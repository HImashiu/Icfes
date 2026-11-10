-- 0036 · Protección del banco de preguntas: nadie (un colegio, un docente de prueba o una cuenta de estudiante)
-- puede sacar el banco entero.
--
--  1. Cupos de cuadernillos según quién abre (antes: 12 por cuenta y día para todos):
--       estudiante      6 por día, 14 distintos en 7 días (cuenta de menos de 24 h: 3 por día)
--       docente         12 por día, 26 distintos en 7 días
--       docente de un colegio en prueba (código CND-…): 8 por día, y el COLEGIO entero (todos sus docentes juntos)
--       puede abrir como máximo 14 cuadernillos distintos durante la prueba. Así 15 docentes de prueba no suman el banco.
--     Volver a abrir un cuadernillo ya abierto no gasta cupo. Los números están en app_limits y se cambian sin deploy.
--  2. Bloqueo manual: una cuenta en bank_blocks, o un colegio con nivel 'blocked' en bank_school_access, no recibe
--     ningún archivo de preguntas. Un colegio que ya paga pasa a nivel 'full' y deja de tener el tope de prueba.
--  3. Exportaciones e impresiones registradas: bank_export() da a cada impresión una referencia corta (p. ej. 7F3A2C)
--     que sale en el pie de cada página junto al nombre del colegio y la fecha. Si aparece un PDF filtrado, la
--     referencia dice quién lo imprimió. Límite: 20 exportaciones y 600 preguntas por cuenta al día; un colegio en
--     prueba, 12 exportaciones al día entre todos.
--  4. Vista bank_watch (solo en el panel de Supabase): quién abre más, cuántas veces chocó con un límite, cuánto
--     imprimió. Las cuentas que chocan seguido con el límite son las que vale la pena mirar.
--
-- Cómo se usa (SQL editor de Supabase):
--   select * from bank_watch;                                                  -- quién está sacando más
--   insert into bank_blocks (user_id, reason) values ('<uuid>', 'descarga masiva');  -- bloquear una cuenta
--   delete from bank_blocks where user_id = '<uuid>';                           -- desbloquear
--   insert into bank_school_access (school_id, level) values ('<uuid>', 'full')
--     on conflict (school_id) do update set level = excluded.level;            -- colegio que paga: sin tope de prueba
--   update app_limits set value = 20 where key = 'trial_school_booklets_total'; -- cambiar un número
--   select * from bank_exports where ref = '7F3A2C';                            -- de quién es un PDF filtrado
--
-- Corre después de 0035 (necesita exam_downloads y app_limits de 0031, trial_codes de 0034). Se puede correr varias veces.

-- 1 · Límites --------------------------------------------------------------------------------------------------------
insert into public.app_limits (key, value) values
  ('student_booklets_per_day', 6),
  ('student_booklets_per_week', 14),
  ('new_account_booklets_per_day', 3),
  ('staff_booklets_per_day', 12),
  ('staff_booklets_per_week', 26),
  ('trial_staff_booklets_per_day', 8),
  ('trial_school_booklets_total', 14),
  ('exports_per_day', 20),
  ('export_questions_per_day', 600),
  ('trial_school_exports_per_day', 12)
on conflict (key) do nothing;

create index if not exists exam_downloads_day on public.exam_downloads (day);

-- 2 · Bloqueos y nivel de acceso por colegio ------------------------------------------------------------------------
create table if not exists public.bank_blocks (
  user_id    uuid primary key,
  reason     text,
  created_at timestamptz not null default now()
);
create table if not exists public.bank_school_access (
  school_id  uuid primary key references public.schools (id) on delete cascade,
  level      text not null check (level in ('full', 'blocked')),
  note       text,
  updated_at timestamptz not null default now()
);
-- Cada vez que una cuenta choca con un límite (para la vista bank_watch).
create table if not exists public.bank_limit_hits (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  at      timestamptz not null default now(),
  slug    text,
  reason  text not null
);
create index if not exists bank_limit_hits_user on public.bank_limit_hits (user_id, at);

-- Impresiones y exportaciones, con su referencia.
create table if not exists public.bank_exports (
  id        bigint generated always as identity primary key,
  ref       text not null unique,
  user_id   uuid not null,
  school_id uuid,
  day       date not null default (now() at time zone 'America/Bogota')::date,
  kind      text not null check (char_length(kind) <= 40),
  slug      text check (char_length(slug) <= 80),
  questions int not null default 0 check (questions between 0 and 1000),
  at        timestamptz not null default now()
);
create index if not exists bank_exports_user_day on public.bank_exports (user_id, day);
create index if not exists bank_exports_school_day on public.bank_exports (school_id, day);

alter table public.bank_blocks enable row level security;
alter table public.bank_school_access enable row level security;
alter table public.bank_limit_hits enable row level security;
alter table public.bank_exports enable row level security;
-- Sin políticas: nadie las lee ni las escribe por la API; solo las funciones de abajo y el panel.
revoke all on public.bank_blocks, public.bank_school_access, public.bank_limit_hits, public.bank_exports from anon, authenticated;

-- 3 · ¿Quién es esta cuenta? ----------------------------------------------------------------------------------------
-- 'student' | 'staff' | 'trial_staff', el colegio, si el colegio está en prueba y si está bloqueado.
create or replace function public.bank_account(p_uid uuid)
returns table (kind text, school_id uuid, school_name text, trial boolean, blocked boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when p.role in ('teacher', 'school_admin')
         then case when t.trial then 'trial_staff' else 'staff' end
         else 'student' end,
    p.school_id,
    s.name,
    coalesce(t.trial, false),
    exists (select 1 from bank_blocks b where b.user_id = p_uid)
      or coalesce(a.level = 'blocked', false) or coalesce(s.status = 'suspended', false),
    coalesce(p.created_at, now())
  from (select p_uid as id) me
  left join profiles p on p.id = me.id
  left join schools s on s.id = p.school_id
  left join bank_school_access a on a.school_id = p.school_id
  left join lateral (
    select coalesce(a.level, '') <> 'full'
           and exists (select 1 from trial_codes c where c.school_id = p.school_id) as trial
  ) t on true
$$;
revoke all on function public.bank_account(uuid) from public, anon, authenticated;

create or replace function public.bank_hit(p_uid uuid, p_slug text, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  insert into bank_limit_hits (user_id, slug, reason) values (p_uid, left(p_slug, 80), p_reason);
  return p_reason;
end $$;
revoke all on function public.bank_hit(uuid, text, text) from public, anon, authenticated;

-- Booklets an account has a reason to open again and again: its school's activities and lessons (teachers), the
-- activities assigned to it and its own past attempts (students). They don't count toward the daily and weekly
-- limits, so results, the gradebook, the data sheet and the error notebook never hit them. A trial school's total
-- cap still counts them (a booklet must be opened once to build an activity on it, and that first opening counts).
create or replace function public.bank_has_reason(p_uid uuid, p_kind text, p_school uuid, p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_kind in ('staff', 'trial_staff') then
      exists (select 1 from assignments a join courses c on c.id = a.course_id where a.exam_slug = p_slug and c.school_id = p_school)
      or exists (select 1 from lessons l where l.exam_slug = p_slug and l.school_id = p_school)
    else
      exists (select 1 from attempts t where t.profile_id = p_uid and t.exam_slug = p_slug)
      or exists (select 1 from assignments a join course_members m on m.course_id = a.course_id
                  where a.exam_slug = p_slug and m.profile_id = p_uid and a.status <> 'draft'
                    and (a.assignee_id is null or a.assignee_id = p_uid))
    end
$$;
revoke all on function public.bank_has_reason(uuid, text, uuid, text) from public, anon, authenticated;

-- 4 · Abrir un cuadernillo -------------------------------------------------------------------------------------------
-- El worker del sitio la llama con el token del usuario antes de servir /app/exams/<slug>.* y /app/api/reveal.
-- Devuelve 'ok' o el motivo: 'access_blocked', 'day_limit', 'week_limit', 'trial_limit', 'files_limit'.
-- No lanza error al negar, para que el choque quede registrado en bank_limit_hits.
create or replace function public.bank_open(p_slug text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_slug text := left(coalesce(p_slug, ''), 80);
  v_acc record;
  v_seen_today boolean;
  v_seen_week boolean;
  v_today int; v_week int; v_files int; v_school_total int;
  lim_day int; lim_week int;
  lim_files int := coalesce((select value from app_limits where key = 'files_per_day'), 400);
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  if v_slug !~ '^[A-Za-z0-9_-]+$' then raise exception 'bad_slug'; end if;
  select * into v_acc from bank_account(v_uid);
  if v_acc.blocked then return bank_hit(v_uid, v_slug, 'access_blocked'); end if;

  -- Serialize the same account's calls, so two booklets opened at once can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('bank_open:' || v_uid::text));

  select count(*), coalesce(sum(files), 0), bool_or(slug = v_slug) into v_today, v_files, v_seen_today
    from exam_downloads where user_id = v_uid and day = v_day;
  v_seen_today := coalesce(v_seen_today, false);
  if v_files >= lim_files then return bank_hit(v_uid, v_slug, 'files_limit'); end if;

  if not v_seen_today and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, v_slug) then
    if v_acc.kind = 'student' then
      lim_day := coalesce((select value from app_limits where key = 'student_booklets_per_day'), 6);
      if v_acc.created_at > now() - interval '24 hours' then
        lim_day := least(lim_day, coalesce((select value from app_limits where key = 'new_account_booklets_per_day'), 3));
      end if;
      lim_week := coalesce((select value from app_limits where key = 'student_booklets_per_week'), 14);
    elsif v_acc.kind = 'trial_staff' then
      lim_day := coalesce((select value from app_limits where key = 'trial_staff_booklets_per_day'), 8);
      lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    else
      lim_day := coalesce((select value from app_limits where key = 'staff_booklets_per_day'), 12);
      lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    end if;
    -- Only booklets opened without a reason count (activity booklets opened today never use up the day).
    select count(*) into v_today from exam_downloads
     where user_id = v_uid and day = v_day and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
    if v_today >= lim_day then return bank_hit(v_uid, v_slug, 'day_limit'); end if;

    select count(distinct slug), coalesce(bool_or(slug = v_slug), false) into v_week, v_seen_week
      from exam_downloads where user_id = v_uid and day > v_day - 7
       and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
    if not v_seen_week and v_week >= lim_week then return bank_hit(v_uid, v_slug, 'week_limit'); end if;
  end if;

  if not v_seen_today then
    -- A school on trial: all its teachers together open at most N different booklets for the whole trial.
    if v_acc.kind = 'trial_staff' then
      perform pg_advisory_xact_lock(hashtext('bank_school:' || v_acc.school_id::text));
      if not exists (
        select 1 from exam_downloads d join profiles p on p.id = d.user_id
         where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin') and d.slug = v_slug
      ) then
        select count(distinct d.slug) into v_school_total
          from exam_downloads d join profiles p on p.id = d.user_id
         where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin');
        if v_school_total >= coalesce((select value from app_limits where key = 'trial_school_booklets_total'), 14) then
          return bank_hit(v_uid, v_slug, 'trial_limit');
        end if;
      end if;
    end if;
  end if;

  insert into exam_downloads (user_id, day, slug) values (v_uid, v_day, v_slug)
    on conflict (user_id, day, slug) do update set files = exam_downloads.files + 1, last_at = now();
  return 'ok';
end $$;
revoke all on function public.bank_open(text) from public, anon;
grant execute on function public.bank_open(text) to authenticated;

-- What this account has left today (the app shows it before a teacher opens another booklet).
create or replace function public.bank_quota()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_acc record;
  v_today int; v_week int; v_school int := null;
  lim_day int; lim_week int; lim_school int := null;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_acc from bank_account(v_uid);
  select count(*) into v_today from exam_downloads
   where user_id = v_uid and day = v_day and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
  select count(distinct slug) into v_week from exam_downloads
   where user_id = v_uid and day > v_day - 7 and not bank_has_reason(v_uid, v_acc.kind, v_acc.school_id, slug);
  if v_acc.kind = 'student' then
    lim_day := coalesce((select value from app_limits where key = 'student_booklets_per_day'), 6);
    if v_acc.created_at > now() - interval '24 hours' then
      lim_day := least(lim_day, coalesce((select value from app_limits where key = 'new_account_booklets_per_day'), 3));
    end if;
    lim_week := coalesce((select value from app_limits where key = 'student_booklets_per_week'), 14);
  elsif v_acc.kind = 'trial_staff' then
    lim_day := coalesce((select value from app_limits where key = 'trial_staff_booklets_per_day'), 8);
    lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
    lim_school := coalesce((select value from app_limits where key = 'trial_school_booklets_total'), 14);
    select count(distinct d.slug) into v_school
      from exam_downloads d join profiles p on p.id = d.user_id
     where p.school_id = v_acc.school_id and p.role in ('teacher', 'school_admin');
  else
    lim_day := coalesce((select value from app_limits where key = 'staff_booklets_per_day'), 12);
    lim_week := coalesce((select value from app_limits where key = 'staff_booklets_per_week'), 26);
  end if;
  return jsonb_build_object(
    'kind', v_acc.kind, 'blocked', v_acc.blocked,
    'today', v_today, 'day_limit', lim_day, 'week', v_week, 'week_limit', lim_week,
    'school_total', v_school, 'school_limit', lim_school,
    'opened_today', coalesce((select jsonb_agg(slug order by first_at) from exam_downloads where user_id = v_uid and day = v_day), '[]'::jsonb),
    'opened_week', coalesce((select jsonb_agg(distinct slug) from exam_downloads where user_id = v_uid and day > v_day - 7), '[]'::jsonb));
end $$;
revoke all on function public.bank_quota() from public, anon;
grant execute on function public.bank_quota() to authenticated;

-- 5 · Imprimir o exportar ------------------------------------------------------------------------------------------
-- La app la llama antes de mostrar una impresión (cuadernillo, guía, clave, presentación). Devuelve
-- { ok, ref, school, name } o { ok: false, reason }. La misma impresión el mismo día reutiliza su referencia.
create or replace function public.bank_export(p_kind text, p_slug text default null, p_questions int default 0)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_kind text := left(coalesce(nullif(trim(p_kind), ''), 'print'), 40);
  v_slug text := left(p_slug, 80);
  v_n int := greatest(0, least(coalesce(p_questions, 0), 1000));
  v_acc record;
  v_ref text;
  v_name text;
  v_count int; v_questions int; v_school_count int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select * into v_acc from bank_account(v_uid);
  select full_name into v_name from profiles where id = v_uid;
  if v_acc.blocked then
    perform bank_hit(v_uid, v_slug, 'export_blocked');
    return jsonb_build_object('ok', false, 'reason', 'access_blocked');
  end if;
  perform pg_advisory_xact_lock(hashtext('bank_export:' || v_uid::text));
  select ref into v_ref from bank_exports
   where user_id = v_uid and day = v_day and kind = v_kind and slug is not distinct from v_slug and questions = v_n
   limit 1;
  if v_ref is null then
    select count(*), coalesce(sum(questions), 0) into v_count, v_questions from bank_exports where user_id = v_uid and day = v_day;
    if v_count >= coalesce((select value from app_limits where key = 'exports_per_day'), 20)
       or v_questions + v_n > coalesce((select value from app_limits where key = 'export_questions_per_day'), 600) then
      perform bank_hit(v_uid, v_slug, 'export_limit');
      return jsonb_build_object('ok', false, 'reason', 'export_limit');
    end if;
    if v_acc.kind = 'trial_staff' then
      select count(*) into v_school_count from bank_exports where school_id = v_acc.school_id and day = v_day;
      if v_school_count >= coalesce((select value from app_limits where key = 'trial_school_exports_per_day'), 12) then
        perform bank_hit(v_uid, v_slug, 'trial_export_limit');
        return jsonb_build_object('ok', false, 'reason', 'trial_export_limit');
      end if;
    end if;
    loop
      v_ref := upper(encode(gen_random_bytes(3), 'hex'));
      exit when not exists (select 1 from bank_exports where ref = v_ref);
    end loop;
    insert into bank_exports (ref, user_id, school_id, day, kind, slug, questions)
    values (v_ref, v_uid, v_acc.school_id, v_day, v_kind, v_slug, v_n);
  end if;
  return jsonb_build_object('ok', true, 'ref', v_ref, 'school', v_acc.school_name, 'name', v_name, 'trial', v_acc.trial);
end $$;
revoke all on function public.bank_export(text, text, int) from public, anon;
grant execute on function public.bank_export(text, text, int) to authenticated;

-- 6 · Vista para Juan ----------------------------------------------------------------------------------------------
create or replace view public.bank_watch with (security_invoker = true) as
  with dl as (
    select user_id, count(distinct slug) as booklets_7d, sum(files) as files_7d, count(distinct day) as days_active,
           max(last_at) as last_seen
      from public.exam_downloads
     where day > (now() at time zone 'America/Bogota')::date - 7
     group by user_id
  ), hits as (
    select user_id, count(*) as limit_hits_7d, max(at) as last_hit
      from public.bank_limit_hits where at > now() - interval '7 days' group by user_id
  ), ex as (
    select user_id, count(*) as exports_7d, sum(questions) as exported_questions_7d
      from public.bank_exports where at > now() - interval '7 days' group by user_id
  )
  select coalesce(dl.user_id, hits.user_id, ex.user_id) as user_id, u.email, p.role, s.name as school,
         exists (select 1 from public.trial_codes c where c.school_id = p.school_id) as trial_school,
         exists (select 1 from public.bank_blocks b where b.user_id = coalesce(dl.user_id, hits.user_id, ex.user_id)) as blocked,
         coalesce(dl.booklets_7d, 0) as booklets_7d, coalesce(dl.files_7d, 0) as files_7d, dl.days_active,
         coalesce(hits.limit_hits_7d, 0) as limit_hits_7d, coalesce(ex.exports_7d, 0) as exports_7d,
         coalesce(ex.exported_questions_7d, 0) as exported_questions_7d, greatest(dl.last_seen, hits.last_hit) as last_seen
    from dl
    full join hits on hits.user_id = dl.user_id
    full join ex on ex.user_id = coalesce(dl.user_id, hits.user_id)
    left join auth.users u on u.id = coalesce(dl.user_id, hits.user_id, ex.user_id)
    left join public.profiles p on p.id = coalesce(dl.user_id, hits.user_id, ex.user_id)
    left join public.schools s on s.id = p.school_id
   order by limit_hits_7d desc, booklets_7d desc;
revoke all on public.bank_watch from anon, authenticated;

-- Por colegio: cuánto del banco ha abierto cada colegio en total (los de prueba tienen tope).
create or replace view public.bank_watch_schools with (security_invoker = true) as
  select s.id as school_id, s.name,
         exists (select 1 from public.trial_codes c where c.school_id = s.id) as trial_school,
         a.level as access_level,
         count(distinct d.slug) filter (where p.role in ('teacher', 'school_admin')) as staff_booklets_total,
         count(distinct d.slug) as booklets_total,
         count(distinct d.user_id) as accounts,
         max(d.last_at) as last_seen
    from public.schools s
    join public.profiles p on p.school_id = s.id
    join public.exam_downloads d on d.user_id = p.id
    left join public.bank_school_access a on a.school_id = s.id
   group by s.id, s.name, a.level
   order by staff_booklets_total desc;
revoke all on public.bank_watch_schools from anon, authenticated;

notify pgrst, 'reload schema';
