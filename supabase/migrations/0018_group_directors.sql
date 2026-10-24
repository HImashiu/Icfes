-- 0018 · Group directors (teacher panel by subject).
-- Each group (grade + group label, e.g. 11 A) may have one director de grupo: a teacher who reads every subject of
-- that group (classes, rosters, activities and results) without editing them. Coordination names them.
-- Re-runnable: every statement checks before creating.

create table if not exists public.group_directors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  grade text not null,
  group_label text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, grade, group_label)
);

alter table public.group_directors enable row level security;

drop policy if exists group_directors_select on public.group_directors;
create policy group_directors_select on public.group_directors for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists group_directors_write on public.group_directors;
create policy group_directors_write on public.group_directors for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

-- True when the signed-in teacher directs the group this class belongs to.
create or replace function public.is_group_director(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    join group_directors d on d.school_id = c.school_id and d.grade = c.grade and upper(d.group_label) = upper(coalesce(c.group_label, ''))
    where c.id = p_course and d.profile_id = auth.uid()
  )
$$;

-- Read-only access for directors. These add to the existing select policies (policies are OR-ed); insert, update
-- and delete stay with the class's teachers and coordination.
drop policy if exists courses_select_director on public.courses;
create policy courses_select_director on public.courses for select using (public.is_group_director(id));
drop policy if exists members_select_director on public.course_members;
create policy members_select_director on public.course_members for select using (public.is_group_director(course_id));
drop policy if exists assignments_select_director on public.assignments;
create policy assignments_select_director on public.assignments for select using (public.is_group_director(course_id));
drop policy if exists attempts_select_director on public.attempts;
create policy attempts_select_director on public.attempts for select
  using (assignment_id is not null and exists (
    select 1 from public.assignments a where a.id = attempts.assignment_id and public.is_group_director(a.course_id)));
