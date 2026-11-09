-- 0030 · Sign-in required for the app, and security hardening.
--  1. Anyone with a Google account can use the app: a student whose email belongs to no school gets an
--     independent profile (school_id null, role student). Teachers still need a school (domain, invite or code).
--  2. A profile can never move itself into a school or change its role (null-safe check).
--  3. Attempts keep their owner, assignment and booklet once created (a student can't move an attempt onto
--     another assignment to skip its open window or attempt limit).
--  4. Public forms (feedback, launch waitlist) are rate limited per network address and overall.
-- Runs after 0029. Re-runnable.

-- 1 · Independent students -----------------------------------------------------------------------------------------
alter table public.profiles alter column school_id drop not null;

create or replace function public.claim_profile(p_teacher_code text default null, p_full_name text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_domain text := split_part(v_email, '@', 2);
  v_school schools;
  v_invite staff_invites;
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
      -- A teacher code only works with the school's own email or an invite.
      raise exception 'school_not_found';
    end if;
  end if;
  if v_invite.id is not null then
    v_role := v_invite.role;
    update staff_invites set accepted_at = now() where id = v_invite.id;
  elsif v_school.id is not null and p_teacher_code is not null and length(trim(p_teacher_code)) > 0 then
    if lower(trim(p_teacher_code)) <> lower(v_school.teacher_code) then raise exception 'bad_teacher_code'; end if;
    v_role := 'teacher';
  end if;
  insert into profiles (id, school_id, role, full_name, email)
  values (v_uid, v_school.id, v_role,
          left(coalesce(nullif(trim(p_full_name), ''), nullif(v_invite.full_name, ''), auth.jwt() -> 'user_metadata' ->> 'full_name', v_email), 120), v_email)
  returning * into v_profile;
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

-- Independent students can still be added to a class by email: the roster link (0010) attaches the class to the
-- profile, and nothing else of a school becomes visible to them. Their school_id stays null.

-- 2 · Profiles can't change their own school or role (the old check compared with '=' and failed for null) -------
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid()
              and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
              and school_id is not distinct from (select p.school_id from public.profiles p where p.id = auth.uid()));

-- 3 · Attempts keep who, which assignment and which booklet ---------------------------------------------------------
create or replace function public.attempts_keep_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.profile_id is distinct from old.profile_id
     or new.assignment_id is distinct from old.assignment_id and new.assignment_id is not null
     or new.exam_slug is distinct from old.exam_slug then
    -- The service role (dashboard, server jobs) may still fix rows by hand.
    if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'attempt_identity_locked';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists attempts_keep_identity on public.attempts;
create trigger attempts_keep_identity before update on public.attempts
  for each row execute function public.attempts_keep_identity();

-- 4 · Rate limits on the public forms --------------------------------------------------------------------------------
-- The caller's address comes from the request headers PostgREST passes in; only a hash is kept.
create or replace function public.request_ip_hash() returns text
language sql stable set search_path = public as $$
  select md5(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    'unknown'))
$$;

alter table public.public_feedback add column if not exists ip_hash text;
alter table public.launch_waitlist add column if not exists ip_hash text;
create index if not exists public_feedback_recent_idx on public.public_feedback (created_at);
create index if not exists launch_waitlist_recent_idx on public.launch_waitlist (created_at);

-- Per address: 6 messages / 10 min. Overall: 300 / hour (a flood stops instead of filling the table).
create or replace function public.public_form_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ip text := public.request_ip_hash(); v_mine int; v_all int;
begin
  new.ip_hash := v_ip;
  if tg_table_name = 'public_feedback' then
    select count(*) filter (where ip_hash = v_ip and created_at > now() - interval '10 minutes'), count(*)
      into v_mine, v_all from public_feedback where created_at > now() - interval '1 hour';
  else
    select count(*) filter (where ip_hash = v_ip and created_at > now() - interval '10 minutes'), count(*)
      into v_mine, v_all from launch_waitlist where created_at > now() - interval '1 hour';
  end if;
  if v_mine >= 6 or v_all >= 300 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.public_form_limit() from public, anon, authenticated;
drop trigger if exists public_feedback_limit on public.public_feedback;
create trigger public_feedback_limit before insert on public.public_feedback for each row execute function public.public_form_limit();
drop trigger if exists launch_waitlist_limit on public.launch_waitlist;
create trigger launch_waitlist_limit before insert on public.launch_waitlist for each row execute function public.public_form_limit();

-- Nobody but the dashboard reads or changes these tables (insert only, as in 0029).
revoke select, update, delete on public.public_feedback from anon, authenticated;
revoke select, insert, update, delete on public.launch_waitlist from anon, authenticated;

-- Waitlist emails must look like an address.
create or replace function public.join_launch_waitlist(p_email text, p_source text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'bad_email'; end if;
  insert into public.launch_waitlist (email, source) values (v_email, left(p_source, 64)) on conflict (email) do nothing;
end $$;
revoke all on function public.join_launch_waitlist(text, text) from public;
grant execute on function public.join_launch_waitlist(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
