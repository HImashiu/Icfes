-- Scenarios for migration 0051 (teacher referrals). Run on a throwaway database after every migration:
--   psql -h /tmp/pgt -p 5499 -U postgres -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/teacher_referrals_0051.sql
-- Every check raises an exception when it fails. Everything runs in one transaction and is rolled back.
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.sub', coalesce(u::text, ''), true); end $$;
create or replace function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- School A: a self-serve workspace (trial). School B: another school.
insert into schools (id, name, domains) values
  ('00000000-0000-4000-8000-0000000000a1', 'IE San José', array['prueba-a.invalid']),
  ('00000000-0000-4000-8000-0000000000b1', 'Colegio B', array['prueba-b.invalid']);
insert into trial_codes (code, school_name, contact, max_teachers, expires_at, school_id, source)
values ('CND-AAAA-BBBB-CCCC-DDDD', 'IE San José', 'luis@gmail.com', 15, now() + interval '30 days', '00000000-0000-4000-8000-0000000000a1', 'self');

-- 1 Luis (referrer, school A) · 2 Marta (colleague by link, school B) · 3 Pedro (joined Luis's workspace)
-- 4 Sara (student account trying the teacher panel) · 100+ students
insert into auth.users (id, email) select pg_temp.u(n), 'u' || n || '@gmail.com' from generate_series(1, 4) n;
insert into auth.users (id, email) select pg_temp.u(n), 'e' || n || '@gmail.com' from generate_series(100, 140) n;
insert into profiles (id, school_id, role, full_name, email) values
  (pg_temp.u(1), '00000000-0000-4000-8000-0000000000a1', 'teacher', 'Luis Gómez', 'u1@gmail.com'),
  (pg_temp.u(2), '00000000-0000-4000-8000-0000000000b1', 'teacher', 'Marta Ruiz', 'u2@gmail.com'),
  (pg_temp.u(3), '00000000-0000-4000-8000-0000000000a1', 'teacher', 'Pedro Díaz', 'u3@gmail.com'),
  (pg_temp.u(4), '00000000-0000-4000-8000-0000000000b1', 'student', 'Sara', 'u4@gmail.com');
insert into profiles (id, school_id, role, full_name, email)
  select pg_temp.u(n), '00000000-0000-4000-8000-0000000000b1', 'student', 'Est ' || n, 'e' || n || '@gmail.com' from generate_series(100, 140) n;
insert into trial_redemptions (profile_id, code, school_id) values
  (pg_temp.u(1), 'CND-AAAA-BBBB-CCCC-DDDD', '00000000-0000-4000-8000-0000000000a1'),
  (pg_temp.u(3), 'CND-AAAA-BBBB-CCCC-DDDD', '00000000-0000-4000-8000-0000000000a1');

-- Courses: Marta's 11-A has students 100..129; Luis's own 11-B has 130..140 plus 100 (shared with Marta).
insert into courses (id, school_id, name, created_by) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b1', '11-A', pg_temp.u(2)),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000a1', '11-B', pg_temp.u(1));
insert into course_members (course_id, profile_id, email, role)
  select '00000000-0000-4000-8000-00000000c001'::uuid, pg_temp.u(n), 'e' || n || '@gmail.com', 'student' from generate_series(100, 129) n;
insert into course_members (course_id, profile_id, email, role)
  select '00000000-0000-4000-8000-00000000c002'::uuid, pg_temp.u(n), 'e' || n || '@gmail.com', 'student' from generate_series(130, 140) n
  union all select '00000000-0000-4000-8000-00000000c002'::uuid, pg_temp.u(100), 'e100@gmail.com', 'student';

-- Answers: students 100..124 answer 20 questions over 3 days (active); 125..129 answer 20 in one day (not active);
-- Luis's own students 130..140 are active too (they must not count).
insert into answer_log (user_id, attempt_id, exam_slug, qkey, answered_at)
  select pg_temp.u(n), 'a' || d, 'S11-A', 'q' || q, now() - interval '20 days' + make_interval(days => d)
    from generate_series(100, 124) n, generate_series(0, 2) d, generate_series(1, 7) q;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, answered_at)
  select pg_temp.u(n), 'a0', 'S11-A', 'q' || q, now() - interval '2 days' from generate_series(125, 129) n, generate_series(1, 25) q;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, answered_at)
  select pg_temp.u(n), 'a' || d, 'S11-A', 'q' || q, now() - interval '10 days' + make_interval(days => d)
    from generate_series(130, 140) n, generate_series(0, 2) d, generate_series(1, 7) q;

select pg_temp.ok(tref_is_active(pg_temp.u(100)), 'active: 21 answers on 3 days');
select pg_temp.ok(not tref_is_active(pg_temp.u(125)), 'not active: all answers on one day');

set local role authenticated;

-- Marta signs in with Luis's link (via docente).
select pg_temp.as_user(pg_temp.u(1));
select set_config('t.code', my_referral_code(), true);
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok(claim_referral(current_setting('t.code'), 'docente') = 'ok', 'claim with via docente');
reset role;
select pg_temp.ok((select via from referrals where user_id = pg_temp.u(2)) = 'docente', 'via stored as docente');
-- Pedro joined Luis's workspace through Luis's invite.
update trial_redemptions set invited_by = pg_temp.u(1) where profile_id = pg_temp.u(3);
set local role authenticated;

-- Luis: 2 invited, 1 colleague counts (Marta, 24 active students; 100 is also Luis's own student and is left out).
select pg_temp.as_user(pg_temp.u(1));
select set_config('t.r', my_teacher_referrals()::text, true);
select pg_temp.ok((current_setting('t.r')::json ->> 'invited')::int = 2, 'two colleagues invited');
select pg_temp.ok((current_setting('t.r')::json ->> 'colleagues')::int = 1, 'one colleague counts (Pedro has no students)');
select pg_temp.ok((current_setting('t.r')::json ->> 'students')::int = 24, 'active students: 101..124 (100 is his own)');
select pg_temp.ok((current_setting('t.r')::json ->> 'level')::int = 1, 'level 1 (Aliado)');
select pg_temp.ok((current_setting('t.r')::json -> 'next' ->> 'level')::int = 2, 'next level is 2');
select pg_temp.ok(json_array_length(current_setting('t.r')::json -> 'list') = 2, 'list shows both colleagues');
select pg_temp.ok(position('Est ' in current_setting('t.r')) = 0, 'no student names in the answer');

-- Level 1 gives no limits yet.
reset role;
select pg_temp.ok(teacher_ref_bonus('00000000-0000-4000-8000-0000000000a1', 'booklets') = 0, 'no booklet bonus at level 1');
select pg_temp.ok(tref_student_bonus(pg_temp.u(130)) = 0, 'no question bonus at level 1');

-- Lower level 2 to what Luis has: booklets for his trial workspace, questions for his students.
update app_limits set value = 1 where key = 'tref_l2_colleagues';
update app_limits set value = 20 where key = 'tref_l2_students';
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((my_teacher_referrals() ->> 'level')::int = 2, 'level 2 (Embajador)');
select pg_temp.ok((bank_quota() ->> 'school_limit')::int = 28, 'trial workspace: 14 + 14 booklets');
select pg_temp.ok((bank_quota() ->> 'day_limit')::int = 12, 'trial teacher: 8 + 4 a day');
select pg_temp.as_user(pg_temp.u(3));
select pg_temp.ok((bank_quota() ->> 'school_limit')::int = 28, 'same workspace, colleague also gets it');
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok((bank_quota() ->> 'school_limit') is null, 'Marta is not on a trial: no school cap');
reset role;
select pg_temp.ok(tref_student_bonus(pg_temp.u(130)) = 10, 'Luis''s student gets +10 questions a day');
select pg_temp.ok(growth_bonus_questions(pg_temp.u(130)) >= 10, 'growth_bonus_questions includes it');
select pg_temp.ok(tref_student_bonus(pg_temp.u(101)) = 0, 'Marta''s student: Marta is level 0');

-- Raising the bar again never takes a level away.
update app_limits set value = 3 where key = 'tref_l2_colleagues';
update app_limits set value = 100 where key = 'tref_l2_students';
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((my_teacher_referrals() ->> 'level')::int = 2, 'level kept');
reset role;
select pg_temp.ok((select reached_at ? '2' from teacher_ref_levels where user_id = pg_temp.u(1)), 'date level 2 was reached');

-- Students can't call it; nobody reads the tables or the view directly.
set local role authenticated;
select pg_temp.as_user(pg_temp.u(4));
do $$ begin perform my_teacher_referrals(); raise exception 'FAILED: a student read teacher referrals';
exception when others then if sqlerrm not like '%not_teacher%' then raise; end if; end $$;
do $$ begin perform 1 from teacher_ref_levels; raise exception 'FAILED: table readable';
exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from teacher_referrals; raise exception 'FAILED: view readable';
exception when insufficient_privilege then null; end $$;
do $$ begin perform tref_refresh(auth.uid()); raise exception 'FAILED: tref_refresh callable';
exception when insufficient_privilege then null; end $$;
reset role;

select pg_temp.ok((select value from app_limits where key = 'self_trial_teachers') = 50, '50 teachers per self-serve workspace');
select 'teacher referrals 0051: all checks passed';
rollback;
