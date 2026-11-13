-- 0039 · The founder's dashboard (#admin): growth, engagement, retention, acquisition and every account's activity.
-- 1) site_visit_days: one row per browser per day (Bogotá) with the pages it opened that day, where that day's visit
--    came from and the kind of device. track_visit() fills it; nothing else writes it. Still no IP and no name.
--    site_visitors.device keeps the first device seen.
-- 2) source_channel(): groups raw sources (google.com, wa-resultado, l.instagram.com…) into channels.
-- 3) founder_accounts / founder_activity: helper views (one row per account / per account and active day).
-- 4) admin_dashboard(), admin_people(), admin_person(): the page's data. Each one starts by checking app_admins
--    (migration 0037) on the server, so a non-admin gets an error, never data. admin_person() writes who looked at
--    whom in admin_access_log.
-- Runs after 0037 (and does not depend on 0039). Re-runnable (no data is lost on a second run).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Visits per day
create table if not exists public.site_visit_days (
  visitor_id uuid not null references public.site_visitors (visitor_id) on delete cascade,
  day        date not null,
  views      int  not null default 0,
  paths      text[] not null default '{}',
  source     text check (source is null or char_length(source) <= 80),
  device     text check (device is null or device in ('movil', 'tablet', 'computador')),
  user_id    uuid references auth.users (id) on delete set null,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (visitor_id, day)
);
create index if not exists site_visit_days_day_idx on public.site_visit_days (day);
create index if not exists site_visit_days_user_idx on public.site_visit_days (user_id, day);
alter table public.site_visit_days enable row level security;
revoke all on public.site_visit_days from anon, authenticated;

alter table public.site_visitors add column if not exists device text;
alter table public.site_visitors drop constraint if exists site_visitors_device_check;
alter table public.site_visitors add constraint site_visitors_device_check check (device is null or device in ('movil', 'tablet', 'computador'));

-- Visits before this migration: the first day and the last day of each browser are known (not the days in between).
insert into public.site_visit_days (visitor_id, day, views, paths, source, user_id, first_at, last_at)
select v.visitor_id, (v.first_seen at time zone 'America/Bogota')::date, 1,
       case when v.first_path is null then '{}'::text[] else array[v.first_path] end, v.source,
       case when v.user_id is not null and (v.first_seen at time zone 'America/Bogota')::date = v.last_day then v.user_id end,
       v.first_seen, v.first_seen
  from public.site_visitors v
on conflict do nothing;
insert into public.site_visit_days (visitor_id, day, views, user_id, first_at, last_at)
select v.visitor_id, v.last_day, 1, v.user_id, v.last_seen, v.last_seen
  from public.site_visitors v
 where v.last_day <> (v.first_seen at time zone 'America/Bogota')::date
on conflict do nothing;

-- The same as 0037, plus the day row and the device. The old 4-argument version is replaced (a call without p_device
-- still works: it defaults to null).
drop function if exists public.track_visit(uuid, text, text, text);
create or replace function public.track_visit(p_visitor uuid, p_event text default 'view', p_path text default null,
                                              p_source text default null, p_device text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_event text := coalesce(p_event, 'view');
  v_path text := left(nullif(trim(p_path), ''), 120);
  v_source text := left(nullif(lower(trim(p_source)), ''), 80);
  v_device text := case when p_device in ('movil', 'tablet', 'computador') then p_device end;
begin
  if p_visitor is null or v_event not in ('view', 'sample', 'app', 'signin') then return; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then v_uid := null; end if;
  -- A flood of new ids (a script) stops being recorded; real visitors are far below this.
  if not exists (select 1 from site_visitors where visitor_id = p_visitor)
     and (select count(*) from site_visitors where first_seen > now() - interval '1 minute') > 300 then
    return;
  end if;
  insert into site_visitors as s (visitor_id, first_path, source, answered_sample, opened_app, user_id, signed_in_at, device)
  values (p_visitor, v_path, v_source, v_event = 'sample', v_event in ('app', 'signin'), v_uid,
          case when v_uid is not null then now() end, v_device)
  on conflict (visitor_id) do update set
    last_seen = now(),
    days = s.days + case when s.last_day < v_day then 1 else 0 end,
    last_day = v_day,
    source = coalesce(s.source, excluded.source),
    answered_sample = s.answered_sample or excluded.answered_sample,
    opened_app = s.opened_app or excluded.opened_app,
    user_id = coalesce(excluded.user_id, s.user_id),
    signed_in_at = coalesce(s.signed_in_at, excluded.signed_in_at),
    device = coalesce(s.device, excluded.device);

  insert into site_visit_days as d (visitor_id, day, views, paths, source, device, user_id)
  values (p_visitor, v_day, case when v_event in ('view', 'app') then 1 else 0 end,
          case when v_path is null then '{}'::text[] else array[v_path] end, v_source, v_device, v_uid)
  on conflict (visitor_id, day) do update set
    views = d.views + case when v_event in ('view', 'app') then 1 else 0 end,
    paths = case when v_path is null or v_path = any (d.paths) or cardinality(d.paths) >= 40 then d.paths
                 else d.paths || v_path end,
    source = coalesce(d.source, excluded.source),
    device = coalesce(d.device, excluded.device),
    user_id = coalesce(excluded.user_id, d.user_id),
    last_at = now();

  -- Signing in tells whose browser it was: the earlier anonymous days of this browser belong to that account.
  if v_uid is not null then
    update site_visit_days set user_id = v_uid where visitor_id = p_visitor and user_id is null;
  end if;
end $$;
revoke all on function public.track_visit(uuid, text, text, text, text) from public;
grant execute on function public.track_visit(uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Channels
create or replace function public.source_channel(p text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p is null or btrim(p) = '' then 'Directo'
    -- Coming back from Google sign-in or from our own pages is not a source.
    when p ~ '(^|\.)(accounts\.google\.com|supabase\.co|condoricfes\.com|workers\.dev|localhost)$' then 'Directo'
    when p ~ '(^wa-|^wa$|whatsapp|^wa\.me)' then 'WhatsApp'
    when p ~ '(chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai|bard\.google)' then 'Asistentes IA'
    when p ~ '(mail|^com\.google\.android\.gm|outlook|hotmail|correo|email|newsletter)' then 'Correo'
    when p ~ '(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave|qwant|startpage)\.|^search\.|^google$|^bing$' then 'Buscadores'
    when p ~ '(facebook|^fb|\.fb\.|instagram|^ig$|^ig-|tiktok|youtube|youtu\.be|^t\.co$|twitter|^x\.com$|linkedin|reddit|pinterest|threads\.net|snapchat|telegram|^t\.me$|discord)' then 'Redes sociales'
    when p ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then 'Otros sitios'
    else 'Campañas'
  end;
$$;
grant execute on function public.source_channel(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Helper views (only the admin functions read them)
create or replace view public.founder_accounts with (security_invoker = true) as
select p.id as user_id, p.full_name as name, p.email, p.role, p.school_id, s.name as school, p.created_at,
       (p.created_at at time zone 'America/Bogota')::date as created_day,
       v.source, case when v.visitor_id is null then 'Sin dato' else source_channel(v.source) end as channel, v.first_path, v.device, v.first_seen, coalesce(v.answered_sample, false) as answered_sample,
       (v.visitor_id is not null) as tracked
  from profiles p
  left join schools s on s.id = p.school_id
  left join lateral (
    select sv.* from site_visitors sv where sv.user_id = p.id order by sv.first_seen limit 1
  ) v on true;
revoke all on public.founder_accounts from anon, authenticated;

-- One row per account and day it did something: answered, opened the app, delivered, played live, or (teachers)
-- created an activity, a live game or a question.
create or replace view public.founder_activity with (security_invoker = true) as
select user_id, day,
       sum(answers)::int as answers, sum(correct)::int as correct, sum(graded)::int as graded,
       sum(opens)::int as opens, sum(attempts)::int as attempts, sum(live)::int as live, sum(teacher)::int as teacher
  from (
    select user_id, (answered_at at time zone 'America/Bogota')::date as day, count(*) as answers,
           count(*) filter (where correct) as correct, count(*) filter (where correct is not null) as graded,
           0 as opens, 0 as attempts, 0 as live, 0 as teacher
      from answer_log group by 1, 2
    union all
    select user_id, day, 0, 0, 0, sum(views), 0, 0, 0 from site_visit_days where user_id is not null group by 1, 2
    union all
    select profile_id, (submitted_at at time zone 'America/Bogota')::date, 0, 0, 0, 0, count(*), 0, 0
      from attempts where submitted_at is not null group by 1, 2
    union all
    select profile_id, (joined_at at time zone 'America/Bogota')::date, 0, 0, 0, 0, 0, count(*), 0
      from live_players where profile_id is not null group by 1, 2
    union all
    select created_by, (created_at at time zone 'America/Bogota')::date, 0, 0, 0, 0, 0, 0, count(*) from assignments group by 1, 2
    union all
    select host_id, (created_at at time zone 'America/Bogota')::date, 0, 0, 0, 0, 0, 0, count(*) from live_sessions group by 1, 2
    union all
    select owner_id, (created_at at time zone 'America/Bogota')::date, 0, 0, 0, 0, 0, 0, count(*) from teacher_questions group by 1, 2
  ) x
 where user_id is not null
 group by user_id, day;
revoke all on public.founder_activity from anon, authenticated;

-- Who on the team looked at which person's detail, and when.
create table if not exists public.admin_access_log (
  id       bigint generated always as identity primary key,
  admin_id uuid not null,
  action   text not null check (char_length(action) <= 40),
  target   uuid,
  at       timestamptz not null default now()
);
alter table public.admin_access_log enable row level security;
revoke all on public.admin_access_log from anon, authenticated;

-- Estimated minutes of practice: gaps between consecutive answers of the same person, each capped at 3 minutes; a gap
-- over 15 minutes starts a new sitting, which counts 1 minute.
create or replace view public.founder_minutes with (security_invoker = true) as
select user_id, day, round(sum(sec) / 60.0, 1) as minutes
  from (
    select user_id, (answered_at at time zone 'America/Bogota')::date as day,
           case when gap is null or gap > 900 then 60 else least(gap, 180) end as sec
      from (select user_id, answered_at,
                   extract(epoch from answered_at - lag(answered_at) over (partition by user_id order by answered_at)) as gap
              from answer_log) g
  ) s
 group by user_id, day;
revoke all on public.founder_minutes from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) The dashboard
-- p_from..p_to: Bogotá days (both included; at most 366 days). The same number of days just before is the comparison.
-- Filters (null = all): p_role 'student' | 'teacher' | 'school_admin'; p_channel a channel name; p_school 'none'
-- (independent), 'any' (with a school) or a school id. Visitor numbers only follow p_channel.
create or replace function public.admin_dashboard(p_from date default null, p_to date default null, p_role text default null,
                                                  p_channel text default null, p_school text default null)
returns json
language plpgsql volatile security definer set search_path = public set jit = off as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_to date := least(coalesce(p_to, (now() at time zone 'America/Bogota')::date), (now() at time zone 'America/Bogota')::date);
  v_from date;
  v_len int;
  v_pfrom date;
  v_pto date;
  v_out json;
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then raise exception 'not_admin'; end if;
  v_from := greatest(coalesce(p_from, v_to - 29), v_to - 365);
  if v_from > v_to then v_from := v_to; end if;
  v_len := v_to - v_from + 1;
  v_pto := v_from - 1;
  v_pfrom := v_from - v_len;

  create temp table if not exists _fa (user_id uuid primary key, role text, school_id uuid, school text, channel text, source text,
                                       first_path text, device text, created_day date) on commit drop;
  truncate _fa;
  insert into _fa
  select a.user_id, a.role, a.school_id, a.school, a.channel, a.source, a.first_path, a.device, a.created_day
    from founder_accounts a
   where (p_role is null or a.role = p_role)
     and (p_channel is null or a.channel = p_channel)
     and (p_school is null or (p_school = 'none' and a.school_id is null) or (p_school = 'any' and a.school_id is not null)
          or a.school_id::text = p_school);

  create temp table if not exists _act (user_id uuid, day date, answers int, correct int, graded int, opens int, attempts int,
                                        live int, teacher int) on commit drop;
  truncate _act;
  insert into _act
  select f.user_id, f.day, f.answers, f.correct, f.graded, f.opens, f.attempts, f.live, f.teacher
    from founder_activity f join _fa a on a.user_id = f.user_id
   where f.day >= a.created_day;
  create index if not exists _act_ud on _act (user_id, day);
  create index if not exists _act_d on _act (day);
  analyze _act;

  create temp table if not exists _min (user_id uuid, day date, minutes numeric) on commit drop;
  truncate _min;
  insert into _min select m.user_id, m.day, m.minutes from founder_minutes m join _fa a using (user_id);

  create temp table if not exists _vis (visitor_id uuid primary key, first_day date, channel text, source text, first_path text,
                                        device text, answered_sample boolean, opened_app boolean, user_id uuid) on commit drop;
  create temp table if not exists _vd (visitor_id uuid, day date, views int, paths text[]) on commit drop;
  create temp table if not exists _ans (user_id uuid primary key, n int) on commit drop;
  create temp table if not exists _al (user_id uuid, exam_slug text, area text, mode text, assigned boolean, correct boolean,
                                       at timestamp) on commit drop;
  truncate _vis;
  insert into _vis
  select * from (
    select v.visitor_id, (v.first_seen at time zone 'America/Bogota')::date, source_channel(v.source) as channel, v.source, v.first_path,
           v.device, v.answered_sample, v.opened_app, v.user_id
      from site_visitors v) vv
   where p_channel is null or vv.channel = p_channel;
  analyze _vis;
  truncate _vd;
  insert into _vd select d.visitor_id, d.day, d.views, d.paths from site_visit_days d join _vis using (visitor_id)
   where d.day between v_pfrom and v_to;
  create index if not exists _vd_d on _vd (day);
  analyze _vd;
  truncate _ans;
  insert into _ans select user_id, count(*) from answer_log group by 1;
  truncate _al;
  insert into _al
  select l.user_id, l.exam_slug, l.area, l.mode, l.assignment_id is not null, l.correct, l.answered_at at time zone 'America/Bogota'
    from answer_log l join _fa a using (user_id)
   where l.answered_at >= (v_from::timestamp at time zone 'America/Bogota')
     and l.answered_at < ((v_to + 1)::timestamp at time zone 'America/Bogota');

  select json_build_object(
    'from', v_from, 'to', v_to, 'prev_from', v_pfrom, 'prev_to', v_pto, 'today', v_today,
    'kpis', (
      select json_object_agg(per, k) from (
        select per, json_build_object(
          'visitors', (select count(distinct d.visitor_id) from _vd d join _vis v using (visitor_id) where d.day between f and t),
          'new_visitors', (select count(*) from _vis where first_day between f and t),
          'returning_visitors', (select count(distinct d.visitor_id) from _vd d join _vis v using (visitor_id)
                                  where d.day between f and t and v.first_day < d.day),
          'page_views', (select coalesce(sum(d.views), 0) from _vd d join _vis v using (visitor_id) where d.day between f and t),
          'signups', (select count(*) from _fa where created_day between f and t),
          'signups_students', (select count(*) from _fa where created_day between f and t and role = 'student'),
          'signups_teachers', (select count(*) from _fa where created_day between f and t and role <> 'student'),
          'activated', (select count(*) from _fa a where a.created_day between f and t
                          and (select coalesce(sum(answers), 0) from _act x where x.user_id = a.user_id and x.day <= a.created_day + 6) >= 5),
          'active', (select count(distinct user_id) from _act where day between f and t),
          'practicing', (select count(distinct user_id) from _act where day between f and t and answers > 0),
          'answers', (select coalesce(sum(answers), 0) from _act where day between f and t),
          'accuracy', (select case when sum(graded) > 0 then round(100.0 * sum(correct) / sum(graded)) end from _act where day between f and t),
          'attempts', (select coalesce(sum(attempts), 0) from _act where day between f and t),
          'teacher_actions', (select coalesce(sum(teacher), 0) from _act where day between f and t),
          'minutes', (select coalesce(round(sum(minutes)), 0) from _min where day between f and t),
          'returned', (select count(*) from _fa a where a.created_day between f and t
                         and exists (select 1 from _act x where x.user_id = a.user_id and x.day > a.created_day))
        ) as k
          from (values ('current', v_from, v_to), ('previous', v_pfrom, v_pto)) p(per, f, t)
      ) z
    ),
    -- Active accounts on the last day, its last 7 and its last 30 (DAU / WAU / MAU).
    'reach', json_build_object(
      'dau', (select count(distinct user_id) from _act where day = v_to),
      'wau', (select count(distinct user_id) from _act where day between v_to - 6 and v_to),
      'mau', (select count(distinct user_id) from _act where day between v_to - 29 and v_to),
      'accounts', (select count(*) from _fa where created_day <= v_to),
      'students', (select count(*) from _fa where created_day <= v_to and role = 'student'),
      'teachers', (select count(*) from _fa where created_day <= v_to and role <> 'student'),
      'visitors_all', (select count(*) from _vis),
      'answers_all', (select coalesce(sum(l.n), 0) from _ans l join _fa using (user_id))
    ),
    'daily', (
      select json_agg(json_build_object(
        'day', d,
        'visitors', (select count(distinct x.visitor_id) from _vd x where x.day = d),
        'new_visitors', (select count(*) from _vis where first_day = d),
        'signups', (select count(*) from _fa where created_day = d),
        'active', (select count(distinct user_id) from _act where day = d),
        'wau', (select count(distinct user_id) from _act where day between d - 6 and d),
        'answers', (select coalesce(sum(answers), 0) from _act where day = d),
        'attempts', (select coalesce(sum(attempts), 0) from _act where day = d),
        'minutes', (select coalesce(round(sum(minutes)), 0) from _min where day = d)
      ) order by d)
        from (select generate_series(v_from, v_to, interval '1 day')::date as d) g
    ),
    -- Browsers first seen in the period, step by step to a second day.
    'funnel', (
      select json_build_object(
        'visitors', count(*),
        'sample', count(*) filter (where v.answered_sample),
        'opened_app', count(*) filter (where v.opened_app),
        'signed_in', count(*) filter (where v.user_id is not null),
        'answered', count(*) filter (where exists (select 1 from _ans l where l.user_id = v.user_id)),
        'answered5', count(*) filter (where exists (select 1 from _ans l where l.user_id = v.user_id and l.n >= 5)),
        'came_back', count(*) filter (where exists (select 1 from _ans l where l.user_id = v.user_id) and exists (
                       select 1 from _act x join _fa a on a.user_id = x.user_id where x.user_id = v.user_id and x.day > a.created_day))
      )
        from _vis v where v.first_day between v_from and v_to
    ),
    'channels', coalesce((
      select json_agg(c order by c.visitors desc, c.signups desc) from (
        select ch as channel,
               (select count(*) from _vis where channel = ch and first_day between v_from and v_to) as visitors,
               (select count(*) from _vis where channel = ch and first_day between v_from and v_to and opened_app) as opened_app,
               (select count(*) from _fa where channel = ch and created_day between v_from and v_to) as signups,
               (select count(*) from _fa a where a.channel = ch and a.created_day between v_from and v_to
                  and exists (select 1 from _act x where x.user_id = a.user_id and x.answers > 0)) as practiced,
               (select count(*) from _fa a where a.channel = ch and a.created_day between v_from and v_to
                  and exists (select 1 from _act x where x.user_id = a.user_id and x.day > a.created_day)) as returned,
               (select count(*) from _fa where channel = ch and created_day between v_pfrom and v_pto) as prev_signups,
               (select count(*) from _vis where channel = ch and first_day between v_pfrom and v_pto) as prev_visitors
          from (select distinct channel as ch from _vis where first_day between v_pfrom and v_to
                union select distinct channel from _fa where created_day between v_pfrom and v_to) chs
      ) c where c.visitors + c.signups + c.prev_visitors + c.prev_signups > 0), '[]'::json),
    'sources', coalesce((
      select json_agg(s order by s.visitors desc) from (
        select coalesce(v.source, '(directo)') as source, v.channel, count(*) as visitors,
               count(*) filter (where v.user_id is not null) as accounts,
               count(*) filter (where exists (select 1 from _ans l where l.user_id = v.user_id)) as practiced
          from _vis v where v.first_day between v_from and v_to group by 1, 2 order by 3 desc limit 40) s), '[]'::json),
    -- Where browsers land first (entry pages) and which pages are opened most.
    'landing', coalesce((
      select json_agg(s order by s.visitors desc) from (
        select coalesce(v.first_path, '(desconocida)') as path, count(*) as visitors,
               count(*) filter (where v.opened_app) as opened_app,
               count(*) filter (where v.user_id is not null) as accounts
          from _vis v where v.first_day between v_from and v_to group by 1 order by 2 desc limit 40) s), '[]'::json),
    'pages', coalesce((
      select json_agg(s order by s.visitors desc) from (
        select pth as path, count(distinct d.visitor_id) as visitors, count(*) as visitor_days
          from _vd d join _vis v using (visitor_id), unnest(d.paths) pth
         where d.day between v_from and v_to group by 1 order by 2 desc limit 60) s), '[]'::json),
    'devices', coalesce((
      select json_agg(s order by s.visitors desc) from (
        select coalesce(v.device, 'sin dato') as device, count(*) as visitors, count(*) filter (where v.user_id is not null) as accounts
          from _vis v where v.first_day between v_from and v_to group by 1) s), '[]'::json),
    'areas', coalesce((
      select json_agg(s order by s.answers desc) from (
        select coalesce(l.area, 'Sin área') as area, count(*) as answers, count(distinct l.user_id) as people,
               case when count(*) filter (where l.correct is not null) > 0
                    then round(100.0 * count(*) filter (where l.correct) / count(*) filter (where l.correct is not null)) end as accuracy
          from _al l group by 1) s), '[]'::json),
    'modes', coalesce((
      select json_agg(s order by s.answers desc) from (
        select case when l.assigned then 'Actividad del docente' when l.mode = 'timed' then 'Simulacro con tiempo'
                    else 'Práctica libre' end as mode,
               count(*) as answers, count(distinct l.user_id) as people
          from _al l group by 1) s), '[]'::json),
    'exams', coalesce((
      select json_agg(s order by s.answers desc) from (
        select l.exam_slug as exam, count(*) as answers, count(distinct l.user_id) as people
          from _al l group by 1 order by 2 desc limit 15) s), '[]'::json),
    -- When people practice (Bogotá): weekday 1 = Monday … 7 = Sunday, hour 0-23.
    'hours', coalesce((
      select json_agg(s) from (
        select extract(isodow from l.at)::int as dow, extract(hour from l.at)::int as hour, count(*) as answers
          from _al l group by 1, 2) s), '[]'::json),
    -- Accounts by signup week (Monday) for the last 12 weeks: how many did something in week 0, 1, 2…
    'cohorts', coalesce((
      select json_agg(c order by c.week) from (
        select w.week, count(a.user_id) as size,
               array(select (select count(distinct x.user_id) from _act x join _fa b on b.user_id = x.user_id
                              where date_trunc('week', b.created_day)::date = w.week
                                and x.day between w.week + 7 * n and w.week + 7 * n + 6)
                       from generate_series(0, ((date_trunc('week', v_today)::date - w.week) / 7)) n) as active
          from (select generate_series(date_trunc('week', v_today)::date - 77, date_trunc('week', v_today)::date, interval '7 days')::date as week) w
          left join _fa a on date_trunc('week', a.created_day)::date = w.week
         group by w.week) c), '[]'::json),
    -- Accounts by where they are now (as of today).
    'lifecycle', (
      select json_build_object(
        'nuevo', count(*) filter (where s = 'nuevo'), 'activo', count(*) filter (where s = 'activo'),
        'en_riesgo', count(*) filter (where s = 'en_riesgo'), 'dormido', count(*) filter (where s = 'dormido'),
        'nunca', count(*) filter (where s = 'nunca'))
        from (
          select case
                   when a.created_day > v_today - 7 then 'nuevo'
                   when coalesce(x.work, 0) = 0 then 'nunca'
                   when x.last_day > v_today - 7 then 'activo'
                   when x.last_day > v_today - 21 then 'en_riesgo'
                   else 'dormido' end as s
            from _fa a
            left join (select user_id, max(day) as last_day, sum(answers + attempts + live + teacher) as work
                         from _act group by 1) x on x.user_id = a.user_id
        ) ss
    ),
    'schools', coalesce((
      select json_agg(s order by s.active_7d desc, s.accounts desc) from (
        select coalesce(a.school, 'Independientes (sin colegio)') as school, a.school_id,
               count(*) as accounts,
               count(*) filter (where a.role = 'student') as students,
               count(*) filter (where a.role <> 'student') as staff,
               count(*) filter (where a.created_day between v_from and v_to) as new_accounts,
               count(*) filter (where exists (select 1 from _act x where x.user_id = a.user_id and x.day > v_today - 7)) as active_7d,
               (select coalesce(sum(x.answers), 0) from _act x join _fa b on b.user_id = x.user_id
                 where b.school_id is not distinct from a.school_id and x.day between v_from and v_to) as answers,
               (select coalesce(sum(x.teacher), 0) from _act x join _fa b on b.user_id = x.user_id
                 where b.school_id is not distinct from a.school_id and x.day between v_from and v_to) as teacher_actions,
               min(a.created_day) as since
          from _fa a group by a.school, a.school_id) s), '[]'::json),
    'leads', json_build_object(
      'schools', (select count(*) from public_feedback where kind = 'school' and (created_at at time zone 'America/Bogota')::date between v_from and v_to),
      'waitlist', (select count(*) from launch_waitlist where (created_at at time zone 'America/Bogota')::date between v_from and v_to),
      'feedback', (select count(*) from public_feedback where kind <> 'school' and (created_at at time zone 'America/Bogota')::date between v_from and v_to),
      'recent', coalesce((
        select json_agg(r order by r.at desc) from (
          select 'colegio' as kind, left(message, 300) as text, contact, created_at as at from public_feedback where kind = 'school'
          union all
          select 'lista', null, email, created_at from launch_waitlist
          order by 4 desc limit 15) r), '[]'::json)
    )
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.admin_dashboard(date, date, text, text, text) from public, anon;
grant execute on function public.admin_dashboard(date, date, text, text, text) to authenticated;

-- Every account with its numbers (the «Personas» table; the page filters and sorts it).
create or replace function public.admin_people()
returns json
language plpgsql stable security definer set search_path = public set jit = off as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then raise exception 'not_admin'; end if;
  return coalesce((
    select json_agg(r order by r.last_day desc nulls last, r.created_at desc) from (
      select a.user_id as id, a.name, a.email, a.role, a.school_id, a.school, a.created_at, a.channel, a.source, a.first_path, a.device,
             x.last_day, coalesce(x.active_days, 0) as active_days, coalesce(x.active_7, 0) as active_7,
             coalesce(x.answers, 0) as answers, coalesce(x.answers_7, 0) as answers_7, coalesce(x.answers_30, 0) as answers_30,
             case when x.graded > 0 then round(100.0 * x.correct / x.graded) end as accuracy,
             coalesce(x.attempts, 0) as attempts, coalesce(x.live, 0) as live, coalesce(x.teacher, 0) as teacher_actions,
             coalesce(m.minutes, 0) as minutes, coalesce(st.streak, 0) as streak,
             (select count(*) from course_members cm where cm.profile_id = a.user_id) as classes,
             case when a.role <> 'student' then (
               select count(distinct cm2.profile_id) from courses c join course_members cm2 on cm2.course_id = c.id and cm2.role = 'student'
                where c.created_by = a.user_id or c.id in (select course_id from course_members t where t.profile_id = a.user_id and t.role = 'teacher'))
             end as reach,
             case
               when a.created_day > v_today - 7 then 'nuevo'
               when coalesce(x.answers, 0) + coalesce(x.attempts, 0) + coalesce(x.live, 0) + coalesce(x.teacher, 0) = 0 then 'nunca'
               when x.last_day > v_today - 7 then 'activo'
               when x.last_day > v_today - 21 then 'en_riesgo'
               else 'dormido' end as status
        from founder_accounts a
        left join (
          select user_id, max(day) as last_day, count(*) as active_days, count(*) filter (where day > v_today - 7) as active_7,
                 sum(answers) as answers, sum(answers) filter (where day > v_today - 7) as answers_7,
                 sum(answers) filter (where day > v_today - 30) as answers_30,
                 sum(correct) as correct, sum(graded) as graded, sum(attempts) as attempts, sum(live) as live, sum(teacher) as teacher
            from founder_activity group by 1) x on x.user_id = a.user_id
        left join (select user_id, round(sum(minutes)) as minutes from founder_minutes group by 1) m on m.user_id = a.user_id
        left join (
          -- Days in a row with answers, ending today or yesterday.
          select d.user_id, count(*) as streak
            from (select user_id, day, day - (row_number() over (partition by user_id order by day))::int as grp
                    from founder_activity where answers > 0) d
            join (select user_id, max(day) as last, count(*)::int as n from founder_activity where answers > 0 group by 1) l
              on l.user_id = d.user_id
           where l.last >= v_today - 1 and d.grp = l.last - l.n
           group by d.user_id) st on st.user_id = a.user_id
       limit 20000) r), '[]'::json);
end $$;
revoke all on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated;

-- One person in detail. Logged in admin_access_log.
create or replace function public.admin_person(p_user uuid)
returns json
language plpgsql volatile security definer set search_path = public set jit = off as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_role text;
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then raise exception 'not_admin'; end if;
  select role into v_role from profiles where id = p_user;
  if v_role is null then raise exception 'not_found'; end if;
  insert into admin_access_log (admin_id, action, target) values (auth.uid(), 'person', p_user);
  return json_build_object(
    'profile', (select row_to_json(a) from founder_accounts a where a.user_id = p_user),
    'visits', coalesce((
      select json_agg(v order by v.first_seen) from (
        select visitor_id, first_seen, last_seen, days, first_path, source, source_channel(source) as channel, device,
               answered_sample, opened_app, signed_in_at
          from site_visitors where user_id = p_user) v), '[]'::json),
    'pages', coalesce((
      select json_agg(p order by p.day desc) from (
        select d.day, sum(d.views) as views,
               (select array_agg(distinct pp) from site_visit_days d2, unnest(d2.paths) pp where d2.user_id = p_user and d2.day = d.day) as paths
          from site_visit_days d where d.user_id = p_user group by d.day order by d.day desc limit 60) p), '[]'::json),
    'days', coalesce((
      select json_agg(d order by d.day) from (
        select f.day, f.answers, f.correct, f.graded, f.opens, f.attempts, f.live, f.teacher, coalesce(m.minutes, 0) as minutes
          from founder_activity f left join founder_minutes m on m.user_id = f.user_id and m.day = f.day
         where f.user_id = p_user and f.day > v_today - 180) d), '[]'::json),
    'areas', coalesce((
      select json_agg(s order by s.answers desc) from (
        select coalesce(area, 'Sin área') as area, count(*) as answers,
               case when count(*) filter (where correct is not null) > 0
                    then round(100.0 * count(*) filter (where correct) / count(*) filter (where correct is not null)) end as accuracy,
               case when count(*) filter (where correct is not null and answered_at > now() - interval '30 days') > 0
                    then round(100.0 * count(*) filter (where correct and answered_at > now() - interval '30 days')
                               / count(*) filter (where correct is not null and answered_at > now() - interval '30 days')) end as accuracy_30,
               case when count(*) filter (where correct is not null and answered_at <= now() - interval '30 days') > 0
                    then round(100.0 * count(*) filter (where correct and answered_at <= now() - interval '30 days')
                               / count(*) filter (where correct is not null and answered_at <= now() - interval '30 days')) end as accuracy_before
          from answer_log where user_id = p_user group by 1) s), '[]'::json),
    'weeks', coalesce((
      select json_agg(w order by w.week) from (
        select date_trunc('week', answered_at at time zone 'America/Bogota')::date as week, count(*) as answers,
               case when count(*) filter (where correct is not null) > 0
                    then round(100.0 * count(*) filter (where correct) / count(*) filter (where correct is not null)) end as accuracy
          from answer_log where user_id = p_user group by 1) w), '[]'::json),
    'attempts', coalesce((
      select json_agg(t order by t.started_at desc) from (
        select at.exam_slug, at.mode, at.scope, at.started_at, at.submitted_at, at.duration_sec, at.score, at.device,
               (at.receipt is not null) as verified, asg.title as assignment, asg.kind as assignment_kind
          from attempts at left join assignments asg on asg.id = at.assignment_id
         where at.profile_id = p_user order by at.started_at desc limit 60) t), '[]'::json),
    'answers', coalesce((
      select json_agg(l order by l.answered_at desc) from (
        select exam_slug, qkey, area, mode, answer, correct, answered_at, (assignment_id is not null) as assigned
          from answer_log where user_id = p_user order by answered_at desc limit 200) l), '[]'::json),
    'classes', coalesce((
      select json_agg(c) from (
        select c.id, c.name, c.subject, c.grade, cm.role, t.full_name as teacher,
               (select count(*) from course_members s where s.course_id = c.id and s.role = 'student') as students
          from course_members cm join courses c on c.id = cm.course_id left join profiles t on t.id = c.created_by
         where cm.profile_id = p_user
        union
        select c.id, c.name, c.subject, c.grade, 'teacher', null,
               (select count(*) from course_members s where s.course_id = c.id and s.role = 'student')
          from courses c where c.created_by = p_user) c), '[]'::json),
    'teaching', case when v_role <> 'student' then json_build_object(
      'assignments', coalesce((
        select json_agg(x order by x.created_at desc) from (
          select a.title, a.kind, a.exam_slug, a.created_at, a.status, a.delivery, c.name as course,
                 (select count(*) from attempts t where t.assignment_id = a.id and t.submitted_at is not null) as delivered
            from assignments a join courses c on c.id = a.course_id where a.created_by = p_user order by a.created_at desc limit 40) x), '[]'::json),
      'live', coalesce((
        select json_agg(x order by x.created_at desc) from (
          select l.title, l.exam_slug, l.created_at, l.state, cardinality(l.question_keys) as questions,
                 (select count(*) from live_players p where p.session_id = l.id) as players
            from live_sessions l where l.host_id = p_user order by l.created_at desc limit 30) x), '[]'::json),
      'questions', (select count(*) from teacher_questions where owner_id = p_user)
    ) end,
    'consents', coalesce((select json_agg(c) from (select kind, version, granted_at from consents where profile_id = p_user) c), '[]'::json),
    'trial', (select row_to_json(t) from (select code, redeemed_at from trial_redemptions where profile_id = p_user) t),
    'quota', coalesce((select json_agg(q order by q.day desc) from (select day, questions from practice_usage where user_id = p_user order by day desc limit 30) q), '[]'::json),
    'downloads', coalesce((select json_agg(d order by d.day desc) from (select day, slug, files from exam_downloads where user_id = p_user order by day desc limit 40) d), '[]'::json)
  );
end $$;
revoke all on function public.admin_person(uuid) from public, anon;
grant execute on function public.admin_person(uuid) to authenticated;

-- The owner's account must already be in app_admins (0037). If it is not:
-- insert into public.app_admins (user_id) select id from auth.users where email = 'TU_CORREO@gmail.com' on conflict do nothing;
