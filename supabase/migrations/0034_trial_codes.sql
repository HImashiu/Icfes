-- 0034 · Trial codes: one code per school, for outreach emails.
--  A school gets one code. Its teachers sign in with Google, choose "Soy docente" and type the code. The first
--  teacher creates the school's trial school (not linked to any real domain); the next teachers join that same school.
--  Each code expires (20 days by default) and has a teacher limit (15 by default). Every redemption is recorded, so
--  staff can see which schools entered.
--  Issued by staff from the Supabase SQL editor:
--    select public.issue_trial_code('Colegio Ejemplo, Bogotá', 'rector@colegio.edu.co');
--  Runs after 0032. Re-runnable.

-- 1 · Codes and redemptions ---------------------------------------------------------------------------------------
create table if not exists public.trial_codes (
  code          text primary key check (code ~ '^CND-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  school_name   text not null check (length(school_name) between 1 and 160),
  -- who the code was sent to: staff only, never shown to students or teachers
  contact       text,
  max_teachers  int not null default 15 check (max_teachers between 1 and 100),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  school_id     uuid references public.schools (id) on delete set null
);

create table if not exists public.trial_redemptions (
  profile_id   uuid primary key references auth.users (id) on delete cascade,
  code         text not null references public.trial_codes (code) on delete cascade,
  school_id    uuid references public.schools (id) on delete set null,
  redeemed_at  timestamptz not null default now()
);
create index if not exists trial_redemptions_code on public.trial_redemptions (code);

-- Nobody reads or writes these tables through the API: only the security definer functions below do.
alter table public.trial_codes enable row level security;
alter table public.trial_redemptions enable row level security;

-- 2 · Issue a code (staff, SQL editor) ----------------------------------------------------------------------------
create or replace function public.issue_trial_code(p_school_name text, p_contact text default null,
                                                   p_days int default 20, p_max_teachers int default 15)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
begin
  if coalesce(trim(p_school_name), '') = '' then raise exception 'school_name_required'; end if;
  loop
    v_code := 'CND-' || upper(encode(gen_random_bytes(2), 'hex')) || '-' || upper(encode(gen_random_bytes(2), 'hex'))
              || '-' || upper(encode(gen_random_bytes(2), 'hex')) || '-' || upper(encode(gen_random_bytes(2), 'hex'));
    exit when not exists (select 1 from public.trial_codes where code = v_code);
  end loop;
  insert into public.trial_codes (code, school_name, contact, max_teachers, expires_at)
  values (v_code, left(trim(p_school_name), 160), nullif(trim(coalesce(p_contact, '')), ''),
          greatest(1, least(100, p_max_teachers)), now() + make_interval(days => p_days));
  return v_code;
end $$;
revoke all on function public.issue_trial_code(text, text, int, int) from public, anon, authenticated;

-- 3 · claim_profile: a trial code opens its school for the teachers who use it (same rules as 0030 otherwise) -------
create or replace function public.claim_profile(p_teacher_code text default null, p_full_name text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_domain text := split_part(v_email, '@', 2);
  v_school schools;
  v_invite staff_invites;
  v_trial  trial_codes;
  v_trial_used boolean := false;
  v_role  text := 'student';
  v_profile profiles;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  -- Guests (anonymous sign-in) never get a profile.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) or v_email = '' then raise exception 'not_signed_in'; end if;
  select * into v_profile from profiles where id = v_uid;
  if found then return v_profile; end if;
  select * into v_school from schools where status = 'active' and v_domain = any (domains) limit 1;
  if found then
    select * into v_invite from staff_invites where school_id = v_school.id and email = v_email;
  else
    select i.* into v_invite from staff_invites i join schools s on s.id = i.school_id and s.status = 'active'
     where i.email = v_email order by i.created_at desc limit 1;
    if found then
      select * into v_school from schools where id = v_invite.school_id;
    elsif p_teacher_code is not null and length(trim(p_teacher_code)) > 0 then
      select * into v_trial from trial_codes where code = upper(trim(p_teacher_code)) for update;
      if not found then raise exception 'school_not_found'; end if;
      if v_trial.expires_at < now() then raise exception 'trial_code_expired'; end if;
      if (select count(*) from trial_redemptions r where r.code = v_trial.code) >= v_trial.max_teachers then
        raise exception 'trial_code_full';
      end if;
      if v_trial.school_id is null then
        -- First teacher of the school: create its trial school (no real domain).
        insert into schools (name, domains)
        values (v_trial.school_name, array['prueba-' || substr(md5(v_trial.code), 1, 16) || '.invalid'])
        returning * into v_school;
        update trial_codes set school_id = v_school.id where code = v_trial.code;
      else
        select * into v_school from schools where id = v_trial.school_id;
      end if;
      v_trial_used := true;
    end if;
  end if;
  if v_invite.id is not null then
    v_role := v_invite.role;
    update staff_invites set accepted_at = now() where id = v_invite.id;
  elsif v_trial_used then
    v_role := 'teacher';
  elsif v_school.id is not null and p_teacher_code is not null and length(trim(p_teacher_code)) > 0 then
    if lower(trim(p_teacher_code)) <> lower(v_school.teacher_code) then raise exception 'bad_teacher_code'; end if;
    v_role := 'teacher';
  end if;
  insert into profiles (id, school_id, role, full_name, email)
  values (v_uid, v_school.id, v_role,
          left(coalesce(nullif(trim(p_full_name), ''), nullif(v_invite.full_name, ''), auth.jwt() -> 'user_metadata' ->> 'full_name', v_email), 120), v_email)
  returning * into v_profile;
  if v_trial_used then
    insert into trial_redemptions (profile_id, code, school_id) values (v_uid, v_trial.code, v_school.id);
  end if;
  if v_school.id is not null then
    update course_members set profile_id = v_uid, full_name = case when full_name = '' then v_profile.full_name else full_name end
     where profile_id is null and lower(email) = v_email;
    update attempts set profile_id = v_uid
     where profile_id is null and member_id in (select id from course_members where profile_id = v_uid);
  end if;
  return v_profile;
end $$;
revoke all on function public.claim_profile(text, text) from public, anon;
grant execute on function public.claim_profile(text, text) to authenticated;
