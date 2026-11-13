# Growth engine ledger

Juan's ask (2026-11-13): at least 50 substantial, distinct growth features for Cóndor, built, tested, integrated
and documented. This file is the list: what each one fixes, how it is measured, where it lives and how it was tested.

Branch `claude/project-thread-2szd1o`, built on the SEO integration branch `claude/project-thread-rl614y`.
Nothing here is live until the SEO foundation thread merges, runs migration 0050 and deploys.

**Status: 46 built and tested, 4 not built (end of this file).**

## How it fits together

- **Database**: `supabase/migrations/0050_growth_engine.sql`. Additive only (new tables and functions; it re-creates
  `practice_quota` and `take_practice_questions` from 0033 with the invitation bonus added). Re-runnable: applied twice
  on a local Postgres with every migration before it. Every write from anonymous visitors is rate-limited
  (`growth_rate_ok`), every admin function checks `app_admins` (0037), no table is readable directly by anon or
  authenticated. Scenario test: `supabase/tests/growth_0050.sql` (about 70 checks, runs in a transaction and rolls back).
- **Site runtime**: `app/site/growth.js` + `growth.css`, loaded on every page by a small loader at the end of
  `site.js`. Events, experiments, banners, the sticky bar, social proof, public question stats, 404 help.
- **Tool pages**: `app/scripts/build-seo-growth.mjs` (called last from `build-seo.mjs`), behaviour in
  `app/site-src/tools.js` (bundled with esbuild into `site-dist/tools.js`), pure logic in
  `app/src/lib/growth/tools-core.js`. 17 new indexed URLs, plus noindex pages (10 challenge packs, search, certificate
  check, poster) kept out of the sitemap.
- **Worker**: `app/worker/growth.js`, called from `worker/index.js` (one hook line and a `scheduled` handler).
- **App**: `app/src/lib/growth/` (events, experiments, stats, app calls), screens in `app/src/screens/growth/` and
  `app/src/screens/AdminGrowth.jsx`, service worker `app/public/sw.js`.
- **Tests**: `app/tests/growth.test.js` (logic, statistics, worker routes, VAPID signing),
  `app/tests/growth-screens.test.jsx` (app screens), the SQL scenario test, and a browser run of every tool page
  against a local copy of the database (36 checks, all passing; script kept in the thread's scratch folder).

Rules kept: no rankings anywhere (study groups are cooperative, members A to Z); never "free forever"; the public
question cap holds (the diagnostic and challenges reuse only questions that are already public: 297 of 550);
no message goes out in Juan's name (lead emails are stored with consent, nothing is sent).

## The 46 built

| # | Feature | Problem it solves | Metric | Where | Tested |
|---|---|---|---|---|---|
| 1 | Event pipeline | No way to see what visitors do between landing and practice | events per visitor | `track_events`, growth.js, lib/growth/events.js | SQL, browser |
| 2 | Activation funnel | Unknown where people drop | step-to-step conversion | `admin_growth_funnel`, control room | SQL, screen test |
| 3 | A/B experiments | Changes ship on opinion | lift, p-value, chance to beat control | `growth_experiments`, `active_experiments`, stats.js; two running: hero button, sticky bar | unit, SQL |
| 4 | Error reporting | Broken pages go unnoticed | errors per visitor | `log_client_error`, site + app | SQL |
| 5 | Real-user speed | Speed only measured in lab | p75 LCP, CLS, INP, TTFB by page family | growth.js, `admin_web_vitals` | SQL |
| 6 | 404 help | Dead links lose visitors | 404 hits, suggestion clicks | 404.html + growth.js, `admin_content_gaps` | browser |
| 7 | Growth control room | No single place to read growth | (the readout itself) | `/app/#admin/crecimiento` | screen test |
| 8 | Student invitations | No reason to bring a friend | invited, activated, k-factor | `my_referral_code`, `claim_referral`, +10 questions/day per activated friend (cap 60) in `practice_quota` | SQL, screen test |
| 9 | "Recomiéndale Cóndor a tu profe" | Students reach teachers we can't | teacher sign-ups via `profe` | Perfil card, WhatsApp text to /prueba-docente/ | screen test |
| 10 | Partner programme | Tutors and academies have no way in | applications, partner sign-ups | /aliados/, `apply_partner`, approve in control room, partner panel on Perfil | SQL, browser |
| 11 | Parche study groups | Studying alone, dropping off | groups, weekly totals, members active | `#parche`, `#parche/<code>`; cooperative only | SQL, screen test |
| 12 | Reto challenges | Nothing to send a friend | challenge shares and completions | /reto-icfes/ + 10 packs | browser |
| 13 | Short links | Long links on posters and QR | clicks per code | /r/<code> in worker, editable in control room | unit |
| 14 | Poster with personal QR | Offline word of mouth | poster prints, /r/ clicks | /cartel/ | browser |
| 15 | Score share previews | Shared links look generic | share-to-visit rate | worker swaps og:image for ?p= and ?s=, 14 images | unit |
| 16 | Diagnostic | Visitors don't know their level | completions, practice after | /diagnostico-icfes/ (20 public questions, app scoring model) | browser |
| 17 | Class diagnostic, no account | Teachers can't try Cóndor in 5 minutes | diagnostics created, students per class | /diagnostico-icfes/curso/ + private results link | browser, SQL |
| 18 | "¿Cuántas preguntas debo acertar?" | High-volume search query unserved | page traffic, app clicks | /cuantas-preguntas-acertar-icfes/ | unit, browser |
| 19 | Study plan | No plan to the exam date | plans made, calendar downloads | /plan-de-estudio-icfes/ | unit, browser |
| 20 | Countdown + calendar | Exam dates forgotten | calendar adds | /cuanto-falta-para-el-icfes/, calendario/*.ics | unit, browser |
| 21 | Formula sheets | Printable resource people search for | traffic, prints | /formulas-icfes/ + 3 | build |
| 22 | Site search | No search, missing content invisible | searches, zero-result terms | /buscar/, buscar/index.json | unit, browser |
| 23 | Live question stats | Public questions feel static | first-try answers | "El X % acertó" under public questions (from 20 answers) | SQL, browser |
| 24 | Novedades + feed | Returning readers can't see what's new | feed subscribers, visits | /novedades/, /feed.xml | build |
| 25 | Returning and invited visitors | Everyone sees the same landing | returning click rate | growth.js banners | browser |
| 26 | Sticky bar on guides | Long guides end without a next step | guide-to-app clicks (experiment) | growth.js, experiment `sticky-cta` | browser |
| 27 | Social proof | No sign that others practice | (supports conversion) | `public_activity`, shown from 300 answers a week | SQL |
| 28 | Lead capture | Interested visitors leave nothing | leads by tool | `save_lead`, consent required | SQL, browser |
| 29 | Campaign notices | Season moments missed | notice clicks | `growth_notices` (2 seeded), site + app Inicio | SQL, screen test |
| 30 | Simulacro nacional (5 Dec) | No event to rally around | sign-ups, attendance | /simulacro-nacional/, Event schema, .ics | browser, SQL |
| 31 | Testimonials | No social proof content | testimonials approved | asked after an NPS of 9-10, approved in control room, shown on /herramientas-icfes/ | SQL |
| 32 | Install the app | People must find the site again | installs | sw.js, install prompt on Perfil | build |
| 33 | Practice reminders in the calendar | No habit trigger | downloads | Perfil card, .ics until exam day | unit |
| 34 | Notifications | No habit trigger on Android | subscribers, return rate | Web Push from the worker's hourly cron; skips anyone who practiced that day | unit (needs keys to run) |
| 35 | Welcome back | Students who lapse don't return | return after 3+ days away | Inicio card with a warm-up | screen test |
| 36 | Primeros pasos | New students don't know what to do | checklist completion | Inicio checklist | screen test |
| 37 | Practice certificate | No proof of effort to show | certificates issued, verifications | Perfil + /verificar/ (first name and initial only) | SQL, browser |
| 38 | Family link for independent students | Families of non-school students see nothing | links made | Perfil card, reuses family reports | SQL |
| 39 | Item statistics | Wrong keys found by hand | flagged questions | `admin_item_stats` (dubious key, inverse discrimination) | SQL |
| 40 | NPS | No satisfaction signal | NPS | Inicio, from the 3rd practice | screen test |
| 41 | "¿Cómo nos conociste?" | Unknown channels | share by channel | Inicio, from the 2nd practice | screen test |
| 42 | Price sensitivity | Pricing by guess | Van Westendorp range | Inicio, from the 6th practice, once | unit |
| 43 | Roadmap votes | Unknown what to build | votes, ideas | /que-viene/ | browser |
| 44 | School proposal | Teachers can't sell Cóndor internally | proposals made | /propuesta-colegios/ (printable) | browser |
| 45 | School demand | Unknown which schools to approach | students per school | "Mi colegio" on Perfil, control room list | SQL |
| 46 | Sign-up recovery | Google sign-in abandoned silently | recovered sign-ins | site banner after an unfinished sign-in | browser |

## Not built (4)

- **Career goal** (pick a university programme, get the target score): the data is in `scripts/seo-data/universidades.mjs`; next step is a Perfil field feeding Mi meta.
- **"Practica a tu nivel"**: `question_difficulty(slug)` exists in 0050; the practice picker that uses it is not written.
- **Weekly recap** for students (by email or push): waits for an email sender Juan approves.
- **Results by department pages**: datos.gov.co is blocked from the cloud, so the data could not be fetched.

## To go live (SEO foundation thread)

1. Run `supabase/migrations/0050_growth_engine.sql` in the Supabase SQL editor (safe to run again).
2. Merge the branch, `npm test`, `npm run site` (check-seo: 0 errors), deploy.
3. Optional, for notifications: `node scripts/vapid-keys.mjs`, then `wrangler secret put` VAPID_PUBLIC,
   VAPID_PRIVATE_JWK and PUSH_CRON_TOKEN (= `select value from growth_secrets where key = 'push_cron'`).
   Without them the app hides nothing important: the notification button says to use the calendar.
4. The control room needs Juan's account in `app_admins` (0037), as the «Uso» page does.
