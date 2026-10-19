-- Teacher tools: class spaces by subject, school versions of bank questions, and exam monitoring.
-- Re-runnable. After running it: notify pgrst, 'reload schema';

-- 1. Class spaces ("Inglés 9no A"): a course now knows its subject and group letter.
alter table public.courses add column if not exists subject text;
alter table public.courses add column if not exists group_label text;

-- 2. A school's own version of a bank question. The shared bank is never changed; the app lays this over the
--    original for everyone in the school (students and teachers). Deleting the row restores the original.
create table if not exists public.question_overrides (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  exam_slug   text not null,
  qkey        text not null,
  question_json jsonb not null check (pg_column_size(question_json) < 800000),
  answer      text check (answer is null or answer ~ '^[A-D]$'),
  explanation text,
  edited_by   uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  unique (school_id, exam_slug, qkey)
);
alter table public.question_overrides enable row level security;
drop policy if exists qo_select on public.question_overrides;
create policy qo_select on public.question_overrides for select using (school_id = public.my_school());
drop policy if exists qo_insert on public.question_overrides;
create policy qo_insert on public.question_overrides for insert
  with check (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin') and edited_by = auth.uid());
drop policy if exists qo_update on public.question_overrides;
create policy qo_update on public.question_overrides for update
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'))
  with check (school_id = public.my_school() and edited_by = auth.uid());
drop policy if exists qo_delete on public.question_overrides;
create policy qo_delete on public.question_overrides for delete
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
create or replace function public.qo_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists qo_touch on public.question_overrides;
create trigger qo_touch before update on public.question_overrides for each row execute function public.qo_touch();

-- 3. Monitoring. The teacher switches it on per assignment; the student's app records when the tab or window is
--    left and when the pointer leaves the exam, and the teacher sees it live and in the report.
alter table public.assignments add column if not exists proctor boolean not null default false;
alter table public.attempts add column if not exists proctor jsonb not null default '{}'::jsonb;

create table if not exists public.proctor_events (
  id            bigint generated always as identity primary key,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) default auth.uid(),
  client_id     text not null,
  kind          text not null check (kind in ('leave', 'return', 'pointer_out', 'pointer_in', 'idle')),
  at            timestamptz not null default now(),
  question_key  text,
  secs          int
);
create index if not exists proctor_events_assignment_idx on public.proctor_events (assignment_id, at desc);
alter table public.proctor_events enable row level security;
drop policy if exists pe_select on public.proctor_events;
create policy pe_select on public.proctor_events for select
  using (profile_id = auth.uid()
         or exists (select 1 from public.assignments a where a.id = proctor_events.assignment_id and public.is_course_teacher(a.course_id)));
drop policy if exists pe_insert on public.proctor_events;
create policy pe_insert on public.proctor_events for insert
  with check (profile_id = auth.uid()
              and exists (select 1 from public.assignments a
                          where a.id = assignment_id and a.proctor and public.is_course_member(a.course_id) and a.status = 'active'));
