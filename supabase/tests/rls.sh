#!/usr/bin/env bash
# Runs the migration against a throwaway local Postgres with a stub of Supabase's auth schema,
# then checks the row-level security rules. Usage: supabase/tests/rls.sh <psql connection args>
#   e.g. supabase/tests/rls.sh -h /tmp/pgt -p 5499 -U postgres
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
P=(psql "$@" -v ON_ERROR_STOP=1 -q -At)
"${P[@]}" -c "drop database if exists rlstest" -c "create database rlstest"
P=(psql "$@" -d rlstest -v ON_ERROR_STOP=1 -q -At)
"${P[@]}" <<'SQL'
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', current_setting('request.jwt.email', true), 'user_metadata', jsonb_build_object('full_name', 'N')) $$;
grant usage on schema auth, public to authenticated, anon;
SQL
"${P[@]}" -f "$here/../migrations/0001_accounts_courses_assignments.sql"
"${P[@]}" -f "$here/../migrations/0002_course_creator_can_read.sql"
"${P[@]}" -f "$here/../migrations/0003_attempt_limits_roles_consent.sql"
"${P[@]}" -f "$here/../migrations/0004_live_sessions.sql"
"${P[@]}" -f "$here/../migrations/0005_teacher_questions.sql"
"${P[@]}" -f "$here/../migrations/0006_personal_assignments_paper_family.sql"
"${P[@]}" -f "$here/rls_scenarios.sql"
echo "rls: all checks passed"
