-- Migration 0025 checks. Run after 0001, 0002 and the 0003-0024 all-in-one on a throwaway database with the auth stub of
-- rls.sh, then this seed, then 0025 (twice). It reproduces classes saved without grade/group ("Matemáticas 11 A", "11-A").
-- Seed:
insert into schools (id, name, domains) values ('00000000-0000-0000-0000-0000000000a1', 'Prado', '{prado.co}');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001','juan@prado.co'),('00000000-0000-0000-0000-000000000002','profe@prado.co'),('00000000-0000-0000-0000-000000000003','ana@prado.co');
insert into profiles (id, email, full_name, role, school_id) values
 ('00000000-0000-0000-0000-000000000001', 'juan@prado.co', 'Juan', 'school_admin', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000002', 'profe@prado.co', 'Profe', 'teacher', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-000000000003', 'ana@prado.co', 'Ana', 'student', '00000000-0000-0000-0000-0000000000a1');
-- Juan's real mess: classes without grade/group, scattered subjects, a bare 11-A and a prep course.
insert into courses (id, school_id, name, grade, subject, group_label, created_by) values
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Matemáticas 11 A', null, 'Matemáticas', null, '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'Lectura crítica 11 B', null, null, null, '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', '11-A', null, null, null, '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a1', 'Curso Preparación Saber 11 C', '11', null, null, '00000000-0000-0000-0000-000000000002');
insert into course_members (course_id, profile_id, email, full_name, role) values
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000003', 'ana@prado.co', 'Ana', 'student'),
 ('00000000-0000-0000-0000-0000000000c3', null, 'beto@prado.co', 'Beto', 'student'),
 ('00000000-0000-0000-0000-0000000000c4', null, 'caro@prado.co', 'Caro', 'student');
-- Run 0025 here, then:
\echo '--- classes per curso'
select grade || group_label as curso, count(*) filter (where course_area(subject, name) is not null) as subjects, count(*) as classes,
  string_agg(name, ' | ' order by name) from courses group by 1 order by 1;
\echo '--- students per subject class'
select c.name, count(m.*) filter (where m.role = 'student') as students, count(m.*) filter (where m.role='teacher') as teachers
  from courses c left join course_members m on m.course_id = c.id group by c.name order by c.name;
\echo '--- school_groups'
select grade, label from school_groups order by 1,2;
grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;
-- a teacher creates Inglés 11 D: the curso gets its other four subjects, and the teacher only teaches Inglés.
set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
insert into courses (school_id, name, grade, subject, group_label, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'Inglés 11 D', '11', 'Inglés', 'd', '00000000-0000-0000-0000-000000000002');
insert into course_members (course_id, email, full_name, role) select id, 'dani@prado.co', 'Dani', 'student' from courses where name = 'Inglés 11 D';
reset role;
\echo '--- 11D after a teacher created Inglés 11 D and added Dani'
select c.name, c.created_by = '00000000-0000-0000-0000-000000000002' as by_teacher,
  (select string_agg(m.email || ':' || m.role, ',' order by m.email) from course_members m where m.course_id = c.id) from courses c where group_label = 'D' order by name;
\echo '--- live scheduling'
set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select state, scheduled_at > now() from live_schedule('Repaso', 'S11-A_1ra', array['1','2'], 60, (select id from courses where name = 'Inglés 11 D'), now() + interval '2 hours');
reset role;
set request.jwt.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
\echo '--- Ana sees games of her classes (none in 11 D)'
select count(*) from student_live_games();
reset role;
update profiles set email = 'dani@prado.co' where id = '00000000-0000-0000-0000-000000000003';
update course_members set profile_id = '00000000-0000-0000-0000-000000000003' where email = 'dani@prado.co';
set role authenticated;
\echo '--- now as Dani: sees it, cannot join yet'
select title, state, scheduled_at is not null, questions from student_live_games();
do $$ begin perform live_join((select code from student_live_games() limit 1), 'Dani'); raise exception 'joined early'; exception when others then if sqlerrm <> 'not_open_yet' then raise; end if; end $$;
reset role;
set request.jwt.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select scheduled_at is null from live_reschedule((select id from live_sessions limit 1), null);
reset role;
set request.jwt.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select state from live_join((select code from student_live_games() limit 1), 'Dani');
\echo '--- complete_curso as student is refused'
do $$ begin perform complete_curso('11', 'A'); raise exception 'student allowed'; exception when others then if sqlerrm <> 'not_allowed' then raise; end if; end $$;
reset role;
\echo 'ALL OK'
