-- Scenarios for migration 0052 (amigos y parches). Run after all migrations on a throwaway database:
--   psql -h /tmp/pgt -p 5499 -U postgres -d <db> -f supabase/tests/friends_0052.sql
-- Every check raises an exception when it fails; everything is rolled back at the end.
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.sub', coalesce(u::text, ''), true); end $$;

insert into schools (id, name, domains) values ('00000000-0000-4000-8000-0000000000a1', 'Colegio de prueba', array['prueba.edu.co']) on conflict do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'ana@gmail.com'), ('00000000-0000-4000-8000-000000000002', 'beto@gmail.com'),
  ('00000000-0000-4000-8000-000000000003', 'caro@gmail.com'), ('00000000-0000-4000-8000-000000000004', 'dani@gmail.com')
on conflict do nothing;
insert into profiles (id, school_id, role, full_name, email) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'student', 'Ana María Pérez', 'ana@gmail.com'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'student', 'Beto Ruiz', 'beto@gmail.com'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 'student', 'Caro Díaz', 'caro@gmail.com'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', 'student', 'Dani', 'dani@gmail.com')
on conflict do nothing;

-- Beto practiced today, yesterday and the day before; Ana today and yesterday; Caro three days ago only.
insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct, answered_at) values
  ('00000000-0000-4000-8000-000000000002', 'b0', 'S11-B_1ra', '1', 'Matemáticas', 'A', true, now()),
  ('00000000-0000-4000-8000-000000000002', 'b0', 'S11-B_1ra', '2', 'Matemáticas', 'B', false, now()),
  ('00000000-0000-4000-8000-000000000002', 'b1', 'S11-B_1ra', '3', 'Inglés', 'C', true, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000002', 'b2', 'S11-B_1ra', '4', 'Inglés', 'C', true, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000001', 'a0', 'S11-B_1ra', '5', 'Lectura crítica', 'A', true, now()),
  ('00000000-0000-4000-8000-000000000001', 'a1', 'S11-B_1ra', '6', 'Lectura crítica', 'A', true, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000003', 'c0', 'S11-B_1ra', '7', 'Matemáticas', 'A', true, now() - interval '3 days');

set local role authenticated;

-- Cards: made on first use with the first name; nothing shared by default.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((my_friends() -> 'me' ->> 'name') = 'Ana', 'card takes the first name');
select pg_temp.ok((my_friends() -> 'me' ->> 'share') = 'nada', 'nothing shared by default');
select pg_temp.ok((my_friends() -> 'me' ->> 'streak')::int = 2, 'own streak counts today and yesterday');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002'); select my_friends();
select pg_temp.as_user('00000000-0000-4000-8000-000000000003'); select my_friends();
reset role;
create temp table codes as select user_id, code from friend_cards;
grant select on codes to authenticated;
set local role authenticated;

-- Requests: Ana asks Beto; Beto sees it; Beto accepts.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok(add_friend((select code from codes where user_id = '00000000-0000-4000-8000-000000000002')) ->> 'status' = 'sent', 'request sent');
select pg_temp.ok(add_friend((select code from codes where user_id = '00000000-0000-4000-8000-000000000001')) ->> 'error' = 'self', 'cannot add yourself');
select pg_temp.ok(add_friend('zzzzzz') ->> 'error' = 'unknown', 'unknown code');
select pg_temp.ok(json_array_length(my_friends() -> 'outgoing') = 1, 'outgoing request listed');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok((my_friends() -> 'incoming' -> 0 ->> 'name') = 'Ana', 'incoming request listed');
select answer_friend('00000000-0000-4000-8000-000000000001', true);
select pg_temp.ok(json_array_length(my_friends() -> 'friends') = 1, 'friends after accepting');

-- Privacy: Beto shares nothing yet, so Ana sees only the name.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'today') is null, 'hidden progress when not shared');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'streak') is null, 'hidden streak when not shared');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select set_friend_card(null, 'basico');
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'today')::boolean, 'basico shows today');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'streak')::int = 3, 'basico shows streak');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'areas') is null, 'basico hides areas');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'together') is null, 'racha juntos needs both to share');
select set_friend_card('Anita', 'basico');
select pg_temp.ok((my_friends() -> 'friends' -> 0 ->> 'together')::int = 2, 'racha juntos = days both practiced');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select set_friend_card(null, 'completo');
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok(json_array_length(my_friends() -> 'friends' -> 0 -> 'areas') = 2, 'completo shows areas');

-- Cheers: once a day, friends or parche members only.
select pg_temp.ok(cheer('00000000-0000-4000-8000-000000000002', 'animo') ->> 'ok' = 'true', 'cheer a friend');
select pg_temp.ok(cheer('00000000-0000-4000-8000-000000000002', 'bien') ->> 'error' = 'already_today', 'one cheer a day');
select pg_temp.ok(cheer('00000000-0000-4000-8000-000000000003', 'animo') ->> 'error' = 'not_friends', 'no cheers to strangers');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok((my_friends() -> 'cheers' -> 0 ->> 'from') = 'Anita', 'cheer received');
select mark_cheers_seen();
select pg_temp.ok(json_array_length(my_friends() -> 'cheers') = 0, 'cheers marked seen');

-- Parche: Ana makes one, invites Beto (a friend) but not Caro (not a friend). Beto accepts.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
create temp table g as select (create_study_group('Los de 11-B', 300, 'Anita') ->> 'id')::uuid as id;
select pg_temp.ok(invite_to_group((select id from g), '00000000-0000-4000-8000-000000000002') ->> 'status' = 'sent', 'invite a friend');
select pg_temp.ok(invite_to_group((select id from g), '00000000-0000-4000-8000-000000000003') ->> 'error' = 'not_friends', 'only friends are invited');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok((my_friends() -> 'invites' -> 0 ->> 'name') = 'Los de 11-B', 'invite listed');
select pg_temp.ok(answer_group_invite((select id from g), true) ->> 'status' = 'joined', 'invite accepted');
select pg_temp.ok(json_array_length(group_overview((select id from g)) -> 'members') = 2, 'two members');
select pg_temp.ok((group_overview((select id from g)) -> 'members' -> 0 ->> 'name') = 'Anita', 'members A-Z');
-- Both practiced today and the group was made today: a streak of 1, today done.
select pg_temp.ok((group_overview((select id from g)) ->> 'streak')::int = 1, 'group streak');
select pg_temp.ok((group_overview((select id from g)) ->> 'today_done')::boolean, 'today done when everyone practiced');
select pg_temp.ok(json_array_length(group_overview((select id from g)) -> 'missions') = 3, 'three missions a week');
select pg_temp.ok((group_overview((select id from g)) -> 'missions' -> 0 ->> 'id') = 'area', 'area mission always first');

-- Challenge and group practice.
select pg_temp.ok(create_group_challenge((select id from g), 'Reto de mate', 'Matemáticas', 'preguntas', 40, 7) ->> 'id' is not null, 'challenge made');
select pg_temp.ok(create_group_activity((select id from g), 'Lectura juntos', 'S11-B_1ra', array['10', '11', '12'], 'Lectura crítica', 5) ->> 'id' is not null, 'group practice made');
reset role;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct) values
  ('00000000-0000-4000-8000-000000000002', 'b9', 'S11-B_1ra', '10', 'Lectura crítica', 'A', true),
  ('00000000-0000-4000-8000-000000000002', 'b9', 'S11-B_1ra', '11', 'Lectura crítica', 'B', false),
  ('00000000-0000-4000-8000-000000000001', 'a9', 'S11-B_1ra', '10', 'Lectura crítica', 'A', false),
  ('00000000-0000-4000-8000-000000000001', 'a9', 'S11-B_1ra', '21', 'Matemáticas', 'A', true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((group_overview((select id from g)) -> 'challenges' -> 0 ->> 'progress')::int = 3, 'challenge counts the area since it started');
select pg_temp.ok((group_overview((select id from g)) -> 'activities' -> 0 -> 'questions' -> 0 ->> 'answered')::int = 2, 'two answered question 10');
select pg_temp.ok((group_overview((select id from g)) -> 'activities' -> 0 -> 'questions' -> 0 ->> 'pct')::int = 50, 'group percent on question 10');
select pg_temp.ok((group_overview((select id from g)) -> 'activities' -> 0 -> 'members' -> 1 ->> 'answered')::int = 2, 'Beto answered 2 of 3');
select pg_temp.ok(cheer('00000000-0000-4000-8000-000000000002', 'vamos', (select id from g)) ->> 'error' = 'already_today', 'parche cheer still once a day');

-- Strangers see nothing.
select pg_temp.as_user('00000000-0000-4000-8000-000000000003');
select pg_temp.ok(group_overview((select id from g)) ->> 'error' = 'not_member', 'non-member cannot read a parche');
select pg_temp.ok(create_group_challenge((select id from g), 'x reto', null, 'preguntas', 4, 3) ->> 'error' = 'not_member', 'non-member cannot add a challenge');
do $$ begin perform 1 from friendships; raise exception 'FAILED: friendships readable'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from friend_cards; raise exception 'FAILED: friend_cards readable'; exception when insufficient_privilege then null; end $$;
do $$ begin perform fg_streak('00000000-0000-4000-8000-000000000002'); raise exception 'FAILED: fg_streak callable'; exception when insufficient_privilege then null; end $$;

-- Removing a friend ends sharing.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select remove_friend('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(json_array_length(my_friends() -> 'friends') = 0, 'friend removed');

select 'friends_0052: all checks passed';
rollback;
