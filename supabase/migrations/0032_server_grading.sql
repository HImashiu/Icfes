-- 0032 · Grading on the server. A student's delivered attempt keeps the score the site's worker computed and sealed
-- (worker/index.js: AES-256-CBC + HMAC-SHA256 with GRADE_SECRET), never a score typed in the browser.
--   attempts.receipt = { iv, data, sig } from the worker. The trigger checks the signature, decrypts it, checks that it
--   belongs to this student, booklet and attempt, and writes its score into attempts.score (verified: true).
--   Without a valid receipt the attempt is saved with no score (score.keyed = false, verified = false): the teacher
--   sees it as not graded instead of a number nobody can trust.
-- Rows written by teachers' functions (paper sheets, security definer) are not touched.
-- The secret lives in private.grade_secret (a schema the API never exposes). Set it with:
--   insert into private.grade_secret (id, secret) values (1, '<the same value as the worker's GRADE_SECRET>')
--     on conflict (id) do update set secret = excluded.secret;
-- Runs after 0031. Re-runnable.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.grade_secret (id int primary key check (id = 1), secret text not null);
alter table private.grade_secret enable row level security;
revoke all on private.grade_secret from public, anon, authenticated;

alter table public.attempts add column if not exists receipt jsonb;

create or replace function public.attempts_server_score() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_text text;
  v_r jsonb;
  v_ok boolean := false;
begin
  -- Only a student saving their own attempt, at the moment it is delivered.
  -- (Teachers' functions run with the teacher's id; the dashboard and server jobs have none.)
  if auth.uid() is null or new.profile_id is distinct from auth.uid() or new.submitted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then return new; end if;

  select secret into v_secret from private.grade_secret where id = 1;
  if v_secret is not null and new.receipt ? 'iv' and new.receipt ? 'data' and new.receipt ? 'sig'
     and encode(hmac((new.receipt ->> 'iv') || (new.receipt ->> 'data'), v_secret, 'sha256'), 'hex') = new.receipt ->> 'sig' then
    begin
      v_text := convert_from(decrypt_iv(decode(new.receipt ->> 'data', 'hex'), digest(v_secret || 'enc', 'sha256'),
                                        decode(new.receipt ->> 'iv', 'hex'), 'aes-cbc/pad:pkcs'), 'utf8');
      v_r := v_text::jsonb;
      v_ok := v_r ->> 'uid' = auth.uid()::text
          and v_r ->> 'slug' = new.exam_slug
          and v_r ->> 'client_id' = new.client_id
          and (v_r ->> 'assignment_id') is not distinct from new.assignment_id::text;
    exception when others then v_ok := false;
    end;
  end if;

  if v_ok then
    new.score := (v_r -> 'score') || jsonb_build_object('verified', true);
  else
    new.score := coalesce(new.score, '{}'::jsonb) || jsonb_build_object('keyed', false, 'verified', false);
  end if;
  new.receipt := null; -- the sealed copy has done its job
  return new;
end $$;
revoke all on function public.attempts_server_score() from public, anon, authenticated;

drop trigger if exists attempts_server_score on public.attempts;
create trigger attempts_server_score before insert or update on public.attempts
  for each row execute function public.attempts_server_score();

notify pgrst, 'reload schema';
