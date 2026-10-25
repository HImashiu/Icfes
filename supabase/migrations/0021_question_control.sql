-- 0021 · Question control: no group of students meets the same question twice without the teacher knowing.
-- 1. school_question_uses(): every use of every question in the school (activities, live games, classes for
--    projection), whoever made it, for teachers and coordination. A teacher's own lists only show their classes;
--    this shows the whole school without opening anyone's results.
-- 2. question_holds: a question, or a whole booklet (qkey '*'), reserved for a simulacro and/or hidden from
--    students' free practice. hidden_questions() is what a student's app reads (only booklet + key, no notes).
-- 3. question_rules: the school's rules (tarea ↔ simulacro, repeats, reserved questions), set by coordination.
-- Runs after 0003-0019. Re-runnable. After running it: notify pgrst, 'reload schema';

-- 1. Uses ---------------------------------------------------------------------------------------------------------
-- A live game counts only the questions it actually showed; a class for projection counts its question slides.
-- `delivery` (paper or digital) is read from the row when that column exists, so this works before and after it does.
create or replace function public.school_question_uses()
returns table (source text, id uuid, kind text, exam_slug text, scope text, question_keys text[], title text,
               course_id uuid, course_name text, grade text, group_label text, teacher_id uuid, teacher_name text,
               at timestamptz, status text, delivery text)
language sql stable security definer set search_path = public as $$
  select 'assignment', a.id, a.kind, a.exam_slug, a.scope, a.question_keys, a.title,
         c.id, c.name, c.grade::text, to_jsonb(c) ->> 'group_label', a.created_by, coalesce(nullif(p.full_name, ''), p.email),
         coalesce(a.opens_at, a.created_at), a.status, to_jsonb(a) ->> 'delivery'
  from assignments a
  join courses c on c.id = a.course_id
  left join profiles p on p.id = a.created_by
  where c.school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin')
  union all
  select 'live', s.id, 'live', s.exam_slug, 'all', s.question_keys[1:s.current_index + 1], s.title,
         c.id, c.name, c.grade::text, to_jsonb(c) ->> 'group_label', s.host_id, coalesce(nullif(p.full_name, ''), p.email),
         s.created_at, s.state, null
  from live_sessions s
  left join courses c on c.id = s.course_id
  left join profiles p on p.id = s.host_id
  where s.school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin') and s.current_index >= 0
  union all
  select 'lesson', l.id, 'lesson', l.exam_slug, 'all',
         array(select i ->> 'key' from jsonb_array_elements(l.items) i where i ->> 'type' = 'q'), l.title,
         null, null, null, null, l.owner_id, coalesce(nullif(p.full_name, ''), p.email),
         l.updated_at, l.visibility, null
  from lessons l
  left join profiles p on p.id = l.owner_id
  where l.school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin')
    and exists (select 1 from jsonb_array_elements(l.items) i where i ->> 'type' = 'q')
$$;
revoke all on function public.school_question_uses() from public, anon;
grant execute on function public.school_question_uses() to authenticated;

-- 2. Holds ---------------------------------------------------------------------------------------------------------
create table if not exists public.question_holds (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) default public.my_school(),
  exam_slug          text not null check (char_length(exam_slug) between 1 and 80),
  -- a question key, or '*' for the whole booklet
  qkey               text not null default '*' check (char_length(qkey) between 1 and 80),
  -- reserved for simulacros: no homework, practice, live game or class may use it
  reserve            boolean not null default false,
  -- not offered to students in free practice (assigned activities still show it)
  hide_from_students boolean not null default false,
  label              text not null default '' check (char_length(label) <= 120),
  -- the hold ends by itself after this moment (null: until someone releases it)
  until              timestamptz,
  -- the simulacro the questions were reserved for; deleting it keeps the hold
  assignment_id      uuid references public.assignments (id) on delete set null,
  created_by         uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (school_id, exam_slug, qkey)
);
create index if not exists question_holds_school_idx on public.question_holds (school_id, exam_slug);

alter table public.question_holds enable row level security;
drop policy if exists qh_select on public.question_holds;
create policy qh_select on public.question_holds for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists qh_insert on public.question_holds;
create policy qh_insert on public.question_holds for insert
  with check (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
-- A hold is changed or released by whoever set it, or by coordination.
drop policy if exists qh_update on public.question_holds;
create policy qh_update on public.question_holds for update
  using (school_id = public.my_school() and (created_by = auth.uid() or public.my_role() = 'school_admin'))
  with check (school_id = public.my_school());
drop policy if exists qh_delete on public.question_holds;
create policy qh_delete on public.question_holds for delete
  using (school_id = public.my_school() and (created_by = auth.uid() or public.my_role() = 'school_admin'));

-- What the signed-in person's school hides from free practice. qkey null = the whole booklet.
create or replace function public.hidden_questions()
returns table (exam_slug text, qkey text)
language sql stable security definer set search_path = public as $$
  select h.exam_slug, nullif(h.qkey, '*')
  from question_holds h
  where h.school_id = public.my_school() and h.hide_from_students and (h.until is null or h.until >= now())
$$;
revoke all on function public.hidden_questions() from public, anon;
grant execute on function public.hidden_questions() to authenticated;

-- 3. Rules ---------------------------------------------------------------------------------------------------------
-- { "cross": "block|warn|off", "repeat": "block|warn|off", "reserved": "block|warn|off", "reach": "group|school" }
create table if not exists public.question_rules (
  school_id  uuid primary key references public.schools (id) default public.my_school(),
  rules      jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) < 4000),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.question_rules enable row level security;
drop policy if exists qr_select on public.question_rules;
create policy qr_select on public.question_rules for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists qr_write on public.question_rules;
create policy qr_write on public.question_rules for all
  using (school_id = public.my_school() and public.my_role() = 'school_admin')
  with check (school_id = public.my_school() and public.my_role() = 'school_admin');

grant select, insert, update, delete on public.question_holds, public.question_rules to authenticated;

notify pgrst, 'reload schema';
