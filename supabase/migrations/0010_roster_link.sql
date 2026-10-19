-- 0010: link a signed-in account to roster rows whose email differs only in case or stray spaces,
-- so assigned tasks reach the student's dashboard. Safe to re-run.
create or replace function public.link_my_roster() returns void
language sql security definer set search_path = public as $$
  update course_members m set profile_id = auth.uid()
   where m.profile_id is null
     and lower(btrim(m.email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.link_my_roster() to authenticated;

create or replace function public.link_member_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is null then
    select id into new.profile_id from profiles where lower(btrim(email)) = lower(btrim(new.email)) limit 1;
  end if;
  return new;
end $$;
