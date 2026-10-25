-- Migration 0026 checks: run after 0001-0025 (and the cursos_live_0025 seed) on the throwaway database of rls.sh.
\set ON_ERROR_STOP 1
insert into course_members (course_id, profile_id, email, full_name, role)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000002', 'profe@prado.co', 'Profe', 'teacher') on conflict do nothing;
grant all on all tables in schema public to authenticated;
-- the teacher posts to Matemáticas 11 A
set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
insert into class_announcements (course_id, title, body, author_id) values ('00000000-0000-0000-0000-0000000000c1', 'Simulacro el viernes', 'Traigan lápiz', '00000000-0000-0000-0000-000000000001');
reset role;
\echo '--- author and name come from the session, not the payload'
select title, author_id = '00000000-0000-0000-0000-000000000002' as own, author_name from class_announcements;
-- a student of the class reads it, and cannot post
set request.jwt.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
\echo '--- student sees'
select count(*) from class_announcements;
do $$ begin
  insert into class_announcements (course_id, title) values ('00000000-0000-0000-0000-0000000000c1', 'hack');
  raise exception 'student could post';
exception when insufficient_privilege then raise notice 'student blocked: ok';
end $$;
reset role;
-- a student of another class sees nothing
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000009', 'otro@prado.co') on conflict do nothing;
insert into profiles (id, email, full_name, role, school_id) values ('00000000-0000-0000-0000-000000000009', 'otro@prado.co', 'Otro', 'student', '00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
set request.jwt.sub = '00000000-0000-0000-0000-000000000009';
set role authenticated;
\echo '--- outsider sees'
select count(*) from class_announcements;
reset role;
\echo 'announcements: ALL OK'
