-- 0029 · Public demo: question flags, general feedback, school contact requests and the launch-discount waitlist.
-- Anyone (signed in or not) can INSERT feedback here through the public app; nobody can read these tables through the API.
-- Juan reads them in the Supabase dashboard (SQL editor / table editor), which bypasses row-level security.
-- Runs after 0003-0028. Re-runnable.

create table if not exists public.public_feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('question', 'general', 'school')),
  exam text check (char_length(exam) <= 200),
  question_key text check (char_length(question_key) <= 200),
  question_number int check (question_number is null or question_number between 1 and 500),
  message text not null check (char_length(message) between 1 and 2000),
  contact text check (char_length(contact) <= 200),
  client text check (char_length(client) <= 64),
  created_at timestamptz not null default now()
);

-- Older copies of this table (first draft of 0029) only allowed 'question' and 'general'.
alter table public.public_feedback drop constraint if exists public_feedback_kind_check;
alter table public.public_feedback add constraint public_feedback_kind_check check (kind in ('question', 'general', 'school'));

create table if not exists public.launch_waitlist (
  email text primary key check (char_length(email) between 5 and 200 and email like '%@%.%'),
  source text check (char_length(source) <= 64),
  created_at timestamptz not null default now()
);

alter table public.public_feedback enable row level security;
alter table public.launch_waitlist enable row level security;

-- Supabase grants table rights to anon/authenticated by default; stated here so the intent is explicit.
grant insert on public.public_feedback to anon, authenticated;

drop policy if exists pf_insert_anyone on public.public_feedback;
create policy pf_insert_anyone on public.public_feedback for insert to anon, authenticated with check (true);

-- The waitlist has no insert policy: only this function writes to it, so it can't be filled with arbitrary rows.
-- The waitlist keeps one row per address: a repeat sign-up just succeeds without changing anything.
create or replace function public.join_launch_waitlist(p_email text, p_source text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.launch_waitlist (email, source)
  values (lower(trim(p_email)), left(p_source, 64))
  on conflict (email) do nothing;
$$;
grant execute on function public.join_launch_waitlist(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
