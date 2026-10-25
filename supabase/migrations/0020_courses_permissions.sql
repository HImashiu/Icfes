-- 0020 · Cursos y materias, permisos, invitaciones, ajustes del colegio y registro.
-- A curso (11 A) is now a record of its own, so coordination can create it before any class exists; each class of
-- the curso is one subject (Matemáticas 11 A). Teachers get edit or view-only access per class (course_members.access)
-- or per subject across the school (subject_access). Coordination invites teachers by email (no code needed),
-- edits the school's settings, and sees a log of who did what.
-- Needs 0001-0018. Re-runnable: every statement checks before creating. After running it: notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- cursos
create table if not exists public.school_groups (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade default public.my_school(),
  grade      text not null check (grade ~ '^[0-9]{1,2}$'),
  label      text not null check (char_length(label) between 1 and 8 and label = upper(label)),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, grade, label)
);
alter table public.school_groups enable row level security;
drop policy if exists school_groups_select on public.school_groups;
create policy school_groups_select on public.school_groups for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists school_groups_write on public.school_groups;
create policy school_groups_write on public.school_groups for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

-- ---------------------------------------------------------------- access per class
-- 'edit': teaches the class (activities, roster, grades). 'view': reads everything of it, changes nothing.
alter table public.course_members add column if not exists access text not null default 'edit';
do $$ begin
  alter table public.course_members add constraint course_members_access_check check (access in ('edit', 'view'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- access per subject
-- A teacher may read (or edit) one ICFES area in every curso, optionally only in one grade. area '*' is every area.
create table if not exists public.subject_access (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade default public.my_school(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  area       text not null,
  grade      text,
  access     text not null default 'view' check (access in ('edit', 'view')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists subject_access_key on public.subject_access (school_id, profile_id, area, coalesce(grade, ''));
alter table public.subject_access enable row level security;
drop policy if exists subject_access_select on public.subject_access;
create policy subject_access_select on public.subject_access for select
  using (school_id = public.my_school() and (profile_id = auth.uid() or public.my_role() = 'school_admin'));
drop policy if exists subject_access_write on public.subject_access;
create policy subject_access_write on public.subject_access for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

-- The ICFES area of a class, from its subject (or its name, for classes made before subjects existed).
-- Mirrors SUBJECT_AREA in app/src/lib/teaching.js.
create or replace function public.course_area(p_subject text, p_name text) returns text
language sql immutable as $$
  select case
    when p_subject in ('Lectura crítica', 'Español') then 'Lectura crítica'
    when p_subject = 'Matemáticas' then 'Matemáticas'
    when p_subject = 'Sociales y ciudadanas' then 'Sociales y ciudadanas'
    when p_subject in ('Ciencias naturales', 'Física', 'Química', 'Biología') then 'Ciencias naturales'
    when p_subject = 'Inglés' then 'Inglés'
    when p_subject is not null then null
    when lower(p_name) like 'lectura%' or lower(p_name) like 'español%' then 'Lectura crítica'
    when lower(p_name) like 'matem%' then 'Matemáticas'
    when lower(p_name) like 'sociales%' then 'Sociales y ciudadanas'
    when lower(p_name) like 'ciencias%' or lower(p_name) like 'física%' or lower(p_name) like 'química%' or lower(p_name) like 'biología%' then 'Ciencias naturales'
    when lower(p_name) like 'inglés%' or lower(p_name) like 'ingles%' then 'Inglés'
    else null end
$$;

-- True when the signed-in teacher holds a subject grant of at least p_level for this class.
create or replace function public.has_subject_access(p_course uuid, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    join subject_access s on s.school_id = c.school_id and s.profile_id = auth.uid()
    join profiles p on p.id = auth.uid() and p.role in ('teacher', 'school_admin')
    where c.id = p_course
      and (s.area = '*' or s.area = public.course_area(c.subject, c.name))
      and (s.grade is null or s.grade = c.grade)
      and (p_level = 'view' or s.access = 'edit')
  )
$$;

-- Teaching (edit) rights. Every policy written since 0001 uses this function, so view-only rows and grants are
-- excluded everywhere at once; edit grants count as teaching.
create or replace function public.is_course_teacher(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_members
    where course_id = p_course and profile_id = auth.uid() and role = 'teacher' and access = 'edit'
  ) or exists (
    select 1 from courses c join profiles p on p.id = auth.uid()
    where c.id = p_course and c.school_id = p.school_id and p.role = 'school_admin'
  ) or public.has_subject_access(p_course, 'edit')
$$;

-- Reading rights: teachers, view-only teachers, view grants and group directors.
create or replace function public.can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_course_teacher(p_course)
    or exists (select 1 from course_members where course_id = p_course and profile_id = auth.uid() and role = 'teacher')
    or public.has_subject_access(p_course, 'view')
    or public.is_group_director(p_course)
$$;

-- Read-only policies; they add to the existing select policies (policies are OR-ed).
drop policy if exists courses_select_viewer on public.courses;
create policy courses_select_viewer on public.courses for select using (public.can_view_course(id));
drop policy if exists members_select_viewer on public.course_members;
create policy members_select_viewer on public.course_members for select using (public.can_view_course(course_id));
drop policy if exists assignments_select_viewer on public.assignments;
create policy assignments_select_viewer on public.assignments for select using (public.can_view_course(course_id));
drop policy if exists attempts_select_viewer on public.attempts;
create policy attempts_select_viewer on public.attempts for select
  using (assignment_id is not null and exists (
    select 1 from public.assignments a where a.id = attempts.assignment_id and public.can_view_course(a.course_id)));
do $$ begin
  if to_regclass('public.proctor_events') is not null then
    execute 'drop policy if exists pe_select_viewer on public.proctor_events';
    execute 'create policy pe_select_viewer on public.proctor_events for select using (exists (select 1 from public.assignments a where a.id = proctor_events.assignment_id and public.can_view_course(a.course_id)))';
  end if;
  if to_regclass('public.paper_seating') is not null then
    execute 'drop policy if exists paper_seating_viewer on public.paper_seating';
    execute 'create policy paper_seating_viewer on public.paper_seating for select using (exists (select 1 from public.assignments a where a.id = paper_seating.assignment_id and public.can_view_course(a.course_id)))';
  end if;
end $$;

-- ---------------------------------------------------------------- school settings
create table if not exists public.school_settings (
  school_id  uuid primary key references public.schools (id) on delete cascade default public.my_school(),
  settings   jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 20000),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.school_settings enable row level security;
drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select on public.school_settings for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists school_settings_write on public.school_settings;
create policy school_settings_write on public.school_settings for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

create or replace function public.school_flag(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (settings ->> p_key)::boolean from school_settings where school_id = public.my_school()), p_default)
$$;

-- Teachers create their own classes unless coordination turned it off in Ajustes.
drop policy if exists courses_insert on public.courses;
create policy courses_insert on public.courses for insert
  with check (created_by = auth.uid() and school_id = public.my_school()
              and (public.my_role() = 'school_admin' or (public.my_role() = 'teacher' and public.school_flag('teachers_create_classes', true))));

-- Coordination renames the school (schools has no update policy: name only, through this function).
create or replace function public.update_school_name(p_name text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'school_admin' then raise exception 'not_allowed'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'bad_name'; end if;
  update schools set name = trim(p_name) where id = public.my_school();
  insert into school_audit (school_id, actor, action, detail) values (public.my_school(), auth.uid(), 'school_name', jsonb_build_object('name', trim(p_name)));
  return trim(p_name);
end $$;

-- A new teacher code; the old one stops working at once.
create or replace function public.regenerate_teacher_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_code text := encode(gen_random_bytes(5), 'hex');
begin
  if public.my_role() is distinct from 'school_admin' then raise exception 'not_allowed'; end if;
  update schools set teacher_code = v_code where id = public.my_school();
  insert into school_audit (school_id, actor, action, detail) values (public.my_school(), auth.uid(), 'teacher_code', '{}'::jsonb);
  return v_code;
end $$;

-- ---------------------------------------------------------------- who did what
create table if not exists public.school_audit (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade default public.my_school(),
  actor      uuid references public.profiles (id) on delete set null default auth.uid(),
  action     text not null check (char_length(action) between 1 and 40),
  detail     jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 4000),
  created_at timestamptz not null default now()
);
create index if not exists school_audit_school_idx on public.school_audit (school_id, created_at desc);
alter table public.school_audit enable row level security;
drop policy if exists school_audit_select on public.school_audit;
create policy school_audit_select on public.school_audit for select
  using (school_id = public.my_school() and public.my_role() = 'school_admin');
drop policy if exists school_audit_insert on public.school_audit;
create policy school_audit_insert on public.school_audit for insert
  with check (school_id = public.my_school() and actor = auth.uid() and public.my_role() in ('teacher', 'school_admin'));

-- ---------------------------------------------------------------- invitations
-- Coordination invites staff by email. At first sign-in the invited person gets the role without typing the
-- teacher code, even with an email outside the school's domains (a teacher's personal Gmail).
create table if not exists public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade default public.my_school(),
  email       text not null check (email = lower(email) and email like '%_@_%'),
  full_name   text not null default '',
  role        text not null default 'teacher' check (role in ('teacher', 'school_admin')),
  invited_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index if not exists staff_invites_key on public.staff_invites (school_id, email);
alter table public.staff_invites enable row level security;
drop policy if exists staff_invites_admin on public.staff_invites;
create policy staff_invites_admin on public.staff_invites for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

-- p_rows: [{ "email": "...", "name": "...", "role": "teacher" }]. Someone already signed in gets the role now.
-- Returns one row per email: 'invited', 'updated' (already had an account) or 'skipped' (bad email or yourself).
create or replace function public.invite_staff(p_rows jsonb)
returns table (email text, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_school uuid := public.my_school();
  r jsonb;
  v_email text; v_name text; v_role text;
  v_profile profiles;
begin
  if public.my_role() is distinct from 'school_admin' then raise exception 'not_allowed'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_email := lower(trim(coalesce(r ->> 'email', '')));
    v_name := trim(coalesce(r ->> 'name', ''));
    v_role := case when r ->> 'role' = 'school_admin' then 'school_admin' else 'teacher' end;
    email := v_email;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then status := 'skipped'; return next; continue; end if;
    select * into v_profile from profiles p where lower(p.email) = v_email and p.school_id = v_school;
    if found and v_profile.id = auth.uid() then status := 'skipped'; return next; continue; end if;
    insert into staff_invites (school_id, email, full_name, role, invited_by, accepted_at)
    values (v_school, v_email, v_name, v_role, auth.uid(), case when v_profile.id is not null then now() end)
    on conflict (school_id, email) do update set role = excluded.role, full_name = coalesce(nullif(excluded.full_name, ''), staff_invites.full_name),
      accepted_at = coalesce(staff_invites.accepted_at, excluded.accepted_at);
    if v_profile.id is not null then
      update profiles set role = v_role where id = v_profile.id;
      status := 'updated';
    else
      status := 'invited';
    end if;
    insert into school_audit (school_id, actor, action, detail) values (v_school, auth.uid(), 'invite', jsonb_build_object('email', v_email, 'role', v_role));
    v_profile := null;
    return next;
  end loop;
end $$;

-- First sign-in, now with invitations (keeps 0006: paper results already stored become the student's).
create or replace function public.claim_profile(p_teacher_code text default null, p_full_name text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_domain text := split_part(v_email, '@', 2);
  v_school schools;
  v_invite staff_invites;
  v_role  text := 'student';
  v_profile profiles;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_profile from profiles where id = v_uid;
  if found then return v_profile; end if;
  select * into v_school from schools where status = 'active' and v_domain = any (domains) limit 1;
  if found then
    select * into v_invite from staff_invites where school_id = v_school.id and email = v_email;
  else
    select i.* into v_invite from staff_invites i join schools s on s.id = i.school_id and s.status = 'active'
     where i.email = v_email order by i.created_at desc limit 1;
    if not found then raise exception 'school_not_found'; end if;
    select * into v_school from schools where id = v_invite.school_id;
  end if;
  if v_invite.id is not null then
    v_role := v_invite.role;
    update staff_invites set accepted_at = now() where id = v_invite.id;
  elsif p_teacher_code is not null and length(trim(p_teacher_code)) > 0 then
    if lower(trim(p_teacher_code)) <> lower(v_school.teacher_code) then raise exception 'bad_teacher_code'; end if;
    v_role := 'teacher';
  end if;
  insert into profiles (id, school_id, role, full_name, email)
  values (v_uid, v_school.id, v_role,
          coalesce(nullif(trim(p_full_name), ''), nullif(v_invite.full_name, ''), auth.jwt() -> 'user_metadata' ->> 'full_name', v_email), v_email)
  returning * into v_profile;
  update course_members set profile_id = v_uid, full_name = case when full_name = '' then v_profile.full_name else full_name end
   where profile_id is null and lower(email) = v_email;
  update attempts set profile_id = v_uid
   where profile_id is null and member_id in (select id from course_members where profile_id = v_uid);
  return v_profile;
end $$;

-- Mis materias: only teachers with edit access are named to students.
create or replace function public.student_classes()
returns table (id uuid, name text, subject text, grade text, group_label text, teachers text[])
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.subject, c.grade::text, c.group_label,
    coalesce(
      nullif(array(select coalesce(nullif(t.full_name, ''), t.email) from course_members t left join profiles tp on tp.id = t.profile_id
                   where t.course_id = c.id and t.role = 'teacher' and t.access = 'edit' and coalesce(tp.role, 'teacher') <> 'school_admin' order by 1), '{}'),
      array(select coalesce(nullif(t.full_name, ''), t.email) from course_members t where t.course_id = c.id and t.role = 'teacher' and t.access = 'edit' order by 1))
  from courses c
  where exists (select 1 from course_members m where m.course_id = c.id and m.profile_id = auth.uid() and m.role = 'student')
  order by c.name
$$;

revoke all on function public.invite_staff(jsonb) from public, anon;
grant execute on function public.invite_staff(jsonb) to authenticated;
revoke all on function public.update_school_name(text) from public, anon;
grant execute on function public.update_school_name(text) to authenticated;
revoke all on function public.regenerate_teacher_code() from public, anon;
grant execute on function public.regenerate_teacher_code() to authenticated;
grant execute on function public.student_classes() to authenticated;
grant execute on function public.course_area(text, text) to authenticated;

notify pgrst, 'reload schema';
