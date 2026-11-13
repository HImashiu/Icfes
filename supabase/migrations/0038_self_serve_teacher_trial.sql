-- 0038 · Self-serve teacher trial and colleague invitations.
--  Until now a teacher could only enter the teacher panel with a code that Cóndor emailed to the school (0034) or
--  the school's own teacher code. A teacher who found Cóndor alone had no way in. start_teacher_trial() lets any
--  signed-in teacher open their own trial workspace at once: it issues a trial code for their school (source 'self'),
--  creates the trial school and makes the caller its first teacher. Everything else works as for a code from an
--  email: the bank-protection caps for trial schools (0036) apply, trial_redemptions records the entry, and the code
--  itself is the invitation for colleagues (up to max_teachers), which my_trial() now returns to the school's staff.
--  A trial school never gets a real email domain (and never a public one like gmail.com): its domain is
--  'prueba-<hash>.invalid', so no student joins it by accident.
--  Numbers live in app_limits:
--    update app_limits set value = 45 where key = 'self_trial_days';
--  Runs after 0037. Re-runnable.

-- 1 · Where a code came from, and the school's city -----------------------------------------------------------------
alter table public.trial_codes add column if not exists source text not null default 'staff';
alter table public.trial_codes drop constraint if exists trial_codes_source_check;
alter table public.trial_codes add constraint trial_codes_source_check check (source in ('staff', 'self'));
alter table public.trial_codes add column if not exists city text;
-- Who redeemed through an invitation link from a colleague (null = typed the code or opened the trial).
alter table public.trial_redemptions add column if not exists invited_by uuid references auth.users (id) on delete set null;

insert into public.app_limits (key, value) values
  ('self_trial_days', 30),          -- length of a self-serve trial
  ('self_trial_teachers', 15),      -- teachers who can join one self-serve trial
  ('self_trials_per_day', 80)       -- all self-serve trials opened in one day, across Cóndor (abuse brake)
  on conflict (key) do nothing;

-- Public email providers: never a school domain.
create or replace function public.is_public_email_domain(p_domain text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_domain, '')) = any (array[
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.co',
    'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
    'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'une.net.co', 'etb.net.co'
  ]);
$$;

-- 2 · Open a trial workspace -----------------------------------------------------------------------------------------
-- For the caller: a first visit (no profile yet) or a student account that belongs to no school. A teacher who is
-- already staff gets their profile back unchanged. Errors: not_signed_in, school_name_required, student_in_school,
-- school_uses_condor (the email domain belongs to a school already on Cóndor: ask coordination for its code),
-- self_trial_used (this account already opened one), self_trial_busy (daily brake).
create or replace function public.start_teacher_trial(p_school_name text, p_city text default null,
                                                      p_full_name text default null)
returns public.profiles
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_domain  text := split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2);
  v_name    text := left(trim(coalesce(p_school_name, '')), 160);
  v_city    text := nullif(left(trim(coalesce(p_city, '')), 80), '');
  v_profile profiles;
  v_school  schools;
  v_home    schools;
  v_invite  staff_invites;
  v_code    text;
  v_label   text;
begin
  if v_uid is null or v_email = '' or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_signed_in';
  end if;

  select * into v_profile from profiles where id = v_uid for update;
  if found and v_profile.role <> 'student' then return v_profile; end if;

  -- Invited by a school's coordination: that invitation wins (claim_profile accepts it).
  if not found then
    select i.* into v_invite from staff_invites i join schools s on s.id = i.school_id and s.status = 'active'
     where i.email = v_email order by i.created_at desc limit 1;
    if found then return public.claim_profile(null, p_full_name); end if;
  end if;

  -- An email domain that belongs to a school already on Cóndor: that school's code, not a new trial.
  if not public.is_public_email_domain(v_domain) then
    select * into v_home from schools where status = 'active' and v_domain = any (domains) limit 1;
    if found then raise exception 'school_uses_condor'; end if;
  end if;

  -- A student of a real school stays there. A student whose "school" is only a catch-all for public email (or none)
  -- may become a teacher with their own workspace.
  if v_profile.id is not null and v_profile.school_id is not null then
    select * into v_home from schools where id = v_profile.school_id;
    if found and not exists (select 1 from unnest(v_home.domains) d where public.is_public_email_domain(d)) then
      raise exception 'student_in_school';
    end if;
  end if;

  if v_name = '' then raise exception 'school_name_required'; end if;
  if exists (select 1 from trial_codes where source = 'self' and contact = v_email) then
    raise exception 'self_trial_used';
  end if;
  if (select count(*) from trial_codes where source = 'self' and created_at > now() - interval '1 day')
     >= coalesce((select value from app_limits where key = 'self_trials_per_day'), 80) then
    raise exception 'self_trial_busy';
  end if;

  -- The code, exactly like issue_trial_code(), marked as self-serve.
  loop
    v_code := 'CND-' || upper(encode(gen_random_bytes(2), 'hex')) || '-' || upper(encode(gen_random_bytes(2), 'hex'))
              || '-' || upper(encode(gen_random_bytes(2), 'hex')) || '-' || upper(encode(gen_random_bytes(2), 'hex'));
    exit when not exists (select 1 from trial_codes where code = v_code);
  end loop;
  v_label := v_name || case when v_city is not null then ', ' || v_city else '' end;
  insert into schools (name, domains)
  values (left(v_label, 160), array['prueba-' || substr(md5(v_code), 1, 16) || '.invalid'])
  returning * into v_school;
  insert into trial_codes (code, school_name, contact, max_teachers, expires_at, school_id, source, city)
  values (v_code, left(v_label, 160), v_email,
          greatest(1, least(100, coalesce((select value from app_limits where key = 'self_trial_teachers'), 15))),
          now() + make_interval(days => coalesce((select value from app_limits where key = 'self_trial_days'), 30)),
          v_school.id, 'self', v_city);

  if v_profile.id is null then
    insert into profiles (id, school_id, role, full_name, email)
    values (v_uid, v_school.id, 'teacher',
            left(coalesce(nullif(trim(p_full_name), ''), auth.jwt() -> 'user_metadata' ->> 'full_name', v_email), 120), v_email)
    returning * into v_profile;
  else
    update profiles set school_id = v_school.id, role = 'teacher',
           full_name = coalesce(nullif(left(trim(p_full_name), 120), ''), full_name)
     where id = v_uid returning * into v_profile;
  end if;
  insert into trial_redemptions (profile_id, code, school_id) values (v_uid, v_code, v_school.id)
    on conflict (profile_id) do update set code = excluded.code, school_id = excluded.school_id, redeemed_at = now();
  return v_profile;
end $$;
revoke all on function public.start_teacher_trial(text, text, text) from public, anon;
grant execute on function public.start_teacher_trial(text, text, text) to authenticated;

-- 3 · Who invited whom: a colleague who arrives from an invitation link records it (best effort, own row only) ------
create or replace function public.note_trial_inviter(p_inviter uuid)
returns void
language sql security definer set search_path = public as $$
  update trial_redemptions r set invited_by = p_inviter
   where r.profile_id = auth.uid() and r.invited_by is null and p_inviter is distinct from auth.uid()
     and exists (select 1 from trial_redemptions o where o.profile_id = p_inviter and o.school_id = r.school_id);
$$;
revoke all on function public.note_trial_inviter(uuid) from public, anon;
grant execute on function public.note_trial_inviter(uuid) to authenticated;

-- 4 · my_trial(): now also the code (the colleagues' invitation) and where the trial came from. Staff only. ----------
drop function if exists public.my_trial();
create function public.my_trial()
returns table (school_name text, expires_at timestamptz, max_teachers int, teachers int, code text, source text)
language sql stable security definer set search_path = public as $$
  select t.school_name, t.expires_at, t.max_teachers,
         (select count(*)::int from trial_redemptions r where r.code = t.code),
         t.code, t.source
    from trial_codes t
    join profiles p on p.id = auth.uid() and p.role <> 'student' and p.school_id = t.school_id
   order by t.created_at desc
   limit 1;
$$;
revoke all on function public.my_trial() from public, anon;
grant execute on function public.my_trial() to authenticated;

-- 5 · For Juan (SQL editor): every teacher workspace, how it started and how far it spread ----------------------------
create or replace view public.teacher_trials as
  select t.school_name, t.city, t.source, t.contact as opened_by, t.code, t.created_at::date as opened,
         t.expires_at::date as ends,
         (select count(*) from trial_redemptions r where r.code = t.code) as teachers,
         (select count(*) from trial_redemptions r where r.code = t.code and r.invited_by is not null) as invited_teachers,
         (select count(*) from profiles p where p.school_id = t.school_id and p.role = 'student') as students,
         (select count(*) from courses c where c.school_id = t.school_id) as classes,
         (select count(*) from assignments a join courses c on c.id = a.course_id where c.school_id = t.school_id) as activities
    from trial_codes t
   order by t.created_at desc;
revoke all on public.teacher_trials from anon, authenticated;
