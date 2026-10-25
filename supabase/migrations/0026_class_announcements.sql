-- 0026: anuncios per subject class. A teacher who can edit a class posts short notices to it; everyone in the class
-- (its students and teachers) reads them. Re-runnable.

create table if not exists public.class_announcements (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text,
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 2000),
  pinned      boolean not null default false,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists class_announcements_course_idx on public.class_announcements (course_id, created_at desc);

alter table public.class_announcements enable row level security;

-- Read: the class's members (students once their roster row is linked, its teachers) and anyone who may view it.
drop policy if exists announcements_select on public.class_announcements;
create policy announcements_select on public.class_announcements for select
  using (public.is_course_member(course_id) or public.can_view_course(course_id));

-- Write: teachers who can edit the class (and the school admin), only as themselves.
drop policy if exists announcements_insert on public.class_announcements;
create policy announcements_insert on public.class_announcements for insert
  with check (public.is_course_teacher(course_id) and author_id = auth.uid());
drop policy if exists announcements_update on public.class_announcements;
create policy announcements_update on public.class_announcements for update
  using (public.is_course_teacher(course_id)) with check (public.is_course_teacher(course_id));
drop policy if exists announcements_delete on public.class_announcements;
create policy announcements_delete on public.class_announcements for delete
  using (public.is_course_teacher(course_id));

-- The author's name is stored with the notice: students cannot read teachers' profiles.
create or replace function public.announcement_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce(nullif(trim((select full_name from profiles where id = auth.uid())), ''), split_part((select email from profiles where id = auth.uid()), '@', 1));
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.course_id := old.course_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists class_announcements_defaults on public.class_announcements;
create trigger class_announcements_defaults before insert or update on public.class_announcements
  for each row execute function public.announcement_defaults();

grant select, insert, update, delete on public.class_announcements to authenticated;

notify pgrst, 'reload schema';
