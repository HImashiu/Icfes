-- 0023: an activity is answered online or on paper.
-- Paper activities are printed (booklet + bubble sheet) and scanned; students see them in their list as
-- "En papel, en el salón" and never open their questions in the app. Safe to run more than once.
alter table public.assignments add column if not exists delivery text not null default 'online';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_delivery_check') then
    alter table public.assignments add constraint assignments_delivery_check check (delivery in ('online', 'paper'));
  end if;
end $$;
