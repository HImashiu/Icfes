-- Chart builder: a teacher's saved charts. Each row keeps only the chart recipe (rows, columns, metric, filters),
-- never data, so a saved chart always shows the current numbers. Private to the teacher who saved it.
-- Re-runnable. After running it: notify pgrst, 'reload schema';

create table if not exists public.saved_charts (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id),
  owner_id   uuid not null references public.profiles (id) default auth.uid(),
  name       text not null check (char_length(name) between 1 and 80),
  spec       jsonb not null check (pg_column_size(spec) < 20000),
  created_at timestamptz not null default now()
);
create index if not exists saved_charts_owner on public.saved_charts (owner_id, created_at desc);
alter table public.saved_charts enable row level security;

drop policy if exists sc_select on public.saved_charts;
create policy sc_select on public.saved_charts for select
  using (owner_id = auth.uid() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists sc_insert on public.saved_charts;
create policy sc_insert on public.saved_charts for insert
  with check (owner_id = auth.uid() and school_id = public.my_school() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists sc_update on public.saved_charts;
create policy sc_update on public.saved_charts for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and school_id = public.my_school());
drop policy if exists sc_delete on public.saved_charts;
create policy sc_delete on public.saved_charts for delete using (owner_id = auth.uid());

notify pgrst, 'reload schema';
