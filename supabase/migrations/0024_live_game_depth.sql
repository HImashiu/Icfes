-- 0024: a deeper live game. Game modes, a class goal, "sure / unsure" answers, pause and added time, asking a
-- question again after the class discussed it, the letters accepted at each question kept for the report, and the
-- class's share of right answers sent to every phone. Re-runnable. Needs 0004 (live_sessions).
-- Still no ranking: the share the phones receive is the whole class's, never a position.

alter table public.live_sessions add column if not exists mode text not null default 'classic';
alter table public.live_sessions drop constraint if exists live_sessions_mode_check;
alter table public.live_sessions add constraint live_sessions_mode_check check (mode in ('classic', 'accuracy', 'class_goal'));
alter table public.live_sessions add column if not exists goal_pct int;
alter table public.live_sessions drop constraint if exists live_sessions_goal_check;
alter table public.live_sessions add constraint live_sessions_goal_check check (goal_pct is null or goal_pct between 10 and 100);
alter table public.live_sessions add column if not exists ask_confidence boolean not null default false;
alter table public.live_sessions add column if not exists extra_seconds int not null default 0;
alter table public.live_sessions add column if not exists paused_at timestamptz;
-- index (as text) -> index of the question this round asks again
alter table public.live_sessions add column if not exists reasks jsonb not null default '{}'::jsonb;
-- index (as text) -> letters accepted when it closed
alter table public.live_sessions add column if not exists closed jsonb not null default '{}'::jsonb;
-- { "pct": 72, "overall": 65, "answered": 25 } for the question just closed, written by the host
alter table public.live_sessions add column if not exists class_stats jsonb;
alter table public.live_sessions add column if not exists ended_at timestamptz;

alter table public.live_answers add column if not exists confident boolean;

-- An answer is accepted only for the open question, not while it is paused, inside its time plus added time
-- (and two seconds for network lag).
create or replace function public.live_answer_open(p_session uuid, p_index int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_sessions
    where id = p_session and state = 'question' and current_index = p_index and paused_at is null
      and now() <= question_started_at + make_interval(secs => seconds_per_question + extra_seconds + 2)
  )
$$;

-- Settings chosen in the lobby (or changed between questions).
create or replace function public.live_configure(p_session uuid, p_mode text, p_goal int, p_confidence boolean)
returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set
    mode = case when p_mode in ('classic', 'accuracy', 'class_goal') then p_mode else mode end,
    goal_pct = case when p_goal between 10 and 100 then p_goal else null end,
    ask_confidence = coalesce(p_confidence, false)
   where id = p_session and state <> 'ended' returning * into v_row;
  if not found then raise exception 'not_allowed'; end if;
  return v_row;
end $$;

-- Opening a question clears the pause, the added time and the class share of the previous one.
create or replace function public.live_next(p_session uuid, p_index int) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set state = 'question', current_index = p_index, question_started_at = now(), current_correct = '{}',
         extra_seconds = 0, paused_at = null, class_stats = null
   where id = p_session and state <> 'ended' and p_index >= 0 and p_index < cardinality(question_keys)
   returning * into v_row;
  if not found then raise exception 'bad_question'; end if;
  return v_row;
end $$;

-- Pause stops the clock; resuming moves the start forward by the paused time, so nobody loses seconds.
create or replace function public.live_pause(p_session uuid, p_pause boolean) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  if p_pause then
    update live_sessions set paused_at = now() where id = p_session and state = 'question' and paused_at is null returning * into v_row;
  else
    update live_sessions set question_started_at = question_started_at + (now() - paused_at), paused_at = null
     where id = p_session and state = 'question' and paused_at is not null returning * into v_row;
  end if;
  if v_row.id is null then select * into v_row from live_sessions where id = p_session; end if;
  return v_row;
end $$;

create or replace function public.live_add_time(p_session uuid, p_seconds int) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set extra_seconds = least(600, extra_seconds + greatest(5, least(120, coalesce(p_seconds, 15))))
   where id = p_session and state = 'question' returning * into v_row;
  if not found then select * into v_row from live_sessions where id = p_session; end if;
  return v_row;
end $$;

-- p_points: [{"player_id": "...", "points": 850}, ...] computed by the host from the server timestamps.
-- Also keeps the accepted letters of this question in `closed` for the report.
create or replace function public.live_reveal(p_session uuid, p_correct text[], p_points jsonb) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions; v_idx int; v_pts jsonb;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  select current_index into v_idx from live_sessions where id = p_session and state = 'question';
  if not found then raise exception 'not_in_question'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('player_id', x ->> 'player_id', 'points', greatest(0, least(2000, (x ->> 'points')::int)))), '[]'::jsonb)
    into v_pts from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) x;
  update live_answers a set points = t.points
    from jsonb_to_recordset(v_pts) as t(player_id uuid, points int)
   where a.session_id = p_session and a.question_index = v_idx and a.player_id = t.player_id;
  -- A re-ask round (no points) leaves streaks as they were.
  update live_players p set
    score = p.score + coalesce((select t.points from jsonb_to_recordset(v_pts) as t(player_id uuid, points int) where t.player_id = p.player_id), 0),
    streak = case
      when (select reasks ? v_idx::text from live_sessions where id = p_session) then p.streak
      when coalesce((select t.points from jsonb_to_recordset(v_pts) as t(player_id uuid, points int) where t.player_id = p.player_id), 0) > 0 then p.streak + 1
      else 0 end
   where p.session_id = p_session;
  update live_sessions set state = 'reveal', current_correct = coalesce(p_correct, '{}'), paused_at = null,
         closed = closed || jsonb_build_object(v_idx::text, to_jsonb(coalesce(p_correct, '{}')))
   where id = p_session returning * into v_row;
  return v_row;
end $$;

-- Ask the question just revealed once more, right after it (the class discussed it first). Only from "reveal".
create or replace function public.live_reask(p_session uuid) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions; v_idx int; v_keys text[]; v_orig int;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  select * into v_row from live_sessions where id = p_session and state = 'reveal';
  if not found then raise exception 'not_in_reveal'; end if;
  if cardinality(v_row.question_keys) >= 100 then raise exception 'too_many_questions'; end if;
  v_idx := v_row.current_index;
  v_keys := v_row.question_keys;
  v_orig := coalesce((v_row.reasks ->> v_idx::text)::int, v_idx);
  update live_sessions set
    question_keys = v_keys[1:v_idx + 1] || v_keys[v_idx + 1] || coalesce(v_keys[v_idx + 2:cardinality(v_keys)], '{}'),
    reasks = reasks || jsonb_build_object((v_idx + 1)::text, v_orig)
   where id = p_session;
  return public.live_next(p_session, v_idx + 1);
end $$;

-- The class's share of right answers for the question just closed, for every phone. Never per player.
create or replace function public.live_share(p_session uuid, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set class_stats = jsonb_build_object(
      'pct', least(100, greatest(0, (p_stats ->> 'pct')::int)),
      'overall', least(100, greatest(0, (p_stats ->> 'overall')::int)),
      'answered', greatest(0, (p_stats ->> 'answered')::int))
   where id = p_session;
end $$;

create or replace function public.live_end(p_session uuid) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set state = 'ended', paused_at = null, ended_at = coalesce(ended_at, now()) where id = p_session returning * into v_row;
  return v_row;
end $$;

revoke all on function public.live_configure(uuid, text, int, boolean), public.live_pause(uuid, boolean), public.live_add_time(uuid, int),
  public.live_reask(uuid), public.live_share(uuid, jsonb) from public, anon;
grant execute on function public.live_configure(uuid, text, int, boolean), public.live_pause(uuid, boolean), public.live_add_time(uuid, int),
  public.live_reask(uuid), public.live_share(uuid, jsonb) to authenticated;
