-- 0051 · Teacher referrals (Juan, 2026-11-14: "a referral system so after a certain referral amount that creates
-- x active students"; reward chosen on the decision card: higher limits + recognition).
--
-- A teacher brings other teachers, and goes up a level as those colleagues' students start practicing:
--   * Colleague: a teacher or school admin who signed in with this teacher's link (referrals, via 'docente' or
--     any other via, from 0050) or joined this teacher's workspace through their invite (trial_redemptions.invited_by,
--     from 0038). A colleague counts once at least `tref_colleague_min_students` of their students are active.
--   * Active student: a student account in a course the colleague created or teaches, with at least
--     `tref_active_answers` answers on at least `tref_active_days` different days, within `tref_active_window_days`
--     of their first answer. Counted once, however many courses or colleagues they share. The referrer's own
--     students never count: the point is bringing others.
--   * Levels (app_limits, change without a deploy):
--       1 Aliado     1 colleague, 20 active students   badge + printable constancia
--       2 Embajador  3 colleagues, 100                  +14 booklets for a workspace on trial (whole school),
--                                                      +4 a day for each of its teachers, +10 questions a day
--                                                      for the referrer's students
--       3 Fundador   10 colleagues, 300                 +28 booklets, +8 a day, +20 questions a day
-- Rewards never mention money or access ending. Nothing here promises anything "for ever".
--
-- Also: up to 50 teachers can join one self-serve workspace (was 15).
--
-- Re-creates (bodies otherwise identical): claim_referral (0050, accepts via 'docente'), growth_bonus_questions
-- (0050, adds the teacher-level bonus), bank_open and bank_quota (0036, trial limits plus teacher_ref_bonus).
-- Runs after 0050. Re-runnable.

-- 1 · Limits ------------------------------------------------------------------------------------------------------
insert into public.app_limits (key, value) values
  ('tref_active_answers', 20), ('tref_active_days', 3), ('tref_active_window_days', 30),
  ('tref_colleague_min_students', 5),
  ('tref_l1_colleagues', 1),  ('tref_l1_students', 20),
  ('tref_l2_colleagues', 3),  ('tref_l2_students', 100),
  ('tref_l3_colleagues', 10), ('tref_l3_students', 300),
  ('tref_l2_trial_booklets', 14), ('tref_l3_trial_booklets', 28),
  ('tref_l2_trial_day', 4),       ('tref_l3_trial_day', 8),
  ('tref_l2_student_questions', 10), ('tref_l3_student_questions', 20)
on conflict (key) do nothing;

update public.app_limits set value = 50 where key = 'self_trial_teachers' and value = 15;
update public.trial_codes set max_teachers = 50 where source = 'self' and max_teachers = 15;

-- 2 · 'docente' invitations --------------------------------------------------------------------------------------
alter table public.referrals drop constraint if exists referrals_via_check;
alter table public.referrals add constraint referrals_via_check
  check (via in ('amigo', 'profe', 'aliado', 'parche', 'reto', 'docente'));

-- 0050's claim_referral, now also accepting 'docente' (a teacher's link to another teacher).
create or replace function public.claim_referral(p_code text, p_via text default 'amigo')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_row referral_codes;
  v_created timestamptz;
begin
  if v_uid is null then return 'not_signed_in'; end if;
  select * into v_row from referral_codes where code = lower(trim(p_code)) and active;
  if not found then return 'unknown'; end if;
  if v_row.user_id = v_uid then return 'self'; end if;
  if exists (select 1 from referrals where user_id = v_uid) then return 'already'; end if;
  select coalesce((select created_at from profiles where id = v_uid), (select created_at from auth.users where id = v_uid)) into v_created;
  if v_created is not null and v_created < now() - interval '14 days' then return 'too_old'; end if;
  insert into referrals (user_id, code, referrer, via)
  values (v_uid, v_row.code, v_row.user_id,
          case when v_row.kind = 'partner' then 'aliado' when p_via in ('amigo', 'profe', 'parche', 'reto', 'docente') then p_via else 'amigo' end)
  on conflict (user_id) do nothing;
  return 'ok';
end $$;
revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- 3 · Counting ---------------------------------------------------------------------------------------------------
create or replace function public.tref_limit(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_limits where key = p_key), p_default);
$$;
revoke all on function public.tref_limit(text, int) from public, anon, authenticated;

-- Teachers this teacher brought: by link (referrals) or into their own workspace (trial_redemptions.invited_by).
create or replace function public.tref_colleagues(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.user_id from referrals r join profiles p on p.id = r.user_id
   where r.referrer = p_uid and r.user_id <> p_uid and p.role in ('teacher', 'school_admin')
  union
  select t.profile_id from trial_redemptions t join profiles p on p.id = t.profile_id
   where t.invited_by = p_uid and t.profile_id <> p_uid and p.role in ('teacher', 'school_admin');
$$;
revoke all on function public.tref_colleagues(uuid) from public, anon, authenticated;

-- Students in the courses a teacher created or teaches.
create or replace function public.tref_students(p_teacher uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.profile_id
    from course_members m
    join courses c on c.id = m.course_id
    join profiles s on s.id = m.profile_id and s.role = 'student'
   where m.role = 'student' and m.profile_id is not null
     and (c.created_by = p_teacher
          or exists (select 1 from course_members t where t.course_id = c.id and t.profile_id = p_teacher and t.role = 'teacher'));
$$;
revoke all on function public.tref_students(uuid) from public, anon, authenticated;

-- Enough answers on enough days, within the first weeks after their first answer.
create or replace function public.tref_is_active(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with f as (select min(answered_at) as first_at from answer_log where user_id = p_student),
       a as (select l.answered_at from answer_log l, f
              where l.user_id = p_student
                and l.answered_at < f.first_at + make_interval(days => tref_limit('tref_active_window_days', 30)))
  select count(*) >= tref_limit('tref_active_answers', 20)
     and count(distinct (answered_at at time zone 'America/Bogota')::date) >= tref_limit('tref_active_days', 3)
    from a;
$$;
revoke all on function public.tref_is_active(uuid) from public, anon, authenticated;

-- Last computed level of each teacher (refreshed whenever they open Hoy, read by the reward checks below).
create table if not exists public.teacher_ref_levels (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  level      int not null default 0 check (level between 0 and 3),
  colleagues int not null default 0,
  students   int not null default 0,
  reached_at jsonb not null default '{}'::jsonb,   -- {"1": "2026-11-20T...", ...}: when each level was first reached
  updated_at timestamptz not null default now()
);
alter table public.teacher_ref_levels enable row level security;
revoke all on public.teacher_ref_levels from anon, authenticated;

-- Count, store and return a teacher's referral progress. Levels never go down once reached.
create or replace function public.tref_refresh(p_uid uuid)
returns teacher_ref_levels language plpgsql security definer set search_path = public as $$
declare
  v_min int := tref_limit('tref_colleague_min_students', 5);
  v_col int; v_stu int; v_lvl int := 0; v_prev teacher_ref_levels; v_row teacher_ref_levels;
  v_reached jsonb;
begin
  with per as (
    select c.cid, s.sid
      from tref_colleagues(p_uid) as c(cid)
      cross join lateral tref_students(c.cid) as s(sid)
     where s.sid <> p_uid
       and s.sid not in (select tref_students(p_uid))     -- the referrer's own students don't count
       and tref_is_active(s.sid)
  )
  select (select count(*) from (select cid from per group by cid having count(*) >= v_min) x),
         (select count(distinct sid) from per)
    into v_col, v_stu;
  for i in 1..3 loop
    if v_col >= tref_limit('tref_l' || i || '_colleagues', case i when 1 then 1 when 2 then 3 else 10 end)
       and v_stu >= tref_limit('tref_l' || i || '_students', case i when 1 then 20 when 2 then 100 else 300 end) then
      v_lvl := i;
    end if;
  end loop;
  select * into v_prev from teacher_ref_levels where user_id = p_uid;
  v_lvl := greatest(v_lvl, coalesce(v_prev.level, 0));
  v_reached := coalesce(v_prev.reached_at, '{}'::jsonb);
  for i in 1..v_lvl loop
    if not v_reached ? i::text then v_reached := v_reached || jsonb_build_object(i::text, now()); end if;
  end loop;
  insert into teacher_ref_levels (user_id, level, colleagues, students, reached_at, updated_at)
  values (p_uid, v_lvl, v_col, v_stu, v_reached, now())
  on conflict (user_id) do update set level = excluded.level, colleagues = excluded.colleagues,
    students = excluded.students, reached_at = excluded.reached_at, updated_at = now()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.tref_refresh(uuid) from public, anon, authenticated;

-- 4 · What the teacher sees (Hoy) ---------------------------------------------------------------------------------
-- Their invite code (the same one 0050 gives everyone), level, progress to the next one, and each colleague's
-- first name with how many active students they have. Student names are never shown.
create or replace function public.my_teacher_referrals()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row teacher_ref_levels;
  v_next int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select role into v_role from profiles where id = v_uid;
  if v_role is null or v_role not in ('teacher', 'school_admin') then raise exception 'not_teacher'; end if;
  v_row := tref_refresh(v_uid);
  v_next := least(v_row.level + 1, 3);
  return json_build_object(
    'code', my_referral_code(),
    'level', v_row.level,
    'colleagues', v_row.colleagues,
    'students', v_row.students,
    'reached_at', v_row.reached_at,
    'next', case when v_row.level >= 3 then null else json_build_object(
      'level', v_next,
      'colleagues', tref_limit('tref_l' || v_next || '_colleagues', case v_next when 1 then 1 when 2 then 3 else 10 end),
      'students', tref_limit('tref_l' || v_next || '_students', case v_next when 1 then 20 when 2 then 100 else 300 end)) end,
    'rewards', json_build_object(
      'trial_booklets', json_build_array(0, 0, tref_limit('tref_l2_trial_booklets', 14), tref_limit('tref_l3_trial_booklets', 28)),
      'trial_day', json_build_array(0, 0, tref_limit('tref_l2_trial_day', 4), tref_limit('tref_l3_trial_day', 8)),
      'student_questions', json_build_array(0, 0, tref_limit('tref_l2_student_questions', 10), tref_limit('tref_l3_student_questions', 20))),
    'min_students', tref_limit('tref_colleague_min_students', 5),
    'invited', (select count(*) from tref_colleagues(v_uid)),
    'list', coalesce((
      select json_agg(json_build_object('name', split_part(p.full_name, ' ', 1),
                                        'students', (select count(*) from tref_students(c.cid) s(sid)
                                                      where s.sid <> v_uid and tref_is_active(s.sid)))
                      order by p.created_at)
        from tref_colleagues(v_uid) c(cid) join profiles p on p.id = c.cid), '[]'::json));
end $$;
revoke all on function public.my_teacher_referrals() from public, anon;
grant execute on function public.my_teacher_referrals() to authenticated;

-- 5 · Rewards ----------------------------------------------------------------------------------------------------
-- Extra booklets for a workspace on trial: the best level among its teachers.
create or replace function public.teacher_ref_bonus(p_school uuid, p_kind text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(case
           when l.level >= 3 then tref_limit(case p_kind when 'day' then 'tref_l3_trial_day' else 'tref_l3_trial_booklets' end, case p_kind when 'day' then 8 else 28 end)
           when l.level = 2  then tref_limit(case p_kind when 'day' then 'tref_l2_trial_day' else 'tref_l2_trial_booklets' end, case p_kind when 'day' then 4 else 14 end)
           else 0 end), 0)
    from teacher_ref_levels l join profiles p on p.id = l.user_id
   where p_school is not null and p.school_id = p_school and p.role in ('teacher', 'school_admin');
$$;
revoke all on function public.teacher_ref_bonus(uuid, text) from public, anon, authenticated;

-- Extra practice questions a day for a student whose teacher reached level 2 or 3 (the best of their teachers).
create or replace function public.tref_student_bonus(p_uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(case when l.level >= 3 then tref_limit('tref_l3_student_questions', 20)
                           when l.level = 2  then tref_limit('tref_l2_student_questions', 10) else 0 end), 0)
    from course_members m
    join courses c on c.id = m.course_id
    join teacher_ref_levels l on l.user_id = c.created_by
                              or l.user_id in (select t.profile_id from course_members t where t.course_id = c.id and t.role = 'teacher')
   where m.profile_id = p_uid and m.role = 'student';
$$;
revoke all on function public.tref_student_bonus(uuid) from public, anon, authenticated;

-- 0050's growth_bonus_questions, plus the teacher-level bonus.
create or replace function public.growth_bonus_questions(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_code text; v_bonus int := 0;
begin
  if p_uid is null then return 0; end if;
  select code into v_code from referral_codes where user_id = p_uid and kind = 'student';
  if v_code is not null then
    select least(60,
      10 * (select count(*) from referrals r join profiles p on p.id = r.user_id
             where r.code = v_code and p.role = 'student' and (select count(*) from answer_log l where l.user_id = r.user_id) >= 5)
      + 20 * (select count(*) from referrals r join profiles p on p.id = r.user_id where r.code = v_code and p.role in ('teacher', 'school_admin')))
      into v_bonus;
  end if;
  if exists (select 1 from referrals where user_id = p_uid and at > now() - interval '7 days') then v_bonus := v_bonus + 10; end if;
  return coalesce(v_bonus, 0) + tref_student_bonus(p_uid);
end $$;
revoke all on function public.growth_bonus_questions(uuid) from public, anon, authenticated;

-- 0036's bank_open and bank_quota; the only change is "+ teacher_ref_bonus(...)" on the two trial limits.
create or replace function public.bank_open(p_slug text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_slug text := left(coalesce(p_slug, ''), 80);
  v_acc record;
  v_seen_today boolean;
  v_seen_week boolean;
  v_today int; v_week int; v_files int; v_school_total int;
  lim_day int; lim_week int;
  lim_files int := coalesce((select value from app_limits where key = 'files_per_day'), 400);
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  if v_slug !~ '^[A-Za-z0-9_-]+$' then raise exception 'bad_slug'; end if;
  select * into v_acc from bank_account(v_uid);
  if v_acc.blocked then return bank_hit(v_uid, v_slug, 'access_blocked'); end if;

  -- Serialize the same account's calls, so two booklets opened at once can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('bank_open:' || v_uid::text));

  select count(*), coalesce(sum(files), 0), bool_or(slug = v_slug) into v_today, v_files, v_seen_today
    from exam_downloads where user_id = v_uid and day = v_day;
  v_seen_today := coalesce(v_seen_today, false);
  if v_files >= lim_files then return bank_hit(v_uid, v_slug, 'files_limit'); end if;

  if not v_seen_today and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, v_slug) then
    if v_acc.kind = 'student' then
      lim_day := coalesce((select value from app_limits where key = 'student_booklets_per_day'), 6);
      if v_acc.created_at > now() - interval '24 hours' then
        lim_day := least(lim_day, coalesce((select value from app_limits where key = 'new_account_booklets_per_day'), 3));
      end if;
      lim_week := coalesce((select value from app_limits where key = 'student_booklets_per_week'), 14);
    elsif v_acc.kind = 'trial_staff' then
      lim_day := (coalesce((select value from app_limits where key = 'trial_staff_booklets_per_day'), 8) + teacher_ref_bonus(v_acc.school_id, 'day'));
      lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    else
      lim_day := coalesce((select value from app_limits where key = 'staff_booklets_per_day'), 12);
      lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    end if;
    -- Only booklets opened without a reason count (activity booklets opened today never use up the day).
    select count(*) into v_today from exam_downloads
     where user_id = v_uid and day = v_day and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
    if v_today >= lim_day then return bank_hit(v_uid, v_slug, 'day_limit'); end if;

    select count(distinct slug), coalesce(bool_or(slug = v_slug), false) into v_week, v_seen_week
      from exam_downloads where user_id = v_uid and day > v_day - 7
       and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
    if not v_seen_week and v_week >= lim_week then return bank_hit(v_uid, v_slug, 'week_limit'); end if;
  end if;

  if not v_seen_today then
    -- A school on trial: all its teachers together open at most N different booklets for the whole trial.
    if v_acc.kind = 'trial_staff' then
      perform pg_advisory_xact_lock(hashtext('bank_school:' || v_acc.school_id::text));
      if not exists (
        select 1 from exam_downloads d join profiles p on p.id = d.user_id
         where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin') and d.slug = v_slug
      ) then
        select count(distinct d.slug) into v_school_total
          from exam_downloads d join profiles p on p.id = d.user_id
         where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin');
        if v_school_total >= (coalesce((select value from app_limits where key = 'trial_school_booklets_total'), 14) + teacher_ref_bonus(v_acc.school_id, 'booklets')) then
          return bank_hit(v_uid, v_slug, 'trial_limit');
        end if;
      end if;
    end if;
  end if;

  insert into exam_downloads (user_id, day, slug) values (v_uid, v_day, v_slug)
    on conflict (user_id, day, slug) do update set files = exam_downloads.files + 1, last_at = now();
  return 'ok';
end $$;
revoke all on function public.bank_open(text) from public, anon;
grant execute on function public.bank_open(text) to authenticated;

-- What this account has left today (the app shows it before a teacher opens another booklet).
create or replace function public.bank_quota()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_acc record;
  v_today int; v_week int; v_school int := null;
  lim_day int; lim_week int; lim_school int := null;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_acc from bank_account(v_uid);
  select count(*) into v_today from exam_downloads
   where user_id = v_uid and day = v_day and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
  select count(distinct slug) into v_week from exam_downloads
   where user_id = v_uid and day > v_day - 7 and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
  if v_acc.kind = 'student' then
    lim_day := coalesce((select value from app_limits where key = 'student_booklets_per_day'), 6);
    if v_acc.created_at > now() - interval '24 hours' then
      lim_day := least(lim_day, coalesce((select value from app_limits where key = 'new_account_booklets_per_day'), 3));
    end if;
    lim_week := coalesce((select value from app_limits where key = 'student_booklets_per_week'), 14);
  elsif v_acc.kind = 'trial_staff' then
    lim_day := (coalesce((select value from app_limits where key = 'trial_staff_booklets_per_day'), 8) + teacher_ref_bonus(v_acc.school_id, 'day'));
    lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    lim_school := (coalesce((select value from app_limits where key = 'trial_school_booklets_total'), 14) + teacher_ref_bonus(v_acc.school_id, 'booklets'));
    select count(distinct d.slug) into v_school
      from exam_downloads d join profiles p on p.id = d.user_id
     where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin');
  else
    lim_day := coalesce((select value from app_limits where key = 'staff_booklets_per_day'), 12);
    lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
  end if;
  return jsonb_build_object(
    'kind', v_acc.kind, 'blocked', v_acc.blocked,
    'today', v_today, 'day_limit', lim_day, 'week', v_week, 'week_limit', lim_week,
    'school_total', v_school, 'school_limit', lim_school,
    'opened_today', coalesce((select jsonb_agg(slug order by first_at) from exam_downloads where user_id = v_uid and day = v_day), '[]'::jsonb),
    'opened_week', coalesce((select jsonb_agg(distinct slug) from exam_downloads where user_id = v_uid and day > v_day - 7), '[]'::jsonb));
end $$;
revoke all on function public.bank_quota() from public, anon;
grant execute on function public.bank_quota() to authenticated;
-- 6 · For Juan (SQL editor): who is bringing teachers -------------------------------------------------------------
--   select * from teacher_referrals;          -- refreshes when each teacher opens Hoy
create or replace view public.teacher_referrals as
  select p.full_name, p.email, s.name as school, l.level, l.colleagues, l.students, l.reached_at, l.updated_at,
         (select count(*) from tref_colleagues(l.user_id)) as invited
    from teacher_ref_levels l join profiles p on p.id = l.user_id left join schools s on s.id = p.school_id
   order by l.level desc, l.students desc;
revoke all on public.teacher_referrals from anon, authenticated;
