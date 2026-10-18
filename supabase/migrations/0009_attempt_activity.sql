-- Teachers can see how each student worked: which questions got a hint and where they changed an answer.
-- Time per question already lives in attempts.times; this adds the rest. Empty by default, so older attempts keep working.
-- After running it: notify pgrst, 'reload schema';
alter table public.attempts add column if not exists activity jsonb not null default '{}'::jsonb;
