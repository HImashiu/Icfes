-- 0031 · Anti-scraping: every signed-in download of a booklet's files is logged, and one account can open at most
-- a set number of different booklets per day (default 12; a student practising hard opens 2 or 3).
-- The site's worker calls note_exam_download() with the student's own token before serving /app/exams/<slug>.*.
-- Juan sees heavy users in the view exam_download_watch (dashboard only). Runs after 0030. Re-runnable.

create table if not exists public.exam_downloads (
  user_id    uuid not null,
  day        date not null default (now() at time zone 'America/Bogota')::date,
  slug       text not null check (char_length(slug) <= 80),
  files      int  not null default 1,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (user_id, day, slug)
);
alter table public.exam_downloads enable row level security;
-- No policies: nobody reads or writes it through the API; only the function below and the dashboard.
revoke all on public.exam_downloads from anon, authenticated;

-- Limits Juan can change in the dashboard without a deploy.
create table if not exists public.app_limits (key text primary key, value int not null);
alter table public.app_limits enable row level security;
revoke all on public.app_limits from anon, authenticated;
insert into public.app_limits (key, value) values ('booklets_per_day', 12), ('files_per_day', 400)
  on conflict (key) do nothing;

create or replace function public.note_exam_download(p_slug text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Bogota')::date;
  v_slug text := left(coalesce(p_slug, ''), 80);
  v_booklets int; v_files int;
  v_max_booklets int := coalesce((select value from app_limits where key = 'booklets_per_day'), 12);
  v_max_files int := coalesce((select value from app_limits where key = 'files_per_day'), 400);
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select count(*), coalesce(sum(files), 0) into v_booklets, v_files from exam_downloads where user_id = v_uid and day = v_day;
  if v_files >= v_max_files then raise exception 'download_limit'; end if;
  if not exists (select 1 from exam_downloads where user_id = v_uid and day = v_day and slug = v_slug) then
    if v_booklets >= v_max_booklets then raise exception 'download_limit'; end if;
    v_booklets := v_booklets + 1;
  end if;
  insert into exam_downloads (user_id, day, slug) values (v_uid, v_day, v_slug)
    on conflict (user_id, day, slug) do update set files = exam_downloads.files + 1, last_at = now();
  return v_booklets;
end $$;
revoke all on function public.note_exam_download(text) from public, anon;
grant execute on function public.note_exam_download(text) to authenticated;

-- Who downloads the most (last 7 days). Open it in Table editor / SQL editor; not reachable through the API.
create or replace view public.exam_download_watch with (security_invoker = true) as
  select d.user_id, u.email, count(distinct d.slug) as booklets_7d, sum(d.files) as files_7d,
         count(distinct d.day) as days_active, max(d.last_at) as last_seen
    from public.exam_downloads d left join auth.users u on u.id = d.user_id
   where d.day > (now() at time zone 'America/Bogota')::date - 7
   group by d.user_id, u.email
   order by booklets_7d desc;
revoke all on public.exam_download_watch from anon, authenticated;

notify pgrst, 'reload schema';
