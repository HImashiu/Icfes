-- 0053 · Big rewards for bringing friends (Juan, 2026-11-18: "por referir personas se le otorguen beneficios bastante
-- fuertes, demasiado fuertes, que permitan que la persona pueda estudiar más"; and "la capacidad de realizar un
-- simulacro completo o varios ... necesitamos la capacidad de verificar referrals").
--
-- Builds on 0050 (referral_codes, referrals, claim_referral, my_referral_code) and 0052 (friendships). Replaces 0050's
-- small bonus (+10 a day per friend, at most +60) with levels:
--
--   Verified friend: an account that arrived with the student's link (or added them in Amigos during its first 14
--   days), and
--     * is not on a device the student used, nor on a device of an earlier friend of theirs (site_visitors history),
--     * answered at least `ref_verify_answers` questions on at least `ref_verify_days` different days,
--     * was not voided by an admin, and is among the first `ref_week_cap` friends of that week.
--   A teacher who joins with the link and creates a course counts as `ref_teacher_points` friends.
--
--   Points (verified friends)  Daily questions                       Full simulacros
--   0                          40 (questions_per_day)                `simulacros_per_month` a month
--   1 · Nivel 1                80                                    + `ref_simulacros_per_friend` per friend, kept
--   3 · Nivel 2                150                                   until used
--   5 · Nivel 3 "Pase total"   no daily limit for `ref_pass_days` days (fair use `ref_pass_cap` a day), simulacros
--                              without limit too; each further friend adds `ref_pass_extra_days` days
--   The friend who arrives:    +`ref_welcome_bonus` questions a day for `ref_welcome_days` days and
--                              `ref_welcome_simulacros` extra full simulacro.
--
-- Every number is in app_limits (change without a deploy). Nothing here promises anything "for ever": levels 1-2 are
-- today's numbers, the pass has an end date.
--
-- A full simulacro is both sessions of one cuadernillo (slug without _1ra/_2da). Opening it again within 30 days is
-- free. Teachers and staff are never limited; teacher assignments don't go through take_simulacro.
--
-- Independent of 0051 (teacher referrals): practice_quota/take_practice_questions add 0051's tref_student_bonus only
-- when that function exists, and the referral checks live in a trigger, so 0051's claim_referral can run before or
-- after this file. Re-runnable.

-- 1 · Limits ------------------------------------------------------------------------------------------------------
insert into public.app_limits (key, value) values
  ('ref_verify_answers', 20), ('ref_verify_days', 2), ('ref_week_cap', 5), ('ref_teacher_points', 2),
  ('ref_l1_points', 1), ('ref_l1_questions', 80),
  ('ref_l2_points', 3), ('ref_l2_questions', 150),
  ('ref_l3_points', 5), ('ref_pass_days', 60), ('ref_pass_extra_days', 30), ('ref_pass_cap', 400),
  ('ref_welcome_bonus', 40), ('ref_welcome_days', 7), ('ref_welcome_simulacros', 1),
  ('simulacros_per_month', 1), ('ref_simulacros_per_friend', 2)
on conflict (key) do nothing;

create or replace function public.ref_limit(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_limits where key = p_key), p_default);
$$;
revoke all on function public.ref_limit(text, int) from public, anon, authenticated;

-- 2 · Devices each account used (site_visitors keeps only the last account per browser) ---------------------------
create table if not exists public.account_devices (
  visitor_id uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  first_at   timestamptz not null default now(),
  primary key (visitor_id, user_id)
);
create index if not exists account_devices_user_idx on public.account_devices (user_id);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from anon, authenticated;

insert into public.account_devices (visitor_id, user_id, first_at)
select visitor_id, user_id, coalesce(signed_in_at, first_seen) from public.site_visitors where user_id is not null
on conflict do nothing;

create or replace function public.ref_note_device()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into account_devices (visitor_id, user_id) values (new.visitor_id, new.user_id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists site_visitors_device on public.site_visitors;
create trigger site_visitors_device after insert or update of user_id on public.site_visitors
  for each row execute function public.ref_note_device();

create or replace function public.ref_share_device(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_devices a join account_devices b on b.visitor_id = a.visitor_id
                  where a.user_id = p_x and b.user_id = p_y);
$$;
revoke all on function public.ref_share_device(uuid, uuid) from public, anon, authenticated;

-- 3 · Referrals: admin void + the referrer's own code for any account ---------------------------------------------
alter table public.referrals add column if not exists void boolean not null default false;
alter table public.referrals add column if not exists void_note text check (void_note is null or char_length(void_note) <= 200);

-- The referrer is always the code's owner, whatever claim_referral version inserted the row.
create or replace function public.ref_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select user_id into new.referrer from referral_codes where code = new.code;
  if new.referrer = new.user_id then return null; end if;
  return new;
end $$;
drop trigger if exists referrals_before_insert on public.referrals;
create trigger referrals_before_insert before insert on public.referrals
  for each row execute function public.ref_before_insert();

-- A student's code, made when missing (0050's my_referral_code for any account).
create or replace function public.ref_code_for(p_uid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_base text;
begin
  select code into v_code from referral_codes where user_id = p_uid;
  if v_code is not null then return v_code; end if;
  select lower(regexp_replace(translate(split_part(coalesce(full_name, ''), ' ', 1), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^a-zA-Z]', '', 'g'))
    into v_base from profiles where id = p_uid;
  v_base := left(coalesce(nullif(v_base, ''), 'amigo'), 10);
  for i in 1..8 loop
    v_code := v_base || '-' || growth_code(3);
    begin
      insert into referral_codes (code, user_id, kind) values (v_code, p_uid, 'student');
      return v_code;
    exception when unique_violation then
      select code into v_code from referral_codes where user_id = p_uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  return null;
end $$;
revoke all on function public.ref_code_for(uuid) from public, anon, authenticated;

create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_code text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_code := ref_code_for(v_uid);
  if v_code is null then raise exception 'no_code'; end if;
  return v_code;
end $$;
revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- Amigos (0052): a new account (first 14 days, no invitation yet) that sends a friend request was brought by that
-- friend. Counts like the link.
create or replace function public.ref_from_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_other uuid := case when new.requested_by = new.a then new.b else new.a end; v_created timestamptz; v_code text;
begin
  if exists (select 1 from referrals where user_id = new.requested_by) then return new; end if;
  select coalesce((select created_at from profiles where id = new.requested_by), (select created_at from auth.users where id = new.requested_by)) into v_created;
  if v_created is null or v_created < now() - interval '14 days' then return new; end if;
  -- The friend must be older than the newcomer: two brand-new accounts don't bring each other.
  if coalesce((select created_at from profiles where id = v_other), now()) >= v_created then return new; end if;
  v_code := ref_code_for(v_other);
  if v_code is null then return new; end if;
  insert into referrals (user_id, code, referrer, via) values (new.requested_by, v_code, v_other, 'amigo') on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists friendships_referral on public.friendships;
create trigger friendships_referral after insert on public.friendships
  for each row execute function public.ref_from_friendship();

-- 4 · Who counts ----------------------------------------------------------------------------------------------------
-- Every account a student brought, with its state:
--   ok           verified, counts
--   practicing   real so far, still has to practice (answers / days below)
--   same_device  used a device the student (or an earlier friend of theirs) used: never counts
--   week_cap     verified but over the weekly cap: doesn't count
--   void         an admin took it out
create or replace function public.ref_friends(p_uid uuid)
returns table (friend uuid, first_name text, at timestamptz, is_teacher boolean, answers int, days int, state text, points int)
language sql stable security definer set search_path = public as $$
  with base as (
    select r.user_id as friend, r.at, r.void,
           split_part(coalesce(p.full_name, ''), ' ', 1) as first_name,
           coalesce(p.role in ('teacher', 'school_admin'), false) as is_teacher,
           (select count(*)::int from answer_log l where l.user_id = r.user_id) as answers,
           (select count(distinct (l.answered_at at time zone 'America/Bogota')::date)::int from answer_log l where l.user_id = r.user_id) as days,
           exists (select 1 from courses c where c.created_by = r.user_id) as has_course,
           ref_share_device(r.user_id, p_uid) as dev_self,
           exists (select 1 from referrals e where e.referrer = p_uid and (e.at, e.user_id) < (r.at, r.user_id) and ref_share_device(r.user_id, e.user_id)) as dev_other
      from referrals r left join profiles p on p.id = r.user_id
     where r.referrer = p_uid
  ), judged as (
    select b.*,
           case when b.void then 'void'
                when b.dev_self or b.dev_other then 'same_device'
                when b.is_teacher and b.has_course then 'ok'
                when not b.is_teacher and b.answers >= ref_limit('ref_verify_answers', 20) and b.days >= ref_limit('ref_verify_days', 2) then 'ok'
                else 'practicing' end as st
      from base b
  ), ranked as (
    select j.*, case when j.st = 'ok' then row_number() over (partition by (j.st = 'ok'), date_trunc('week', j.at) order by j.at, j.friend) end as n
      from judged j
  )
  select friend, nullif(first_name, ''), at, is_teacher, answers, days,
         case when st = 'ok' and n > ref_limit('ref_week_cap', 5) then 'week_cap' else st end,
         case when st = 'ok' and n <= ref_limit('ref_week_cap', 5) then (case when is_teacher then ref_limit('ref_teacher_points', 2) else 1 end) else 0 end
    from ranked order by at;
$$;
revoke all on function public.ref_friends(uuid) from public, anon, authenticated;

-- The pass (level 3) has an end date: it starts when the student first reaches level 3 and each new point adds days.
create table if not exists public.referral_pass (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  points     int not null,
  started_at timestamptz not null default now(),
  until      timestamptz not null
);
alter table public.referral_pass enable row level security;
revoke all on public.referral_pass from anon, authenticated;

-- The student's rewards now (and the pass brought up to date). Volatile: it may write referral_pass.
create or replace function public.ref_reward(p_uid uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_points int; v_pass referral_pass; v_level int := 0; v_questions int; v_bonus int := 0; v_welcome int := 0;
  v_welcome_sim int := 0; v_ref referrals; v_l1 int := ref_limit('ref_l1_points', 1); v_l2 int := ref_limit('ref_l2_points', 3);
  v_l3 int := ref_limit('ref_l3_points', 5); v_base int := ref_limit('questions_per_day', 40);
begin
  select coalesce(sum(points), 0)::int into v_points from ref_friends(p_uid);
  select * into v_pass from referral_pass where user_id = p_uid;
  if v_points >= v_l3 then
    if v_pass.user_id is null then
      insert into referral_pass (user_id, points, until)
      values (p_uid, v_points, now() + make_interval(days => ref_limit('ref_pass_days', 60) + (v_points - v_l3) * ref_limit('ref_pass_extra_days', 30)))
      returning * into v_pass;
    elsif v_points > v_pass.points then
      update referral_pass set until = greatest(until, now()) + make_interval(days => (v_points - v_pass.points) * ref_limit('ref_pass_extra_days', 30)),
                               points = v_points
       where user_id = p_uid returning * into v_pass;
    end if;
  end if;
  v_level := case when v_points >= v_l3 then 3 when v_points >= v_l2 then 2 when v_points >= v_l1 then 1 else 0 end;
  v_questions := case when v_points >= v_l2 then ref_limit('ref_l2_questions', 150) when v_points >= v_l1 then ref_limit('ref_l1_questions', 80) else v_base end;
  -- The friend who arrived: welcome bonus for their first days, unless they share a device with whoever brought them.
  select * into v_ref from referrals where user_id = p_uid;
  if v_ref.user_id is not null and not v_ref.void and (v_ref.referrer is null or not ref_share_device(p_uid, v_ref.referrer)) then
    if v_ref.at > now() - make_interval(days => ref_limit('ref_welcome_days', 7)) then v_welcome := ref_limit('ref_welcome_bonus', 40); end if;
    v_welcome_sim := ref_limit('ref_welcome_simulacros', 1);
  end if;
  v_bonus := greatest(v_questions - v_base, 0) + v_welcome;
  return json_build_object(
    'points', v_points, 'level', v_level,
    'pass_until', case when v_pass.until > now() then v_pass.until end,
    'bonus', v_bonus, 'welcome', v_welcome,
    'questions', v_base + v_bonus,
    'simulacro_extra', v_points * ref_limit('ref_simulacros_per_friend', 2) + v_welcome_sim);
end $$;
revoke all on function public.ref_reward(uuid) from public, anon, authenticated;

-- 5 · Daily questions -----------------------------------------------------------------------------------------------
-- 0051's teacher-level bonus for students, when 0051 has run.
create or replace function public.ref_teacher_bonus(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v int;
begin
  if to_regprocedure('public.tref_student_bonus(uuid)') is null then return 0; end if;
  execute 'select public.tref_student_bonus($1)' into v using p_uid;
  return coalesce(v, 0);
end $$;
revoke all on function public.ref_teacher_bonus(uuid) from public, anon, authenticated;

create or replace function public.ref_day_limit(p_uid uuid, out o_limit int, out o_bonus int, out o_pass boolean)
language plpgsql security definer set search_path = public as $$
declare v json := ref_reward(p_uid);
begin
  o_pass := (v ->> 'pass_until') is not null;
  o_bonus := (v ->> 'bonus')::int + ref_teacher_bonus(p_uid);
  o_limit := case when o_pass then ref_limit('ref_pass_cap', 400) else ref_limit('questions_per_day', 40) + o_bonus end;
end $$;
revoke all on function public.ref_day_limit(uuid) from public, anon, authenticated;

create or replace function public.practice_quota()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_l record;
  v_used int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select * into v_l from ref_day_limit(v_uid);
  select coalesce((select questions from practice_usage where user_id = v_uid and day = v_day), 0) into v_used;
  return json_build_object('used', v_used, 'limit', v_l.o_limit, 'remaining', greatest(v_l.o_limit - v_used, 0),
                           'bonus', v_l.o_bonus, 'pass', v_l.o_pass);
end $$;

create or replace function public.take_practice_questions(p_count int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_l record;
  v_want int := greatest(coalesce(p_count, 0), 0);
  v_used int;
  v_grant int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select * into v_l from ref_day_limit(v_uid);
  insert into practice_usage (user_id, day, questions) values (v_uid, v_day, 0) on conflict (user_id, day) do nothing;
  select questions into v_used from practice_usage where user_id = v_uid and day = v_day for update;
  v_grant := least(v_want, greatest(v_l.o_limit - v_used, 0));
  update practice_usage set questions = questions + v_grant where user_id = v_uid and day = v_day;
  return json_build_object('granted', v_grant, 'used', v_used + v_grant, 'limit', v_l.o_limit,
                           'remaining', greatest(v_l.o_limit - v_used - v_grant, 0), 'bonus', v_l.o_bonus, 'pass', v_l.o_pass);
end $$;
revoke all on function public.practice_quota() from public, anon;
revoke all on function public.take_practice_questions(int) from public, anon;
grant execute on function public.practice_quota() to authenticated;
grant execute on function public.take_practice_questions(int) to authenticated;

-- 6 · Full simulacros ---------------------------------------------------------------------------------------------
create table if not exists public.simulacro_uses (
  user_id    uuid not null references auth.users (id) on delete cascade,
  exam       text not null check (char_length(exam) <= 80),
  kind       text not null check (kind in ('month', 'extra', 'pass')),
  started_at timestamptz not null default now(),
  primary key (user_id, exam, started_at)
);
alter table public.simulacro_uses enable row level security;
revoke all on public.simulacro_uses from anon, authenticated;

create or replace function public.sim_state(p_uid uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_r json := ref_reward(p_uid);
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
  v_base int := ref_limit('simulacros_per_month', 1);
  v_used_month int; v_extra int; v_used_extra int;
begin
  select count(*)::int into v_used_month from simulacro_uses where user_id = p_uid and kind = 'month' and started_at >= v_month;
  select count(*)::int into v_used_extra from simulacro_uses where user_id = p_uid and kind = 'extra';
  v_extra := (v_r ->> 'simulacro_extra')::int;
  return json_build_object(
    'month_limit', v_base, 'month_used', v_used_month,
    'extra', v_extra, 'extra_used', v_used_extra,
    'remaining', greatest(v_base - v_used_month, 0) + greatest(v_extra - v_used_extra, 0),
    'pass', (v_r ->> 'pass_until') is not null,
    'unlimited', (v_r ->> 'pass_until') is not null or exists (select 1 from profiles where id = p_uid and role <> 'student'));
end $$;
revoke all on function public.sim_state(uuid) from public, anon, authenticated;

create or replace function public.simulacro_quota()
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return sim_state(v_uid);
end $$;
revoke all on function public.simulacro_quota() from public, anon;
grant execute on function public.simulacro_quota() to authenticated;

-- Start (or reopen) the full simulacro of a cuadernillo. Returns sim_state plus granted and how ('again' = opened
-- within 30 days, free).
create or replace function public.take_simulacro(p_slug text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_exam text := left(regexp_replace(coalesce(p_slug, ''), '_(1ra|2da)$', ''), 80);
  v_s json; v_kind text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if v_exam = '' then raise exception 'no_exam'; end if;
  perform pg_advisory_xact_lock(hashtext('sim:' || v_uid::text));
  if exists (select 1 from simulacro_uses where user_id = v_uid and exam = v_exam and started_at > now() - interval '30 days') then
    return (sim_state(v_uid)::jsonb || jsonb_build_object('granted', true, 'how', 'again'))::json;
  end if;
  v_s := sim_state(v_uid);
  if (v_s ->> 'unlimited')::boolean then v_kind := 'pass';
  elsif (v_s ->> 'month_used')::int < (v_s ->> 'month_limit')::int then v_kind := 'month';
  elsif (v_s ->> 'extra_used')::int < (v_s ->> 'extra')::int then v_kind := 'extra';
  end if;
  if v_kind is null then return (v_s::jsonb || jsonb_build_object('granted', false))::json; end if;
  insert into simulacro_uses (user_id, exam, kind) values (v_uid, v_exam, v_kind);
  return (sim_state(v_uid)::jsonb || jsonb_build_object('granted', true, 'how', v_kind))::json;
end $$;
revoke all on function public.take_simulacro(text) from public, anon;
grant execute on function public.take_simulacro(text) to authenticated;

-- 7 · The student's panel -------------------------------------------------------------------------------------------
-- Code, level, what's next, each friend by first name with what they still need. Nothing about other people's
-- answers beyond "practicing / verified".
create or replace function public.my_referrals()
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_code text; v_r json;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select code into v_code from referral_codes where user_id = v_uid;
  v_r := ref_reward(v_uid);
  return json_build_object(
    'code', v_code,
    'invited', (select count(*) from ref_friends(v_uid) f where not f.is_teacher),
    'activated', (select count(*) from ref_friends(v_uid) f where f.state = 'ok' and not f.is_teacher),
    'teachers', (select count(*) from ref_friends(v_uid) f where f.is_teacher),
    'bonus', (v_r ->> 'bonus')::int,
    'reward', v_r,
    'simulacros', sim_state(v_uid),
    'friends', coalesce((select json_agg(json_build_object(
        'name', coalesce(f.first_name, 'Alguien'), 'teacher', f.is_teacher, 'state', f.state,
        'answers', least(f.answers, ref_limit('ref_verify_answers', 20)), 'days', least(f.days, ref_limit('ref_verify_days', 2)))
        order by f.at desc) from ref_friends(v_uid) f where f.state <> 'void'), '[]'::json),
    'rules', json_build_object(
      'answers', ref_limit('ref_verify_answers', 20), 'days', ref_limit('ref_verify_days', 2), 'week_cap', ref_limit('ref_week_cap', 5),
      'teacher_points', ref_limit('ref_teacher_points', 2), 'base', ref_limit('questions_per_day', 40),
      'l1', ref_limit('ref_l1_points', 1), 'l1_questions', ref_limit('ref_l1_questions', 80),
      'l2', ref_limit('ref_l2_points', 3), 'l2_questions', ref_limit('ref_l2_questions', 150),
      'l3', ref_limit('ref_l3_points', 5), 'pass_days', ref_limit('ref_pass_days', 60), 'pass_extra_days', ref_limit('ref_pass_extra_days', 30),
      'welcome', ref_limit('ref_welcome_bonus', 40), 'welcome_days', ref_limit('ref_welcome_days', 7),
      'sim_month', ref_limit('simulacros_per_month', 1), 'sim_friend', ref_limit('ref_simulacros_per_friend', 2)),
    'invited_by', (select coalesce(c.label, split_part(coalesce(p.full_name, ''), ' ', 1), 'un amigo')
                     from referrals r join referral_codes c on c.code = r.code left join profiles p on p.id = r.referrer
                    where r.user_id = v_uid));
end $$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- 8 · Checking referrals (admins) -----------------------------------------------------------------------------------
-- Every referral of the last p_days with both names, the state, practice so far, shared devices, and how many
-- accounts each referrer brought on a single day (bursts are worth a look).
create or replace function public.admin_ref_review(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x order by x.at desc) from (
    select r.at, r.user_id as friend, pf.full_name as friend_name, pf.email as friend_email, pf.role as friend_role,
           r.referrer, pr.full_name as referrer_name, pr.email as referrer_email, r.via, r.void, r.void_note,
           f.state, f.answers, f.days, f.points,
           (select count(*) from referrals s where s.referrer = r.referrer and s.at::date = r.at::date) as same_day,
           (select (rw ->> 'level')::int from (select ref_reward(r.referrer) as rw) z) as referrer_level
      from referrals r
      left join profiles pf on pf.id = r.user_id
      left join profiles pr on pr.id = r.referrer
      left join lateral (select * from ref_friends(r.referrer) q where q.friend = r.user_id) f on true
     where r.at >= v_from and r.referrer is not null) x), '[]'::json);
end $$;
revoke all on function public.admin_ref_review(int) from public, anon;
grant execute on function public.admin_ref_review(int) to authenticated;

-- Take a referral out (or put it back). A pass already earned keeps its end date.
create or replace function public.admin_void_referral(p_friend uuid, p_void boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  update referrals set void = coalesce(p_void, true), void_note = left(p_note, 200) where user_id = p_friend;
  return found;
end $$;
revoke all on function public.admin_void_referral(uuid, boolean, text) from public, anon;
grant execute on function public.admin_void_referral(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
