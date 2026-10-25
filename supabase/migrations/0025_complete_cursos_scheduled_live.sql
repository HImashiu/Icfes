-- 0025 · Every curso has its five subjects, and live games can be scheduled.
--
-- 1. Cursos. A curso (11 A) is a group of students; each ICFES area is one class of it (Matemáticas 11 A). Classes made
--    before cursos existed often had no grade or group ("11-A", "Matemáticas 11 A" with both empty), and some cursos had
--    only one or two subjects. This migration:
--      · reads the grade and group from the class name when they are missing ("Curso Preparación Saber 11 C" → 11, C);
--      · gives every curso its five subject classes (Lectura crítica, Matemáticas, Sociales y ciudadanas, Ciencias
--        naturales, Inglés), created without a teacher for coordination to assign;
--      · puts every student of a curso in all five of its subject classes;
--      · keeps it that way: a new class of a curso brings the missing subjects with it, and a student added to one
--        class of a curso joins all of its subject classes.
--    Classes without a subject ("11-A", a "Todas las áreas" prep class) stay as they are, with their tasks and results.
--
-- 2. Live games with a date and time (live_sessions.scheduled_at). The teacher starts a game now, or programs it; the
--    students of its class see it coming on Inicio and can join from that moment. Opening the room early opens it now.
--
-- Needs 0001-0024 (0012 subject/group_label, 0020 school_groups and course_area(), 0004 live_sessions).
-- Re-runnable. After running it: notify pgrst, 'reload schema';

-- ================================================================ 1. cursos with their five subjects

-- "Matemáticas 11 A" → {11, A}. Mirrors gradeGroupFromName() in app/src/lib/teaching.js.
create or replace function public.name_grade_group(p_name text) returns text[]
language sql immutable as $$
  select case when m is not null and m[1]::int between 1 and 13 then array[(m[1]::int)::text, upper(m[2])] end
  from (select regexp_match(btrim(coalesce(p_name, '')), '(?:^|[^0-9])([0-9]{1,2})\s*[-°º]?\s*([A-Za-z]|[0-9]{2})$') as m) x
$$;

-- The subject a class name starts with, for classes saved before subjects existed ("Matemáticas 11 A").
create or replace function public.name_subject(p_name text) returns text
language sql immutable as $$
  select case
    when n like 'lectura crítica%' or n like 'lectura critica%' then 'Lectura crítica'
    when n like 'matemáticas%' or n like 'matematicas%' then 'Matemáticas'
    when n like 'sociales%' then 'Sociales y ciudadanas'
    when n like 'ciencias naturales%' or n like 'naturales%' then 'Ciencias naturales'
    when n like 'física%' then 'Física' when n like 'química%' then 'Química' when n like 'biología%' then 'Biología'
    when n like 'español%' then 'Español'
    when n like 'inglés%' or n like 'ingles%' then 'Inglés'
  end from (select lower(btrim(coalesce(p_name, ''))) as n) x
$$;

-- One curso: its record, its five subject classes and every student in each of them. Returns the classes it created.
-- New classes belong to coordination (or, in a school without one, to whoever made the curso's other classes) and
-- have no teacher until coordination assigns one in Colegio › Cursos y materias.
create or replace function public.complete_curso_rows(p_school uuid, p_grade text, p_label text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_area text;
  v_owner uuid;
  v_year int;
  v_id uuid;
  v_made int := 0;
  v_areas text[] := array['Lectura crítica', 'Matemáticas', 'Sociales y ciudadanas', 'Ciencias naturales', 'Inglés'];
begin
  if p_school is null or coalesce(p_grade, '') !~ '^[0-9]{1,2}$' or coalesce(btrim(p_label), '') = '' or char_length(btrim(p_label)) > 8 then
    return 0;
  end if;
  p_label := upper(btrim(p_label));
  insert into school_groups (school_id, grade, label, created_by)
  values (p_school, p_grade, p_label, null)
  on conflict (school_id, grade, label) do nothing;

  select id into v_owner from profiles where school_id = p_school and role = 'school_admin' order by created_at limit 1;
  if v_owner is null then
    select created_by into v_owner from courses
     where school_id = p_school and grade = p_grade and upper(coalesce(group_label, '')) = p_label order by created_at limit 1;
  end if;
  if v_owner is null then
    select created_by into v_owner from school_groups where school_id = p_school and grade = p_grade and label = p_label;
  end if;
  select coalesce(max(year), extract(year from now())::int) into v_year from courses
   where school_id = p_school and grade = p_grade and upper(coalesce(group_label, '')) = p_label;

  if v_owner is not null then
    foreach v_area in array v_areas loop
      if not exists (select 1 from courses where school_id = p_school and grade = p_grade and upper(coalesce(group_label, '')) = p_label
                     and public.course_area(subject, name) = v_area) then
        insert into courses (school_id, name, grade, year, created_by, subject, group_label)
        values (p_school, v_area || ' ' || p_grade || ' ' || p_label, p_grade, coalesce(v_year, extract(year from now())::int), v_owner, v_area, p_label)
        returning id into v_id;
        -- The creator trigger (0001) made the owner this class's teacher: the class waits for its real teacher.
        delete from course_members where course_id = v_id and role = 'teacher' and profile_id = v_owner;
        v_made := v_made + 1;
      end if;
    end loop;
  end if;

  -- Every student of any class of the curso, in every subject class of it.
  insert into course_members (course_id, profile_id, email, full_name, role)
  select c.id, s.profile_id, s.email, s.full_name, 'student'
    from courses c
    cross join lateral (
      select distinct on (lower(m.email)) m.profile_id, lower(m.email) as email, m.full_name
        from course_members m join courses k on k.id = m.course_id
       where m.role = 'student' and k.school_id = p_school and k.grade = p_grade and upper(coalesce(k.group_label, '')) = p_label
       order by lower(m.email), (m.profile_id is null), m.created_at
    ) s
   where c.school_id = p_school and c.grade = p_grade and upper(coalesce(c.group_label, '')) = p_label
     and public.course_area(c.subject, c.name) is not null
     and not exists (select 1 from course_members x where x.course_id = c.id and lower(x.email) = s.email)
  on conflict (course_id, email) do nothing;

  return v_made;
end $$;
revoke all on function public.complete_curso_rows(uuid, text, text) from public, anon, authenticated;

-- For the app: coordination (or a teacher of the curso) completes one curso. Returns how many classes it created.
create or replace function public.complete_curso(p_grade text, p_label text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'school_admin' and not exists (
    select 1 from courses c where c.school_id = public.my_school() and c.grade = p_grade
      and upper(coalesce(c.group_label, '')) = upper(btrim(p_label)) and public.is_course_teacher(c.id)) then
    raise exception 'not_allowed';
  end if;
  return public.complete_curso_rows(public.my_school(), p_grade, p_label);
end $$;
revoke all on function public.complete_curso(text, text) from public, anon;
grant execute on function public.complete_curso(text, text) to authenticated;

-- A class saved without grade or group gets them from its name; without a subject, from its name too.
create or replace function public.course_fill_group() returns trigger
language plpgsql as $$
declare v_gg text[];
begin
  if new.group_label is null or btrim(new.group_label) = '' then
    v_gg := public.name_grade_group(new.name);
    if v_gg is not null and (new.grade is null or new.grade = v_gg[1]) then
      new.grade := v_gg[1];
      new.group_label := v_gg[2];
    end if;
  end if;
  if new.subject is null then new.subject := public.name_subject(new.name); end if;
  if new.group_label is not null then new.group_label := upper(btrim(new.group_label)); end if;
  return new;
end $$;
drop trigger if exists courses_fill_group on public.courses;
create trigger courses_fill_group before insert on public.courses
  for each row execute function public.course_fill_group();

-- A new class of a curso brings the curso's missing subjects (and its students) with it.
create or replace function public.course_complete_curso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.grade is not null and coalesce(btrim(new.group_label), '') <> '' then
    perform public.complete_curso_rows(new.school_id, new.grade, new.group_label);
  end if;
  return new;
end $$;
drop trigger if exists courses_zz_complete_curso on public.courses;
create trigger courses_zz_complete_curso after insert on public.courses
  for each row execute function public.course_complete_curso();

-- A student added to one class of a curso joins every subject class of it.
create or replace function public.member_join_curso() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_course courses;
begin
  if pg_trigger_depth() > 1 or new.role <> 'student' then return new; end if;
  select * into v_course from courses where id = new.course_id;
  if v_course.grade is null or coalesce(btrim(v_course.group_label), '') = '' then return new; end if;
  insert into course_members (course_id, profile_id, email, full_name, role)
  select c.id, new.profile_id, new.email, new.full_name, 'student'
    from courses c
   where c.school_id = v_course.school_id and c.grade = v_course.grade
     and upper(coalesce(c.group_label, '')) = upper(v_course.group_label)
     and c.id <> v_course.id and public.course_area(c.subject, c.name) is not null
     and not exists (select 1 from course_members x where x.course_id = c.id and lower(x.email) = lower(new.email))
  on conflict (course_id, email) do nothing;
  return new;
end $$;
drop trigger if exists course_members_join_curso on public.course_members;
create trigger course_members_join_curso after insert on public.course_members
  for each row execute function public.member_join_curso();

-- Existing data, once (and harmlessly again on a re-run).
-- a) Grade, group and subject from the name where they are missing.
update public.courses c set grade = g[1], group_label = g[2]
  from (select id, public.name_grade_group(name) as g from public.courses
         where (group_label is null or btrim(group_label) = '')) x
 where c.id = x.id and x.g is not null and (c.grade is null or c.grade = x.g[1]);
update public.courses set subject = public.name_subject(name) where subject is null and public.name_subject(name) is not null;
update public.courses set group_label = upper(btrim(group_label)) where group_label is not null and group_label <> upper(btrim(group_label));
-- b) Every curso, from its classes or from its record, gets its five subjects and its students in all of them.
do $$
declare r record;
begin
  for r in
    select school_id, grade, upper(btrim(group_label)) as label from public.courses
     where grade ~ '^[0-9]{1,2}$' and coalesce(btrim(group_label), '') <> ''
    union
    select school_id, grade, label from public.school_groups
  loop
    perform public.complete_curso_rows(r.school_id, r.grade, r.label);
  end loop;
end $$;

-- ================================================================ 2. scheduled live games

alter table public.live_sessions add column if not exists scheduled_at timestamptz;
create index if not exists live_sessions_course_idx on public.live_sessions (course_id) where state <> 'ended';

-- A game programmed for a date and time: same as live_create, with the moment students may join.
create or replace function public.live_schedule(p_title text, p_exam text, p_keys text[], p_seconds int, p_course uuid, p_at timestamptz)
returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if p_at is null or p_at < now() - interval '5 minutes' or p_at > now() + interval '120 days' then raise exception 'bad_time'; end if;
  if p_course is not null and not public.is_course_teacher(p_course) then raise exception 'not_allowed'; end if;
  v_row := public.live_create(p_title, p_exam, p_keys, p_seconds, p_course);
  update live_sessions set scheduled_at = case when p_at <= now() then null else p_at end where id = v_row.id returning * into v_row;
  return v_row;
end $$;

-- Opening a programmed room early (or changing its time). p_at null = open now.
create or replace function public.live_reschedule(p_session uuid, p_at timestamptz) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  if p_at is not null and (p_at > now() + interval '120 days') then raise exception 'bad_time'; end if;
  update live_sessions set scheduled_at = case when p_at is null or p_at <= now() then null else p_at end
   where id = p_session and state <> 'ended' returning * into v_row;
  if not found then raise exception 'not_allowed'; end if;
  return v_row;
end $$;

-- Joining waits for the programmed time.
create or replace function public.live_join(p_code text, p_nickname text) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_session live_sessions; v_profile uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v_session from live_sessions where code = btrim(p_code) and state <> 'ended';
  if not found then raise exception 'session_not_found'; end if;
  if v_session.scheduled_at is not null and v_session.scheduled_at > now() then raise exception 'not_open_yet'; end if;
  select id into v_profile from profiles where id = auth.uid();
  insert into live_players (session_id, player_id, nickname, profile_id)
  values (v_session.id, auth.uid(), left(btrim(p_nickname), 24), v_profile)
  on conflict (session_id, player_id) do update set nickname = excluded.nickname;
  return v_session;
end $$;

-- A student's games: the open and programmed rooms of the classes they belong to (programmed up to 30 days ahead).
-- Rooms left open and never played drop off after 12 hours.
create or replace function public.student_live_games()
returns table (id uuid, code text, title text, scheduled_at timestamptz, state text, course_id uuid, course_name text,
               subject text, grade text, group_label text, host_name text, questions int, seconds_per_question int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.code, s.title, s.scheduled_at, s.state, s.course_id, c.name, c.subject, c.grade, c.group_label,
         coalesce(nullif(h.full_name, ''), h.email), cardinality(s.question_keys), s.seconds_per_question, s.created_at
    from live_sessions s
    join courses c on c.id = s.course_id
    left join profiles h on h.id = s.host_id
   where s.state <> 'ended'
     and exists (select 1 from course_members m where m.course_id = s.course_id and m.profile_id = auth.uid() and m.role = 'student')
     and coalesce(s.scheduled_at, s.created_at) > now() - interval '12 hours'
     and (s.scheduled_at is null or s.scheduled_at < now() + interval '30 days')
   order by coalesce(s.scheduled_at, s.created_at)
$$;

revoke all on function public.live_schedule(text, text, text[], int, uuid, timestamptz), public.live_reschedule(uuid, timestamptz),
  public.live_join(text, text), public.student_live_games() from public, anon;
grant execute on function public.live_schedule(text, text, text[], int, uuid, timestamptz), public.live_reschedule(uuid, timestamptz),
  public.live_join(text, text), public.student_live_games() to authenticated;

notify pgrst, 'reload schema';
