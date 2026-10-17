-- M2 follow-up: attempt limits and opening/closing enforced by the database, role management by the coordinator,
-- and consent records. Run after 0001 and 0002.

-- ---------------------------------------------------------------- attempt limits
alter table public.assignments
  add column if not exists max_attempts int check (max_attempts is null or max_attempts between 1 and 20);

-- Counting existing attempts inside the policy would make the policy refer to its own table (recursion),
-- so the count goes through a security-definer function.
create or replace function public.attempts_used(p_assignment uuid, p_client text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from attempts
  where assignment_id = p_assignment and profile_id = auth.uid() and client_id <> p_client
$$;

-- A student can start an attempt only while the assignment is open (not before opens_at, not after due_at plus two
-- hours of grace for a phone that was offline) and while attempts remain. A retried upload of the same attempt
-- (same client_id) never counts against the limit.
drop policy if exists attempts_insert on public.attempts;
create policy attempts_insert on public.attempts for insert
  with check (
    profile_id = auth.uid()
    and (assignment_id is null or exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and public.is_course_member(a.course_id)
        and a.status = 'active'
        and a.opens_at <= now()
        and (a.due_at is null or now() <= a.due_at + interval '2 hours')
        and (a.max_attempts is null or public.attempts_used(a.id, client_id) < a.max_attempts)
    ))
  );

-- ---------------------------------------------------------------- roles
-- Only the coordinator of a school changes roles, only inside that school, never their own.
create or replace function public.set_profile_role(p_profile uuid, p_role text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v_row profiles;
begin
  if public.my_role() is distinct from 'school_admin' then raise exception 'not_allowed'; end if;
  if p_role not in ('student', 'teacher', 'school_admin') then raise exception 'bad_role'; end if;
  if p_profile = auth.uid() then raise exception 'not_yourself'; end if;
  update profiles set role = p_role
   where id = p_profile and school_id = public.my_school()
   returning * into v_row;
  if not found then raise exception 'not_found'; end if;
  return v_row;
end $$;
revoke all on function public.set_profile_role(uuid, text) from public, anon;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------- consent
-- Per person: accepted terms and, for adults, optional use of results for calibration.
create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('terms', 'results_calibration')),
  version    text not null,
  granted_at timestamptz not null default now(),
  unique (profile_id, kind, version)
);
-- The school records, once per school, that it holds the guardians' authorization for its minors.
create table if not exists public.school_consents (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  kind       text not null check (kind in ('guardian_authorization', 'results_calibration')),
  version    text not null,
  granted_by uuid not null references public.profiles (id),
  granted_at timestamptz not null default now(),
  unique (school_id, kind, version)
);
alter table public.consents enable row level security;
alter table public.school_consents enable row level security;

create policy consents_select on public.consents for select
  using (profile_id = auth.uid() or (public.my_role() = 'school_admin'
         and exists (select 1 from public.profiles p where p.id = consents.profile_id and p.school_id = public.my_school())));
create policy consents_insert on public.consents for insert with check (profile_id = auth.uid());

create policy school_consents_select on public.school_consents for select
  using (school_id = public.my_school());
create policy school_consents_insert on public.school_consents for insert
  with check (school_id = public.my_school() and granted_by = auth.uid() and public.my_role() = 'school_admin');
