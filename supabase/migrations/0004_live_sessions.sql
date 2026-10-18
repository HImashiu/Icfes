-- M3b: live answering (Kahoot style). The teacher hosts a room; students and guests join with a 6-digit code.
-- Question content is never stored here: a room only holds the booklet slug and question keys.
-- The app polls these tables every second or two, so Realtime does not need to be enabled.
-- Guests join through Supabase anonymous sign-in (Authentication > Sign In / Providers > "Allow anonymous sign-ins").

create table if not exists public.live_sessions (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  host_id             uuid not null references public.profiles (id),
  school_id           uuid not null references public.schools (id),
  course_id           uuid references public.courses (id) on delete set null,
  title               text not null default '',
  exam_slug           text not null,
  question_keys       text[] not null check (cardinality(question_keys) between 1 and 100),
  seconds_per_question int not null default 60 check (seconds_per_question between 10 and 300),
  state               text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'ended')),
  current_index       int not null default -1,
  question_started_at timestamptz,
  -- letters that count as right for the question just revealed (the teacher may accept more than one)
  current_correct     text[] not null default '{}',
  created_at          timestamptz not null default now()
);
create unique index if not exists live_sessions_open_code on public.live_sessions (code) where state <> 'ended';
create index if not exists live_sessions_host_idx on public.live_sessions (host_id, created_at desc);

-- player_id is auth.uid(): a signed-in student or an anonymous guest.
create table if not exists public.live_players (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  player_id  uuid not null,
  nickname   text not null check (char_length(btrim(nickname)) between 1 and 24),
  profile_id uuid references public.profiles (id) on delete set null,
  score      int not null default 0,
  streak     int not null default 0,
  joined_at  timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.live_answers (
  session_id     uuid not null,
  player_id      uuid not null,
  question_index int not null check (question_index >= 0),
  option         text not null check (option ~ '^[A-H]$'),
  answered_at    timestamptz not null default now(),
  points         int not null default 0,
  primary key (session_id, player_id, question_index),
  foreign key (session_id, player_id) references public.live_players (session_id, player_id) on delete cascade
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_live_host(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from live_sessions where id = p_session and host_id = auth.uid())
$$;
create or replace function public.is_live_player(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from live_players where session_id = p_session and player_id = auth.uid())
$$;
-- An answer is accepted only for the open question, inside its time (plus two seconds for network lag).
create or replace function public.live_answer_open(p_session uuid, p_index int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_sessions
    where id = p_session and state = 'question' and current_index = p_index
      and now() <= question_started_at + make_interval(secs => seconds_per_question + 2)
  )
$$;

-- ---------------------------------------------------------------- row-level security
alter table public.live_sessions enable row level security;
alter table public.live_players  enable row level security;
alter table public.live_answers  enable row level security;

drop policy if exists live_sessions_select on public.live_sessions;
create policy live_sessions_select on public.live_sessions for select
  using (host_id = auth.uid() or public.is_live_player(id));
drop policy if exists live_players_select on public.live_players;
create policy live_players_select on public.live_players for select
  using (public.is_live_host(session_id) or public.is_live_player(session_id));
drop policy if exists live_answers_select on public.live_answers;
create policy live_answers_select on public.live_answers for select
  using (player_id = auth.uid() or public.is_live_host(session_id));
drop policy if exists live_answers_insert on public.live_answers;
create policy live_answers_insert on public.live_answers for insert
  with check (player_id = auth.uid() and public.live_answer_open(session_id, question_index));
-- No update or delete policies: answers are final, and scores change only through the functions below.

-- ---------------------------------------------------------------- functions
create or replace function public.live_create(p_title text, p_exam text, p_keys text[], p_seconds int, p_course uuid default null)
returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_profile profiles; v_code text; v_row live_sessions; v_try int := 0;
begin
  select * into v_profile from profiles where id = auth.uid();
  if not found or v_profile.role not in ('teacher', 'school_admin') then raise exception 'not_allowed'; end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from live_sessions where code = v_code and state <> 'ended');
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'no_code_available'; end if;
  end loop;
  insert into live_sessions (code, host_id, school_id, course_id, title, exam_slug, question_keys, seconds_per_question)
  values (v_code, v_profile.id, v_profile.school_id, p_course, coalesce(p_title, ''), p_exam, p_keys, coalesce(p_seconds, 60))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.live_join(p_code text, p_nickname text) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_session live_sessions; v_profile uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into v_session from live_sessions where code = btrim(p_code) and state <> 'ended';
  if not found then raise exception 'session_not_found'; end if;
  select id into v_profile from profiles where id = auth.uid();
  insert into live_players (session_id, player_id, nickname, profile_id)
  values (v_session.id, auth.uid(), left(btrim(p_nickname), 24), v_profile)
  on conflict (session_id, player_id) do update set nickname = excluded.nickname;
  return v_session;
end $$;

create or replace function public.live_next(p_session uuid, p_index int) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set state = 'question', current_index = p_index, question_started_at = now(), current_correct = '{}'
   where id = p_session and state <> 'ended' and p_index >= 0 and p_index < cardinality(question_keys)
   returning * into v_row;
  if not found then raise exception 'bad_question'; end if;
  return v_row;
end $$;

-- p_points: [{"player_id": "...", "points": 850}, ...] computed by the host from the server timestamps.
create or replace function public.live_reveal(p_session uuid, p_correct text[], p_points jsonb) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions; v_idx int; v_pts jsonb;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  select current_index into v_idx from live_sessions where id = p_session and state = 'question';
  if not found then raise exception 'not_in_question'; end if;
  -- keep each award between 0 and 2000
  select coalesce(jsonb_agg(jsonb_build_object('player_id', x ->> 'player_id', 'points', greatest(0, least(2000, (x ->> 'points')::int)))), '[]'::jsonb)
    into v_pts from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) x;
  update live_answers a set points = t.points
    from jsonb_to_recordset(v_pts) as t(player_id uuid, points int)
   where a.session_id = p_session and a.question_index = v_idx and a.player_id = t.player_id;
  update live_players p set
    score = p.score + coalesce((select t.points from jsonb_to_recordset(v_pts) as t(player_id uuid, points int) where t.player_id = p.player_id), 0),
    streak = case when coalesce((select t.points from jsonb_to_recordset(v_pts) as t(player_id uuid, points int) where t.player_id = p.player_id), 0) > 0 then p.streak + 1 else 0 end
   where p.session_id = p_session;
  update live_sessions set state = 'reveal', current_correct = coalesce(p_correct, '{}')
   where id = p_session returning * into v_row;
  return v_row;
end $$;

create or replace function public.live_end(p_session uuid) returns public.live_sessions
language plpgsql security definer set search_path = public as $$
declare v_row live_sessions;
begin
  if not public.is_live_host(p_session) then raise exception 'not_allowed'; end if;
  update live_sessions set state = 'ended' where id = p_session returning * into v_row;
  return v_row;
end $$;

-- Phones calibrate their countdown against the database clock with this.
create or replace function public.live_now() returns timestamptz
language sql stable as $$ select now() $$;

revoke all on function public.live_now() from public, anon;
grant execute on function public.live_now() to authenticated;

revoke all on function public.live_create(text, text, text[], int, uuid), public.live_join(text, text),
  public.live_next(uuid, int), public.live_reveal(uuid, text[], jsonb), public.live_end(uuid) from public, anon;
grant execute on function public.live_create(text, text, text[], int, uuid), public.live_join(text, text),
  public.live_next(uuid, int), public.live_reveal(uuid, text[], jsonb), public.live_end(uuid) to authenticated;
