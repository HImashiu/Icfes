-- Teaching tools: lessons (a run of bank questions and text slides that a teacher presents, prints, plays live or
-- turns into an assignment) and saved activity formats (the rules an activity is created with).
-- Re-runnable. After running it: notify pgrst, 'reload schema';

-- 1. Lessons. Only question keys are stored (the questions stay in the exam files); every question of a lesson
--    comes from one booklet (exam_slug, 'teacher' for the teacher's own questions).
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  owner_id    uuid not null references public.profiles (id),
  title       text not null default '' check (char_length(title) <= 200),
  exam_slug   text not null,
  -- [{ "type": "q", "key": "12" }, { "type": "text", "title": "...", "body": "..." }]
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 400000),
  -- { "hideOptions": bool, "seconds": int, "titleSlide": bool }
  settings    jsonb not null default '{}'::jsonb,
  visibility  text not null default 'private' check (visibility in ('private', 'school')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lessons_owner_idx on public.lessons (owner_id, updated_at desc);
create index if not exists lessons_school_idx on public.lessons (school_id);

alter table public.lessons enable row level security;
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select
  using (owner_id = auth.uid()
         or (visibility = 'school' and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin')));
drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons for insert
  with check (owner_id = auth.uid() and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and school_id = public.my_school());
drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons for delete using (owner_id = auth.uid());

create or replace function public.lessons_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons for each row execute function public.lessons_touch();

-- 2. Saved activity formats ("Quiz de los viernes": kind, correction, hints, attempts, time, answers policy, monitoring).
create table if not exists public.activity_formats (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  owner_id    uuid not null references public.profiles (id),
  name        text not null check (char_length(name) between 1 and 80),
  config      jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 4000),
  visibility  text not null default 'private' check (visibility in ('private', 'school')),
  created_at  timestamptz not null default now()
);
create index if not exists activity_formats_owner_idx on public.activity_formats (owner_id, created_at desc);

alter table public.activity_formats enable row level security;
drop policy if exists af_select on public.activity_formats;
create policy af_select on public.activity_formats for select
  using (owner_id = auth.uid()
         or (visibility = 'school' and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin')));
drop policy if exists af_insert on public.activity_formats;
create policy af_insert on public.activity_formats for insert
  with check (owner_id = auth.uid() and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists af_update on public.activity_formats;
create policy af_update on public.activity_formats for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and school_id = public.my_school());
drop policy if exists af_delete on public.activity_formats;
create policy af_delete on public.activity_formats for delete using (owner_id = auth.uid());

-- 3. An assignment made from a lesson remembers it. Deleting the lesson keeps the assignment.
alter table public.assignments add column if not exists lesson_id uuid references public.lessons (id) on delete set null;
