-- 0050 · Growth engine: the database side of the 50 growth features (docs/growth/LEDGER.md has the list, the metric of
-- each one and how it is tested). Everything here is additive: new tables, new functions, and two functions of 0033
-- (practice_quota, take_practice_questions) re-created with the referral bonus added to the daily allowance.
--
-- Privacy: visitors are the random id the browser keeps (condor:vid, migration 0037). No IP, no device fingerprint.
-- Anything a visitor can write goes through a security-definer function with size checks and a rate limit
-- (growth_rate_ok); the tables themselves are closed to anon and authenticated. Readouts are for app_admins only.
--
-- Runs after 0037 (needs site_visitors, answer_log, app_admins, profiles, schools). Re-runnable: every object is
-- created with "if not exists" / "or replace", seeds use "on conflict do nothing", nothing is dropped.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------------------------ shared helpers

create or replace function public.growth_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function public.growth_is_admin() from public, anon;
grant execute on function public.growth_is_admin() to authenticated;

-- The signed-in account, or null for visitors and anonymous sessions.
create or replace function public.growth_uid()
returns uuid language sql stable as $$
  select case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then null else auth.uid() end;
$$;

-- Fixed-window rate limit: true while `p_key` has been used fewer than `p_limit` times in the current window.
create table if not exists public.growth_rate (
  key          text primary key check (char_length(key) <= 120),
  window_start timestamptz not null,
  n            int not null default 0
);
alter table public.growth_rate enable row level security;
revoke all on public.growth_rate from anon, authenticated;

create or replace function public.growth_rate_ok(p_key text, p_limit int, p_window interval default interval '1 minute')
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into growth_rate as r (key, window_start, n) values (left(p_key, 120), now(), 1)
  on conflict (key) do update set
    n = case when r.window_start < now() - p_window then 1 else r.n + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning n into v_n;
  -- Keep the table small: forget windows older than a day now and then.
  if random() < 0.01 then delete from growth_rate where window_start < now() - interval '1 day'; end if;
  return v_n <= p_limit;
end $$;
revoke all on function public.growth_rate_ok(text, int, interval) from public, anon, authenticated;

-- Short random codes without look-alike characters (no 0/o, 1/l/i).
create or replace function public.growth_code(p_len int default 6)
returns text language sql volatile as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, greatest(3, least(coalesce(p_len, 6), 16)));
$$;

-- ------------------------------------------------------------------------------------------------ F1 events

create table if not exists public.growth_events (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  visitor uuid,
  user_id uuid,
  name    text not null check (name ~ '^[a-z0-9][a-z0-9_.:-]{1,39}$'),
  path    text check (path is null or char_length(path) <= 160),
  props   jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048)
);
create index if not exists growth_events_name_at on public.growth_events (name, at);
create index if not exists growth_events_visitor on public.growth_events (visitor, at);
create index if not exists growth_events_at on public.growth_events (at);
alter table public.growth_events enable row level security;
revoke all on public.growth_events from anon, authenticated;

-- p_rows: [{ n: name, p: path, x: props, t: client ms (ignored, the server clock is used) }], at most 30 per call.
create or replace function public.track_events(p_visitor uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_n int;
begin
  if p_visitor is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  if not growth_rate_ok('ev:' || p_visitor::text, 240) or not growth_rate_ok('ev:all', 20000) then return 0; end if;
  insert into growth_events (visitor, user_id, name, path, props)
  select p_visitor, v_uid, lower(r ->> 'n'), left(nullif(r ->> 'p', ''), 160),
         case when jsonb_typeof(r -> 'x') = 'object' and pg_column_size(r -> 'x') <= 2048 then r -> 'x' else '{}'::jsonb end
    from (select value as r from jsonb_array_elements(p_rows) limit 30) e
   where coalesce(r ->> 'n', '') ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,39}$';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.track_events(uuid, jsonb) from public;
grant execute on function public.track_events(uuid, jsonb) to anon, authenticated;

-- Top events of the period, for the growth page.
create or replace function public.admin_growth_events(p_days int default 7)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(t order by t.visitors desc, t.events desc) from (
    select name, count(*) as events, count(distinct visitor) as visitors
      from growth_events where at >= v_from group by name order by count(distinct visitor) desc limit 80) t), '[]'::json);
end $$;
revoke all on function public.admin_growth_events(int) from public, anon;
grant execute on function public.admin_growth_events(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F2 activation funnel

-- Distinct visitors that reached each step in the period. The steps are events the site and the app send
-- (docs/growth/LEDGER.md, F2); "returned" = a visitor with events on two different days.
create or replace function public.admin_growth_funnel(p_days int default 14)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return (
    with ev as (select visitor, name, at from growth_events where at >= v_from and visitor is not null),
    steps(i, step, label) as (values
      (1, 'page:view', 'Visitó una página'), (2, 'cta:click', 'Tocó un botón para practicar'), (3, 'app:open', 'Abrió la app'),
      (4, 'auth:start', 'Empezó a entrar con Google'), (5, 'auth:done', 'Entró con su cuenta'), (6, 'consent:ok', 'Aceptó los términos'),
      (7, 'q:first', 'Respondió su primera pregunta'), (8, 'q:fifth', 'Respondió 5 preguntas'), (9, 'practice:done', 'Terminó una práctica'))
    select json_build_object(
      'steps', (select json_agg(json_build_object('step', s.step, 'label', s.label,
                  'visitors', (select count(distinct visitor) from ev where ev.name = s.step)) order by s.i) from steps s),
      'returned', (select count(*) from (select visitor from ev group by visitor having count(distinct (at at time zone 'America/Bogota')::date) > 1) r),
      'visitors', (select count(distinct visitor) from ev))
  );
end $$;
revoke all on function public.admin_growth_funnel(int) from public, anon;
grant execute on function public.admin_growth_funnel(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F3 experiments

create table if not exists public.growth_experiments (
  key         text primary key check (key ~ '^[a-z0-9_-]{2,40}$'),
  description text not null default '' check (char_length(description) <= 300),
  variants    jsonb not null default '["a","b"]'::jsonb,  -- first one is the control
  weights     jsonb,                                       -- optional, same length, sums to 100
  goal        text not null check (goal ~ '^[a-z0-9][a-z0-9_.:-]{1,39}$'),
  surface     text not null default 'site' check (surface in ('site', 'app')),
  status      text not null default 'running' check (status in ('running', 'stopped')),
  winner      text,
  started_at  timestamptz not null default now()
);
alter table public.growth_experiments enable row level security;
revoke all on public.growth_experiments from anon, authenticated;

insert into public.growth_experiments (key, description, variants, goal, surface) values
  ('hero-cta', 'Botón principal del inicio: «Practicar gratis» frente a «Haz tu primera pregunta».', '["control","pregunta"]', 'cta:click', 'site'),
  ('sticky-cta', 'Barra fija en las guías: aparece al 40 % de la página frente a no aparecer.', '["sin-barra","barra"]', 'cta:click', 'site')
on conflict (key) do nothing;

create or replace function public.active_experiments()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('key', key, 'variants', variants, 'weights', weights, 'surface', surface,
                                             'winner', winner, 'running', status = 'running')), '[]'::json)
    from growth_experiments;
$$;
revoke all on function public.active_experiments() from public;
grant execute on function public.active_experiments() to anon, authenticated;

-- Exposed and converted visitors per variant. A conversion is the experiment's goal event after the visitor's first
-- exposure. The statistics (lift, z-test, chance to beat control) are computed in the page (src/lib/growth/stats.js).
create or replace function public.admin_experiment_readout()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x order by x.started_at desc) from (
    select e.key, e.description, e.variants, e.goal, e.status, e.winner, e.started_at,
      (select coalesce(json_agg(json_build_object('variant', v.variant, 'exposed', v.exposed, 'converted', v.converted)), '[]'::json) from (
         select ex.variant, count(*) as exposed,
                count(*) filter (where exists (select 1 from growth_events g where g.visitor = ex.visitor and g.name = e.goal and g.at >= ex.first_at)) as converted
           from (select visitor, props ->> 'v' as variant, min(at) as first_at from growth_events
                  where name = 'exp:expose' and props ->> 'k' = e.key and at >= e.started_at and visitor is not null
                  group by visitor, props ->> 'v') ex
          group by ex.variant) v) as arms
    from growth_experiments e) x), '[]'::json);
end $$;
revoke all on function public.admin_experiment_readout() from public, anon;
grant execute on function public.admin_experiment_readout() to authenticated;

create or replace function public.admin_set_experiment(p_key text, p_status text, p_winner text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  update growth_experiments set status = p_status, winner = p_winner where key = p_key;
end $$;
revoke all on function public.admin_set_experiment(text, text, text) from public, anon;
grant execute on function public.admin_set_experiment(text, text, text) to authenticated;

-- ------------------------------------------------------------------------------------------------ F4 client errors

create table if not exists public.client_errors (
  fingerprint text primary key check (char_length(fingerprint) <= 64),
  message     text not null check (char_length(message) <= 300),
  source      text check (source is null or char_length(source) <= 200),
  path        text check (path is null or char_length(path) <= 160),
  stack       text check (stack is null or char_length(stack) <= 1500),
  surface     text check (surface in ('site', 'app')),
  count       int not null default 1,
  visitors    int not null default 1,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

create or replace function public.log_client_error(p_fp text, p_message text, p_source text, p_path text, p_stack text, p_surface text, p_first boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_fp, '') = '' or coalesce(p_message, '') = '' then return; end if;
  if not growth_rate_ok('err:all', 600) or not growth_rate_ok('err:' || left(p_fp, 64), 30) then return; end if;
  insert into client_errors as c (fingerprint, message, source, path, stack, surface)
  values (left(p_fp, 64), left(p_message, 300), left(p_source, 200), left(p_path, 160), left(p_stack, 1500),
          case when p_surface in ('site', 'app') then p_surface end)
  on conflict (fingerprint) do update set count = c.count + 1, last_at = now(),
    visitors = c.visitors + case when p_first then 1 else 0 end, path = coalesce(excluded.path, c.path);
end $$;
revoke all on function public.log_client_error(text, text, text, text, text, text, boolean) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text, boolean) to anon, authenticated;

create or replace function public.admin_client_errors(p_days int default 7)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(c order by c.visitors desc, c.count desc) from (
    select * from client_errors where last_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
     order by visitors desc, count desc limit 50) c), '[]'::json);
end $$;
revoke all on function public.admin_client_errors(int) from public, anon;
grant execute on function public.admin_client_errors(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F5 vitals, F6 404s

-- Real-user Core Web Vitals (events 'vital' with props {m: LCP|CLS|INP|TTFB|FCP, v: number, tpl: page family}).
create or replace function public.admin_web_vitals(p_days int default 14)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(t order by t.tpl, t.metric) from (
    select coalesce(props ->> 'tpl', 'otra') as tpl, props ->> 'm' as metric, count(*) as n,
           round((percentile_cont(0.75) within group (order by (props ->> 'v')::numeric))::numeric, 3) as p75
      from growth_events
     where name = 'vital' and at >= v_from and (props ->> 'v') ~ '^[0-9.]+$' and props ->> 'm' in ('LCP', 'CLS', 'INP', 'TTFB', 'FCP')
     group by 1, 2) t), '[]'::json);
end $$;
revoke all on function public.admin_web_vitals(int) from public, anon;
grant execute on function public.admin_web_vitals(int) to authenticated;

-- Pages people asked for that don't exist (events 'nf' {p: path, r: referrer host}), and searches with no result
-- (events 'search' {q, hits}). Together: what people look for and the site doesn't have yet.
create or replace function public.admin_content_gaps(p_days int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return json_build_object(
    'not_found', coalesce((select json_agg(t) from (
      select props ->> 'p' as path, props ->> 'r' as referrer, count(*) as hits, count(distinct visitor) as visitors
        from growth_events where name = 'nf' and at >= v_from group by 1, 2 order by 4 desc, 3 desc limit 40) t), '[]'::json),
    'searches', coalesce((select json_agg(t) from (
      select lower(trim(props ->> 'q')) as query, count(*) as times, max((props ->> 'hits')::int) as hits
        from growth_events where name = 'search' and at >= v_from and (props ->> 'hits') ~ '^[0-9]+$'
       group by 1 order by (max((props ->> 'hits')::int) = 0) desc, 2 desc limit 60) t), '[]'::json));
end $$;
revoke all on function public.admin_content_gaps(int) from public, anon;
grant execute on function public.admin_content_gaps(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F8, F9, F10 referrals and partners

create table if not exists public.referral_codes (
  code        text primary key check (code ~ '^[a-z0-9-]{3,24}$'),
  user_id     uuid unique references auth.users (id) on delete cascade,   -- a student's own code (one each)
  kind        text not null default 'student' check (kind in ('student', 'partner')),
  label       text check (label is null or char_length(label) <= 80),     -- partner name
  owner_email text check (owner_email is null or char_length(owner_email) <= 200), -- partner, before they sign in
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
revoke all on public.referral_codes from anon, authenticated;

create table if not exists public.referrals (
  user_id    uuid primary key references auth.users (id) on delete cascade,  -- the invited account
  code       text not null references public.referral_codes (code),
  referrer   uuid references auth.users (id) on delete set null,
  via        text not null default 'amigo' check (via in ('amigo', 'profe', 'aliado', 'parche', 'reto')),
  at         timestamptz not null default now()
);
create index if not exists referrals_code_idx on public.referrals (code);
create index if not exists referrals_referrer_idx on public.referrals (referrer);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- How many of the accounts a code brought in answered at least 5 questions ("activated").
create or replace function public.growth_activated(p_code text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from referrals r
   where r.code = p_code and (select count(*) from answer_log l where l.user_id = r.user_id) >= 5;
$$;
revoke all on function public.growth_activated(text) from public, anon, authenticated;

-- Extra free-practice questions a day: +10 for each friend who activated, +20 for each teacher who joined with the
-- student's link (at most +60 in all); and +10 a day during an invited account's first 7 days.
create or replace function public.growth_bonus_questions(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_code text; v_bonus int := 0;
begin
  if p_uid is null then return 0; end if;
  select code into v_code from referral_codes where user_id = p_uid and kind = 'student';
  if v_code is not null then
    select least(60,
      10 * (select count(*) from referrals r join profiles p on p.id = r.user_id
             where r.code = v_code and p.role = 'student' and (select count(*) from answer_log l where l.user_id = r.user_id) >= 5)
      + 20 * (select count(*) from referrals r join profiles p on p.id = r.user_id where r.code = v_code and p.role in ('teacher', 'school_admin')))
      into v_bonus;
  end if;
  if exists (select 1 from referrals where user_id = p_uid and at > now() - interval '7 days') then v_bonus := v_bonus + 10; end if;
  return coalesce(v_bonus, 0);
end $$;
revoke all on function public.growth_bonus_questions(uuid) from public, anon, authenticated;

-- 0033's allowance, plus the referral bonus.
create or replace function public.practice_quota()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_bonus int;
  v_limit int;
  v_used int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  v_bonus := growth_bonus_questions(v_uid);
  v_limit := coalesce((select value from app_limits where key = 'questions_per_day'), 40) + v_bonus;
  select coalesce((select questions from practice_usage where user_id = v_uid and day = v_day), 0) into v_used;
  return json_build_object('used', v_used, 'limit', v_limit, 'remaining', greatest(v_limit - v_used, 0), 'bonus', v_bonus);
end $$;

create or replace function public.take_practice_questions(p_count int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_bonus int;
  v_limit int;
  v_want int := greatest(coalesce(p_count, 0), 0);
  v_used int;
  v_grant int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  v_bonus := growth_bonus_questions(v_uid);
  v_limit := coalesce((select value from app_limits where key = 'questions_per_day'), 40) + v_bonus;
  insert into practice_usage (user_id, day, questions) values (v_uid, v_day, 0) on conflict (user_id, day) do nothing;
  select questions into v_used from practice_usage where user_id = v_uid and day = v_day for update;
  v_grant := least(v_want, greatest(v_limit - v_used, 0));
  update practice_usage set questions = questions + v_grant where user_id = v_uid and day = v_day;
  return json_build_object('granted', v_grant, 'used', v_used + v_grant, 'limit', v_limit,
                           'remaining', greatest(v_limit - v_used - v_grant, 0), 'bonus', v_bonus);
end $$;
revoke all on function public.practice_quota() from public, anon;
revoke all on function public.take_practice_questions(int) from public, anon;
grant execute on function public.practice_quota() to authenticated;
grant execute on function public.take_practice_questions(int) to authenticated;

-- The student's own invite code (made on first call), from their first name when it is free: "ana-k7d".
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_code text;
  v_base text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select code into v_code from referral_codes where user_id = v_uid;
  if v_code is not null then return v_code; end if;
  select lower(regexp_replace(translate(split_part(coalesce(full_name, ''), ' ', 1), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^a-zA-Z]', '', 'g'))
    into v_base from profiles where id = v_uid;
  v_base := left(coalesce(nullif(v_base, ''), 'amigo'), 10);
  for i in 1..8 loop
    v_code := v_base || '-' || growth_code(3);
    begin
      insert into referral_codes (code, user_id, kind) values (v_code, v_uid, 'student');
      return v_code;
    exception when unique_violation then
      select code into v_code from referral_codes where user_id = v_uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  raise exception 'no_code';
end $$;
revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- A new account says who invited it. Only accounts younger than 14 days, once, never their own code.
create or replace function public.claim_referral(p_code text, p_via text default 'amigo')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_row referral_codes;
  v_created timestamptz;
begin
  if v_uid is null then return 'not_signed_in'; end if;
  select * into v_row from referral_codes where code = lower(trim(p_code)) and active;
  if not found then return 'unknown'; end if;
  if v_row.user_id = v_uid then return 'self'; end if;
  if exists (select 1 from referrals where user_id = v_uid) then return 'already'; end if;
  select coalesce((select created_at from profiles where id = v_uid), (select created_at from auth.users where id = v_uid)) into v_created;
  if v_created is not null and v_created < now() - interval '14 days' then return 'too_old'; end if;
  insert into referrals (user_id, code, referrer, via)
  values (v_uid, v_row.code, v_row.user_id,
          case when v_row.kind = 'partner' then 'aliado' when p_via in ('amigo', 'profe', 'parche', 'reto') then p_via else 'amigo' end)
  on conflict (user_id) do nothing;
  return 'ok';
end $$;
revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- The student's invite panel: code, invited, activated, teachers who joined, today's bonus. Names are never shown.
create or replace function public.my_referrals()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_code text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select code into v_code from referral_codes where user_id = v_uid;
  return json_build_object(
    'code', v_code,
    'invited', (select count(*) from referrals r join profiles p on p.id = r.user_id where r.code = v_code and p.role = 'student'),
    'activated', (select count(*) from referrals r join profiles p on p.id = r.user_id where r.code = v_code and p.role = 'student'
                   and (select count(*) from answer_log l where l.user_id = r.user_id) >= 5),
    'teachers', (select count(*) from referrals r join profiles p on p.id = r.user_id where r.code = v_code and p.role in ('teacher', 'school_admin')),
    'bonus', growth_bonus_questions(v_uid),
    'invited_by', (select coalesce(c.label, 'un amigo') from referrals r join referral_codes c on c.code = r.code where r.user_id = v_uid));
end $$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- Partners (tutors, academies, creators, foundations): they apply on /aliados/, the owner approves and gives a code.
create table if not exists public.partner_applications (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 120),
  kind       text not null check (kind in ('profe', 'academia', 'creador', 'fundacion', 'otro')),
  email      text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200),
  city       text check (city is null or char_length(city) <= 80),
  audience   int check (audience is null or audience between 0 and 10000000),
  message    text check (message is null or char_length(message) <= 1000),
  visitor    uuid,
  status     text not null default 'nueva' check (status in ('nueva', 'aprobada', 'rechazada')),
  code       text,
  created_at timestamptz not null default now()
);
alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from anon, authenticated;

create or replace function public.apply_partner(p_name text, p_kind text, p_email text, p_city text, p_audience int, p_message text, p_visitor uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not growth_rate_ok('partner:' || coalesce(p_visitor::text, 'x'), 3, interval '1 hour') or not growth_rate_ok('partner:all', 60, interval '1 hour') then
    return 'too_many';
  end if;
  insert into partner_applications (name, kind, email, city, audience, message, visitor)
  values (trim(p_name), case when p_kind in ('profe', 'academia', 'creador', 'fundacion') then p_kind else 'otro' end,
          lower(trim(p_email)), nullif(trim(p_city), ''), p_audience, nullif(trim(p_message), ''), p_visitor);
  return 'ok';
end $$;
revoke all on function public.apply_partner(text, text, text, text, int, text, uuid) from public;
grant execute on function public.apply_partner(text, text, text, text, int, text, uuid) to anon, authenticated;

create or replace function public.admin_partners()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return json_build_object(
    'applications', coalesce((select json_agg(a order by a.created_at desc) from partner_applications a), '[]'::json),
    'codes', coalesce((select json_agg(json_build_object('code', c.code, 'label', c.label, 'owner_email', c.owner_email, 'active', c.active,
                        'signups', (select count(*) from referrals r where r.code = c.code), 'activated', growth_activated(c.code)) order by c.created_at desc)
                       from referral_codes c where c.kind = 'partner'), '[]'::json));
end $$;
revoke all on function public.admin_partners() from public, anon;
grant execute on function public.admin_partners() to authenticated;

-- Approve an application: makes the partner code (owned by the account with that email once it signs in).
create or replace function public.admin_make_partner(p_application uuid, p_code text, p_label text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text := lower(trim(p_code));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  if v_code !~ '^[a-z0-9-]{3,24}$' then raise exception 'bad_code'; end if;
  insert into referral_codes (code, kind, label, owner_email) values (v_code, 'partner', left(p_label, 80), lower(trim(p_email)))
  on conflict (code) do update set label = excluded.label, owner_email = excluded.owner_email, active = true
    where referral_codes.kind = 'partner';
  if p_application is not null then update partner_applications set status = 'aprobada', code = v_code where id = p_application; end if;
  return v_code;
end $$;
revoke all on function public.admin_make_partner(uuid, text, text, text) from public, anon;
grant execute on function public.admin_make_partner(uuid, text, text, text) to authenticated;

-- A partner's own numbers (#aliado in the app): sign-ups and activity of the accounts their code brought, by week.
create or replace function public.partner_stats()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_email text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select lower(email) into v_email from profiles where id = v_uid;
  return coalesce((select json_agg(json_build_object(
      'code', c.code, 'label', c.label,
      'signups', (select count(*) from referrals r where r.code = c.code),
      'activated', growth_activated(c.code),
      'answers_30d', (select count(*) from answer_log l join referrals r on r.user_id = l.user_id where r.code = c.code and l.answered_at > now() - interval '30 days'),
      'weeks', (select coalesce(json_agg(w order by w.week), '[]'::json) from (
                 select date_trunc('week', r.at)::date as week, count(*) as signups from referrals r where r.code = c.code group by 1) w)))
    from referral_codes c where c.kind = 'partner' and c.active and (c.user_id = v_uid or (v_email is not null and c.owner_email = v_email))), '[]'::json);
end $$;
revoke all on function public.partner_stats() from public, anon;
grant execute on function public.partner_stats() to authenticated;

create or replace function public.admin_referrals(p_days int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return json_build_object(
    'codes', (select count(*) from referral_codes where kind = 'student'),
    'by_via', coalesce((select json_object_agg(via, n) from (select via, count(*) as n from referrals where at >= v_from group by via) t), '{}'::json),
    'signups', (select count(*) from referrals where at >= v_from),
    'activated', (select count(*) from referrals r where r.at >= v_from and (select count(*) from answer_log l where l.user_id = r.user_id) >= 5),
    'share_clicks', (select count(*) from growth_events where name like 'share:%' and at >= v_from),
    'k_factor_hint', (select round(count(*)::numeric / nullif((select count(*) from profiles where created_at >= v_from), 0), 3) from referrals where at >= v_from));
end $$;
revoke all on function public.admin_referrals(int) from public, anon;
grant execute on function public.admin_referrals(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F11 study groups (parches)

create table if not exists public.study_groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9]{6}$'),
  name        text not null check (char_length(name) between 2 and 40),
  weekly_goal int not null default 300 check (weekly_goal between 20 and 5000),
  owner       uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table if not exists public.study_group_members (
  group_id     uuid not null references public.study_groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists sgm_user_idx on public.study_group_members (user_id);
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
revoke all on public.study_groups, public.study_group_members from anon, authenticated;

create or replace function public.create_study_group(p_name text, p_goal int, p_display text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_id uuid; v_code text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if (select count(*) from study_group_members where user_id = v_uid) >= 5 then return json_build_object('error', 'too_many_groups'); end if;
  if not growth_rate_ok('sg:' || v_uid::text, 10, interval '1 day') then return json_build_object('error', 'too_many'); end if;
  for i in 1..8 loop
    v_code := growth_code(6);
    begin
      insert into study_groups (code, name, weekly_goal, owner) values (v_code, left(trim(p_name), 40), least(greatest(coalesce(p_goal, 300), 20), 5000), v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then v_id := null;
    end;
  end loop;
  if v_id is null then raise exception 'no_code'; end if;
  insert into study_group_members (group_id, user_id, display_name) values (v_id, v_uid, left(coalesce(nullif(trim(p_display), ''), 'Yo'), 30));
  return json_build_object('id', v_id, 'code', v_code);
end $$;

create or replace function public.join_study_group(p_code text, p_display text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_g study_groups;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_g from study_groups where code = lower(trim(p_code));
  if not found then return json_build_object('error', 'unknown'); end if;
  if exists (select 1 from study_group_members where group_id = v_g.id and user_id = v_uid) then return json_build_object('id', v_g.id, 'already', true); end if;
  if (select count(*) from study_group_members where group_id = v_g.id) >= 12 then return json_build_object('error', 'full'); end if;
  if (select count(*) from study_group_members where user_id = v_uid) >= 5 then return json_build_object('error', 'too_many_groups'); end if;
  insert into study_group_members (group_id, user_id, display_name) values (v_g.id, v_uid, left(coalesce(nullif(trim(p_display), ''), 'Amigo'), 30));
  return json_build_object('id', v_g.id, 'name', v_g.name);
end $$;

create or replace function public.leave_study_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from study_group_members where group_id = p_group and user_id = growth_uid();
  delete from study_groups g where g.id = p_group and not exists (select 1 from study_group_members m where m.group_id = g.id);
end $$;

-- Preview for the join screen: name and size only.
create or replace function public.study_group_preview(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('name', g.name, 'members', (select count(*) from study_group_members m where m.group_id = g.id), 'weekly_goal', g.weekly_goal)
    from study_groups g where g.code = lower(trim(p_code));
$$;

-- The student's groups. Cooperative by design: the group's total of the week against its goal, and per member only
-- whether they practiced today and on how many days this week. Members come in alphabetical order, never by score.
create or replace function public.my_study_groups()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_monday date := v_today - ((extract(isodow from v_today)::int) - 1);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return coalesce((select json_agg(json_build_object(
      'id', g.id, 'code', g.code, 'name', g.name, 'weekly_goal', g.weekly_goal, 'mine', g.owner = v_uid,
      'week_total', (select count(*) from answer_log l join study_group_members m on m.user_id = l.user_id
                      where m.group_id = g.id and (l.answered_at at time zone 'America/Bogota')::date >= v_monday),
      'members', (select json_agg(json_build_object(
                     'name', m.display_name, 'me', m.user_id = v_uid,
                     'today', exists (select 1 from answer_log l where l.user_id = m.user_id and (l.answered_at at time zone 'America/Bogota')::date = v_today),
                     'days', (select count(distinct (l.answered_at at time zone 'America/Bogota')::date) from answer_log l
                               where l.user_id = m.user_id and (l.answered_at at time zone 'America/Bogota')::date >= v_monday))
                   order by lower(m.display_name)) from study_group_members m where m.group_id = g.id)
    ) order by g.created_at) from study_groups g where exists (select 1 from study_group_members m where m.group_id = g.id and m.user_id = v_uid)), '[]'::json);
end $$;
revoke all on function public.create_study_group(text, int, text), public.join_study_group(text, text), public.leave_study_group(uuid),
  public.my_study_groups() from public, anon;
grant execute on function public.create_study_group(text, int, text), public.join_study_group(text, text), public.leave_study_group(uuid),
  public.my_study_groups() to authenticated;
revoke all on function public.study_group_preview(text) from public;
grant execute on function public.study_group_preview(text) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F13 short links

create table if not exists public.short_links (
  code       text primary key check (code ~ '^[a-z0-9-]{2,32}$'),
  target     text not null check (target ~ '^/[^/\\]' and char_length(target) <= 400),  -- this site only: no open redirect
  label      text check (label is null or char_length(label) <= 120),
  clicks     int not null default 0,
  last_click timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.short_links enable row level security;
revoke all on public.short_links from anon, authenticated;

insert into public.short_links (code, target, label) values
  ('practicar', '/app/?empezar=1', 'Practicar (genérico)'),
  ('diagnostico', '/diagnostico-icfes/', 'Diagnóstico ICFES'),
  ('colegios', '/preicfes-para-colegios/', 'Página para colegios'),
  ('simulacro', '/simulacro-icfes/', 'Simulacro ICFES'),
  ('nacional', '/simulacro-nacional/', 'Simulacro nacional Cóndor')
on conflict (code) do nothing;

-- Called by the worker for /r/<code>: the target, and one more click.
create or replace function public.resolve_short_link(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_target text;
begin
  if not growth_rate_ok('sl:all', 3000) then
    select target into v_target from short_links where code = lower(p_code);
    return v_target;
  end if;
  update short_links set clicks = clicks + 1, last_click = now() where code = lower(p_code) returning target into v_target;
  return v_target;
end $$;
revoke all on function public.resolve_short_link(text) from public;
grant execute on function public.resolve_short_link(text) to anon, authenticated;

create or replace function public.admin_short_links()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(s order by s.created_at desc) from short_links s), '[]'::json);
end $$;
create or replace function public.admin_save_short_link(p_code text, p_target text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  insert into short_links (code, target, label, created_by) values (lower(trim(p_code)), trim(p_target), nullif(trim(p_label), ''), auth.uid())
  on conflict (code) do update set target = excluded.target, label = excluded.label;
end $$;
revoke all on function public.admin_short_links(), public.admin_save_short_link(text, text, text) from public, anon;
grant execute on function public.admin_short_links(), public.admin_save_short_link(text, text, text) to authenticated;

-- ------------------------------------------------------------------------------------------------ F17 class diagnostics

create table if not exists public.class_diagnostics (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z0-9]{6}$'),   -- the students' link
  secret       uuid not null unique default gen_random_uuid(),          -- the teacher's results link
  teacher_name text not null check (char_length(teacher_name) between 2 and 80),
  school_name  text check (school_name is null or char_length(school_name) <= 120),
  course       text check (course is null or char_length(course) <= 40),
  email        text check (email is null or (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200)),
  visitor      uuid,
  created_at   timestamptz not null default now()
);
create table if not exists public.diagnostic_responses (
  id           bigserial primary key,
  diag_id      uuid not null references public.class_diagnostics (id) on delete cascade,
  visitor      uuid not null,
  student_name text check (student_name is null or char_length(student_name) <= 60),
  answers      jsonb not null default '{}'::jsonb check (pg_column_size(answers) <= 4000),
  correct      int not null check (correct between 0 and 100),
  total        int not null check (total between 1 and 100),
  per_area     jsonb not null default '[]'::jsonb check (pg_column_size(per_area) <= 4000),
  est_score    int check (est_score is null or est_score between 0 and 500),
  at           timestamptz not null default now(),
  unique (diag_id, visitor)
);
alter table public.class_diagnostics enable row level security;
alter table public.diagnostic_responses enable row level security;
revoke all on public.class_diagnostics, public.diagnostic_responses from anon, authenticated;

create or replace function public.create_class_diagnostic(p_teacher text, p_school text, p_course text, p_email text, p_visitor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_secret uuid;
begin
  if coalesce(char_length(trim(p_teacher)), 0) < 2 then return json_build_object('error', 'name'); end if;
  if not growth_rate_ok('cd:' || coalesce(p_visitor::text, 'x'), 6, interval '1 hour') or not growth_rate_ok('cd:all', 200, interval '1 hour') then
    return json_build_object('error', 'too_many');
  end if;
  for i in 1..8 loop
    v_code := growth_code(6);
    begin
      insert into class_diagnostics (code, teacher_name, school_name, course, email, visitor)
      values (v_code, left(trim(p_teacher), 80), nullif(left(trim(p_school), 120), ''), nullif(left(trim(p_course), 40), ''),
              case when p_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then lower(left(trim(p_email), 200)) end, p_visitor)
      returning secret into v_secret;
      return json_build_object('code', v_code, 'secret', v_secret);
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'no_code';
end $$;

create or replace function public.class_diagnostic_info(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('teacher', teacher_name, 'school', school_name, 'course', course)
    from class_diagnostics where code = lower(trim(p_code));
$$;

create or replace function public.submit_class_diagnostic(p_code text, p_visitor uuid, p_name text, p_answers jsonb, p_correct int, p_total int, p_per_area jsonb, p_est int)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_visitor is null then return 'no_visitor'; end if;
  select id into v_id from class_diagnostics where code = lower(trim(p_code));
  if v_id is null then return 'unknown'; end if;
  if not growth_rate_ok('cdr:' || v_id::text, 120, interval '1 hour') then return 'too_many'; end if;
  if (select count(*) from diagnostic_responses where diag_id = v_id) >= 300 then return 'full'; end if;
  insert into diagnostic_responses (diag_id, visitor, student_name, answers, correct, total, per_area, est_score)
  values (v_id, p_visitor, nullif(left(trim(p_name), 60), ''),
          case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end,
          least(greatest(coalesce(p_correct, 0), 0), 100), least(greatest(coalesce(p_total, 1), 1), 100),
          case when jsonb_typeof(p_per_area) = 'array' then p_per_area else '[]'::jsonb end,
          case when p_est between 0 and 500 then p_est end)
  on conflict (diag_id, visitor) do update set student_name = excluded.student_name, answers = excluded.answers, correct = excluded.correct,
    total = excluded.total, per_area = excluded.per_area, est_score = excluded.est_score, at = now();
  return 'ok';
end $$;

-- The teacher's page (by the secret link): each student's result and the class's answers per question.
create or replace function public.class_diagnostic_report(p_secret uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('teacher', d.teacher_name, 'school', d.school_name, 'course', d.course, 'code', d.code, 'created_at', d.created_at,
    'responses', coalesce((select json_agg(json_build_object('name', r.student_name, 'correct', r.correct, 'total', r.total,
                    'per_area', r.per_area, 'est', r.est_score, 'answers', r.answers, 'at', r.at) order by lower(coalesce(r.student_name, '')), r.at)
                  from diagnostic_responses r where r.diag_id = d.id), '[]'::json))
    from class_diagnostics d where d.secret = p_secret;
$$;
revoke all on function public.create_class_diagnostic(text, text, text, text, uuid), public.class_diagnostic_info(text),
  public.submit_class_diagnostic(text, uuid, text, jsonb, int, int, jsonb, int), public.class_diagnostic_report(uuid) from public;
grant execute on function public.create_class_diagnostic(text, text, text, text, uuid), public.class_diagnostic_info(text),
  public.submit_class_diagnostic(text, uuid, text, jsonb, int, int, jsonb, int), public.class_diagnostic_report(uuid) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F23, F27 public answers and social proof

create table if not exists public.public_answers (
  qid     text not null check (qid ~ '^[A-Za-z0-9_.:-]{2,60}$'),
  visitor uuid not null,
  choice  text check (choice is null or choice ~ '^[A-H]$'),
  correct boolean not null,
  at      timestamptz not null default now(),
  primary key (qid, visitor)
);
create index if not exists public_answers_at on public.public_answers (at);
alter table public.public_answers enable row level security;
revoke all on public.public_answers from anon, authenticated;

-- A visitor's first try at a question on a public page. Later tries don't change it (the first try is the honest one).
create or replace function public.log_public_answer(p_qid text, p_visitor uuid, p_choice text, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or p_correct is null or coalesce(p_qid, '') !~ '^[A-Za-z0-9_.:-]{2,60}$' then return; end if;
  if not growth_rate_ok('pa:' || p_visitor::text, 60) or not growth_rate_ok('pa:all', 6000) then return; end if;
  insert into public_answers (qid, visitor, choice, correct) values (p_qid, p_visitor, case when p_choice ~ '^[A-H]$' then p_choice end, p_correct)
  on conflict (qid, visitor) do nothing;
end $$;

-- Share of first tries that were right, per question, only with 20 tries or more (rounded to 5 %).
create or replace function public.public_question_stats(p_qids text[])
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(qid, json_build_object('n', n, 'pct', pct)), '{}'::json) from (
    select qid, count(*) as n, (round(100.0 * count(*) filter (where correct) / count(*) / 5) * 5)::int as pct
      from public_answers where qid = any (p_qids[1:60]) group by qid having count(*) >= 20) t;
$$;

-- Activity of the last 7 days for the landing ("1.250 preguntas respondidas esta semana"), rounded down, and null
-- below 300 answers (a small number would work against us).
create or replace function public.public_activity()
returns json language sql stable security definer set search_path = public as $$
  with a as (
    select (select count(*) from answer_log where answered_at > now() - interval '7 days')
         + (select count(*) from public_answers where at > now() - interval '7 days') as answers,
           (select count(distinct user_id) from answer_log where answered_at > now() - interval '7 days') as students)
  select case when answers >= 300 then json_build_object('answers', (answers / 50) * 50, 'students', case when students >= 30 then (students / 10) * 10 end) end from a;
$$;
revoke all on function public.log_public_answer(text, uuid, text, boolean), public.public_question_stats(text[]), public.public_activity() from public;
grant execute on function public.log_public_answer(text, uuid, text, boolean), public.public_question_stats(text[]), public.public_activity() to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F28 leads

create table if not exists public.growth_leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200),
  kind       text not null check (kind in ('diagnostico', 'plan', 'formulas', 'nacional', 'propuesta', 'calculadora', 'otro')),
  role       text check (role in ('estudiante', 'familia', 'docente', 'coordinador', 'otro')),
  payload    jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 4000),
  consent    boolean not null check (consent),
  visitor    uuid,
  created_at timestamptz not null default now()
);
create index if not exists growth_leads_at on public.growth_leads (created_at);
alter table public.growth_leads enable row level security;
revoke all on public.growth_leads from anon, authenticated;

create or replace function public.save_lead(p_email text, p_kind text, p_role text, p_payload jsonb, p_consent boolean, p_visitor uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(p_consent, false) then return 'consent'; end if;
  if coalesce(p_email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return 'email'; end if;
  if not growth_rate_ok('lead:' || coalesce(p_visitor::text, 'x'), 5, interval '1 hour') or not growth_rate_ok('lead:all', 300, interval '1 hour') then return 'too_many'; end if;
  insert into growth_leads (email, kind, role, payload, consent, visitor)
  values (lower(left(trim(p_email), 200)),
          case when p_kind in ('diagnostico', 'plan', 'formulas', 'nacional', 'propuesta', 'calculadora') then p_kind else 'otro' end,
          case when p_role in ('estudiante', 'familia', 'docente', 'coordinador') then p_role else null end,
          case when jsonb_typeof(p_payload) = 'object' and pg_column_size(p_payload) <= 4000 then p_payload else '{}'::jsonb end, true, p_visitor);
  return 'ok';
end $$;
revoke all on function public.save_lead(text, text, text, jsonb, boolean, uuid) from public;
grant execute on function public.save_lead(text, text, text, jsonb, boolean, uuid) to anon, authenticated;

create or replace function public.admin_leads(p_days int default 90)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(l order by l.created_at desc) from (
    select id, email, kind, role, payload, created_at from growth_leads
     where created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 3650))) l), '[]'::json);
end $$;
revoke all on function public.admin_leads(int) from public, anon;
grant execute on function public.admin_leads(int) to authenticated;

-- ------------------------------------------------------------------------------------------------ F29 campaign notices

create table if not exists public.growth_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 2 and 90),
  body       text check (body is null or char_length(body) <= 240),
  cta_label  text check (cta_label is null or char_length(cta_label) <= 40),
  cta_url    text check (cta_url is null or cta_url ~ '^(/[^/\\]|https://condoricfes\.com/)'),
  audience   text not null default 'all' check (audience in ('site', 'app', 'all')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  priority   int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.growth_notices enable row level security;
revoke all on public.growth_notices from anon, authenticated;

-- Season notices that are true on known dates (ICFES calendar 2026-2027, from the official calendar). Only inserted once.
insert into public.growth_notices (id, title, body, cta_label, cta_url, audience, starts_at, ends_at, priority) values
  ('5a1d0c1e-0000-4000-8000-000000000001', 'Calendario B 2027: se viene la inscripción', 'Revisa fechas y requisitos, y empieza a practicar con exámenes reales.', 'Ver fechas', '/fechas-icfes-2027/', 'all', '2026-11-20', '2027-01-31', 10),
  ('5a1d0c1e-0000-4000-8000-000000000002', 'Simulacro nacional Cóndor', 'Un sábado, todos a la misma hora, con tu puntaje de 0 a 500 al final.', 'Inscribirme', '/simulacro-nacional/', 'all', '2026-11-14', '2026-12-06', 20)
on conflict (id) do nothing;

create or replace function public.active_notices(p_audience text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'title', title, 'body', body, 'cta_label', cta_label, 'cta_url', cta_url) order by priority desc, starts_at desc), '[]'::json)
    from (select * from growth_notices where active and now() between starts_at and ends_at
            and (audience = 'all' or audience = p_audience) order by priority desc limit 3) n;
$$;
revoke all on function public.active_notices(text) from public;
grant execute on function public.active_notices(text) to anon, authenticated;

create or replace function public.admin_notices()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(n order by n.starts_at desc) from growth_notices n), '[]'::json);
end $$;
create or replace function public.admin_save_notice(p_id uuid, p_title text, p_body text, p_cta_label text, p_cta_url text, p_audience text, p_starts timestamptz, p_ends timestamptz, p_priority int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  insert into growth_notices (id, title, body, cta_label, cta_url, audience, starts_at, ends_at, priority, active)
  values (v_id, p_title, nullif(p_body, ''), nullif(p_cta_label, ''), nullif(p_cta_url, ''), coalesce(p_audience, 'all'), coalesce(p_starts, now()), p_ends, coalesce(p_priority, 0), coalesce(p_active, true))
  on conflict (id) do update set title = excluded.title, body = excluded.body, cta_label = excluded.cta_label, cta_url = excluded.cta_url,
    audience = excluded.audience, starts_at = excluded.starts_at, ends_at = excluded.ends_at, priority = excluded.priority, active = excluded.active;
  return v_id;
end $$;
revoke all on function public.admin_notices(), public.admin_save_notice(uuid, text, text, text, text, text, timestamptz, timestamptz, int, boolean) from public, anon;
grant execute on function public.admin_notices(), public.admin_save_notice(uuid, text, text, text, text, text, timestamptz, timestamptz, int, boolean) to authenticated;

-- ------------------------------------------------------------------------------------------------ F30 events (simulacro nacional)

create table if not exists public.growth_event_signups (
  event_key text not null check (event_key ~ '^[a-z0-9-]{2,40}$'),
  visitor   uuid not null,
  user_id   uuid,
  email     text check (email is null or (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 200)),
  grade     text check (grade is null or grade in ('10', '11', 'egresado', 'docente', 'otro')),
  at        timestamptz not null default now(),
  primary key (event_key, visitor)
);
alter table public.growth_event_signups enable row level security;
revoke all on public.growth_event_signups from anon, authenticated;

create or replace function public.signup_event(p_key text, p_visitor uuid, p_email text, p_grade text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or coalesce(p_key, '') !~ '^[a-z0-9-]{2,40}$' then return json_build_object('error', 'bad'); end if;
  if not growth_rate_ok('evs:' || p_visitor::text, 10, interval '1 hour') then return json_build_object('error', 'too_many'); end if;
  insert into growth_event_signups (event_key, visitor, user_id, email, grade)
  values (p_key, p_visitor, growth_uid(), case when p_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then lower(left(trim(p_email), 200)) end,
          case when p_grade in ('10', '11', 'egresado', 'docente') then p_grade else null end)
  on conflict (event_key, visitor) do update set email = coalesce(excluded.email, growth_event_signups.email), grade = coalesce(excluded.grade, growth_event_signups.grade),
    user_id = coalesce(excluded.user_id, growth_event_signups.user_id);
  return json_build_object('ok', true, 'count', (select count(*) from growth_event_signups where event_key = p_key));
end $$;

-- Public count, shown from 25 sign-ups up.
create or replace function public.event_count(p_key text)
returns int language sql stable security definer set search_path = public as $$
  select case when count(*) >= 25 then count(*)::int end from growth_event_signups where event_key = p_key;
$$;
revoke all on function public.signup_event(text, uuid, text, text), public.event_count(text) from public;
grant execute on function public.signup_event(text, uuid, text, text), public.event_count(text) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F32 testimonials

create table if not exists public.testimonials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  detail       text check (detail is null or char_length(detail) <= 60),
  body         text not null check (char_length(body) between 10 and 400),
  consent      boolean not null check (consent),
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.testimonials enable row level security;
revoke all on public.testimonials from anon, authenticated;

create or replace function public.submit_testimonial(p_name text, p_detail text, p_body text, p_consent boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then return 'not_signed_in'; end if;
  if not coalesce(p_consent, false) then return 'consent'; end if;
  if not growth_rate_ok('tm:' || v_uid::text, 3, interval '1 day') then return 'too_many'; end if;
  insert into testimonials (user_id, display_name, detail, body, consent)
  values (v_uid, left(trim(p_name), 40), nullif(left(trim(p_detail), 60), ''), left(trim(p_body), 400), true);
  return 'ok';
end $$;
create or replace function public.approved_testimonials()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('name', display_name, 'detail', detail, 'body', body) order by created_at desc), '[]'::json)
    from (select * from testimonials where approved order by created_at desc limit 12) t;
$$;
create or replace function public.admin_testimonials()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(t order by t.created_at desc) from (select id, display_name, detail, body, approved, created_at from testimonials) t), '[]'::json);
end $$;
create or replace function public.admin_set_testimonial(p_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  update testimonials set approved = p_approved where id = p_id;
end $$;
revoke all on function public.submit_testimonial(text, text, text, boolean), public.admin_testimonials(), public.admin_set_testimonial(uuid, boolean) from public, anon;
grant execute on function public.submit_testimonial(text, text, text, boolean), public.admin_testimonials(), public.admin_set_testimonial(uuid, boolean) to authenticated;
revoke all on function public.approved_testimonials() from public;
grant execute on function public.approved_testimonials() to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F40 practice certificates

create table if not exists public.practice_certificates (
  code      text primary key check (code ~ '^[a-z0-9]{8}$'),
  user_id   uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  stats     jsonb not null,
  issued_at timestamptz not null default now()
);
alter table public.practice_certificates enable row level security;
revoke all on public.practice_certificates from anon, authenticated;

-- The criteria, from the account's own answers: 150 graded answers, 3 areas, 5 different days.
create or replace function public.certificate_progress()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return (select json_build_object(
      'answered', count(*) filter (where correct is not null),
      'correct', count(*) filter (where correct),
      'areas', count(distinct area) filter (where area is not null),
      'days', count(distinct (answered_at at time zone 'America/Bogota')::date),
      'since', min(answered_at),
      'need', json_build_object('answered', 150, 'areas', 3, 'days', 5),
      'code', (select code from practice_certificates where user_id = v_uid))
    from answer_log where user_id = v_uid);
end $$;

create or replace function public.issue_certificate(p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_p json; v_code text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_p := certificate_progress();
  if (v_p ->> 'answered')::int < 150 or (v_p ->> 'areas')::int < 3 or (v_p ->> 'days')::int < 5 then return json_build_object('error', 'not_yet', 'progress', v_p); end if;
  select code into v_code from practice_certificates where user_id = v_uid;
  if v_code is null then
    for i in 1..8 loop
      v_code := growth_code(8);
      begin
        insert into practice_certificates (code, user_id, full_name, stats) values (v_code, v_uid, left(trim(p_name), 80), (v_p::jsonb - 'need' - 'code'));
        exit;
      exception when unique_violation then
        select code into v_code from practice_certificates where user_id = v_uid;
        exit when v_code is not null;
      end;
    end loop;
  else
    update practice_certificates set full_name = left(trim(p_name), 80), stats = (v_p::jsonb - 'need' - 'code'), issued_at = now() where user_id = v_uid;
  end if;
  return json_build_object('code', v_code);
end $$;

-- Public check of a certificate: first name and last-name initial only, and the numbers.
create or replace function public.verify_certificate(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('name', split_part(full_name, ' ', 1) || coalesce(' ' || nullif(left(split_part(full_name, ' ', 2), 1), '') || '.', ''),
                           'stats', stats, 'issued_at', issued_at)
    from practice_certificates where code = lower(trim(p_code));
$$;
revoke all on function public.certificate_progress(), public.issue_certificate(text) from public, anon;
grant execute on function public.certificate_progress(), public.issue_certificate(text) to authenticated;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F41 family link for independent students

-- A student shares their own progress with their family (the teacher version is create_family_report, 0006).
create or replace function public.create_my_family_report(p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_token text;
begin
  select * into v_me from profiles where id = growth_uid();
  if not found or v_me.role <> 'student' then raise exception 'not_allowed'; end if;
  if pg_column_size(p_payload) >= 20000 then raise exception 'too_big'; end if;
  if not growth_rate_ok('fam:' || v_me.id::text, 10, interval '1 day') then raise exception 'too_many'; end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into family_reports (token, school_id, profile_id, created_by, payload) values (v_token, v_me.school_id, v_me.id, v_me.id, p_payload);
  return v_token;
end $$;
revoke all on function public.create_my_family_report(jsonb) from public, anon;
grant execute on function public.create_my_family_report(jsonb) to authenticated;

-- ------------------------------------------------------------------------------------------------ F43-F46 surveys and roadmap

create table if not exists public.survey_answers (
  id      bigserial primary key,
  survey  text not null check (survey in ('nps', 'canal', 'precio', 'precio_colegio', 'idea')),
  user_id uuid,
  visitor uuid,
  answer  jsonb not null check (jsonb_typeof(answer) = 'object' and pg_column_size(answer) <= 1500),
  at      timestamptz not null default now()
);
create unique index if not exists survey_once_user on public.survey_answers (survey, user_id) where user_id is not null and survey <> 'idea';
create unique index if not exists survey_once_visitor on public.survey_answers (survey, visitor) where user_id is null and survey <> 'idea';
alter table public.survey_answers enable row level security;
revoke all on public.survey_answers from anon, authenticated;

create or replace function public.answer_survey(p_survey text, p_visitor uuid, p_answer jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if p_survey not in ('nps', 'canal', 'precio', 'precio_colegio', 'idea') or jsonb_typeof(p_answer) <> 'object' or pg_column_size(p_answer) > 1500 then return 'bad'; end if;
  if v_uid is null and p_visitor is null then return 'bad'; end if;
  if not growth_rate_ok('sv:' || coalesce(v_uid, p_visitor)::text, 12, interval '1 hour') then return 'too_many'; end if;
  begin
    insert into survey_answers (survey, user_id, visitor, answer) values (p_survey, v_uid, p_visitor, p_answer);
  exception when unique_violation then
    update survey_answers set answer = p_answer, at = now()
     where survey = p_survey and ((v_uid is not null and user_id = v_uid) or (v_uid is null and user_id is null and visitor = p_visitor));
  end;
  return 'ok';
end $$;
revoke all on function public.answer_survey(text, uuid, jsonb) from public;
grant execute on function public.answer_survey(text, uuid, jsonb) to anon, authenticated;

create or replace function public.admin_surveys(p_days int default 90)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 1), 3650));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_object_agg(survey, rows) from (
    select survey, json_agg(json_build_object('answer', answer, 'at', at, 'role', (select role from profiles p where p.id = s.user_id)) order by at desc) as rows
      from survey_answers s where at >= v_from group by survey) t), '{}'::json);
end $$;
revoke all on function public.admin_surveys(int) from public, anon;
grant execute on function public.admin_surveys(int) to authenticated;

create table if not exists public.roadmap_items (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  title       text not null check (char_length(title) <= 90),
  description text not null check (char_length(description) <= 300),
  audience    text not null default 'estudiantes' check (audience in ('estudiantes', 'docentes', 'todos')),
  status      text not null default 'idea' check (status in ('idea', 'en-camino', 'listo')),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.roadmap_votes (
  item_id text not null references public.roadmap_items (id) on delete cascade,
  visitor uuid not null,
  at      timestamptz not null default now(),
  primary key (item_id, visitor)
);
alter table public.roadmap_items enable row level security;
alter table public.roadmap_votes enable row level security;
revoke all on public.roadmap_items, public.roadmap_votes from anon, authenticated;

insert into public.roadmap_items (id, title, description, audience, status, sort) values
  ('explicacion-paso-a-paso', 'Explicación paso a paso de cada pregunta', 'Cada respuesta con el razonamiento completo y el error típico de cada opción.', 'estudiantes', 'en-camino', 10),
  ('modo-sin-internet', 'Practicar sin internet', 'Descargar un cuadernillo y practicar en el bus o donde no haya señal.', 'estudiantes', 'en-camino', 20),
  ('videos-cortos', 'Videos cortos por tema', 'Un video de 3 minutos por tema, enlazado desde las preguntas que fallas.', 'estudiantes', 'idea', 30),
  ('lectura-critica-patrones', 'Patrones de Lectura crítica', 'Ver qué tipo de pregunta de lectura fallas más (intención del autor, inferencia, estructura).', 'estudiantes', 'idea', 40),
  ('simulacro-mensual', 'Simulacro nacional cada mes', 'Un sábado al mes, todos a la misma hora, con tu puntaje al final.', 'todos', 'en-camino', 50),
  ('preguntas-nuevas-2025', 'Preguntas de exámenes más recientes', 'Más cuadernillos publicados por el ICFES de los últimos años.', 'todos', 'idea', 60),
  ('reporte-padres', 'Informe mensual para la familia', 'Un resumen sencillo del avance que llega a la familia cada mes.', 'todos', 'idea', 70),
  ('banco-docente-compartido', 'Banco de preguntas entre docentes', 'Compartir preguntas propias con docentes de otros colegios.', 'docentes', 'idea', 80),
  ('planeador-clases', 'Planeador de clases por competencia', 'Sugerencias de clase según lo que más falla el curso.', 'docentes', 'idea', 90),
  ('integracion-plataformas', 'Notas a la plataforma del colegio', 'Exportar las notas al formato de la plataforma académica del colegio.', 'docentes', 'idea', 100)
on conflict (id) do nothing;

create or replace function public.roadmap_list(p_visitor uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', i.id, 'title', i.title, 'description', i.description, 'audience', i.audience, 'status', i.status,
           'votes', (select count(*) from roadmap_votes v where v.item_id = i.id),
           'mine', exists (select 1 from roadmap_votes v where v.item_id = i.id and v.visitor = p_visitor)) order by i.sort), '[]'::json)
    from roadmap_items i;
$$;
create or replace function public.roadmap_vote(p_item text, p_visitor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or not growth_rate_ok('rv:' || p_visitor::text, 40, interval '1 hour') then return null; end if;
  if exists (select 1 from roadmap_votes where item_id = p_item and visitor = p_visitor) then
    delete from roadmap_votes where item_id = p_item and visitor = p_visitor;
    return false;
  end if;
  insert into roadmap_votes (item_id, visitor) select p_item, p_visitor where exists (select 1 from roadmap_items where id = p_item);
  return true;
end $$;
revoke all on function public.roadmap_list(uuid), public.roadmap_vote(text, uuid) from public;
grant execute on function public.roadmap_list(uuid), public.roadmap_vote(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------ F48 school demand

create table if not exists public.student_school_names (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  school_name text not null check (char_length(school_name) between 3 and 100),
  city        text check (city is null or char_length(city) <= 60),
  norm        text not null,
  at          timestamptz not null default now()
);
alter table public.student_school_names enable row level security;
revoke all on public.student_school_names from anon, authenticated;

-- "Colegio Nuestra Señora del Rosario" and "col. nuestra sra del rosario" end up close: lower case, no accents,
-- no common words.
create or replace function public.growth_norm_school(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
           ' ' || lower(translate(coalesce(p, ''), 'áéíóúüñÁÉÍÓÚÜÑ.,', 'aeiouunaeiouun  ')) || ' ',
           '\s(colegio|col|institucion|educativa|ie|iet|i|e|gimnasio|liceo|escuela|centro|de|del|la|las|los|el|y|sede|nuestra|senora|sra)(?=\s)', ' ', 'g'),
         '\s+', ' ', 'g'));
$$;

create or replace function public.set_my_school_name(p_name text, p_city text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then return 'not_signed_in'; end if;
  if coalesce(char_length(trim(p_name)), 0) < 3 then return 'name'; end if;
  insert into student_school_names (user_id, school_name, city, norm) values (v_uid, left(trim(p_name), 100), nullif(left(trim(p_city), 60), ''), growth_norm_school(p_name))
  on conflict (user_id) do update set school_name = excluded.school_name, city = excluded.city, norm = excluded.norm, at = now();
  return 'ok';
end $$;
create or replace function public.my_school_name()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('name', school_name, 'city', city) from student_school_names where user_id = growth_uid();
$$;
revoke all on function public.set_my_school_name(text, text), public.my_school_name() from public, anon;
grant execute on function public.set_my_school_name(text, text), public.my_school_name() to authenticated;

-- Schools where students already practice on their own: the warmest leads for a school plan.
create or replace function public.admin_school_demand()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(t order by t.students desc, t.active_7d desc) from (
    select min(n.school_name) as school, min(n.city) as city, n.norm, count(*) as students,
           count(*) filter (where exists (select 1 from answer_log l where l.user_id = n.user_id and l.answered_at > now() - interval '7 days')) as active_7d,
           (select count(*) from answer_log l where l.user_id in (select user_id from student_school_names x where x.norm = n.norm)) as answers,
           exists (select 1 from schools s where growth_norm_school(s.name) = n.norm) as has_account
      from student_school_names n group by n.norm limit 200) t), '[]'::json);
end $$;
revoke all on function public.admin_school_demand() from public, anon;
grant execute on function public.admin_school_demand() to authenticated;

-- ------------------------------------------------------------------------------------------------ F42, F38 item statistics

-- Per question with enough graded answers: share right (p), point-biserial against the account's overall share right
-- (discrimination), the most chosen wrong letter, and a flag when the numbers suggest a wrong key.
create or replace function public.admin_item_stats(p_min int default 20)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(t order by t.flag nulls last, t.p) from (
    with acc as (select user_id, avg(case when correct then 1.0 else 0.0 end) as ability from answer_log where correct is not null group by user_id having count(*) >= 10),
    rows as (
      select l.exam_slug, l.qkey, l.area, l.answer, case when l.correct then 1.0 else 0.0 end as y, a.ability
        from answer_log l left join acc a on a.user_id = l.user_id where l.correct is not null),
    agg as (
      select exam_slug, qkey, min(area) as area, count(*) as n, avg(y) as p, corr(y, ability) as disc,
             (select json_object_agg(answer, c) from (select r2.answer, count(*) as c from rows r2 where r2.exam_slug = r.exam_slug and r2.qkey = r.qkey group by r2.answer) z) as choices,
             (select r3.answer from rows r3 where r3.exam_slug = r.exam_slug and r3.qkey = r.qkey and r3.y = 0 group by r3.answer order by count(*) desc limit 1) as top_wrong,
             (select count(*) from rows r3 where r3.exam_slug = r.exam_slug and r3.qkey = r.qkey and r3.y = 0
               and r3.answer = (select r4.answer from rows r4 where r4.exam_slug = r.exam_slug and r4.qkey = r.qkey and r4.y = 0 group by r4.answer order by count(*) desc limit 1)) as top_wrong_n
        from rows r group by exam_slug, qkey having count(*) >= greatest(coalesce(p_min, 20), 5))
    select exam_slug, qkey, area, n, round(p::numeric, 3) as p, round(disc::numeric, 3) as disc, choices, top_wrong,
           case when top_wrong_n > n * p and p < 0.35 then 'clave-dudosa'
                when disc < -0.05 then 'discrimina-al-reves'
                when p > 0.95 then 'muy-facil'
                when p < 0.1 then 'muy-dificil' end as flag
      from agg) t), '[]'::json);
end $$;
revoke all on function public.admin_item_stats(int) from public, anon;
grant execute on function public.admin_item_stats(int) to authenticated;

-- Difficulty for "Practica a tu nivel": share right per question of one booklet, from 15 graded answers up. It says
-- nothing about which letter is right.
create or replace function public.question_difficulty(p_slug text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(qkey, p), '{}'::json) from (
    select qkey, round(avg(case when correct then 1.0 else 0.0 end)::numeric, 2) as p
      from answer_log where exam_slug = p_slug and correct is not null group by qkey having count(*) >= 15) t;
$$;
revoke all on function public.question_difficulty(text) from public, anon;
grant execute on function public.question_difficulty(text) to authenticated;

-- ------------------------------------------------------------------------------------------------ F35 web push reminders

create table if not exists public.push_subscriptions (
  endpoint   text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 600),
  user_id    uuid references auth.users (id) on delete cascade,
  visitor    uuid,
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  hour       int not null default 18 check (hour between 0 and 23),   -- Bogotá time
  last_sent  date,
  fails      int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_hour int, p_visitor uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_endpoint, '') !~ '^https://' then return 'bad'; end if;
  if not growth_rate_ok('push:' || coalesce(p_visitor::text, 'x'), 10, interval '1 hour') then return 'too_many'; end if;
  insert into push_subscriptions (endpoint, user_id, visitor, p256dh, auth, hour)
  values (left(p_endpoint, 600), growth_uid(), p_visitor, left(p_p256dh, 200), left(p_auth, 100), least(greatest(coalesce(p_hour, 18), 0), 23))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, hour = excluded.hour, fails = 0,
    user_id = coalesce(excluded.user_id, push_subscriptions.user_id);
  return 'ok';
end $$;
create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function public.save_push_subscription(text, text, text, int, uuid), public.remove_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text, int, uuid), public.remove_push_subscription(text) to anon, authenticated;

-- The worker's hourly cron asks which subscriptions are due now (their hour, not sent today, and not practiced today
-- when the account is known). It proves itself with a token kept in growth_secrets (set it to the worker's
-- PUSH_CRON_TOKEN). Marks them sent in the same call.
create table if not exists public.growth_secrets (key text primary key, value text not null);
alter table public.growth_secrets enable row level security;
revoke all on public.growth_secrets from anon, authenticated;
insert into public.growth_secrets (key, value) values ('push_cron', encode(gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

create or replace function public.push_due(p_token text, p_limit int default 500)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_hour int := extract(hour from (now() at time zone 'America/Bogota'))::int;
  v_out json;
begin
  if p_token is null or p_token <> (select value from growth_secrets where key = 'push_cron') then raise exception 'not_allowed'; end if;
  with due as (
    select s.endpoint from push_subscriptions s
     where s.hour <= v_hour and (s.last_sent is null or s.last_sent < v_today) and s.fails < 5
       and not (s.user_id is not null and exists (select 1 from answer_log l where l.user_id = s.user_id and (l.answered_at at time zone 'America/Bogota')::date = v_today))
     limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ), upd as (
    update push_subscriptions s set last_sent = v_today from due where s.endpoint = due.endpoint
    returning s.endpoint, s.p256dh, s.auth, s.user_id
  )
  select coalesce(json_agg(json_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
           'streak', (select count(distinct (l.answered_at at time zone 'America/Bogota')::date) from answer_log l
                       where l.user_id = upd.user_id and l.answered_at > now() - interval '7 days'))), '[]'::json) into v_out from upd;
  return v_out;
end $$;
create or replace function public.push_failed(p_token text, p_endpoint text, p_gone boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token <> (select value from growth_secrets where key = 'push_cron') then raise exception 'not_allowed'; end if;
  if p_gone then delete from push_subscriptions where endpoint = p_endpoint;
  else update push_subscriptions set fails = fails + 1 where endpoint = p_endpoint; end if;
end $$;
revoke all on function public.push_due(text, int), public.push_failed(text, text, boolean) from public;
grant execute on function public.push_due(text, int), public.push_failed(text, text, boolean) to anon;

-- ------------------------------------------------------------------------------------------------ F7 overview

create or replace function public.admin_growth_overview(p_days int default 7)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
begin
  if not growth_is_admin() then raise exception 'not_admin'; end if;
  return json_build_object(
    'visitors', (select count(distinct visitor) from growth_events where at >= v_from),
    'events', (select count(*) from growth_events where at >= v_from),
    'referral_signups', (select count(*) from referrals where at >= v_from),
    'short_link_clicks', (select coalesce(sum(clicks), 0) from short_links),
    'leads', (select count(*) from growth_leads where created_at >= v_from),
    'class_diagnostics', (select count(*) from class_diagnostics where created_at >= v_from),
    'diagnostic_responses', (select count(*) from diagnostic_responses where at >= v_from),
    'public_answers', (select count(*) from public_answers where at >= v_from),
    'study_groups', (select count(*) from study_groups),
    'event_signups', (select count(*) from growth_event_signups where at >= v_from),
    'partner_applications', (select count(*) from partner_applications where status = 'nueva'),
    'testimonials_pending', (select count(*) from testimonials where not approved),
    'certificates', (select count(*) from practice_certificates),
    'push_subscribers', (select count(*) from push_subscriptions where fails < 5),
    'errors', (select coalesce(sum(count), 0) from client_errors where last_at >= v_from),
    'schools_named', (select count(distinct norm) from student_school_names));
end $$;
revoke all on function public.admin_growth_overview(int) from public, anon;
grant execute on function public.admin_growth_overview(int) to authenticated;
