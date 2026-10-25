-- 0020 scenarios: view-only class access, subject grants, invitations, settings, audit. Run after 0001-0020.
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke select on public.schools from authenticated;
grant select (id, name, domains, status, created_at) on public.schools to authenticated;

insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000a2', 'mate@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000a3', 'lee@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000a4', 'profe@gmail.com'),
 ('00000000-0000-0000-0000-0000000000a5', 'est@colegio.edu.co');
insert into schools (id, name, domains, teacher_code) values ('11111111-1111-1111-1111-111111111111', 'Colegio', '{colegio.edu.co}', 'SECRET1');
insert into profiles (id, school_id, role, full_name, email) values
 ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'school_admin', 'Coord', 'coord@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'teacher', 'Mate', 'mate@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'teacher', 'Lee', 'lee@colegio.edu.co');

create or replace function pg_temp.as_user(u text, e text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.sub', u, false);
  perform set_config('request.jwt.email', e, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; end $$;
grant execute on function pg_temp.as_user(text, text), pg_temp.expect(text, boolean) to public;

-- Coordination: a curso, two classes of it, teachers with edit and view access.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
insert into school_groups (grade, label) values ('11', 'A');
select pg_temp.expect('curso saved', (select count(*) from school_groups) = 1);
insert into courses (id, school_id, name, grade, subject, group_label, created_by) values
 ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Matemáticas 11 A', '11', 'Matemáticas', 'A', '00000000-0000-0000-0000-0000000000a1'),
 ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Lectura crítica 11 A', '11', 'Lectura crítica', 'A', '00000000-0000-0000-0000-0000000000a1'),
 ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Física 10 B', '10', 'Física', 'B', '00000000-0000-0000-0000-0000000000a1');
insert into course_members (course_id, email, full_name, role, access) values
 ('33333333-3333-3333-3333-333333333331', 'mate@colegio.edu.co', 'Mate', 'teacher', 'edit'),
 ('33333333-3333-3333-3333-333333333332', 'lee@colegio.edu.co', 'Lee', 'teacher', 'edit'),
 ('33333333-3333-3333-3333-333333333332', 'mate@colegio.edu.co', 'Mate', 'teacher', 'view'),
 ('33333333-3333-3333-3333-333333333331', 'est@colegio.edu.co', 'Est', 'student', 'edit');
insert into assignments (course_id, created_by, kind, title, exam_slug, scope, status) values
 ('33333333-3333-3333-3333-333333333332', '00000000-0000-0000-0000-0000000000a1', 'task', 'Lectura 1', 'S11-A_1ra', 'all', 'active');

-- The math teacher edits math, only reads Lectura, and does not see Física.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'mate@colegio.edu.co');
select pg_temp.expect('mate sees 2 classes', (select count(*) from courses) = 2);
select pg_temp.expect('mate sees lectura activity', (select count(*) from assignments) = 1);
select pg_temp.expect('mate edits math', public.is_course_teacher('33333333-3333-3333-3333-333333333331'));
select pg_temp.expect('mate cannot edit lectura', not public.is_course_teacher('33333333-3333-3333-3333-333333333332'));
do $$ begin
  insert into assignments (course_id, created_by, kind, title, exam_slug, scope, status) values
   ('33333333-3333-3333-3333-333333333332', '00000000-0000-0000-0000-0000000000a2', 'task', 'x', 'S11-A_1ra', 'all', 'active');
  raise exception 'FAILED: view-only teacher created an activity';
exception when insufficient_privilege then null; end $$;
update assignments set title = 'hack' where course_id = '33333333-3333-3333-3333-333333333332';
select pg_temp.expect('view-only update ignored', (select title from assignments limit 1) = 'Lectura 1');
select pg_temp.expect('mate cannot read audit', (select count(*) from school_audit) = 0);

-- A subject grant: Lee reads Ciencias naturales in grade 10 (Física 10 B) without being on its roster.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
insert into subject_access (profile_id, area, grade, access) values ('00000000-0000-0000-0000-0000000000a3', 'Ciencias naturales', '10', 'view');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3', 'lee@colegio.edu.co');
select pg_temp.expect('grant shows física', (select count(*) from courses where subject = 'Física') = 1);
select pg_temp.expect('grant is read only', not public.is_course_teacher('33333333-3333-3333-3333-333333333333'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
update subject_access set access = 'edit';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3', 'lee@colegio.edu.co');
select pg_temp.expect('edit grant teaches', public.is_course_teacher('33333333-3333-3333-3333-333333333333'));

-- Teachers cannot write grants, cursos, settings or invites.
do $$ begin insert into subject_access (profile_id, area, access) values ('00000000-0000-0000-0000-0000000000a3', '*', 'edit');
  raise exception 'FAILED: teacher granted itself'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into school_groups (grade, label) values ('9', 'Z');
  raise exception 'FAILED: teacher created a curso'; exception when insufficient_privilege then null; end $$;
do $$ begin perform invite_staff('[{"email":"x@colegio.edu.co"}]');
  raise exception 'FAILED: teacher invited'; exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;

-- Settings: coordination turns off class creation by teachers.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
insert into school_settings (settings) values ('{"teachers_create_classes": false, "year": 2026}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'mate@colegio.edu.co');
select pg_temp.expect('teacher reads settings', (select settings ->> 'year' from school_settings) = '2026');
do $$ begin insert into courses (school_id, name, created_by) values ('11111111-1111-1111-1111-111111111111', 'Mía', '00000000-0000-0000-0000-0000000000a2');
  raise exception 'FAILED: teacher created a class while it is off'; exception when insufficient_privilege then null; end $$;

-- Invitations: an outside Gmail joins the school as a teacher without the code; an existing account is promoted.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
select pg_temp.expect('invite statuses', (select string_agg(status, ',' order by email) from invite_staff('[{"email":"Profe@Gmail.com","name":"Profe"},{"email":"lee@colegio.edu.co","role":"school_admin"},{"email":"nope"}]')) = 'updated,skipped,invited');
select pg_temp.expect('lee promoted', (select role from profiles where email = 'lee@colegio.edu.co') = 'school_admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4', 'profe@gmail.com');
select pg_temp.expect('invited gmail is teacher', (select role from claim_profile(null, null)) = 'teacher');
select pg_temp.expect('invited gmail school', (select school_id from profiles where id = '00000000-0000-0000-0000-0000000000a4') = '11111111-1111-1111-1111-111111111111');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5', 'est@colegio.edu.co');
select pg_temp.expect('uninvited student', (select role from claim_profile(null, null)) = 'student');
select pg_temp.expect('student teachers list skips view-only', (select teachers from student_classes() limit 1) = '{Mate}');

-- School name and teacher code; the audit log records them.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'coord@colegio.edu.co');
select update_school_name('Colegio Nuevo');
select pg_temp.expect('code changed', regenerate_teacher_code() <> 'SECRET1');
select pg_temp.expect('audit rows', (select count(*) from school_audit) >= 4);
insert into school_audit (action, detail) values ('class_teacher', '{"x":1}');
select 'rls_0020: all checks passed';
