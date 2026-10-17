-- Teachers decide whether an assignment offers the AI hint ("Ver pista") before answering. On by default,
-- so assignments made before this column existed keep showing hints.
alter table public.assignments add column if not exists allow_hints boolean not null default true;
