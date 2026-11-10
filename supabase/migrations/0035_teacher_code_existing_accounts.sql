-- 0035 · Teacher codes for accounts that already exist, and the trial's days and seats in the app.
--  Before this, a trial code (0034) or a school's teacher code could only be typed on the first-login screen
--  ("Casi listo"). A teacher who had already entered Cóndor with that Google account (for example to practise) was a
--  student with no place to type it. redeem_teacher_code() turns that existing account into a teacher with the same
--  rules as claim_profile(); my_trial() lets the teacher panel show how many days and teacher seats are left.
--  Runs after 0034. Re-runnable.

create or replace function public.redeem_teacher_code(p_code text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text := upper(trim(coalesce(p_code, '')));
  v_profile profiles;
  v_school  schools;
  v_trial   trial_codes;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'not_signed_in'; end if;
  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'no_profile'; end if;            -- first visit: claim_profile() handles it
  if v_profile.role <> 'student' then return v_profile; end if;     -- already a teacher or coordinator
  if v_code = '' then raise exception 'bad_teacher_code'; end if;

  select * into v_trial from trial_codes where code = v_code for update;
  if found then
    if v_trial.expires_at < now() then raise exception 'trial_code_expired'; end if;
    if (select count(*) from trial_redemptions r where r.code = v_trial.code) >= v_trial.max_teachers then
      raise exception 'trial_code_full';
    end if;
    -- A student who belongs to a real school stays there: a trial code never moves them out of it.
    if v_profile.school_id is not null and v_profile.school_id is distinct from v_trial.school_id then
      raise exception 'student_in_school';
    end if;
    if v_trial.school_id is null then
      insert into schools (name, domains)
      values (v_trial.school_name, array['prueba-' || substr(md5(v_trial.code), 1, 16) || '.invalid'])
      returning * into v_school;
      update trial_codes set school_id = v_school.id where code = v_trial.code;
    else
      select * into v_school from schools where id = v_trial.school_id;
    end if;
    update profiles set school_id = v_school.id, role = 'teacher' where id = v_uid returning * into v_profile;
    insert into trial_redemptions (profile_id, code, school_id) values (v_uid, v_trial.code, v_school.id)
      on conflict (profile_id) do nothing;
    return v_profile;
  end if;

  -- The school's own teacher code (0001): only for an account already in that school (its email domain).
  if v_profile.school_id is null then raise exception 'school_not_found'; end if;
  select * into v_school from schools where id = v_profile.school_id;
  if v_school.teacher_code is null or lower(trim(p_code)) <> lower(v_school.teacher_code) then raise exception 'bad_teacher_code'; end if;
  update profiles set role = 'teacher' where id = v_uid returning * into v_profile;
  return v_profile;
end $$;
revoke all on function public.redeem_teacher_code(text) from public, anon;
grant execute on function public.redeem_teacher_code(text) to authenticated;

-- The trial of the caller's school, if it is a trial school: days and teacher seats left. Staff only.
create or replace function public.my_trial()
returns table (school_name text, expires_at timestamptz, max_teachers int, teachers int)
language sql stable security definer set search_path = public as $$
  select t.school_name, t.expires_at, t.max_teachers,
         (select count(*)::int from trial_redemptions r where r.code = t.code)
    from trial_codes t
    join profiles p on p.id = auth.uid() and p.role <> 'student' and p.school_id = t.school_id
   order by t.created_at desc
   limit 1;
$$;
revoke all on function public.my_trial() from public, anon;
grant execute on function public.my_trial() to authenticated;
