-- Migration 0021: question uses, holds and rules. Run after the migrations (see rls.sh). Each check raises on failure.
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1', 'ana@colegio.edu.co'), ('00000000-0000-0000-0000-0000000000b1', 'beto@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000c1', 'cami@colegio.edu.co'), ('00000000-0000-0000-0000-0000000000d1', 'coord@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000e1', 'otra@otro.edu.co');
insert into schools (id, name, domains, teacher_code) values
 ('11111111-1111-1111-1111-111111111111', 'Colegio', '{colegio.edu.co}', 'S1'), ('22222222-2222-2222-2222-222222222222', 'Otro', '{otro.edu.co}', 'S2');
insert into profiles (id, school_id, role, full_name, email) values
 ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'teacher', 'Ana', 'ana@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'teacher', 'Beto', 'beto@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'student', 'Cami', 'cami@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'school_admin', 'Coord', 'coord@colegio.edu.co'),
 ('00000000-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222', 'teacher', 'Otra', 'otra@otro.edu.co');
insert into courses (id, school_id, name, grade, group_label, subject, created_by) values
 ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Matemáticas 11A', '11', 'A', 'Matemáticas', '00000000-0000-0000-0000-0000000000a1'),
 ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Inglés 11A', '11', 'A', 'Inglés', '00000000-0000-0000-0000-0000000000b1');
insert into course_members (course_id, profile_id, email, role) values
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'ana@colegio.edu.co', 'teacher'),
 ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'beto@colegio.edu.co', 'teacher'),
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'cami@colegio.edu.co', 'student')
 on conflict do nothing;
insert into assignments (course_id, created_by, kind, title, exam_slug, question_keys) values
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'homework', 'Tarea 1', 'S11-A_1ra', '{1,2,3}');
insert into live_sessions (code, host_id, school_id, course_id, title, exam_slug, question_keys, current_index) values
 ('123456', '00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', null, 'Juego', 'S11-A_1ra', '{7,8,9}', 1),
 ('654321', '00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', null, 'Sin jugar', 'S11-A_1ra', '{10}', -1);
insert into lessons (school_id, owner_id, title, exam_slug, items) values
 ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'Clase', 'S11-A_1ra', '[{"type":"text"},{"type":"q","key":"20"}]');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.sub', u, false); execute 'set role authenticated'; end $$;
create or replace function pg_temp.expect(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', label; end if; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect(text, boolean) to public;

-- Beto (another class) sees Ana's homework, the two questions her game showed and her class slides.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect('beto cannot read ana''s assignment directly', (select count(*) from assignments where title = 'Tarea 1') = 0);
select pg_temp.expect('uses: 3 rows', (select count(*) from school_question_uses()) = 3);
select pg_temp.expect('homework with group', (select group_label = 'A' and teacher_name = 'Ana' from school_question_uses() where source = 'assignment'));
select pg_temp.expect('live shows only shown questions', (select question_keys = '{7,8}' from school_question_uses() where source = 'live'));
select pg_temp.expect('lesson keys', (select question_keys = '{20}' from school_question_uses() where source = 'lesson'));
-- Beto reserves a question; Ana cannot release it, coordination can.
insert into question_holds (school_id, exam_slug, qkey, reserve, hide_from_students, label, created_by)
 values ('11111111-1111-1111-1111-111111111111', 'S11-A_1ra', '5', true, true, 'Simulacro', '00000000-0000-0000-0000-0000000000b1');
insert into question_holds (school_id, exam_slug, reserve, hide_from_students, created_by)
 values ('11111111-1111-1111-1111-111111111111', 'S11-B_2da', false, true, '00000000-0000-0000-0000-0000000000b1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect('ana sees the holds', (select count(*) from question_holds) = 2);
delete from question_holds where qkey = '5';
select pg_temp.expect('ana cannot release beto''s hold', (select count(*) from question_holds) = 2);
do $$ begin insert into question_rules (school_id, rules) values ('11111111-1111-1111-1111-111111111111', '{"cross":"warn"}'); raise exception 'FAILED: teacher wrote rules';
  exception when insufficient_privilege then null; end $$;
-- The student: no holds, no uses, only what is hidden.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect('student reads no holds', (select count(*) from question_holds) = 0);
select pg_temp.expect('student gets no uses', (select count(*) from school_question_uses()) = 0);
select pg_temp.expect('student hidden list', (select count(*) from hidden_questions()) = 2 and (select count(*) from hidden_questions() where qkey is null and exam_slug = 'S11-B_2da') = 1);
-- Another school sees nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect('other school: no uses', (select count(*) from school_question_uses()) = 0);
select pg_temp.expect('other school: no holds', (select count(*) from question_holds) = 0 and (select count(*) from hidden_questions()) = 0);
-- Coordination: rules and releasing anyone's hold; an expired hold stops hiding.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into question_rules (school_id, rules) values ('11111111-1111-1111-1111-111111111111', '{"cross":"warn"}')
 on conflict (school_id) do update set rules = excluded.rules;
select pg_temp.expect('rules saved', (select rules ->> 'cross' from question_rules) = 'warn');
update question_holds set until = now() - interval '1 day' where qkey = '*';
select pg_temp.expect('expired hold not hidden', (select count(*) from hidden_questions()) = 1);
delete from question_holds where qkey = '5';
select pg_temp.expect('coordination released it', (select count(*) from question_holds where qkey = '5') = 0);
reset role;
select 'question control: all checks passed';
