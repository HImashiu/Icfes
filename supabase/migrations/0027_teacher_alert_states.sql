-- 0027: what each teacher did with a progress alert on Hoy ("Listo", "Posponer", already seen), so it follows the
-- teacher to any device. One row per teacher and alert; only the teacher reads or writes their own rows. Re-runnable.
-- Before this runs the app keeps the same data in the browser.

create table if not exists public.teacher_alert_states (
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  alert_id   text not null check (char_length(alert_id) between 1 and 200),
  sig        text not null default '' check (char_length(sig) <= 200),
  state      text not null check (state in ('seen', 'done', 'snoozed')),
  until      date,
  updated_at timestamptz not null default now(),
  primary key (teacher_id, alert_id)
);

alter table public.teacher_alert_states enable row level security;

drop policy if exists tas_select on public.teacher_alert_states;
create policy tas_select on public.teacher_alert_states for select using (teacher_id = auth.uid());
drop policy if exists tas_insert on public.teacher_alert_states;
create policy tas_insert on public.teacher_alert_states for insert
  with check (teacher_id = auth.uid() and public.my_role() in ('teacher', 'school_admin'));
drop policy if exists tas_update on public.teacher_alert_states;
create policy tas_update on public.teacher_alert_states for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists tas_delete on public.teacher_alert_states;
create policy tas_delete on public.teacher_alert_states for delete using (teacher_id = auth.uid());

create or replace function public.tas_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists tas_touch on public.teacher_alert_states;
create trigger tas_touch before update on public.teacher_alert_states for each row execute function public.tas_touch();

grant select, insert, update, delete on public.teacher_alert_states to authenticated;

notify pgrst, 'reload schema';
