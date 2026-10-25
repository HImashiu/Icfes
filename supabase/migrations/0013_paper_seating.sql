-- Seating plan of a paper simulacro: the room layout, which booklet version each student got and where they sit.
-- The printed sheets and the phone scanner read it to know the version of every student. Run after 0012; safe to run again.

create table if not exists public.paper_seating (
  assignment_id uuid primary key references public.assignments (id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.paper_seating enable row level security;

drop policy if exists paper_seating_teacher on public.paper_seating;
create policy paper_seating_teacher on public.paper_seating for all
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.is_course_teacher(a.course_id)))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id and public.is_course_teacher(a.course_id)));
