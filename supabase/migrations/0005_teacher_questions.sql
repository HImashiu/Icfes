-- M2b: questions written by teachers. Stored apart from the ICFES bank, never pooled into it or into the band.
-- An assignment or live room built from them uses exam_slug = 'teacher' and the question ids as question_keys.

create table if not exists public.teacher_questions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id),
  owner_id    uuid not null references public.profiles (id),
  visibility  text not null default 'private' check (visibility in ('private', 'school')),
  area        text not null default '',
  competencia text,
  tema        text,
  dificultad  int check (dificultad is null or dificultad between 1 and 5),
  -- { stimulus_md, stem_md, options: [{letter, text_md}], traced: [{figure_id, url}] } (same shape as the exam files)
  question_json jsonb not null check (pg_column_size(question_json) < 800000),
  answer      text not null check (answer ~ '^[A-D]$'),
  explanation text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists teacher_questions_owner_idx on public.teacher_questions (owner_id, created_at desc);
create index if not exists teacher_questions_school_idx on public.teacher_questions (school_id);

-- Who may read a question: its owner, staff of the school when it is shared with the school, and the students
-- (and live players) of an assignment or room that uses it.
create or replace function public.can_read_teacher_question(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_questions q
    where q.id = p_id and (
      q.owner_id = auth.uid()
      or (q.visibility = 'school' and q.school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'))
    )
  ) or exists (
    select 1 from assignments a
    where a.exam_slug = 'teacher' and p_id::text = any (a.question_keys)
      and (public.is_course_teacher(a.course_id) or (public.is_course_member(a.course_id) and a.status <> 'draft'))
  ) or exists (
    select 1 from live_sessions s
    where s.exam_slug = 'teacher' and p_id::text = any (s.question_keys)
      and (s.host_id = auth.uid() or public.is_live_player(s.id))
  )
$$;

alter table public.teacher_questions enable row level security;
drop policy if exists tq_select on public.teacher_questions;
create policy tq_select on public.teacher_questions for select using (public.can_read_teacher_question(id));
drop policy if exists tq_insert on public.teacher_questions;
create policy tq_insert on public.teacher_questions for insert
  with check (owner_id = auth.uid() and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists tq_update on public.teacher_questions;
create policy tq_update on public.teacher_questions for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and school_id = public.my_school());
drop policy if exists tq_delete on public.teacher_questions;
create policy tq_delete on public.teacher_questions for delete using (owner_id = auth.uid());

create or replace function public.tq_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists tq_touch on public.teacher_questions;
create trigger tq_touch before update on public.teacher_questions for each row execute function public.tq_touch();
