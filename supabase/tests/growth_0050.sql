-- Scenarios for migration 0050 (growth engine). Run after all migrations on a throwaway database:
--   supabase/tests/growth.sh -h /tmp/pgt -p 5499 -U postgres
-- Every check raises an exception when it fails, so psql -v ON_ERROR_STOP=1 stops at the first broken one.
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', what; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.sub', coalesce(u::text, ''), true); end $$;

insert into schools (id, name, domains) values ('00000000-0000-4000-8000-0000000000a1', 'Colegio Nuestra Señora del Rosario', array['rosario.edu.co']) on conflict do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'ana@gmail.com'), ('00000000-0000-4000-8000-000000000002', 'beto@gmail.com'),
  ('00000000-0000-4000-8000-000000000003', 'caro@gmail.com'), ('00000000-0000-4000-8000-000000000004', 'profe@rosario.edu.co'),
  ('00000000-0000-4000-8000-000000000005', 'admin@x.co'), ('00000000-0000-4000-8000-000000000006', 'aliado@x.co')
on conflict do nothing;
insert into profiles (id, school_id, role, full_name, email) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'student', 'Ána María Pérez', 'ana@gmail.com'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'student', 'Beto Ruiz', 'beto@gmail.com'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 'student', 'Caro Díaz', 'caro@gmail.com'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', 'teacher', 'Profe Luis', 'profe@rosario.edu.co'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a1', 'student', 'Admin', 'admin@x.co'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a1', 'student', 'Aliado', 'aliado@x.co')
on conflict do nothing;
insert into app_admins (user_id) values ('00000000-0000-4000-8000-000000000005') on conflict do nothing;

set local role authenticated;

-- F1 events: valid rows in, bad names out, anon works.
select pg_temp.as_user(null);
select pg_temp.ok(track_events('11111111-1111-4111-8111-111111111111', '[{"n":"page:view","p":"/"},{"n":"cta:click","x":{"id":"hero"}},{"n":"bad name!"},{"n":"x"}]') = 2, 'track_events keeps only valid names');
select pg_temp.ok(track_events(null, '[{"n":"page:view"}]') = 0, 'track_events needs a visitor');
-- Tables stay closed.
do $$ begin perform 1 from growth_events; raise exception 'FAILED: growth_events readable'; exception when insufficient_privilege then null; end $$;

-- F3 experiments: listed for anyone.
select pg_temp.ok(json_array_length(active_experiments()) >= 2, 'active_experiments');
select track_events('11111111-1111-4111-8111-111111111111', '[{"n":"exp:expose","x":{"k":"hero-cta","v":"pregunta"}}]');
select track_events('22222222-2222-4222-8222-222222222222', '[{"n":"exp:expose","x":{"k":"hero-cta","v":"control"}}]');
select track_events('11111111-1111-4111-8111-111111111111', '[{"n":"cta:click"}]');

-- Readouts are for admins only.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
do $$ begin perform admin_growth_overview(7); raise exception 'FAILED: overview open to students'; exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok((select (a ->> 'converted')::int from json_array_elements(admin_experiment_readout()) e, json_array_elements(e -> 'arms') a
                    where e ->> 'key' = 'hero-cta' and a ->> 'variant' = 'pregunta') = 1, 'experiment conversion counted after exposure');
select pg_temp.ok((select (a ->> 'converted')::int from json_array_elements(admin_experiment_readout()) e, json_array_elements(e -> 'arms') a
                    where e ->> 'key' = 'hero-cta' and a ->> 'variant' = 'control') = 0, 'control without goal event');
select pg_temp.ok((admin_growth_funnel(14) -> 'steps' -> 0 ->> 'visitors')::int = 1, 'funnel step 1');

-- F4 errors: grouped by fingerprint.
select pg_temp.as_user(null);
select log_client_error('fp1', 'TypeError: x is undefined', 'app.js:1', '/app/', 'stack', 'app', true);
select log_client_error('fp1', 'TypeError: x is undefined', 'app.js:1', '/app/', 'stack', 'app', false);
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok((admin_client_errors(7) -> 0 ->> 'count')::int = 2, 'errors grouped');

-- F8 referrals: Ana's code, Beto and the teacher join with it, the bonus follows activation.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok(my_referral_code() ~ '^ana-[a-z0-9]{3}$', 'code from the first name without accents');
select pg_temp.ok(my_referral_code() = my_referral_code(), 'code is stable');
select pg_temp.ok(claim_referral(my_referral_code()) = 'self', 'no self referral');
create temp table c as select my_referral_code() as code;
grant select on c to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(claim_referral((select code from c)) = 'ok', 'Beto claims');
select pg_temp.ok(claim_referral((select code from c)) = 'already', 'only once');
select pg_temp.ok(claim_referral('nope-123') = 'unknown', 'unknown code');
select pg_temp.ok((practice_quota() ->> 'bonus')::int = 10, 'invited account gets +10 its first week');
select pg_temp.as_user('00000000-0000-4000-8000-000000000004');
select pg_temp.ok(claim_referral((select code from c), 'profe') = 'ok', 'teacher claims');
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((my_referrals() ->> 'invited')::int = 1 and (my_referrals() ->> 'teachers')::int = 1, 'my_referrals counts');
select pg_temp.ok((my_referrals() ->> 'bonus')::int = 20, 'teacher bonus before activation');
reset role;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct)
select '00000000-0000-4000-8000-000000000002', 'a1', 'S11-A_1ra', g::text, 'Matemáticas', 'A', g % 2 = 0 from generate_series(1, 6) g;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok((my_referrals() ->> 'activated')::int = 1, 'activation after 5 answers');
select pg_temp.ok((practice_quota() ->> 'limit')::int = 40 + 30, 'limit includes +10 friend +20 teacher');
select pg_temp.ok((take_practice_questions(100) ->> 'granted')::int = 70, 'take uses the bonus');
-- Too-old accounts can't claim.
reset role;
update profiles set created_at = now() - interval '30 days' where id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000003');
select pg_temp.ok(claim_referral((select code from c)) = 'too_old', 'old accounts cannot claim');

-- F10 partners: apply, approve, stats by email.
select pg_temp.as_user(null);
select pg_temp.ok(apply_partner('Academia Pitágoras', 'academia', 'aliado@x.co', 'Cali', 400, 'Hola', '33333333-3333-4333-8333-333333333333') = 'ok', 'apply_partner');
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok(admin_make_partner((select (a ->> 'id')::uuid from json_array_elements(admin_partners() -> 'applications') a limit 1), 'pitagoras', 'Academia Pitágoras', 'aliado@x.co') = 'pitagoras', 'partner code');
select pg_temp.as_user('00000000-0000-4000-8000-000000000003');
reset role; update profiles set created_at = now() where id = '00000000-0000-4000-8000-000000000003'; set local role authenticated;
select pg_temp.ok(claim_referral('pitagoras') = 'ok', 'claim partner code');
select pg_temp.as_user('00000000-0000-4000-8000-000000000006');
select pg_temp.ok((partner_stats() -> 0 ->> 'signups')::int = 1, 'partner sees signups by email');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(json_array_length(partner_stats()) = 0, 'others see no partner stats');

-- F11 study groups.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
create temp table g as select create_study_group('Los del 11B', 200, 'Ana') as r;
grant select on g to authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok((study_group_preview((select r ->> 'code' from g)) ->> 'members')::int = 1, 'preview');
select pg_temp.ok(join_study_group((select r ->> 'code' from g), 'Beto') ->> 'name' = 'Los del 11B', 'join');
select pg_temp.ok((my_study_groups() -> 0 ->> 'week_total')::int = 6, 'week total from answers');
select pg_temp.ok((my_study_groups() -> 0 -> 'members' -> 1 ->> 'today')::boolean, 'Beto practiced today (members in alphabetical order)');
select pg_temp.ok(not (my_study_groups() -> 0 -> 'members' -> 0 ->> 'today')::boolean, 'Ana did not');
select leave_study_group((select (r ->> 'id')::uuid from g));
select pg_temp.ok(json_array_length(my_study_groups()) = 0, 'left');

-- F13 short links: internal targets only.
select pg_temp.as_user(null);
select pg_temp.ok(resolve_short_link('diagnostico') = '/diagnostico-icfes/', 'resolve');
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select admin_save_short_link('feria-cali', '/app/?empezar=1&fuente=feria', 'Feria Cali');
do $$ begin perform admin_save_short_link('malo', 'https://evil.example/', 'x'); raise exception 'FAILED: external target accepted'; exception when check_violation then null; end $$;
do $$ begin perform admin_save_short_link('malo2', '//evil.example/', 'x'); raise exception 'FAILED: protocol-relative target accepted'; exception when check_violation then null; end $$;

-- F17 class diagnostic.
select pg_temp.as_user(null);
create temp table d as select create_class_diagnostic('Profe Marta', 'IE La Paz', '11-2', 'marta@x.co', '44444444-4444-4444-8444-444444444444') as r;
grant select on d to anon, authenticated;
select pg_temp.ok(class_diagnostic_info((select r ->> 'code' from d)) ->> 'teacher' = 'Profe Marta', 'info');
select pg_temp.ok(submit_class_diagnostic((select r ->> 'code' from d), '55555555-5555-4555-8555-555555555555', 'Juli', '{"q1":"A"}', 9, 15, '[{"area":"ma","c":2,"t":3}]', 280) = 'ok', 'submit');
select pg_temp.ok(submit_class_diagnostic((select r ->> 'code' from d), '55555555-5555-4555-8555-555555555555', 'Juli', '{"q1":"B"}', 10, 15, '[]', 300) = 'ok', 'resubmit updates');
select pg_temp.ok(json_array_length(class_diagnostic_report((select (r ->> 'secret')::uuid from d)) -> 'responses') = 1, 'one row per student');
select pg_temp.ok(class_diagnostic_report(gen_random_uuid()) is null, 'wrong secret sees nothing');

-- F23 public answers: first try only, stats from 20 up.
select log_public_answer('S11-A_1ra:5', ('66666666-6666-4666-8666-' || lpad(g::text, 12, '0'))::uuid, 'B', g % 4 <> 0) from generate_series(1, 24) g;
select log_public_answer('S11-A_1ra:5', '66666666-6666-4666-8666-000000000001', 'C', false);
select pg_temp.ok((public_question_stats(array['S11-A_1ra:5']) -> 'S11-A_1ra:5' ->> 'pct')::int = 75, 'pct of first tries');
select pg_temp.ok(public_activity() is null, 'no social proof below 300');

-- F28 leads need consent.
select pg_temp.ok(save_lead('x@y.co', 'diagnostico', 'estudiante', '{}', false, '77777777-7777-4777-8777-777777777777') = 'consent', 'lead without consent refused');
select pg_temp.ok(save_lead('x@y.co', 'diagnostico', 'estudiante', '{"score":280}', true, '77777777-7777-4777-8777-777777777777') = 'ok', 'lead saved');

-- F29 notices: only active ones in their window.
select pg_temp.ok(json_array_length(active_notices('site')) <= 3, 'notices capped');

-- F30 event sign-ups: counts hidden below 25.
select pg_temp.ok((signup_event('nacional-2026-11', '77777777-7777-4777-8777-777777777777', 'x@y.co', '11') ->> 'ok')::boolean, 'event signup');
select pg_temp.ok(event_count('nacional-2026-11') is null, 'small counts hidden');

-- F32 testimonials: hidden until approved.
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(submit_testimonial('Beto', '11°, Cali', 'Me ayudó mucho con matemáticas.', true) = 'ok', 'testimonial');
select pg_temp.ok(json_array_length(approved_testimonials()) = 0, 'not shown before approval');
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select admin_set_testimonial((select (t ->> 'id')::uuid from json_array_elements(admin_testimonials()) t limit 1), true);
select pg_temp.ok(json_array_length(approved_testimonials()) = 1, 'shown after approval');

-- F40 certificates.
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(issue_certificate('Beto Ruiz') ->> 'error' = 'not_yet', 'criteria enforced');
reset role;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct, answered_at)
select '00000000-0000-4000-8000-000000000002', 'b' || (g % 5), 'S11-B_1ra', g::text, (array['Matemáticas','Lectura crítica','Inglés'])[1 + g % 3], 'A', g % 3 = 0, now() - (g % 5) * interval '1 day'
  from generate_series(1, 160) g;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
create temp table cert as select issue_certificate('Beto Ruiz Gómez') ->> 'code' as code;
grant select on cert to anon, authenticated;
select pg_temp.ok((select code from cert) ~ '^[a-z0-9]{8}$', 'certificate issued');
select pg_temp.as_user(null);
select pg_temp.ok(verify_certificate((select code from cert)) ->> 'name' = 'Beto R.', 'public name is first name + initial');

-- F41 family link for an independent student.
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
create temp table fam as select create_my_family_report('{"student":"Beto"}') as t;
grant select on fam to anon, authenticated;
select pg_temp.ok(family_report((select t from fam)) ->> 'student' = 'Beto', 'own family link readable');
select pg_temp.as_user('00000000-0000-4000-8000-000000000004');
do $$ begin perform create_my_family_report('{}'); raise exception 'FAILED: teacher made a student link'; exception when raise_exception then if sqlerrm <> 'not_allowed' then raise; end if; end $$;

-- F43-F46 surveys and roadmap.
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.ok(answer_survey('nps', null, '{"score":9}') = 'ok', 'nps');
select pg_temp.ok(answer_survey('nps', null, '{"score":10}') = 'ok', 'nps again updates');
select pg_temp.ok(answer_survey('hack', null, '{}') = 'bad', 'unknown survey');
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok(json_array_length(admin_surveys(30) -> 'nps') = 1 and (admin_surveys(30) -> 'nps' -> 0 -> 'answer' ->> 'score')::int = 10, 'one nps row per account');
select pg_temp.as_user(null);
select pg_temp.ok(roadmap_vote('modo-sin-internet', '88888888-8888-4888-8888-888888888888'), 'vote');
select pg_temp.ok((select (i ->> 'votes')::int from json_array_elements(roadmap_list('88888888-8888-4888-8888-888888888888')) i where i ->> 'id' = 'modo-sin-internet') = 1, 'vote counted');
select pg_temp.ok(not roadmap_vote('modo-sin-internet', '88888888-8888-4888-8888-888888888888'), 'second tap removes the vote');

-- F48 school demand: two spellings of one school meet.
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select set_my_school_name('Colegio Nuestra Señora del Rosario', 'Cali');
select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select set_my_school_name('col. nuestra sra del rosario', 'Cali');
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok((admin_school_demand() -> 0 ->> 'students')::int = 2, 'spellings grouped');
select pg_temp.ok((admin_school_demand() -> 0 ->> 'has_account')::boolean, 'matched to the school account');

-- F42 item stats and difficulty: 6 accounts answer question 900, most of them pick C while the key says A.
reset role;
insert into answer_log (user_id, attempt_id, exam_slug, qkey, area, answer, correct)
select u, 'z', 'S11-B_1ra', '900', 'Matemáticas', case when u::text like '%1' then 'A' else 'C' end, u::text like '%1'
  from unnest(array['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',
                    '00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006']::uuid[]) u;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok((select i ->> 'flag' from json_array_elements(admin_item_stats(5)) i where i ->> 'qkey' = '900') = 'clave-dudosa', 'suspect key flagged');
select pg_temp.ok(json_array_length(admin_item_stats(5)) >= 1, 'item stats');
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.ok(question_difficulty('S11-B_1ra')::text = '{}', 'difficulty needs 15 answers per question');

-- F35 push: token required.
select pg_temp.as_user(null);
select pg_temp.ok(save_push_subscription('https://push.example/abc', 'p', 'a', 18, '99999999-9999-4999-8999-999999999999') = 'ok', 'push saved');
reset role; set local role anon;
do $$ begin perform push_due('wrong'); raise exception 'FAILED: push_due without token'; exception when raise_exception then if sqlerrm <> 'not_allowed' then raise; end if; end $$;

-- F7 overview.
reset role; set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-000000000005');
select pg_temp.ok((admin_growth_overview(7) ->> 'referral_signups')::int = 3, 'overview');

rollback;
\echo 'growth_0050: all checks passed'
