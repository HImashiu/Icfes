-- Teacher workspace for large classes: custom statuses, a follow-up queue, student groups, teacher notes and saved views.
-- Students are identified by their school email (lower case), so one student in several class spaces is one person.
-- A teacher reads and writes these rows only for students of the class spaces they teach; coordination sees the school.
-- Re-runnable. After running it: notify pgrst, 'reload schema';

-- Is the signed-in person staff of p_school and allowed to see this student?
create or replace function public.teaches_student(p_school uuid, p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school = public.my_school()
     and public.my_role() in ('teacher', 'school_admin')
     and (public.my_role() = 'school_admin'
          or exists (select 1 from course_members m
                     where lower(m.email) = lower(p_email) and m.role = 'student' and public.is_course_teacher(m.course_id)))
$$;

create or replace function public.is_school_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school = public.my_school() and public.my_role() in ('teacher', 'school_admin')
$$;

-- 1. Statuses the school defines ("Al día", "Necesita apoyo"...). Shared by the school's teachers.
create table if not exists public.student_statuses (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 40),
  color      text not null default '#A7B1AA' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position   int not null default 0,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists student_statuses_school_idx on public.student_statuses (school_id);
alter table public.student_statuses enable row level security;
drop policy if exists ss_select on public.student_statuses;
create policy ss_select on public.student_statuses for select using (public.is_school_staff(school_id));
drop policy if exists ss_insert on public.student_statuses;
create policy ss_insert on public.student_statuses for insert with check (public.is_school_staff(school_id));
drop policy if exists ss_update on public.student_statuses;
create policy ss_update on public.student_statuses for update using (public.is_school_staff(school_id)) with check (public.is_school_staff(school_id));
drop policy if exists ss_delete on public.student_statuses;
create policy ss_delete on public.student_statuses for delete using (public.is_school_staff(school_id));

-- 2. One row per student: their status and whether they are in the follow-up queue.
create table if not exists public.student_flags (
  school_id        uuid not null references public.schools (id) on delete cascade,
  email            text not null check (email = lower(email)),
  status_id        uuid references public.student_statuses (id) on delete set null,
  follow_up        boolean not null default false,
  follow_up_due    date,
  follow_up_reason text check (follow_up_reason is null or char_length(follow_up_reason) <= 300),
  updated_by       uuid references public.profiles (id) default auth.uid(),
  updated_at       timestamptz not null default now(),
  primary key (school_id, email)
);
alter table public.student_flags enable row level security;
drop policy if exists sf_select on public.student_flags;
create policy sf_select on public.student_flags for select using (public.teaches_student(school_id, email));
drop policy if exists sf_insert on public.student_flags;
create policy sf_insert on public.student_flags for insert with check (public.teaches_student(school_id, email));
drop policy if exists sf_update on public.student_flags;
create policy sf_update on public.student_flags for update using (public.teaches_student(school_id, email)) with check (public.teaches_student(school_id, email));
drop policy if exists sf_delete on public.student_flags;
create policy sf_delete on public.student_flags for delete using (public.teaches_student(school_id, email));
create or replace function public.sf_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists sf_touch on public.student_flags;
create trigger sf_touch before update on public.student_flags for each row execute function public.sf_touch();

-- 3. Groups of students made by teachers ("Refuerzo lectura", "Monitores"). Optional class space.
create table if not exists public.student_groups (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  course_id  uuid references public.courses (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  color      text not null default '#8AB4FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists student_groups_school_idx on public.student_groups (school_id);
alter table public.student_groups enable row level security;
drop policy if exists sg_select on public.student_groups;
create policy sg_select on public.student_groups for select
  using (public.is_school_staff(school_id) and (course_id is null or public.is_course_teacher(course_id) or created_by = auth.uid()));
drop policy if exists sg_insert on public.student_groups;
create policy sg_insert on public.student_groups for insert
  with check (public.is_school_staff(school_id) and created_by = auth.uid() and (course_id is null or public.is_course_teacher(course_id)));
drop policy if exists sg_update on public.student_groups;
create policy sg_update on public.student_groups for update
  using (public.is_school_staff(school_id) and (created_by = auth.uid() or public.my_role() = 'school_admin' or (course_id is not null and public.is_course_teacher(course_id))))
  with check (public.is_school_staff(school_id));
drop policy if exists sg_delete on public.student_groups;
create policy sg_delete on public.student_groups for delete
  using (public.is_school_staff(school_id) and (created_by = auth.uid() or public.my_role() = 'school_admin' or (course_id is not null and public.is_course_teacher(course_id))));

create table if not exists public.student_group_members (
  group_id uuid not null references public.student_groups (id) on delete cascade,
  email    text not null check (email = lower(email)),
  added_by uuid references public.profiles (id) default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (group_id, email)
);
alter table public.student_group_members enable row level security;
drop policy if exists sgm_select on public.student_group_members;
create policy sgm_select on public.student_group_members for select
  using (exists (select 1 from public.student_groups g where g.id = group_id and public.teaches_student(g.school_id, email)));
drop policy if exists sgm_insert on public.student_group_members;
create policy sgm_insert on public.student_group_members for insert
  with check (exists (select 1 from public.student_groups g where g.id = group_id and public.teaches_student(g.school_id, email)));
drop policy if exists sgm_delete on public.student_group_members;
create policy sgm_delete on public.student_group_members for delete
  using (exists (select 1 from public.student_groups g where g.id = group_id and public.teaches_student(g.school_id, email)));

-- 4. Teacher notes on a student (visible to the student's teachers and coordination, never to the student).
create table if not exists public.student_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  email       text not null check (email = lower(email)),
  body        text not null check (char_length(body) between 1 and 4000),
  author_id   uuid references public.profiles (id) default auth.uid(),
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists student_notes_email_idx on public.student_notes (school_id, email, created_at desc);
alter table public.student_notes enable row level security;
drop policy if exists sn_select on public.student_notes;
create policy sn_select on public.student_notes for select using (public.teaches_student(school_id, email));
drop policy if exists sn_insert on public.student_notes;
create policy sn_insert on public.student_notes for insert with check (public.teaches_student(school_id, email) and author_id = auth.uid());
drop policy if exists sn_delete on public.student_notes;
create policy sn_delete on public.student_notes for delete using (author_id = auth.uid());

-- 5. A teacher's saved roster views (search + filters), private to that teacher.
create table if not exists public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  name       text not null check (char_length(name) between 1 and 60),
  filters    jsonb not null default '{}'::jsonb check (pg_column_size(filters) < 20000),
  created_at timestamptz not null default now()
);
alter table public.saved_views enable row level security;
drop policy if exists sv_all on public.saved_views;
create policy sv_all on public.saved_views for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

notify pgrst, 'reload schema';
