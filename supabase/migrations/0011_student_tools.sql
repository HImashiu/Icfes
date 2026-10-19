-- Student tools: teacher word definitions per assignment, and each student's highlights and notes.
-- Safe to run more than once. After running it: notify pgrst, 'reload schema';

-- Teacher-written definitions for an assignment (a list of {term, def}) and the switch that shows them.
alter table public.assignments add column if not exists allow_definitions boolean not null default false;
alter table public.assignments add column if not exists definitions jsonb not null default '[]'::jsonb;

-- One row per student and booklet; items is the list of highlights and notes (see app/src/lib/annotations.js).
create table if not exists public.annotations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exam_slug text not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, exam_slug)
);
alter table public.annotations enable row level security;
drop policy if exists annotations_own on public.annotations;
create policy annotations_own on public.annotations for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
