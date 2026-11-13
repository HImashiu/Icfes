-- 0039 · Public email domains never belong to a school.
-- Why: the test school «Prueba gmail» listed gmail.com in schools.domains, so claim_profile() put EVERY new Gmail
-- student into that school instead of giving them an independent profile (0030). They then saw an empty school
-- home («Tu colegio», teachers with 0/0 tasks), could not redeem a teacher trial code (student_in_school, 0035), and
-- none of them answered a question.
-- 1. A trigger keeps public domains (gmail.com, hotmail.com, outlook.com…) out of schools.domains from now on. A school
--    left with no domain gets a placeholder that matches nobody (like trial schools, 0034).
-- 2. The schools rows and the student profiles this changes are copied to backup tables first (_backup_0039_*).
-- 3. Students with a public email who sit in such a school only because of the domain (not on any of its class lists,
--    no invite) become independent students (school_id null). Their attempts, answers and consents are untouched.
-- Undo: section «Deshacer» at the end. Re-runnable.

create or replace function public.is_public_email_domain(p_domain text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_domain, '')) in (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.mx',
    'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
    'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'une.net.co', 'etb.net.co', 'live.com.co');
$$;

create or replace function public.schools_no_public_domains() returns trigger
language plpgsql set search_path = public as $$
begin
  new.domains := array(select d from unnest(new.domains) d where not public.is_public_email_domain(d));
  if cardinality(new.domains) = 0 then
    new.domains := array['sin-dominio-' || substr(md5(new.id::text), 1, 12) || '.invalid'];
  end if;
  return new;
end $$;

-- Backups (once: a re-run keeps the first copy).
create table if not exists public._backup_0039_schools as
  select now() as backed_up_at, s.* from public.schools s
   where exists (select 1 from unnest(s.domains) d where public.is_public_email_domain(d));
create table if not exists public._backup_0039_profiles as
  select now() as backed_up_at, p.* from public.profiles p
    join public.schools s on s.id = p.school_id
   where p.role = 'student'
     and public.is_public_email_domain(split_part(lower(p.email), '@', 2))
     and exists (select 1 from unnest(s.domains) d where public.is_public_email_domain(d))
     and not exists (select 1 from public.course_members m join public.courses c on c.id = m.course_id
                      where c.school_id = p.school_id and (m.profile_id = p.id or lower(m.email) = lower(p.email)))
     and not exists (select 1 from public.staff_invites i where i.school_id = p.school_id and lower(i.email) = lower(p.email));
alter table public._backup_0039_schools enable row level security;
alter table public._backup_0039_profiles enable row level security;
revoke all on public._backup_0039_schools from anon, authenticated;
revoke all on public._backup_0039_profiles from anon, authenticated;

-- Students who joined only through the public domain become independent.
update public.profiles p set school_id = null
  from public._backup_0039_profiles b
 where p.id = b.id and p.school_id = b.school_id;

-- Clean the schools' domains, then keep them clean.
drop trigger if exists schools_no_public_domains on public.schools;
create trigger schools_no_public_domains before insert or update of domains on public.schools
  for each row execute function public.schools_no_public_domains();
update public.schools set domains = domains
 where exists (select 1 from unnest(domains) d where public.is_public_email_domain(d));

notify pgrst, 'reload schema';

-- Deshacer (solo si hace falta; quita el trigger y devuelve colegios y estudiantes a como estaban):
--   drop trigger if exists schools_no_public_domains on public.schools;
--   update public.schools s set domains = b.domains from public._backup_0039_schools b where s.id = b.id;
--   update public.profiles p set school_id = b.school_id from public._backup_0039_profiles b where p.id = b.id;
