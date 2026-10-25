# Backend (Supabase): accounts, courses, assignments

The app works without any of this (practice stays free, nothing leaves the browser). With the two variables below it also offers
"Ingresar con la cuenta del colegio", teacher courses and assignments, and saves delivered attempts.

No exam content lives here. The database holds schools, people, rosters, assignments (exam slug + question keys) and responses.

## One-time setup (Juan)

1. **Create a Supabase project** (supabase.com, free tier is enough to start). Region: South America (São Paulo).
2. **Run the migration**: SQL editor, paste `migrations/0001_accounts_courses_assignments.sql`, run.
3. **Google Cloud**: console.cloud.google.com, new project, *APIs & Services > OAuth consent screen* (External, app name, your email),
   then *Credentials > Create OAuth client ID > Web application*. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   Copy the client ID and secret. Basic sign-in scopes need no Google verification.
4. **Supabase**: *Authentication > Providers > Google*: paste client ID and secret, enable.
   *Authentication > URL Configuration*: set Site URL and add the hosted app URL to Redirect URLs.
5. **Host the app** at a real URL (Cloudflare Pages or Vercel; build command `npm run build` in `app/`, output `app/dist`).
   Sign-in cannot work from the claude.ai preview artifact because its address is not a registered redirect.
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase *Project Settings > API*; the anon key is public by design) in the host's build settings.
6. **Register the first school** (SQL editor):
   ```sql
   insert into schools (name, domains) values ('Colegio de prueba', '{colegio.edu.co}') returning id, teacher_code;
   ```
   `teacher_code` is what teachers type at first sign-in. After the coordinator has signed in once:
   ```sql
   update profiles set role = 'school_admin' where email = 'coordinacion@colegio.edu.co';
   ```
   The coordinator then sees the teacher code under Ajustes.

Optional Microsoft sign-in: Authentication > Providers > Azure, then build with `VITE_MICROSOFT_LOGIN=1`.

## How access works

- The school is decided by the email domain (`schools.domains`); an unregistered domain cannot create a profile.
- A person is a **student** unless they present the school's teacher code at first sign-in (`claim_profile`). The role is never read from the sign-in token.
- Teachers see and edit only the courses they belong to. Students see only their own roster row, their courses and their active assignments, and cannot see classmates' profiles (minors).
- `schools.teacher_code` is not readable by anyone through the API; only a school admin can read it via `school_teacher_code()`.
- Roster rows are created before students sign in and are linked by email at their first sign-in.

## Tests

`supabase/tests/rls.sh <psql connection args>` runs the migration on a throwaway local Postgres with a stub of Supabase's `auth` schema and checks the rules above
(role by code, domain gate, roster linking, isolation between schools and between students, forged attempts blocked, self-promotion blocked).
Example: `supabase/tests/rls.sh -h /tmp/pgt -p 5499 -U postgres`.

## Known limits (next steps)

- Scores are computed in the browser against the preliminary key, which ships with the app; fine for practice, not for anything high-stakes.
- Attempts that fail to upload (offline) retry only the next time the same attempt is opened; there is no offline queue yet.
- `reveal_policy`, `opens_at` and attempts-allowed exist in the schema but the teacher form and student app do not enforce them yet.
- Responses are stored as JSON on the attempt; a per-response table comes with the IRT work (grading phase 2).
- No consent screen or privacy notice yet. Required before real students use it (decision D5 in the plan).


## Later migrations (run in order, each once)

- `0003_attempt_limits_roles_consent.sql`: attempts allowed per assignment, opening and closing enforced by the database, coordinator can change roles (`set_profile_role`), consent tables.
- `0004_live_sessions.sql`: live answering rooms, players and answers. The app polls every 1-2 seconds, so Realtime does not need to be enabled.
  Guests join through anonymous sign-in: Authentication > Sign In / Providers > turn on "Allow anonymous sign-ins". Without it, only signed-in students can join a room.
- `0025_complete_cursos_scheduled_live.sql`: every curso (11 A) gets its five ICFES subject classes with all its students in each, also for classes saved without grade or group ("Matemáticas 11 A", "11-A"); new classes and new students keep it that way. Live games can be programmed for a date and time (`live_schedule`, `student_live_games`). Checks: `tests/cursos_live_0025.sql`.
