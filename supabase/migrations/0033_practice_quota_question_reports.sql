-- 0033 · Free practice: a daily allowance of questions per student, and question reports the editor can review.
-- 1) Daily allowance. Free practice runs (not teacher assignments) take their questions from today's allowance;
--    a run is drawn at random and shortened when the allowance runs out. The number is app_limits.questions_per_day
--    (default 40, change it in the dashboard, no deploy). Only the functions below touch practice_usage.
-- 2) Question reports ("Reportar un error") get a category and the exam's slug, and a summary view for the editor.
-- Runs after 0032. Re-runnable.

insert into public.app_limits (key, value) values ('questions_per_day', 40) on conflict (key) do nothing;

create table if not exists public.practice_usage (
  user_id   uuid not null,
  day       date not null default (now() at time zone 'America/Bogota')::date,
  questions int  not null default 0,
  primary key (user_id, day)
);
alter table public.practice_usage enable row level security;
revoke all on public.practice_usage from anon, authenticated;

create or replace function public.practice_quota()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_limit int := coalesce((select value from app_limits where key = 'questions_per_day'), 40);
  v_used int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select coalesce((select questions from practice_usage where user_id = v_uid and day = v_day), 0) into v_used;
  return json_build_object('used', v_used, 'limit', v_limit, 'remaining', greatest(v_limit - v_used, 0));
end $$;

create or replace function public.take_practice_questions(p_count int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_limit int := coalesce((select value from app_limits where key = 'questions_per_day'), 40);
  v_want int := greatest(coalesce(p_count, 0), 0);
  v_used int;
  v_grant int;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  insert into practice_usage (user_id, day, questions) values (v_uid, v_day, 0) on conflict (user_id, day) do nothing;
  select questions into v_used from practice_usage where user_id = v_uid and day = v_day for update;
  v_grant := least(v_want, greatest(v_limit - v_used, 0));
  update practice_usage set questions = questions + v_grant where user_id = v_uid and day = v_day;
  return json_build_object('granted', v_grant, 'used', v_used + v_grant, 'limit', v_limit,
                           'remaining', greatest(v_limit - v_used - v_grant, 0));
end $$;

revoke all on function public.practice_quota() from public, anon;
revoke all on function public.take_practice_questions(int) from public, anon;
grant execute on function public.practice_quota() to authenticated;
grant execute on function public.take_practice_questions(int) to authenticated;

-- Question reports: which question, which exam, which kind of problem.
alter table public.public_feedback add column if not exists category text check (category is null or char_length(category) <= 40);
alter table public.public_feedback add column if not exists exam_slug text check (exam_slug is null or char_length(exam_slug) <= 80);

-- The editor's review list: one line per question and kind of problem, newest message first. Dashboard only.
create or replace view public.question_reports with (security_invoker = true) as
  select f.exam_slug, f.exam, f.question_key, f.question_number, f.category,
         count(*) as reports, max(f.created_at) as last_at,
         (array_agg(f.message order by f.created_at desc))[1] as latest_message
    from public.public_feedback f
   where f.kind = 'question'
   group by f.exam_slug, f.exam, f.question_key, f.question_number, f.category
   order by reports desc, last_at desc;
revoke all on public.question_reports from anon, authenticated;

notify pgrst, 'reload schema';
