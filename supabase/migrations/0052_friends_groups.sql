-- 0052 Amigos y parches: friends, opt-in progress sharing, cheers, and the cooperative side of study groups (parches,
-- migration 0050): group streak, weekly group missions, group challenges, group practice (the same questions for
-- everyone) and invitations from a friend.
--
-- Juan's rule (2026-10-17): no ranking. Nothing here orders students by a score or shows rank positions. Lists come
-- in alphabetical order; groups add up their work against a shared goal.
--
-- Privacy: a student's progress is hidden from friends until they choose to share it (friend_cards.share):
--   'nada'      friends only see the name (the default)
--   'basico'    practiced today, current streak, days and questions this week
--   'completo'  also questions and percent correct per area over the last 30 days
-- Members of a parche already see each other's "practiced today" and days this week (0050); this adds nothing more.
--
-- Additive and re-runnable. Needs 0037 (answer_log) and 0050 (growth helpers, study groups).

-- ------------------------------------------------------------------------------------------------ helpers

create or replace function public.fg_today()
returns date language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

create or replace function public.fg_monday()
returns date language sql stable as $$ select fg_today() - ((extract(isodow from fg_today())::int) - 1) $$;

-- Bogotá midnight of a day, as a timestamptz (for index-friendly range filters on answer_log).
create or replace function public.fg_start(p_day date)
returns timestamptz language sql immutable as $$ select (p_day::timestamp) at time zone 'America/Bogota' $$;

-- Days (Bogotá) on which a student answered at least one question since p_from.
create or replace function public.fg_days(p_uid uuid, p_from date)
returns setof date language sql stable security definer set search_path = public as $$
  select distinct (answered_at at time zone 'America/Bogota')::date from answer_log
   where user_id = p_uid and answered_at >= fg_start(p_from);
$$;

-- Consecutive days with practice, counting back from today; a streak still stands today if yesterday counted.
create or replace function public.fg_streak(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_days date[]; v_d date := fg_today(); v_n int := 0;
begin
  select array_agg(d) into v_days from fg_days(p_uid, fg_today() - 400) d;
  if v_days is null then return 0; end if;
  if not (v_d = any (v_days)) then v_d := v_d - 1; end if;
  while v_d = any (v_days) loop v_n := v_n + 1; v_d := v_d - 1; end loop;
  return v_n;
end $$;

-- Racha juntos (Duolingo's friend streak): consecutive days on which both practiced.
create or replace function public.fg_together(p_a uuid, p_b uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_days date[]; v_d date := fg_today(); v_n int := 0;
begin
  select array_agg(d) into v_days from (select fg_days(p_a, fg_today() - 400) d intersect select fg_days(p_b, fg_today() - 400)) x;
  if v_days is null then return 0; end if;
  if not (v_d = any (v_days)) then v_d := v_d - 1; end if;
  while v_d = any (v_days) loop v_n := v_n + 1; v_d := v_d - 1; end loop;
  return v_n;
end $$;

revoke all on function public.fg_days(uuid, date), public.fg_streak(uuid), public.fg_together(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ friend cards

create table if not exists public.friend_cards (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  code         text not null unique check (code ~ '^[a-z0-9]{6}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  share        text not null default 'nada' check (share in ('nada', 'basico', 'completo')),
  created_at   timestamptz not null default now()
);
alter table public.friend_cards enable row level security;
revoke all on public.friend_cards from anon, authenticated;

-- The student's card, made on first use with their first name.
create or replace function public.fg_card(p_uid uuid)
returns public.friend_cards language plpgsql security definer set search_path = public as $$
declare v friend_cards; v_name text;
begin
  select * into v from friend_cards where user_id = p_uid;
  if found then return v; end if;
  select nullif(split_part(trim(full_name), ' ', 1), '') into v_name from profiles where id = p_uid;
  for i in 1..8 loop
    begin
      insert into friend_cards (user_id, code, display_name) values (p_uid, growth_code(6), left(coalesce(v_name, 'Estudiante'), 30))
      on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  select * into v from friend_cards where user_id = p_uid;
  return v;
end $$;
revoke all on function public.fg_card(uuid) from public, anon, authenticated;

create or replace function public.set_friend_card(p_name text, p_share text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v friend_cards;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform fg_card(v_uid);
  update friend_cards set
    display_name = coalesce(left(nullif(trim(p_name), ''), 30), display_name),
    share = case when p_share in ('nada', 'basico', 'completo') then p_share else share end
  where user_id = v_uid returning * into v;
  return json_build_object('code', v.code, 'name', v.display_name, 'share', v.share);
end $$;

-- Who a code belongs to, for the "add friend" screen: the chosen name only.
create or replace function public.friend_code_preview(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v friend_cards;
begin
  if growth_uid() is null then raise exception 'not_signed_in'; end if;
  select * into v from friend_cards where code = lower(trim(p_code));
  if not found then return null; end if;
  return json_build_object('name', v.display_name, 'me', v.user_id = growth_uid());
end $$;

-- ------------------------------------------------------------------------------------------------ friendships

create table if not exists public.friendships (
  a            uuid not null references auth.users (id) on delete cascade,
  b            uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (a, b),
  check (a < b)
);
create index if not exists friendships_b_idx on public.friendships (b);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

create or replace function public.fg_are_friends(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where a = least(p_x, p_y) and b = greatest(p_x, p_y) and status = 'accepted');
$$;
revoke all on function public.fg_are_friends(uuid, uuid) from public, anon, authenticated;

-- Send a request by code. If that person had already asked, this accepts it.
create or replace function public.add_friend(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_other uuid; v_row friendships;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform fg_card(v_uid);
  select user_id into v_other from friend_cards where code = lower(trim(p_code));
  if v_other is null then return json_build_object('error', 'unknown'); end if;
  if v_other = v_uid then return json_build_object('error', 'self'); end if;
  select * into v_row from friendships where a = least(v_uid, v_other) and b = greatest(v_uid, v_other);
  if found then
    if v_row.status = 'accepted' then return json_build_object('status', 'already'); end if;
    if v_row.requested_by = v_uid then return json_build_object('status', 'sent'); end if;
    update friendships set status = 'accepted', accepted_at = now() where a = v_row.a and b = v_row.b;
    return json_build_object('status', 'accepted');
  end if;
  if (select count(*) from friendships where v_uid in (a, b)) >= 150 then return json_build_object('error', 'too_many_friends'); end if;
  if not growth_rate_ok('fr:' || v_uid::text, 30, interval '1 day') then return json_build_object('error', 'too_many'); end if;
  insert into friendships (a, b, requested_by) values (least(v_uid, v_other), greatest(v_uid, v_other), v_uid);
  return json_build_object('status', 'sent');
end $$;

create or replace function public.answer_friend(p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now()
     where a = least(v_uid, p_user) and b = greatest(v_uid, p_user) and status = 'pending' and requested_by = p_user;
  else
    delete from friendships where a = least(v_uid, p_user) and b = greatest(v_uid, p_user) and status = 'pending';
  end if;
end $$;

create or replace function public.remove_friend(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if growth_uid() is null then raise exception 'not_signed_in'; end if;
  delete from friendships where a = least(growth_uid(), p_user) and b = greatest(growth_uid(), p_user);
end $$;

-- ------------------------------------------------------------------------------------------------ cheers

create table if not exists public.friend_cheers (
  id         bigint generated always as identity primary key,
  from_user  uuid not null references auth.users (id) on delete cascade,
  to_user    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('animo', 'bien', 'vamos', 'gracias')),
  group_id   uuid references public.study_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index if not exists friend_cheers_to_idx on public.friend_cheers (to_user, created_at desc);
alter table public.friend_cheers enable row level security;
revoke all on public.friend_cheers from anon, authenticated;

create or replace function public.fg_share_group(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from study_group_members m1 join study_group_members m2 on m2.group_id = m1.group_id
                  where m1.user_id = p_x and m2.user_id = p_y);
$$;
revoke all on function public.fg_share_group(uuid, uuid) from public, anon, authenticated;

-- A short cheer to a friend or a parche member: one per person per day.
create or replace function public.cheer(p_to uuid, p_kind text, p_group uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_to = v_uid or p_kind not in ('animo', 'bien', 'vamos', 'gracias') then return json_build_object('error', 'bad'); end if;
  if not (fg_are_friends(v_uid, p_to) or fg_share_group(v_uid, p_to)) then return json_build_object('error', 'not_friends'); end if;
  if exists (select 1 from friend_cheers where from_user = v_uid and to_user = p_to and created_at >= fg_start(fg_today())) then
    return json_build_object('error', 'already_today');
  end if;
  insert into friend_cheers (from_user, to_user, kind, group_id)
  values (v_uid, p_to, p_kind, case when p_group is not null and exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then p_group end);
  return json_build_object('ok', true);
end $$;

create or replace function public.mark_cheers_seen()
returns void language sql security definer set search_path = public as $$
  update friend_cheers set seen_at = now() where to_user = growth_uid() and seen_at is null;
$$;

-- ------------------------------------------------------------------------------------------------ group invites

create table if not exists public.study_group_invites (
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  to_user    uuid not null references auth.users (id) on delete cascade,
  from_user  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, to_user)
);
alter table public.study_group_invites enable row level security;
revoke all on public.study_group_invites from anon, authenticated;

create or replace function public.invite_to_group(p_group uuid, p_friend uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then return json_build_object('error', 'not_member'); end if;
  if not fg_are_friends(v_uid, p_friend) then return json_build_object('error', 'not_friends'); end if;
  if exists (select 1 from study_group_members where group_id = p_group and user_id = p_friend) then return json_build_object('status', 'already'); end if;
  insert into study_group_invites (group_id, to_user, from_user) values (p_group, p_friend, v_uid) on conflict do nothing;
  return json_build_object('status', 'sent');
end $$;

-- Accept (joins with the friend card's name, same limits as join_study_group) or decline.
create or replace function public.answer_group_invite(p_group uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from study_group_invites where group_id = p_group and to_user = v_uid) then return json_build_object('error', 'unknown'); end if;
  delete from study_group_invites where group_id = p_group and to_user = v_uid;
  if not p_accept then return json_build_object('status', 'declined'); end if;
  if exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then return json_build_object('status', 'already'); end if;
  if (select count(*) from study_group_members where group_id = p_group) >= 12 then return json_build_object('error', 'full'); end if;
  if (select count(*) from study_group_members where user_id = v_uid) >= 5 then return json_build_object('error', 'too_many_groups'); end if;
  v_name := (fg_card(v_uid)).display_name;
  insert into study_group_members (group_id, user_id, display_name) values (p_group, v_uid, v_name);
  return json_build_object('status', 'joined');
end $$;

-- ------------------------------------------------------------------------------------------------ my friends

create or replace function public.my_friends()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_me friend_cards;
  v_today date := fg_today();
  v_monday date := fg_monday();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_me := fg_card(v_uid);
  return json_build_object(
    'me', json_build_object('code', v_me.code, 'name', v_me.display_name, 'share', v_me.share, 'streak', fg_streak(v_uid),
                            'today', exists (select 1 from answer_log where user_id = v_uid and answered_at >= fg_start(v_today))),
    'friends', coalesce((
      select json_agg(x order by lower(x ->> 'name')) from (
        select json_build_object(
          'id', o.id, 'name', c.display_name, 'share', c.share, 'since', f.accepted_at,
          'cheered', exists (select 1 from friend_cheers h where h.from_user = v_uid and h.to_user = o.id and h.created_at >= fg_start(v_today)),
          'today', case when c.share <> 'nada' then exists (select 1 from answer_log l where l.user_id = o.id and l.answered_at >= fg_start(v_today)) end,
          'streak', case when c.share <> 'nada' then fg_streak(o.id) end,
          'together', case when c.share <> 'nada' and v_me.share <> 'nada' then fg_together(v_uid, o.id) end,
          'week_days', case when c.share <> 'nada' then (select count(*) from fg_days(o.id, v_monday)) end,
          'week_questions', case when c.share <> 'nada' then (select count(*) from answer_log l where l.user_id = o.id and l.answered_at >= fg_start(v_monday)) end,
          'areas', case when c.share = 'completo' then (
              select json_agg(json_build_object('area', area, 'answered', n, 'pct', case when k > 0 then round(100.0 * ok / k) end) order by area)
                from (select l.area, count(*) n, count(l.correct) k, count(*) filter (where l.correct) ok
                        from answer_log l where l.user_id = o.id and l.area is not null and l.answered_at >= fg_start(v_today - 29)
                       group by l.area) s) end
        ) x
          from friendships f
          cross join lateral (select case when f.a = v_uid then f.b else f.a end as id) o
          cross join lateral fg_card(o.id) c
         where v_uid in (f.a, f.b) and f.status = 'accepted') y), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('id', f.requested_by, 'name', (fg_card(f.requested_by)).display_name) order by f.created_at)
                            from friendships f where v_uid in (f.a, f.b) and f.status = 'pending' and f.requested_by <> v_uid), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('id', case when f.a = v_uid then f.b else f.a end,
                                                            'name', (fg_card(case when f.a = v_uid then f.b else f.a end)).display_name) order by f.created_at)
                            from friendships f where f.requested_by = v_uid and f.status = 'pending'), '[]'::json),
    'cheers', coalesce((select json_agg(json_build_object('id', h.id, 'from', (fg_card(h.from_user)).display_name, 'kind', h.kind, 'at', h.created_at,
                                                          'group', (select name from study_groups g where g.id = h.group_id)) order by h.created_at desc)
                          from (select * from friend_cheers where to_user = v_uid and seen_at is null order by created_at desc limit 20) h), '[]'::json),
    'invites', coalesce((select json_agg(json_build_object('group', i.group_id, 'name', g.name, 'from', (fg_card(i.from_user)).display_name,
                                                           'members', (select count(*) from study_group_members m where m.group_id = g.id)))
                           from study_group_invites i join study_groups g on g.id = i.group_id where i.to_user = v_uid), '[]'::json)
  );
end $$;

-- ------------------------------------------------------------------------------------------------ group challenges

create table if not exists public.study_group_challenges (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 2 and 60),
  area       text check (area is null or char_length(area) <= 40),
  metric     text not null check (metric in ('preguntas', 'aciertos', 'dias')),
  target     int not null check (target between 1 and 5000),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sgc_group_idx on public.study_group_challenges (group_id, ends_at desc);
alter table public.study_group_challenges enable row level security;
revoke all on public.study_group_challenges from anon, authenticated;

create or replace function public.create_group_challenge(p_group uuid, p_title text, p_area text, p_metric text, p_target int, p_days int)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then return json_build_object('error', 'not_member'); end if;
  if p_metric not in ('preguntas', 'aciertos', 'dias') or char_length(trim(coalesce(p_title, ''))) < 2 then return json_build_object('error', 'bad'); end if;
  if (select count(*) from study_group_challenges where group_id = p_group and ends_at > now()) >= 3 then return json_build_object('error', 'too_many_active'); end if;
  if not growth_rate_ok('sgc:' || v_uid::text, 10, interval '1 day') then return json_build_object('error', 'too_many'); end if;
  insert into study_group_challenges (group_id, created_by, title, area, metric, target, ends_at)
  values (p_group, v_uid, left(trim(p_title), 60), nullif(left(trim(coalesce(p_area, '')), 40), ''), p_metric,
          least(greatest(coalesce(p_target, 50), 1), 5000), fg_start(fg_today() + least(greatest(coalesce(p_days, 7), 1), 14) + 1))
  returning id into v_id;
  return json_build_object('id', v_id);
end $$;

create or replace function public.delete_group_challenge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from study_group_challenges c where c.id = p_id
     and (c.created_by = growth_uid() or exists (select 1 from study_groups g where g.id = c.group_id and g.owner = growth_uid()));
end $$;

-- ------------------------------------------------------------------------------------------------ group practice

-- The same questions for everyone in the parche. Progress comes from answer_log (no extra writes from the app):
-- an answer counts when it is to one of these questions of this booklet, after the practice was made.
create table if not exists public.study_group_activities (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 2 and 60),
  exam_slug  text not null check (char_length(exam_slug) <= 80),
  qkeys      text[] not null check (cardinality(qkeys) between 1 and 25),
  area       text check (area is null or char_length(area) <= 40),
  ends_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sga_group_idx on public.study_group_activities (group_id, created_at desc);
alter table public.study_group_activities enable row level security;
revoke all on public.study_group_activities from anon, authenticated;

create or replace function public.create_group_activity(p_group uuid, p_title text, p_slug text, p_keys text[], p_area text, p_days int)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := growth_uid(); v_id uuid; v_keys text[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then return json_build_object('error', 'not_member'); end if;
  select array_agg(distinct left(k, 20)) into v_keys from unnest(coalesce(p_keys, '{}')) k where coalesce(k, '') <> '';
  if v_keys is null or cardinality(v_keys) > 25 or coalesce(p_slug, '') = '' or char_length(trim(coalesce(p_title, ''))) < 2 then
    return json_build_object('error', 'bad');
  end if;
  if (select count(*) from study_group_activities where group_id = p_group and ends_at > now()) >= 5 then return json_build_object('error', 'too_many_active'); end if;
  if not growth_rate_ok('sga:' || v_uid::text, 10, interval '1 day') then return json_build_object('error', 'too_many'); end if;
  insert into study_group_activities (group_id, created_by, title, exam_slug, qkeys, area, ends_at)
  values (p_group, v_uid, left(trim(p_title), 60), left(p_slug, 80), v_keys, nullif(left(trim(coalesce(p_area, '')), 40), ''),
          fg_start(fg_today() + least(greatest(coalesce(p_days, 7), 1), 14) + 1))
  returning id into v_id;
  return json_build_object('id', v_id);
end $$;

create or replace function public.delete_group_activity(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from study_group_activities a where a.id = p_id
     and (a.created_by = growth_uid() or exists (select 1 from study_groups g where g.id = a.group_id and g.owner = growth_uid()));
end $$;

-- ------------------------------------------------------------------------------------------------ group overview

-- Weekly missions already completed (kept so the parche's count of missions survives the week).
create table if not exists public.study_group_missions_done (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  week     date not null,
  mission  text not null check (char_length(mission) <= 40),
  done_at  timestamptz not null default now(),
  primary key (group_id, week, mission)
);
alter table public.study_group_missions_done enable row level security;
revoke all on public.study_group_missions_done from anon, authenticated;

-- Racha del parche: consecutive days on which every member practiced (everyone who had joined by that day).
-- Today counts once everyone has practiced; until then the streak still stands on yesterday.
create or replace function public.fg_group_streak(p_group uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_d date := fg_today(); v_n int := 0; v_since date;
begin
  select (created_at at time zone 'America/Bogota')::date into v_since from study_groups where id = p_group;
  if v_since is null then return 0; end if;
  if not fg_group_day_done(p_group, v_d) then v_d := v_d - 1; end if;
  while v_d >= v_since and v_n < 400 and fg_group_day_done(p_group, v_d) loop v_n := v_n + 1; v_d := v_d - 1; end loop;
  return v_n;
end $$;

create or replace function public.fg_group_day_done(p_group uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from study_group_members m where m.group_id = p_group and (m.joined_at at time zone 'America/Bogota')::date <= p_day)
     and not exists (
       select 1 from study_group_members m
        where m.group_id = p_group and (m.joined_at at time zone 'America/Bogota')::date <= p_day
          and not exists (select 1 from answer_log l where l.user_id = m.user_id and l.answered_at >= fg_start(p_day) and l.answered_at < fg_start(p_day + 1)));
$$;
revoke all on function public.fg_group_streak(uuid), public.fg_group_day_done(uuid, date) from public, anon, authenticated;

create or replace function public.group_overview(p_group uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := growth_uid();
  v_g study_groups;
  v_today date := fg_today();
  v_monday date := fg_monday();
  v_n int;
  v_h int;
  v_area text;
  v_areas text[] := array['Lectura crítica', 'Matemáticas', 'Sociales y ciudadanas', 'Ciencias naturales', 'Inglés'];
  v_missions json;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_g from study_groups where id = p_group;
  if not found or not exists (select 1 from study_group_members where group_id = p_group and user_id = v_uid) then
    return json_build_object('error', 'not_member');
  end if;
  select count(*) into v_n from study_group_members where group_id = p_group;
  -- This week's three missions: picked from the group and the week, sized to the number of members.
  v_h := abs(hashtext(p_group::text || v_monday::text));
  v_area := v_areas[1 + v_h % 5];
  with m(id, title, target, progress, ord) as (
    select * from (values
      ('area', format('Respondan %s preguntas de %s entre todos', 20 * v_n, v_area), 20 * v_n,
         (select count(*)::int from answer_log l join study_group_members m on m.user_id = l.user_id
           where m.group_id = p_group and l.area = v_area and l.answered_at >= fg_start(v_monday)), 0),
      ('dias', format('Sumen %s días de práctica entre todos', 3 * v_n), 3 * v_n,
         (select coalesce(sum((select count(*) from fg_days(m.user_id, v_monday))), 0)::int from study_group_members m where m.group_id = p_group), 1),
      ('aciertos', format('Logren %s respuestas correctas entre todos', 25 * v_n), 25 * v_n,
         (select count(*)::int from answer_log l join study_group_members m on m.user_id = l.user_id
           where m.group_id = p_group and l.correct and l.answered_at >= fg_start(v_monday)), 2),
      ('juntos', 'Practiquen todos el mismo día, 2 veces', 2,
         (select count(*)::int from generate_series(v_monday, v_today, interval '1 day') d where fg_group_day_done(p_group, d::date)), 3),
      ('cinco', 'Practiquen las 5 áreas esta semana', 5,
         (select count(distinct l.area)::int from answer_log l join study_group_members m on m.user_id = l.user_id
           where m.group_id = p_group and l.area = any (v_areas) and l.answered_at >= fg_start(v_monday)), 4)
    ) t(id, title, target, progress, ord)
    where ord = 0 or ord = 1 + (v_h / 5) % 4 or ord = 1 + ((v_h / 5) + 2) % 4
  ), saved as (
    insert into study_group_missions_done (group_id, week, mission)
    select p_group, v_monday, id from m where progress >= target
    on conflict do nothing returning 1
  )
  select json_agg(json_build_object('id', id, 'title', title, 'target', target, 'progress', least(progress, target), 'done', progress >= target) order by ord)
    into v_missions from m;

  return json_build_object(
    'id', v_g.id, 'code', v_g.code, 'name', v_g.name, 'weekly_goal', v_g.weekly_goal, 'mine', v_g.owner = v_uid,
    'week_total', (select count(*) from answer_log l join study_group_members m on m.user_id = l.user_id
                    where m.group_id = p_group and l.answered_at >= fg_start(v_monday)),
    'streak', fg_group_streak(p_group),
    'today_done', fg_group_day_done(p_group, v_today),
    'missions', v_missions,
    'missions_done', (select count(*) from study_group_missions_done where group_id = p_group),
    'week_ends', v_monday + 6,
    'members', (select json_agg(json_build_object(
                   'id', m.user_id, 'name', m.display_name, 'me', m.user_id = v_uid, 'friend', fg_are_friends(v_uid, m.user_id),
                   'today', exists (select 1 from answer_log l where l.user_id = m.user_id and l.answered_at >= fg_start(v_today)),
                   'days', (select count(*) from fg_days(m.user_id, v_monday)),
                   'cheered', exists (select 1 from friend_cheers h where h.from_user = v_uid and h.to_user = m.user_id and h.created_at >= fg_start(v_today)))
                 order by lower(m.display_name)) from study_group_members m where m.group_id = p_group),
    'challenges', coalesce((select json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'area', c.area, 'metric', c.metric, 'target', c.target, 'ends_at', c.ends_at,
        'by', (select display_name from study_group_members m where m.group_id = p_group and m.user_id = c.created_by),
        'can_delete', c.created_by = v_uid or v_g.owner = v_uid,
        'progress', case c.metric
          when 'dias' then (select count(*)::int from (select distinct l.user_id, (l.answered_at at time zone 'America/Bogota')::date
                              from answer_log l join study_group_members m on m.user_id = l.user_id
                             where m.group_id = p_group and l.answered_at >= c.starts_at and l.answered_at < c.ends_at
                               and (c.area is null or l.area = c.area)) z)
          else (select count(*)::int from answer_log l join study_group_members m on m.user_id = l.user_id
                 where m.group_id = p_group and l.answered_at >= c.starts_at and l.answered_at < c.ends_at
                   and (c.area is null or l.area = c.area) and (c.metric = 'preguntas' or l.correct)) end
      ) order by c.ends_at desc) from (select * from study_group_challenges where group_id = p_group and ends_at > now() - interval '7 days' order by ends_at desc limit 6) c), '[]'::json),
    'activities', coalesce((select json_agg(json_build_object(
        'id', a.id, 'title', a.title, 'slug', a.exam_slug, 'keys', a.qkeys, 'area', a.area, 'ends_at', a.ends_at,
        'by', (select display_name from study_group_members m where m.group_id = p_group and m.user_id = a.created_by),
        'can_delete', a.created_by = v_uid or v_g.owner = v_uid,
        -- Per member: how many of the questions they answered (names A-Z, never a score).
        'members', (select json_agg(json_build_object('name', m.display_name, 'me', m.user_id = v_uid,
                       'answered', (select count(distinct l.qkey) from answer_log l where l.user_id = m.user_id and l.exam_slug = a.exam_slug
                                      and l.qkey = any (a.qkeys) and l.answered_at >= a.created_at)) order by lower(m.display_name))
                      from study_group_members m where m.group_id = p_group),
        -- Per question: the group's answers together (how many answered, percent right), never who.
        'questions', (select json_agg(json_build_object('key', q.qk, 'answered', s.n_ans, 'pct', case when s.n_keyed > 0 then round(100.0 * s.n_ok / s.n_keyed) end) order by q.ord)
                        from unnest(a.qkeys) with ordinality as q(qk, ord)
                        cross join lateral (select count(distinct l.user_id) n_ans, count(l.correct) n_keyed, count(*) filter (where l.correct) n_ok
                                              from answer_log l join study_group_members m on m.user_id = l.user_id and m.group_id = p_group
                                             where l.exam_slug = a.exam_slug and l.qkey = q.qk and l.answered_at >= a.created_at) s)
      ) order by a.created_at desc) from (select * from study_group_activities where group_id = p_group and ends_at > now() - interval '7 days' order by created_at desc limit 6) a), '[]'::json)
  );
end $$;

-- ------------------------------------------------------------------------------------------------ grants

revoke all on function public.set_friend_card(text, text), public.friend_code_preview(text), public.add_friend(text),
  public.answer_friend(uuid, boolean), public.remove_friend(uuid), public.cheer(uuid, text, uuid), public.mark_cheers_seen(),
  public.invite_to_group(uuid, uuid), public.answer_group_invite(uuid, boolean), public.my_friends(),
  public.create_group_challenge(uuid, text, text, text, int, int), public.delete_group_challenge(uuid),
  public.create_group_activity(uuid, text, text, text[], text, int), public.delete_group_activity(uuid),
  public.group_overview(uuid) from public, anon;
grant execute on function public.set_friend_card(text, text), public.friend_code_preview(text), public.add_friend(text),
  public.answer_friend(uuid, boolean), public.remove_friend(uuid), public.cheer(uuid, text, uuid), public.mark_cheers_seen(),
  public.invite_to_group(uuid, uuid), public.answer_group_invite(uuid, boolean), public.my_friends(),
  public.create_group_challenge(uuid, text, text, text, int, int), public.delete_group_challenge(uuid),
  public.create_group_activity(uuid, text, text, text[], text, int), public.delete_group_activity(uuid),
  public.group_overview(uuid) to authenticated;
