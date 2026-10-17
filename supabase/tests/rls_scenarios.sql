-- Scenarios: two schools, a teacher, two students, an outsider. Each check raises on failure.
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- keep the column-level restriction from the migration for schools
revoke select on public.schools from authenticated;
grant select (id, name, domains, status, created_at) on public.schools to authenticated;

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co'),
 ('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co'),
 ('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co'),
 ('00000000-0000-0000-0000-00000000000e', 'x@gmail.com');
insert into schools (id, name, domains, teacher_code) values
 ('11111111-1111-1111-1111-111111111111', 'Colegio', '{colegio.edu.co}', 'SECRET1'),
 ('22222222-2222-2222-2222-222222222222', 'Otro', '{otro.edu.co}', 'SECRET2');

create or replace function pg_temp.as_user(u text, e text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.sub', u, false);
  perform set_config('request.jwt.email', e, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; end $$;
grant execute on function pg_temp.as_user(text, text), pg_temp.expect(text, boolean) to public;

-- 1. claim_profile: domain decides the school, code decides the role
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
select pg_temp.expect('teacher with code', (select role from claim_profile('secret1', 'Ana')) = 'teacher');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'x@gmail.com');
do $$ begin perform claim_profile(null, null); raise exception 'FAILED: unknown domain accepted';
  exception when others then if sqlerrm <> 'school_not_found' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
do $$ begin perform claim_profile('WRONG', null); raise exception 'FAILED: bad code accepted';
  exception when others then if sqlerrm <> 'bad_teacher_code' then raise; end if; end $$;
select pg_temp.expect('student without code', (select role from claim_profile(null, 'Dora')) = 'student');

-- 2. teacher creates a course, adds a roster before the students sign in
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
-- RETURNING is what the app does (insert ... select): the creator must be able to read the row it just made
insert into courses (id, school_id, name, created_by) values
 ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11-A', '00000000-0000-0000-0000-00000000000a')
 returning id;
insert into course_members (course_id, email, full_name) values
 ('33333333-3333-3333-3333-333333333333', 'beto@colegio.edu.co', 'Beto'),
 ('33333333-3333-3333-3333-333333333333', 'cami@colegio.edu.co', 'Cami');
select pg_temp.expect('creator is course teacher', (select count(*) from course_members where role = 'teacher') = 1);

-- 3. students sign in and get linked to the roster; they see only their own row and course
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('student claim', (select role from claim_profile(null, 'Beto')) = 'student');
select pg_temp.expect('student sees own member row only', (select count(*) from course_members) = 1);
select pg_temp.expect('student sees course', (select count(*) from courses) = 1);
select pg_temp.expect('student cannot see classmates profiles', (select count(*) from profiles) = 1);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
select claim_profile(null, 'Cami');

-- 4. students cannot read the teacher code, cannot create courses, cannot self-promote
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
do $$ begin perform teacher_code from schools; raise exception 'FAILED: teacher_code readable';
  exception when insufficient_privilege then null; end $$;
select pg_temp.expect('no teacher code via function', public.school_teacher_code() is null);
do $$ begin
  insert into courses (school_id, name, created_by) values ('11111111-1111-1111-1111-111111111111', 'x', '00000000-0000-0000-0000-00000000000b');
  raise exception 'FAILED: student created course';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
do $$ begin
  update profiles set role = 'teacher' where id = '00000000-0000-0000-0000-00000000000b';
  raise exception 'FAILED: self-promotion allowed';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect('role unchanged', (select role from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'student');

-- 5. teacher assigns; students see it; outsiders do not
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
insert into assignments (id, course_id, created_by, kind, title, exam_slug, scope, question_keys)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-00000000000a', 'homework', 'Tarea 1', 'S11-A_1ra', 'Matemáticas', array['1','2','3']);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('student sees assignment', (select count(*) from assignments) = 1);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
select pg_temp.expect('other school sees nothing', (select count(*) from assignments) = 0 and (select count(*) from courses) = 0);

-- 6. attempts: own insert ok, upload twice is one row, classmate cannot read, teacher can
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
insert into attempts (profile_id, assignment_id, client_id, exam_slug, scope, mode, started_at, submitted_at, answers, score)
values ('00000000-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444', 'c1', 'S11-A_1ra', 'Matemáticas', 'practice', now(), now(), '{"1":"A"}', '{"correct":1,"total":3}');
do $$ begin
  insert into attempts (profile_id, assignment_id, client_id, exam_slug, mode, started_at)
  values ('00000000-0000-0000-0000-00000000000c', null, 'forged', 's', 'practice', now());
  raise exception 'FAILED: forged attempt for another student';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
select pg_temp.expect('classmate cannot read attempt', (select count(*) from attempts) = 0);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
select pg_temp.expect('teacher reads assignment attempts', (select count(*) from attempts) = 1);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
select pg_temp.expect('other school teacher/student reads none', (select count(*) from attempts) = 0);

-- 7. a student cannot assign work or edit the roster
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
do $$ begin
  insert into course_members (course_id, email) values ('33333333-3333-3333-3333-333333333333', 'z@colegio.edu.co');
  raise exception 'FAILED: student edited roster';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;

-- 8. attempt limits and the open window (0003)
reset role;
update assignments set max_attempts = 1 where id = '44444444-4444-4444-4444-444444444444';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
-- the retried upload of the first attempt (same client_id) still works
insert into attempts (profile_id, assignment_id, client_id, exam_slug, scope, mode, started_at, submitted_at, answers, score)
values ('00000000-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444', 'c1', 'S11-A_1ra', 'Matemáticas', 'practice', now(), now(), '{"1":"A"}', '{"correct":1,"total":3}')
on conflict (profile_id, client_id) do nothing;
do $$ begin
  insert into attempts (profile_id, assignment_id, client_id, exam_slug, mode, started_at)
  values ('00000000-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444', 'c2', 'S11-A_1ra', 'practice', now());
  raise exception 'FAILED: second attempt allowed with max_attempts = 1';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
reset role;
update assignments set max_attempts = null, due_at = now() - interval '3 hours' where id = '44444444-4444-4444-4444-444444444444';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
do $$ begin
  insert into attempts (profile_id, assignment_id, client_id, exam_slug, mode, started_at)
  values ('00000000-0000-0000-0000-00000000000b', '44444444-4444-4444-4444-444444444444', 'c3', 'S11-A_1ra', 'practice', now());
  raise exception 'FAILED: attempt accepted long after the due date';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
reset role;
update assignments set due_at = null where id = '44444444-4444-4444-4444-444444444444';

-- 9. roles: only the coordinator changes them, only in their school, never their own
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
do $$ begin perform set_profile_role('00000000-0000-0000-0000-00000000000b', 'teacher'); raise exception 'FAILED: teacher changed a role';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;
reset role;
update profiles set role = 'school_admin' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
select pg_temp.expect('admin promotes student', (select role from set_profile_role('00000000-0000-0000-0000-00000000000b', 'teacher')) = 'teacher');
do $$ begin perform set_profile_role('00000000-0000-0000-0000-00000000000a', 'student'); raise exception 'FAILED: admin changed own role';
  exception when others then if sqlerrm <> 'not_yourself' then raise; end if; end $$;
do $$ begin perform set_profile_role('00000000-0000-0000-0000-00000000000d', 'teacher'); raise exception 'FAILED: admin changed another school';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end $$;
select pg_temp.expect('admin sees teachers of the school', (select count(*) from profiles where role in ('teacher', 'school_admin')) = 2);

-- 10. consent: own records, the coordinator records the school's, nobody forges another person's
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
insert into consents (profile_id, kind, version) values ('00000000-0000-0000-0000-00000000000c', 'terms', 'v1');
do $$ begin insert into consents (profile_id, kind, version) values ('00000000-0000-0000-0000-00000000000b', 'terms', 'v1');
  raise exception 'FAILED: consent forged for another person';
  exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
do $$ begin insert into school_consents (school_id, kind, version, granted_by) values ('11111111-1111-1111-1111-111111111111', 'guardian_authorization', 'v1', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FAILED: student recorded school consent';
  exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
insert into school_consents (school_id, kind, version, granted_by) values ('11111111-1111-1111-1111-111111111111', 'guardian_authorization', 'v1', '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect('admin reads school consent and a student consent', (select count(*) from school_consents) = 1 and (select count(*) from consents) = 1);

-- 11. live sessions: teachers host, anyone with the code joins, answers are timed and final
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000f', '');   -- an anonymous guest has no email
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');   -- beto was promoted to teacher in section 9
create temp table _ls (id uuid, code text);
grant all on _ls to authenticated;
insert into _ls select id, code from live_create('Juego', 'S11-A_1ra', array['1','2'], 30, null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');   -- cami is a plain student
do $$ begin perform live_create('X', 'S11-A_1ra', array['1'], 30, null); raise exception 'FAILED: student created a live room';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;
select pg_temp.expect('student finds nothing before joining', (select count(*) from live_sessions) = 0);
select pg_temp.expect('student joins by code', (select state from live_join((select code from _ls), 'Cami')) = 'lobby');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f', '');
select pg_temp.expect('guest joins by code', (select state from live_join((select code from _ls), 'Invitado')) = 'lobby');
do $$ begin perform live_join('000000x', 'Nadie'); raise exception 'FAILED: bad code joined';
  exception when others then if sqlerrm <> 'session_not_found' then raise; end if; end $$;
-- answers only while a question is open
do $$ begin insert into live_answers (session_id, player_id, question_index, option) select id, '00000000-0000-0000-0000-00000000000f', 0, 'A' from _ls;
  raise exception 'FAILED: answer accepted in the lobby';
  exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('host opens question 0', (select state from live_next((select id from _ls), 0)) = 'question');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f', '');
insert into live_answers (session_id, player_id, question_index, option) select id, '00000000-0000-0000-0000-00000000000f', 0, 'B' from _ls;
do $$ begin insert into live_answers (session_id, player_id, question_index, option) select id, '00000000-0000-0000-0000-00000000000f', 0, 'C' from _ls;
  raise exception 'FAILED: second answer accepted';
  exception when unique_violation then null; end $$;
do $$ begin insert into live_answers (session_id, player_id, question_index, option) select id, '00000000-0000-0000-0000-00000000000c', 0, 'C' from _ls;
  raise exception 'FAILED: answered as another player';
  exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.expect('guest cannot read other answers', (select count(*) from live_answers) = 1);
select pg_temp.expect('guest sees both players', (select count(*) from live_players) = 2);
do $$ begin perform live_reveal((select id from _ls), array['B'], '[]'); raise exception 'FAILED: guest revealed';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('host reads answers', (select count(*) from live_answers) = 1);
select pg_temp.expect('reveal', (select state from live_reveal((select id from _ls), array['B'], '[{"player_id":"00000000-0000-0000-0000-00000000000f","points":900}]')) = 'reveal');
select pg_temp.expect('score and streak updated', (select score from live_players where player_id = '00000000-0000-0000-0000-00000000000f') = 900
  and (select streak from live_players where player_id = '00000000-0000-0000-0000-00000000000f') = 1
  and (select streak from live_players where player_id = '00000000-0000-0000-0000-00000000000c') = 0);
select pg_temp.expect('answer points stored', (select points from live_answers) = 900);
reset role;
update live_sessions set question_started_at = now() - interval '5 minutes', state = 'question', current_index = 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f', '');
do $$ begin insert into live_answers (session_id, player_id, question_index, option) select id, '00000000-0000-0000-0000-00000000000f', 1, 'A' from _ls;
  raise exception 'FAILED: answer accepted after the time ran out';
  exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
select pg_temp.expect('outsider sees no live data', (select count(*) from live_sessions) = 0 and (select count(*) from live_players) = 0);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('host ends the room', (select state from live_end((select id from _ls))) = 'ended');
select pg_temp.expect('clock', live_now() is not null);

-- 12. teacher questions: owner and school-shared staff, students only through an assignment, never other schools
reset role;
update profiles set role = 'school_admin' where id = '00000000-0000-0000-0000-00000000000b';  -- beto is the admin of Colegio for this section
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
insert into teacher_questions (id, school_id, owner_id, area, question_json, answer) values
 ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'Matemáticas', '{"stem_md":"2+2","options":[]}', 'B'),
 ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'Matemáticas', '{"stem_md":"3+3","options":[]}', 'C');
update teacher_questions set visibility = 'school' where id = '55555555-5555-5555-5555-555555555552';
do $$ begin
  insert into teacher_questions (school_id, owner_id, area, question_json, answer) values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', '', '{}', 'A');
  raise exception 'FAILED: question created in another school';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'beto@colegio.edu.co');
select pg_temp.expect('staff sees only the shared question', (select count(*) from teacher_questions) = 1);
do $$ begin update teacher_questions set answer = 'D' where id = '55555555-5555-5555-5555-555555555552';
  if found then raise exception 'FAILED: another teacher edited a question'; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
select pg_temp.expect('student sees none before an assignment', (select count(*) from teacher_questions) = 0);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
insert into assignments (course_id, created_by, kind, title, exam_slug, scope, question_keys)
values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-00000000000a', 'task', 'Propias', 'teacher', 'all', array['55555555-5555-5555-5555-555555555551']);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
select pg_temp.expect('student sees only the assigned question', (select count(*) from teacher_questions) = 1
  and (select id from teacher_questions) = '55555555-5555-5555-5555-555555555551');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
select pg_temp.expect('other school sees none', (select count(*) from teacher_questions) = 0);

-- 13. personal assignments, paper results, family reports
reset role;
-- state: ana is teacher+admin of Colegio (set in 9), beto admin (12), cami and the course 3333 student rows
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
insert into assignments (id, course_id, created_by, kind, title, exam_slug, scope, question_keys, assignee_id)
values ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-00000000000a',
        'task', 'Refuerzo de Cami', 'S11-A_1ra', 'all', array['1'], '00000000-0000-0000-0000-00000000000c');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'cami@colegio.edu.co');
select pg_temp.expect('cami sees her personal assignment', (select count(*) from assignments where id = '66666666-6666-6666-6666-666666666666') = 1);
reset role;
-- a classmate who is a member of the course: add dani (student) to course 3333
insert into auth.users values ('00000000-0000-0000-0000-000000000010', 'dani@colegio.edu.co');
insert into course_members (course_id, email, full_name) values ('33333333-3333-3333-3333-333333333333', 'dani@colegio.edu.co', 'Dani');
select pg_temp.as_user('00000000-0000-0000-0000-000000000010', 'dani@colegio.edu.co');
select claim_profile(null, 'Dani');
select pg_temp.expect('a classmate does not see it', (select count(*) from assignments where id = '66666666-6666-6666-6666-666666666666') = 0);
do $$ begin
  insert into attempts (profile_id, assignment_id, client_id, exam_slug, mode, started_at)
  values ('00000000-0000-0000-0000-000000000010', '66666666-6666-6666-6666-666666666666', 'dx', 'S11-A_1ra', 'practice', now());
  raise exception 'FAILED: classmate attempted someone elses personal assignment';
exception when insufficient_privilege then null; when others then if sqlstate <> '42501' then raise; end if; end $$;
-- paper results belong to roster rows, so students who never signed in still count
reset role;
insert into course_members (id, course_id, email, full_name) values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'eva@colegio.edu.co', 'Eva');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
select paper_submit('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', '{"1":"A"}', '{"correct":1,"total":3,"keyed":true}');
select paper_submit('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', '{"1":"B"}', '{"correct":0,"total":3,"keyed":true}');
select pg_temp.expect('paper result stored once and replaced, with no profile', (select count(*) from attempts where mode = 'paper') = 1 and (select answers ->> '1' from attempts where mode = 'paper') = 'B' and (select profile_id from attempts where mode = 'paper') is null);
select pg_temp.expect('teacher reads the paper result', (select count(*) from attempts where member_id is not null) = 1);
do $$ begin perform paper_submit('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-00000000dead', '{}', '{}'); raise exception 'FAILED: paper result for a stranger';
  exception when others then if sqlerrm <> 'not_a_student_of_course' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'dora@otro.edu.co');
do $$ begin perform paper_submit('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', '{}', '{}'); raise exception 'FAILED: outsider submitted paper results';
  exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;
-- Eva signs in later: her paper result becomes hers
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000011', 'eva@colegio.edu.co');
select pg_temp.as_user('00000000-0000-0000-0000-000000000011', 'eva@colegio.edu.co');
select claim_profile(null, 'Eva');
select pg_temp.expect('paper result follows the student after sign-in', (select count(*) from attempts where mode = 'paper' and profile_id = '00000000-0000-0000-0000-000000000011') = 1);
-- family report: needs the school's guardian authorization (recorded in section 10), readable without login by token
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
create temp table _fr (token text);
grant all on _fr to authenticated, anon;
insert into _fr select create_family_report('00000000-0000-0000-0000-000000000010', '{"student":"Dani","band":{"low":220,"high":280}}');
do $$ begin perform create_family_report('00000000-0000-0000-0000-00000000000d', '{}'); raise exception 'FAILED: report for a student of another school';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end $$;
reset role;
set role anon;
select pg_temp.expect('anyone with the token reads it', (select family_report((select token from _fr)) ->> 'school') = 'Colegio');
select pg_temp.expect('a wrong token reads nothing', family_report('nope') is null);
do $$ begin perform * from family_reports; raise exception 'FAILED: anon listed reports';
  exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
select revoke_family_report((select token from _fr));
set role anon;
select pg_temp.expect('revoked link reads nothing', family_report((select token from _fr)) is null);
reset role;
delete from school_consents;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'ana@colegio.edu.co');
do $$ begin perform create_family_report('00000000-0000-0000-0000-000000000010', '{}'); raise exception 'FAILED: report without guardian authorization';
  exception when others then if sqlerrm <> 'no_guardian_authorization' then raise; end if; end $$;
