-- Personal reinforcement assignments, paper simulacro results entered by the teacher, and family report links.
-- Run after 0005.

-- ---------------------------------------------------------------- work for one student (reinforcement plans)
alter table public.assignments
  add column if not exists assignee_id uuid references public.profiles (id) on delete cascade;

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select
  using (public.is_course_teacher(course_id)
         or (public.is_course_member(course_id) and status <> 'draft' and (assignee_id is null or assignee_id = auth.uid())));

drop policy if exists attempts_insert on public.attempts;
create policy attempts_insert on public.attempts for insert
  with check (
    profile_id = auth.uid()
    and (assignment_id is null or exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.is_course_member(a.course_id)
        and (a.assignee_id is null or a.assignee_id = auth.uid())
        and a.status = 'active'
        and a.opens_at <= now()
        and (a.due_at is null or now() <= a.due_at + interval '2 hours')
        and (a.max_attempts is null or public.attempts_used(a.id, client_id) < a.max_attempts)
    ))
  );

-- ---------------------------------------------------------------- paper simulacro
alter table public.attempts drop constraint if exists attempts_mode_check;
alter table public.attempts add constraint attempts_mode_check check (mode in ('practice', 'timed', 'paper'));

-- The teacher enters (or the phone scan reads) a student's paper sheet. Only for students of the teacher's course.
create or replace function public.paper_submit(p_assignment uuid, p_profile uuid, p_answers jsonb, p_score jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_a assignments;
begin
  select * into v_a from assignments where id = p_assignment;
  if not found or not public.is_course_teacher(v_a.course_id) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from course_members where course_id = v_a.course_id and profile_id = p_profile and role = 'student') then
    raise exception 'not_a_student_of_course';
  end if;
  insert into attempts (profile_id, assignment_id, client_id, exam_slug, scope, mode, started_at, submitted_at, answers, score, device)
  values (p_profile, p_assignment, 'paper-' || p_assignment::text, v_a.exam_slug, v_a.scope, 'paper', now(), now(), p_answers, p_score, 'paper')
  on conflict (profile_id, client_id) do update
    set answers = excluded.answers, score = excluded.score, submitted_at = now();
end $$;
revoke all on function public.paper_submit(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.paper_submit(uuid, uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- family reports
-- A one-page summary a school sends to a family. The link carries a random token; no login is needed to read it.
-- Allowed only after the school records the guardians' authorization (school_consents).
create table if not exists public.family_reports (
  token      text primary key,
  school_id  uuid not null references public.schools (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  payload    jsonb not null check (pg_column_size(payload) < 20000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked    boolean not null default false
);
create index if not exists family_reports_profile_idx on public.family_reports (profile_id);
alter table public.family_reports enable row level security;
create policy family_reports_select on public.family_reports for select
  using (school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));

create or replace function public.create_family_report(p_profile uuid, p_payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_student profiles; v_token text;
begin
  select * into v_me from profiles where id = auth.uid();
  if not found or v_me.role not in ('teacher', 'school_admin') then raise exception 'not_allowed'; end if;
  select * into v_student from profiles where id = p_profile and school_id = v_me.school_id;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from school_consents where school_id = v_me.school_id and kind = 'guardian_authorization') then
    raise exception 'no_guardian_authorization';
  end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into family_reports (token, school_id, profile_id, created_by, payload) values (v_token, v_me.school_id, p_profile, v_me.id, p_payload);
  return v_token;
end $$;

create or replace function public.revoke_family_report(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update family_reports set revoked = true where token = p_token and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin');
  if not found then raise exception 'not_found'; end if;
end $$;

-- Public read: returns the payload plus the school name, or null when the link is unknown, revoked or expired.
create or replace function public.family_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select r.payload || jsonb_build_object('school', s.name, 'created_at', r.created_at)
  from family_reports r join schools s on s.id = r.school_id
  where r.token = p_token and not r.revoked and r.expires_at > now()
$$;

revoke all on function public.create_family_report(uuid, jsonb), public.revoke_family_report(text) from public, anon;
grant execute on function public.create_family_report(uuid, jsonb), public.revoke_family_report(text) to authenticated;
revoke all on function public.family_report(text) from public;
grant execute on function public.family_report(text) to anon, authenticated;
