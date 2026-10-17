-- Teachers and school admins decide whether a practice assignment shows the right answer as soon as the student
-- checks it ("Comprobar") or only at the end. On by default, so older assignments keep immediate feedback.
alter table public.assignments add column if not exists instant_feedback boolean not null default true;
