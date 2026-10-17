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
insert into courses (id, school_id, name, created_by) values
 ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11-A', '00000000-0000-0000-0000-00000000000a');
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
