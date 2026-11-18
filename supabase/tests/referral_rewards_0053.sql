-- Scenarios for migration 0053 (referral rewards). Run after all migrations on a throwaway database:
--   psql -h /tmp/pgt -p 5499 -U postgres -d <db> -f supabase/tests/referral_rewards_0053.sql
-- Every check raises an exception when it fails; everything is rolled back at the end.
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.sub', coalesce(u::text, ''), true); end $$;
-- n answers for a user, spread over `d` different days.
create or replace function pg_temp.answers(u uuid, n int, d int) returns void language sql as $$
  insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct, answered_at)
  select u, 't' || g || '-' || left(md5(random()::text), 6), 'S11-A_1ra', g::text, 'Matemáticas', 'A', true, now() - make_interval(days => g % d) from generate_series(1, n) g;
$$;
create or replace function pg_temp.device(u uuid, v uuid) returns void language sql as $$
  insert into site_visitors (visitor_id, user_id) values (v, u) on conflict (visitor_id) do update set user_id = excluded.user_id;
$$;
-- uuids: 1 Ana (referrer), 2..9 and 10..12 friends, 20 teacher, 30 admin
create or replace function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into schools (id, name, domains) values ('00000000-0000-4000-8000-0000000000a1', 'Colegio de prueba', array['prueba.edu.co']) on conflict do nothing;
insert into auth.users (id, email) select pg_temp.u(n), 'u' || n || '@gmail.com' from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,20,30]) n on conflict do nothing;
insert into profiles (id, school_id, role, full_name, email, created_at)
select pg_temp.u(n), '00000000-0000-4000-8000-0000000000a1', case when n = 20 then 'teacher' else 'student' end,
       (array['Ana Pérez','Beto','Caro','Dani','Eva','Fer','Gabo','Hugo','Iris','Juli','Kata','Leo'])[least(n, 12)] || ' X', 'u' || n || '@gmail.com',
       case when n = 1 then now() - interval '60 days' else now() - interval '1 day' end
  from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,20,30]) n
on conflict (id) do update set role = excluded.role, created_at = excluded.created_at;
update profiles set full_name = 'Profe Luis' where id = pg_temp.u(20);
insert into app_admins (user_id) values (pg_temp.u(30)) on conflict do nothing;
-- Devices: everyone on their own, except Caro (3) on Ana's phone and Dani (4) on Beto's.
select pg_temp.device(pg_temp.u(n), ('11111111-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid) from unnest(array[1,2,5,6,7,8,9,10,11,12,20]) n;
select pg_temp.device(pg_temp.u(1), '22222222-0000-4000-8000-000000000001');
select pg_temp.device(pg_temp.u(3), '22222222-0000-4000-8000-000000000001');
select pg_temp.device(pg_temp.u(2), '22222222-0000-4000-8000-000000000002');
select pg_temp.device(pg_temp.u(4), '22222222-0000-4000-8000-000000000002');
select pg_temp.ok((select count(*) from account_devices where visitor_id = '22222222-0000-4000-8000-000000000001') = 2, 'devices remember every account, not only the last');

set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
create temp table c as select my_referral_code() as code;
grant select on c to authenticated;
select pg_temp.ok((practice_quota() ->> 'limit')::int = 40, 'base: 40 a day');
select pg_temp.ok((simulacro_quota() ->> 'remaining')::int = 1, 'base: 1 full simulacro a month');

-- Beto and Caro join with the link (Dani a minute later).
select pg_temp.as_user(pg_temp.u(2)); select pg_temp.ok(claim_referral((select code from c)) = 'ok', 'Beto claims');
select pg_temp.ok((practice_quota() ->> 'limit')::int = 80, 'friend who arrives: 40 + 40 welcome');
select pg_temp.ok((simulacro_quota() ->> 'remaining')::int = 2, 'friend who arrives: 1 + 1 welcome simulacro');
select pg_temp.as_user(pg_temp.u(3)); select pg_temp.ok(claim_referral((select code from c)) = 'ok', 'Caro claims');
select pg_temp.ok((practice_quota() ->> 'limit')::int = 40, 'same phone as Ana: no welcome bonus');
reset role; update referrals set at = now() - interval '1 minute' where user_id in (pg_temp.u(2), pg_temp.u(3)); set local role authenticated;
select pg_temp.as_user(pg_temp.u(4)); select pg_temp.ok(claim_referral((select code from c)) = 'ok', 'Dani claims');

-- Nobody counts before practicing.
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int = 0, 'nothing before practice');
reset role;
select pg_temp.answers(pg_temp.u(2), 19, 2);
set local role authenticated;
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int = 0, '19 answers are not enough');
reset role; select pg_temp.answers(pg_temp.u(2), 1, 1); set local role authenticated;
-- 20 answers but on one day only for Caro and Dani: practice is not the reason they don't count.
reset role; select pg_temp.answers(pg_temp.u(3), 30, 3); select pg_temp.answers(pg_temp.u(4), 30, 3); set local role authenticated;
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int = 1, 'Beto verified: 20 answers on 2 days');
select pg_temp.ok((select f ->> 'state' from json_array_elements(my_referrals() -> 'friends') f where f ->> 'name' = 'Caro') = 'same_device', 'Caro on Ana''s phone does not count');
select pg_temp.ok((select f ->> 'state' from json_array_elements(my_referrals() -> 'friends') f where f ->> 'name' = 'Dani') = 'same_device', 'Dani on Beto''s phone does not count');
select pg_temp.ok((practice_quota() ->> 'limit')::int = 80, 'level 1: 80 a day');
select pg_temp.ok((simulacro_quota() ->> 'remaining')::int = 3, 'level 1: 1 + 2 simulacros');
select pg_temp.ok((my_referrals() ->> 'invited_by') is null, 'Ana was not invited');
select pg_temp.as_user(pg_temp.u(2));
select pg_temp.ok((my_referrals() ->> 'invited_by') = 'Ana', 'Beto sees who invited him by first name');

-- Simulacros: both sessions of one cuadernillo are one simulacro; reopening is free; then the extras; then none.
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((take_simulacro('S11-A_1ra') ->> 'how') = 'month', 'first simulacro: the month''s');
select pg_temp.ok((take_simulacro('S11-A_2da') ->> 'how') = 'again', 'second session of the same cuadernillo is free');
select pg_temp.ok((take_simulacro('S11-B_1ra') ->> 'how') = 'extra', 'then a friend''s extra');
select pg_temp.ok((take_simulacro('S11-C_1ra') ->> 'how') = 'extra', 'second extra');
select pg_temp.ok((take_simulacro('S11-D_1ra') ->> 'granted')::boolean = false, 'none left');
select pg_temp.ok((simulacro_quota() ->> 'remaining')::int = 0, 'remaining 0');

-- Level 2 then the pass: Eva, Fer join and practice; the teacher joins and makes a course (2 points).
select pg_temp.as_user(pg_temp.u(5)); select claim_referral((select code from c));
select pg_temp.as_user(pg_temp.u(6)); select claim_referral((select code from c));
reset role; select pg_temp.answers(pg_temp.u(5), 25, 2); select pg_temp.answers(pg_temp.u(6), 25, 2); set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((my_referrals() -> 'reward' ->> 'level')::int = 2 and (practice_quota() ->> 'limit')::int = 150, 'level 2: 150 a day');
select pg_temp.as_user(pg_temp.u(20)); select pg_temp.ok(claim_referral((select code from c), 'profe') = 'ok', 'teacher claims');
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int = 3, 'teacher without a course does not count yet');
reset role; insert into courses (school_id, name, created_by) values ('00000000-0000-4000-8000-0000000000a1', '11A', pg_temp.u(20)); set local role authenticated;
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int = 5, 'teacher with a course counts 2');
select pg_temp.ok((practice_quota() ->> 'pass')::boolean and (practice_quota() ->> 'limit')::int = 400, 'level 3: the pass (fair use 400)');
select pg_temp.ok(((my_referrals() -> 'reward' ->> 'pass_until')::timestamptz - now()) between interval '59 days' and interval '61 days', 'pass lasts 60 days');
select pg_temp.ok((take_simulacro('S11-D_1ra') ->> 'how') = 'pass' and (simulacro_quota() ->> 'unlimited')::boolean, 'pass: simulacros without limit');

-- Weekly cap: Gabo, Hugo, Iris, Juli this week are 9 accounts this week for Ana, only 5 verified count a week.
select pg_temp.as_user(pg_temp.u(7)); select claim_referral((select code from c));
select pg_temp.as_user(pg_temp.u(8)); select claim_referral((select code from c));
reset role; select pg_temp.answers(pg_temp.u(7), 25, 2); select pg_temp.answers(pg_temp.u(8), 25, 2);
update referrals set at = date_trunc('week', now()) + interval '1 hour' where referrer = pg_temp.u(1);
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok((select count(*) from json_array_elements(my_referrals() -> 'friends') f where f ->> 'state' = 'week_cap') = 1, 'sixth verified friend of the week waits (5 + teacher = 6 rows ok)');
-- A new point extends the pass by 30 days: move Gabo to last week.
reset role; update referrals set at = at - interval '7 days' where user_id = pg_temp.u(7); set local role authenticated;
select pg_temp.ok((my_referrals() -> 'reward' ->> 'points')::int >= 7, 'next week the capped friend counts');
select pg_temp.ok(((my_referrals() -> 'reward' ->> 'pass_until')::timestamptz - now()) > interval '110 days', 'each new point adds 30 days');

-- Amigos: a new account that adds Ana as a friend was brought by her.
reset role;
create temp table fc as select n, (fg_card(pg_temp.u(n))).code as code from unnest(array[1, 10]) n;
grant select on fc to authenticated;
set local role authenticated;
select pg_temp.as_user(pg_temp.u(9));
select pg_temp.ok(add_friend((select code from fc where n = 1)) ->> 'status' = 'sent', 'Iris adds Ana');
reset role;
select pg_temp.ok((select referrer from referrals where user_id = pg_temp.u(9)) = pg_temp.u(1), 'friend request from a new account is a referral');
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok(add_friend((select code from fc where n = 10)) ->> 'status' = 'sent', 'Ana adds Juli');
reset role;
select pg_temp.ok(not exists (select 1 from referrals where user_id = pg_temp.u(10)), 'Juli was not brought by Ana''s request');
set local role authenticated;

-- Admin review and void.
select pg_temp.as_user(pg_temp.u(1));
do $$ begin perform admin_ref_review(30); raise exception 'FAILED: review open to students'; exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end $$;
do $$ begin perform 1 from account_devices; raise exception 'FAILED: devices readable'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from simulacro_uses; raise exception 'FAILED: simulacro_uses readable'; exception when insufficient_privilege then null; end $$;
select pg_temp.as_user(pg_temp.u(30));
select pg_temp.ok(json_array_length(admin_ref_review(30)) >= 9, 'admin sees the referrals');
select pg_temp.ok((select x ->> 'state' from json_array_elements(admin_ref_review(30)) x where x ->> 'friend_name' like 'Caro%') = 'same_device', 'admin sees why');
select pg_temp.ok(admin_void_referral(pg_temp.u(5), true, 'prueba'), 'admin voids Eva');
select pg_temp.as_user(pg_temp.u(1));
select pg_temp.ok(not exists (select 1 from json_array_elements(my_referrals() -> 'friends') f where f ->> 'name' = 'Eva'), 'voided friend leaves the list');
select pg_temp.ok((practice_quota() ->> 'pass')::boolean, 'a pass already earned keeps its date');

-- Teachers are never limited on simulacros.
select pg_temp.as_user(pg_temp.u(20));
select pg_temp.ok((simulacro_quota() ->> 'unlimited')::boolean, 'teacher: no simulacro limit');

rollback;
\echo referral_rewards_0053: all checks passed
