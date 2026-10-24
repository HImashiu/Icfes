-- Grading models: how a delivered attempt becomes the number a teacher reports (percent, own scale, ICFES estimate,
-- provisional IRT, teacher formula), with per-topic curves, partial credit and diminishing XP on repeat attempts.
-- One row per school, class space or assignment; the nearest one wins in the app. Re-runnable.
-- After running it: notify pgrst, 'reload schema';
create table if not exists public.grading_models (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  scope      text not null check (scope in ('school', 'course', 'assignment')),
  -- the school, course or assignment this model applies to
  scope_id   uuid not null,
  model      jsonb not null check (pg_column_size(model) < 20000),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (scope, scope_id)
);
create index if not exists grading_models_school_idx on public.grading_models (school_id);

alter table public.grading_models enable row level security;

-- Everyone in the school reads them: students see their result in the teacher's model.
drop policy if exists gm_select on public.grading_models;
create policy gm_select on public.grading_models for select using (school_id = public.my_school());

-- Who may write: the coordination for the school, the course's teachers for a class space or one of its assignments.
create or replace function public.can_grade_scope(p_school uuid, p_scope text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school = (select school_id from profiles where id = auth.uid())
    and case p_scope
      when 'school' then p_id = p_school and (select role from profiles where id = auth.uid()) = 'school_admin'
      when 'course' then exists (select 1 from courses c where c.id = p_id and c.school_id = p_school) and public.is_course_teacher(p_id)
      when 'assignment' then exists (
        select 1 from assignments a join courses c on c.id = a.course_id
        where a.id = p_id and c.school_id = p_school and public.is_course_teacher(a.course_id))
      else false
    end
$$;

drop policy if exists gm_insert on public.grading_models;
create policy gm_insert on public.grading_models for insert
  with check (public.can_grade_scope(school_id, scope, scope_id) and updated_by = auth.uid());
drop policy if exists gm_update on public.grading_models;
create policy gm_update on public.grading_models for update
  using (public.can_grade_scope(school_id, scope, scope_id))
  with check (public.can_grade_scope(school_id, scope, scope_id) and updated_by = auth.uid());
drop policy if exists gm_delete on public.grading_models;
create policy gm_delete on public.grading_models for delete
  using (public.can_grade_scope(school_id, scope, scope_id));

create or replace function public.gm_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists gm_touch on public.grading_models;
create trigger gm_touch before update on public.grading_models for each row execute function public.gm_touch();
