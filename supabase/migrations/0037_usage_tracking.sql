-- 0037 · Who uses Cóndor and how much: visitors of the public site (anonymous), accounts, and every question answered.
-- 1) site_visitors: one row per browser that opens condoricfes.com. The id is a random number the browser keeps
--    (localStorage condor:vid): no IP, no name, no cookie of third parties. It records where the visit came from
--    (facebook.com, google, utm_source=...), whether the sample question on the landing was answered, whether the app
--    was opened, and the account it signed in with (if it did). track_visit() is the only way in.
-- 2) answer_log: one row per question answered in the app (practice, simulacro or task), by account. The browser
--    sends them in small batches (log_answers). `correct` is filled in when the app knows the key (after Comprobar or
--    when the attempt is graded); it is for the owner's statistics only, grades never read it.
-- 3) app_admins + admin_usage(): the owner's «Uso» page in the app (#admin/uso). Only accounts listed in app_admins
--    can call it. Views uso_usuarios / uso_por_dia / uso_embudo give the same numbers in the SQL Editor.
-- Runs after 0036 (needs profiles, attempts, schools). Re-runnable.

create table if not exists public.site_visitors (
  visitor_id      uuid primary key,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  days            int  not null default 1,
  last_day        date not null default (now() at time zone 'America/Bogota')::date,
  first_path      text check (first_path is null or char_length(first_path) <= 120),
  source          text check (source is null or char_length(source) <= 80),
  answered_sample boolean not null default false,
  opened_app      boolean not null default false,
  user_id         uuid references auth.users (id) on delete set null,
  signed_in_at    timestamptz
);
create index if not exists site_visitors_user_idx on public.site_visitors (user_id);
create index if not exists site_visitors_first_idx on public.site_visitors (first_seen);
alter table public.site_visitors enable row level security;
revoke all on public.site_visitors from anon, authenticated;

create table if not exists public.answer_log (
  user_id       uuid not null references auth.users (id) on delete cascade,
  attempt_id    text not null check (char_length(attempt_id) <= 40),
  exam_slug     text not null check (char_length(exam_slug) <= 80),
  qkey          text not null check (char_length(qkey) <= 20),
  area          text check (area is null or char_length(area) <= 40),
  mode          text check (mode is null or char_length(mode) <= 20),
  assignment_id uuid,
  answer        text check (answer is null or char_length(answer) <= 4),
  correct       boolean,
  answered_at   timestamptz not null default now(),
  primary key (user_id, attempt_id, exam_slug, qkey)
);
create index if not exists answer_log_time_idx on public.answer_log (answered_at);
alter table public.answer_log enable row level security;
revoke all on public.answer_log from anon, authenticated;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Answers delivered before this migration (attempts saved by accounts) count too. Runs once per attempt: a second run
-- inserts nothing new.
insert into public.answer_log (user_id, attempt_id, exam_slug, qkey, mode, assignment_id, answer, answered_at)
select a.profile_id, left(a.client_id, 40), left(a.exam_slug, 80), left(k.key, 20), a.mode, a.assignment_id,
       left(k.value, 4), coalesce(a.submitted_at, a.started_at)
  from public.attempts a
  cross join lateral jsonb_each_text(case when jsonb_typeof(a.answers) = 'object' then a.answers else '{}'::jsonb end) k
 where a.profile_id is not null and a.submitted_at is not null and k.value <> ''
   and exists (select 1 from auth.users u where u.id = a.profile_id)
on conflict do nothing;

-- A visit from the site or the app. p_event: 'view' (a page of the site), 'sample' (answered the landing's sample
-- question), 'app' (opened /app/), 'signin' (the app has an account; links this browser to it).
create or replace function public.track_visit(p_visitor uuid, p_event text default 'view', p_path text default null, p_source text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_event text := coalesce(p_event, 'view');
begin
  if p_visitor is null or v_event not in ('view', 'sample', 'app', 'signin') then return; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then v_uid := null; end if;
  -- A flood of new ids (a script) stops being recorded; real visitors are far below this.
  if not exists (select 1 from site_visitors where visitor_id = p_visitor)
     and (select count(*) from site_visitors where first_seen > now() - interval '1 minute') > 300 then
    return;
  end if;
  insert into site_visitors as s (visitor_id, first_path, source, answered_sample, opened_app, user_id, signed_in_at)
  values (p_visitor, left(nullif(trim(p_path), ''), 120), left(nullif(lower(trim(p_source)), ''), 80),
          v_event = 'sample', v_event in ('app', 'signin'), v_uid, case when v_uid is not null then now() end)
  on conflict (visitor_id) do update set
    last_seen = now(),
    days = s.days + case when s.last_day < v_day then 1 else 0 end,
    last_day = v_day,
    source = coalesce(s.source, excluded.source),
    answered_sample = s.answered_sample or excluded.answered_sample,
    opened_app = s.opened_app or excluded.opened_app,
    user_id = coalesce(excluded.user_id, s.user_id),
    signed_in_at = coalesce(s.signed_in_at, excluded.signed_in_at);
end $$;
revoke all on function public.track_visit(uuid, text, text, text) from public;
grant execute on function public.track_visit(uuid, text, text, text) to anon, authenticated;

-- Questions answered in the app: [{ attempt, slug, key, area, mode, assignment, answer, correct }], at most 200 a call.
-- A question answered again in the same attempt keeps one row (the last answer).
create or replace function public.log_answers(p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  insert into answer_log as l (user_id, attempt_id, exam_slug, qkey, area, mode, assignment_id, answer, correct)
  select v_uid, left(r ->> 'attempt', 40), left(r ->> 'slug', 80), left(r ->> 'key', 20), left(r ->> 'area', 40),
         left(r ->> 'mode', 20),
         case when (r ->> 'assignment') ~ '^[0-9a-f-]{36}$' then (r ->> 'assignment')::uuid end,
         left(r ->> 'answer', 4),
         case when jsonb_typeof(r -> 'correct') = 'boolean' then (r ->> 'correct')::boolean end
    from (select distinct on (e.value ->> 'attempt', e.value ->> 'slug', e.value ->> 'key') e.value as r
            from (select value, ord from jsonb_array_elements(p_rows) with ordinality as t(value, ord) order by ord limit 200) e
           order by e.value ->> 'attempt', e.value ->> 'slug', e.value ->> 'key', e.ord desc) x
   where coalesce(r ->> 'attempt', '') <> '' and coalesce(r ->> 'slug', '') <> '' and coalesce(r ->> 'key', '') <> ''
  on conflict (user_id, attempt_id, exam_slug, qkey) do update set
    answer = excluded.answer,
    correct = coalesce(excluded.correct, case when l.answer is not distinct from excluded.answer then l.correct end),
    area = coalesce(excluded.area, l.area);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.log_answers(jsonb) from public, anon;
grant execute on function public.log_answers(jsonb) to authenticated;

create or replace function public.am_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function public.am_admin() from public, anon;
grant execute on function public.am_admin() to authenticated;

-- One line per account: who, school, when they joined, last activity, questions answered.
create or replace view public.uso_usuarios with (security_invoker = true) as
with ans as (
  select user_id, count(*) as preguntas,
         count(*) filter (where answered_at > now() - interval '7 days') as preguntas_7d,
         count(*) filter (where answered_at > now() - interval '1 day') as preguntas_hoy,
         count(*) filter (where correct) as correctas,
         count(*) filter (where correct is not null) as calificadas,
         count(distinct attempt_id) as practicas,
         max(answered_at) as ultima_respuesta
    from answer_log group by user_id
), vis as (
  select user_id, min(first_seen) as primera_visita, max(last_seen) as ultima_visita, min(source) as fuente
    from site_visitors where user_id is not null group by user_id
), dl as (
  select user_id, max(last_at) as ultimo_cuadernillo from exam_downloads group by user_id
)
select p.id as user_id, p.full_name as nombre, p.email as correo, p.role as rol, s.name as colegio,
       p.created_at as registro,
       greatest(a.ultima_respuesta, v.ultima_visita, d.ultimo_cuadernillo) as ultima_actividad,
       coalesce(a.preguntas, 0) as preguntas, coalesce(a.preguntas_7d, 0) as preguntas_7d,
       coalesce(a.preguntas_hoy, 0) as preguntas_hoy, coalesce(a.practicas, 0) as practicas,
       case when a.calificadas > 0 then round(100.0 * a.correctas / a.calificadas) end as pct_correctas,
       v.fuente
  from profiles p
  left join schools s on s.id = p.school_id
  left join ans a on a.user_id = p.id
  left join vis v on v.user_id = p.id
  left join dl d on d.user_id = p.id;
revoke all on public.uso_usuarios from anon, authenticated;

-- Day by day (Bogotá time): visitors, new accounts, accounts that answered, questions answered.
create or replace view public.uso_por_dia with (security_invoker = true) as
with d as (
  select generate_series((now() at time zone 'America/Bogota')::date - 59, (now() at time zone 'America/Bogota')::date, interval '1 day')::date as dia
)
select d.dia,
       (select count(*) from site_visitors v where (v.first_seen at time zone 'America/Bogota')::date = d.dia) as visitantes_nuevos,
       (select count(*) from site_visitors v where v.last_day = d.dia) as visitantes_activos_ultimo_dia,
       (select count(*) from profiles p where (p.created_at at time zone 'America/Bogota')::date = d.dia) as cuentas_nuevas,
       (select count(distinct l.user_id) from answer_log l where (l.answered_at at time zone 'America/Bogota')::date = d.dia) as cuentas_que_respondieron,
       (select count(*) from answer_log l where (l.answered_at at time zone 'America/Bogota')::date = d.dia) as preguntas
  from d order by d.dia desc;
revoke all on public.uso_por_dia from anon, authenticated;

-- The path from the landing to answering: how many browsers got to each step.
create or replace view public.uso_embudo with (security_invoker = true) as
select count(*) as visitantes,
       count(*) filter (where answered_sample) as respondieron_muestra,
       count(*) filter (where opened_app) as abrieron_app,
       count(*) filter (where user_id is not null) as entraron_con_cuenta,
       count(*) filter (where user_id in (select user_id from answer_log)) as respondieron_en_app
  from site_visitors;
revoke all on public.uso_embudo from anon, authenticated;

-- The «Uso» page. p_days: the period of the totals and the daily chart (1..90).
create or replace function public.admin_usage(p_days int default 30)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
  v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then raise exception 'not_admin'; end if;
  return json_build_object(
    'days', v_days,
    'totals', json_build_object(
      'visitors', (select count(*) from site_visitors where last_seen >= v_from),
      'visitors_today', (select count(*) from site_visitors where last_day = v_today),
      'sample', (select count(*) from site_visitors where last_seen >= v_from and answered_sample),
      'opened_app', (select count(*) from site_visitors where last_seen >= v_from and opened_app),
      'signed_in', (select count(*) from site_visitors where last_seen >= v_from and user_id is not null),
      'answered_in_app', (select count(*) from site_visitors v where v.last_seen >= v_from and v.user_id is not null
                            and exists (select 1 from answer_log l where l.user_id = v.user_id)),
      'accounts', (select count(*) from profiles),
      'accounts_new', (select count(*) from profiles where created_at >= v_from),
      'students', (select count(*) from profiles where role = 'student'),
      'active', (select count(distinct user_id) from answer_log where answered_at >= v_from),
      'active_today', (select count(distinct user_id) from answer_log where (answered_at at time zone 'America/Bogota')::date = v_today),
      'answers', (select count(*) from answer_log where answered_at >= v_from),
      'answers_today', (select count(*) from answer_log where (answered_at at time zone 'America/Bogota')::date = v_today),
      'answers_all', (select count(*) from answer_log)
    ),
    'sources', coalesce((
      select json_agg(x order by x.n desc) from (
        select coalesce(source, 'directo') as source, count(*) as n,
               count(*) filter (where user_id is not null) as accounts
          from site_visitors where last_seen >= v_from group by 1 order by 2 desc limit 12) x), '[]'::json),
    'daily', coalesce((
      select json_agg(x order by x.day) from (
        select d::date as day,
               (select count(*) from site_visitors v where (v.first_seen at time zone 'America/Bogota')::date = d::date) as visitors,
               (select count(*) from profiles p where (p.created_at at time zone 'America/Bogota')::date = d::date) as accounts,
               (select count(distinct l.user_id) from answer_log l where (l.answered_at at time zone 'America/Bogota')::date = d::date) as active,
               (select count(*) from answer_log l where (l.answered_at at time zone 'America/Bogota')::date = d::date) as answers
          from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d) x), '[]'::json),
    'areas', coalesce((
      select json_agg(x order by x.n desc) from (
        select coalesce(area, 'Sin área') as area, count(*) as n,
               case when count(*) filter (where correct is not null) > 0
                    then round(100.0 * count(*) filter (where correct) / count(*) filter (where correct is not null)) end as pct
          from answer_log where answered_at >= v_from group by 1) x), '[]'::json),
    'users', coalesce((
      select json_agg(x order by x.ultima_actividad desc nulls last) from (
        select user_id, nombre, correo, rol, colegio, registro, ultima_actividad, preguntas, preguntas_7d, preguntas_hoy,
               practicas, pct_correctas, fuente
          from uso_usuarios order by ultima_actividad desc nulls last limit 2000) x), '[]'::json)
  );
end $$;
revoke all on function public.admin_usage(int) from public, anon;
grant execute on function public.admin_usage(int) to authenticated;

-- The owner's account (run once, with the owner's Google email):
-- insert into public.app_admins (user_id) select id from auth.users where email = 'TU_CORREO@gmail.com' on conflict do nothing;
