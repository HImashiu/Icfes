// Writes supabase/demo/seed.sql and clean.sql: the demo school (invented students, classes, work, grades, seating)
// for the real database, under the signed-in teacher's own account. Run with: npx vite-node scripts/make-demo-sql.mjs
// Needs public/exams (npm run sync-exams) for the answer keys of the two booklets it uses.
// Every row gets an id starting with dec0de00 (or an @demo.invalid email), so clean.sql removes exactly those.
import { readFileSync, writeFileSync } from "node:fs";
import { parseExam, parseKey } from "../src/lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../src/lib/figures.js";
import { generatePlan } from "../src/lib/seating.js";
import { PRESETS } from "../src/lib/chartBuilder.js";
import { FIRST, LAST, TEACHERS } from "../src/demo/names.js";

const exams = new URL("../public/exams/", import.meta.url).pathname;
const out = new URL("../../supabase/demo/", import.meta.url).pathname;
const AREA = { Matemáticas: "M", "Lectura crítica": "L", "Sociales y ciudadanas": "S", "Ciencias naturales": "N", Inglés: "I" };

const bank = [];
for (const slug of ["S11-A_1ra", "S11-A_2da"]) {
  const parsed = parseExam(JSON.parse(readFileSync(`${exams}${slug}.json`, "utf8")));
  const rf = JSON.parse(readFileSync(`${exams}${slug}.figures.json`, "utf8"));
  const exam = prepareExam(parsed, linkFigures(parsed, parseFigureSpecs(rf), rf));
  const key = parseKey(JSON.parse(readFileSync(`${exams}${slug}.key.json`, "utf8")));
  const enr = JSON.parse(readFileSync(`${exams}${slug}.enrich.json`, "utf8")).questions;
  const items = exam.questions.filter((q) => key.get(q.key) && !enr[q.number]?.hidden).map((q) => `${q.key}${key.get(q.key)}${AREA[q.section]}${enr[q.number]?.dificultad ?? 3}`);
  bank.push(`('${slug}', '${items.join(" ")}')`);
}

const did = (kind, n) => `dec0de00-${kind.toString(16).padStart(4, "0")}-4000-8000-${n.toString(16).padStart(12, "0")}`;
// Space 6 (Preparación Saber 11 C) holds students 81..120; its member ids are did(2, 6000 + n).
const roster6 = Array.from({ length: 40 }, (_, i) => did(2, 6000 + 81 + i));
const plan = generatePlan({ rows: 7, cols: 7, blocked: ["0,3", "3,3", "6,3"], versions: 4, studentIds: roster6, seed: 20261024, orderSeed: 7351 });
const lit = (v) => `$j$${JSON.stringify(v)}$j$::jsonb`;
const charts = [PRESETS[0], PRESETS[2], PRESETS[3]];

const clean = `-- Borra los datos de demostración (todo lo que creó el seed). No toca nada más.
-- Cada fila de demostración tiene un id que empieza por dec0de00 o un correo @demo.invalid.
do $clean$
declare t text;
begin
  if to_regclass('public.attempts') is not null then delete from public.attempts where client_id like 'demo-%'; end if;
  for t in select unnest(array['courses', 'lessons', 'activity_formats', 'saved_charts', 'saved_views', 'student_groups', 'student_statuses']) loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I where id::text like %L', t, 'dec0de00-%'); end if;
  end loop;
  if to_regclass('public.student_notes') is not null then delete from public.student_notes where email like '%@demo.invalid'; end if;
  if to_regclass('public.student_flags') is not null then delete from public.student_flags where email like '%@demo.invalid'; end if;
  if to_regclass('public.grading_models') is not null then delete from public.grading_models where model ->> '_demo' = 'true'; end if;
  raise notice 'Datos de demostración borrados.';
end $clean$;
`;

const arr = (xs) => `array[${xs.map((x) => `'${x}'`).join(", ")}]`;
const seed = `-- Colegio de demostración dentro de tu cuenta real: 6 espacios de clase, 120 estudiantes inventados, 8 semanas de trabajo,
-- notas, plano del salón, clases y seguimiento. Se puede volver a ejecutar (borra lo anterior y lo crea de nuevo).
-- Para quitarlo todo: ejecuta el script de borrado. Necesita las migraciones 0003 a 0017.
-- Los estudiantes y docentes son filas de lista (sin cuenta de ingreso): solo tú entras. Cambia el correo si tu cuenta es otra.
do $seed$
declare
  v_email text := 'juandabarrios12@gmail.com';
  v_me uuid; v_school uuid; v_role text; v_name text;
  v_now timestamptz := now();
  c record; s record; q record;
  j int; v_n int;
  ago int[] := array[55, 41, 27, 13, 2];
  kinds text[] := array['task', 'homework', 'exam', 'task', 'homework'];
  firsts text[] := ${arr(FIRST)};
  lasts text[] := ${arr(LAST)};
  teachers text[] := ${arr(TEACHERS.map(([f, l]) => `${f} ${l}`))};
  areas text[] := array['M', 'L', 'S', 'N', 'I'];
  area_names text[] := array['Matemáticas', 'Lectura crítica', 'Sociales y ciudadanas', 'Ciencias naturales', 'Inglés'];
  base_sec int[] := array[100, 85, 65, 75, 55];
  tot int[]; answered int[]; cor int[];
  v_slugs text[]; v_slug text; v_keys text[]; v_exam boolean; v_active boolean; v_open timestamptz; v_due timestamptz; v_scope text; v_count int;
  v_first text; v_last text; v_mail text; v_ok boolean; v_given text; v_popular text; v_others text[]; v_theta numeric; v_p numeric; v_ai int; v_sec int; v_sum_sec int;
  ans jsonb; tms jsonb; hnt jsonb; chg jsonb; per jsonb; v_sub timestamptz; v_start timestamptz; v_leaves int; v_att int := 0; v_eng numeric;
  v_rows int;
begin
  select id, school_id, role, full_name into v_me, v_school, v_role, v_name from public.profiles where lower(email) = lower(v_email);
  if v_me is null then raise exception 'No encuentro un perfil con el correo %. Entra una vez a la app con esa cuenta y vuelve a ejecutar.', v_email; end if;
  if v_role = 'student' then raise exception 'Tu cuenta es de estudiante. Cámbiala a docente o coordinación antes de crear la demostración.'; end if;
  if to_regclass('public.grading_models') is null or to_regclass('public.lessons') is null or to_regclass('public.student_flags') is null
     or to_regclass('public.saved_charts') is null or to_regclass('public.paper_seating') is null then
    raise exception 'Faltan migraciones (0013 a 0017). Ejecútalas primero.';
  end if;
  v_name := coalesce(nullif(v_name, ''), 'Docente');

  -- start clean
  delete from public.attempts where client_id like 'demo-%';
  delete from public.courses where id::text like 'dec0de00-%';
  delete from public.lessons where id::text like 'dec0de00-%';
  delete from public.activity_formats where id::text like 'dec0de00-%';
  delete from public.saved_charts where id::text like 'dec0de00-%';
  delete from public.saved_views where id::text like 'dec0de00-%';
  delete from public.student_groups where id::text like 'dec0de00-%';
  delete from public.student_statuses where id::text like 'dec0de00-%';
  delete from public.student_notes where email like '%@demo.invalid';
  delete from public.student_flags where email like '%@demo.invalid';
  delete from public.grading_models where model ->> '_demo' = 'true';

  perform setseed(0.20261024);

  -- the two booklets' answer keys, areas and difficulty (key, letter, area, difficulty)
  create temp table d_bank on commit drop as
    select b.slug, m.a[1] as key, m.a[2] as letter, m.a[3] as area, m.a[4]::int as diff, m.o as ord
    from (values ${bank.join(", ")}) as b(slug, items),
         lateral regexp_matches(b.items, '(\\d+)([A-D])([MLSNI])(\\d)', 'g') with ordinality as m(a, o);

  -- people: 3 homerooms of 40 students
  create temp table d_students (n int, home int, name text, email text, ability numeric, engage numeric, speed numeric, growth numeric,
                                dropout boolean, slump boolean, hint_lover boolean, sk numeric[]) on commit drop;
  for v_n in 1..120 loop
    loop
      v_first := firsts[1 + floor(random() * array_length(firsts, 1))::int];
      v_last := lasts[1 + floor(random() * array_length(lasts, 1))::int] || ' ' || lasts[1 + floor(random() * array_length(lasts, 1))::int];
      exit when not exists (select 1 from d_students where name = v_first || ' ' || v_last);
    end loop;
    v_mail := regexp_replace(translate(lower(v_first || '.' || split_part(v_last, ' ', 1)), 'áéíóúüñ ', 'aeiouun.'), '[^a-z.]', '', 'g') || '@demo.invalid';
    if exists (select 1 from d_students where email = v_mail) then v_mail := replace(v_mail, '@', v_n || '@'); end if;
    insert into d_students values (
      v_n, (v_n - 1) / 40 + 1, v_first || ' ' || v_last, v_mail,
      (random() + random() + random() - 1.5) * 2 * 0.8 + case (v_n - 1) / 40 + 1 when 1 then 0.15 when 2 then 0 else -0.1 end,
      case when random() < 0.6 then 0.94 when random() < 0.75 then 0.78 else 0.45 end,
      exp((random() + random() + random() - 1.5) * 2 * 0.22), 0.03 + random() * 0.05,
      random() < 0.05, random() < 0.06, random() < 0.25,
      array[(random() + random() + random() - 1.5) * 0.9, (random() + random() + random() - 1.5) * 0.9, (random() + random() + random() - 1.5) * 0.9,
            (random() + random() + random() - 1.5) * 0.9, (random() + random() + random() - 1.5) * 0.9]);
  end loop;

  -- class spaces (real subjects, one per homeroom pairing) and their rosters
  create temp table d_courses (idx int, home int, subject text, grp text, name text, focus text, teacher text, titles text[]) on commit drop;
  insert into d_courses values
    (1, 1, 'Matemáticas', 'A', 'Matemáticas 11 A', 'M', teachers[2], array['Tablas y gráficos', 'Funciones y variación', 'Simulacro de matemáticas', 'Probabilidad y conteo', 'Razonamiento con datos']),
    (2, 1, 'Ciencias naturales', 'A', 'Ciencias naturales 11 A', 'N', teachers[5], array['Materia y energía', 'Ecosistemas', 'Simulacro de ciencias', 'Fuerzas y movimiento', 'Química del día a día']),
    (3, 2, 'Lectura crítica', 'B', 'Lectura crítica 11 B', 'L', teachers[3], array['Textos argumentativos', 'Inferir la intención del autor', 'Simulacro de lectura', 'Textos discontinuos', 'Contrastar posiciones']),
    (4, 2, 'Inglés', 'B', 'Inglés 11 B', 'I', teachers[6], array['Vocabulario en contexto', 'Lectura de avisos', 'Simulacro de inglés', 'Conversaciones cortas', 'Cloze y gramática']),
    (5, 3, 'Sociales y ciudadanas', 'C', 'Sociales y ciudadanas 11 C', 'S', teachers[4], array['Constitución y participación', 'Fuentes históricas', 'Simulacro de sociales', 'Conflicto y paz', 'Análisis de casos']),
    (6, 3, 'Todas las áreas', 'C', 'Preparación Saber 11 C', null, teachers[1], array['Calentamiento Saber 11', 'Mezcla de áreas', 'Simulacro general', 'Ciencias y sociales', 'Repaso antes del simulacro']);

  for c in select * from d_courses order by idx loop
    insert into public.courses (id, school_id, name, grade, year, created_by, subject, group_label)
      values (dec0de(1, c.idx), v_school, c.name, '11', 2026, v_me, c.subject, c.grp);
    insert into public.course_members (id, course_id, profile_id, email, full_name, role)
      values (dec0de(2, c.idx * 1000), dec0de(1, c.idx), null, lower(replace(translate(c.teacher, 'áéíóú ', 'aeiou.'), '..', '.')) || '@demo.invalid', c.teacher, 'teacher');
    insert into public.course_members (id, course_id, profile_id, email, full_name, role)
      select dec0de(2, c.idx * 1000 + st.n), dec0de(1, c.idx), null, st.email, st.name, 'student' from d_students st where st.home = c.home;
  end loop;

  -- assignments and what students did, across 8 weeks
  for c in select * from d_courses order by idx loop
    for j in 1..5 loop
      v_exam := kinds[j] = 'exam';
      v_active := j = 5;
      v_count := case when v_exam then 24 else 16 end;
      select array_agg(distinct slug order by slug) into v_slugs from d_bank where c.focus is null or area = c.focus;
      v_slug := v_slugs[1 + (c.idx - 1 + j - 1) % array_length(v_slugs, 1)];
      select array_agg(key order by i) into v_keys from (
        select r.key, g.i from (select key, row_number() over (order by ord) as rn, count(*) over () as cnt from d_bank where slug = v_slug and (c.focus is null or area = c.focus)) r
        join generate_series(0, v_count - 1) g(i) on r.rn - 1 = floor(g.i * r.cnt::numeric / v_count)) t;
      v_scope := coalesce((select area_names[array_position(areas, c.focus)]), 'all');
      v_open := v_now - ((ago[j] + c.idx - 1) * interval '1 day');
      v_due := case when v_active then v_now + interval '3 days' else v_open + interval '6 days' end;
      insert into public.assignments (id, course_id, created_by, kind, title, exam_slug, scope, question_keys, opens_at, due_at, time_limit_min, reveal_policy,
                                      status, created_at, allow_hints, instant_feedback, proctor, max_attempts)
        values (dec0de(3, c.idx * 10 + j), dec0de(1, c.idx), v_me, kinds[j], c.titles[j], v_slug, v_scope, v_keys, v_open, v_due, case when v_exam then 45 end,
                case when v_exam then 'after_close' else 'after_submit' end, 'active', v_open - interval '1 day', not v_exam, not v_exam, v_exam, case when v_exam then 1 end);

      for s in select * from d_students st where st.home = c.home order by st.n loop
        continue when s.dropout and j >= 4;
        continue when random() > s.engage * case when v_active then 0.6 else 1 end;
        ans := '{}'; tms := '{}'; hnt := '{}'; chg := '{}';
        tot := array[0, 0, 0, 0, 0]; answered := array[0, 0, 0, 0, 0]; cor := array[0, 0, 0, 0, 0]; v_sum_sec := 0;
        for q in select key, letter, area, diff from d_bank where slug = v_slug and key = any(v_keys) order by array_position(v_keys, key) loop
          v_ai := array_position(areas, q.area);
          tot[v_ai] := tot[v_ai] + 1;
          continue when v_exam and random() > 0.97;
          v_theta := s.ability + s.growth * 10 * ((j - 1) / 4.0) + s.sk[v_ai] + case when s.slump and j >= 4 then -1.4 else 0 end;
          v_p := 1 / (1 + exp(-(1.15 * (v_theta - 0.5 * (q.diff - 3)) + 0.15)));
          v_ok := random() < v_p;
          v_others := array(select l from unnest(array['A', 'B', 'C', 'D']) l where l <> q.letter order by l);
          v_popular := v_others[1 + (q.key::int % 3)];
          v_given := case when v_ok then q.letter when random() < 0.5 then v_popular else v_others[1 + floor(random() * 3)::int] end;
          v_sec := greatest(6, round(base_sec[v_ai] * (1 + 0.18 * (q.diff - 3)) * s.speed * exp((random() + random() + random() - 1.5) * 2 * 0.38) * case when v_ok then 0.9 else 1.15 end)::int);
          ans := ans || jsonb_build_object(q.key, v_given);
          tms := tms || jsonb_build_object(q.key, v_sec);
          v_sum_sec := v_sum_sec + v_sec;
          answered[v_ai] := answered[v_ai] + 1;
          if v_ok then cor[v_ai] := cor[v_ai] + 1; end if;
          if not v_exam and random() < (case when s.hint_lover then 0.3 else 0.07 end) * (case when v_ok then 0.7 else 1.4 end) then
            hnt := hnt || jsonb_build_object(q.key, 1 + (random() < 0.2)::int);
          end if;
          if random() < 0.07 then chg := chg || jsonb_build_object(q.key, 1); end if;
        end loop;
        continue when (select sum(x) from unnest(answered) x) = 0;
        per := (select jsonb_agg(jsonb_build_object('name', area_names[g], 'total', tot[g], 'answered', answered[g], 'correct', cor[g]) order by g) from generate_series(1, 5) g where tot[g] > 0);
        v_sub := least(v_now - interval '20 minutes', v_open + (2 + random() * case when v_active then 70 else 140 end) * interval '1 hour');
        v_start := v_sub - (v_sum_sec + 60 + random() * 120) * interval '1 second';
        v_leaves := case when v_exam and random() < 0.14 then 1 + floor(random() * 3)::int else 0 end;
        v_att := v_att + 1;
        insert into public.attempts (id, profile_id, member_id, assignment_id, client_id, exam_slug, scope, mode, started_at, submitted_at, duration_sec, answers, times, activity, proctor, score, key_status, device)
          values (dec0de(12, v_att), null, dec0de(2, c.idx * 1000 + s.n), dec0de(3, c.idx * 10 + j), 'demo-' || v_att, v_slug, v_scope, case when v_exam then 'timed' else 'practice' end,
                  v_start, v_sub, extract(epoch from v_sub - v_start)::int, ans, tms, jsonb_build_object('hints', hnt, 'changes', chg),
                  case when v_exam then jsonb_build_object('leaves', v_leaves, 'awaySec', v_leaves * 25, 'pointerOuts', v_leaves * 2, 'idleSec', 0) else '{}'::jsonb end,
                  jsonb_build_object('keyed', true, 'correct', (select sum(x) from unnest(cor) x), 'answered', (select sum(x) from unnest(answered) x), 'total', (select sum(x) from unnest(tot) x), 'perArea', per),
                  'preliminary', case when s.n % 3 = 0 then 'desktop' else 'phone' end);
      end loop;
    end loop;
  end loop;

  -- a paper simulacro for space 6, scanned (results hang from the roster rows), with its seating plan
  select array_agg(key order by i) into v_keys from (
    select r.key, g.i from (select key, row_number() over (order by slug, ord) as rn, count(*) over () as cnt from d_bank where slug = 'S11-A_1ra') r
    join generate_series(0, 23) g(i) on r.rn - 1 = floor(g.i * r.cnt::numeric / 24)) t;
  insert into public.assignments (id, course_id, created_by, kind, title, exam_slug, scope, question_keys, opens_at, due_at, time_limit_min, reveal_policy, status, created_at, allow_hints, instant_feedback, proctor, max_attempts)
    values (dec0de(3, 99), dec0de(1, 6), v_me, 'exam', 'Simulacro en papel · sesión 1', 'S11-A_1ra', 'all', v_keys, v_now - interval '2 days', v_now - interval '1 day', 45, 'after_close', 'active', v_now - interval '6 hours', false, false, false, 1);
  for s in select * from d_students where home = 3 order by n loop
    continue when random() > 0.93;
    ans := '{}'; tot := array[0, 0, 0, 0, 0]; answered := array[0, 0, 0, 0, 0]; cor := array[0, 0, 0, 0, 0];
    for q in select key, letter, area from d_bank where slug = 'S11-A_1ra' and key = any(v_keys) loop
      v_ai := array_position(areas, q.area);
      tot[v_ai] := tot[v_ai] + 1;
      continue when random() > 0.96;
      v_ok := random() < 1 / (1 + exp(-(1.1 * (s.ability + 0.4) + 0.1)));
      v_others := array(select l from unnest(array['A', 'B', 'C', 'D']) l where l <> q.letter order by l);
      ans := ans || jsonb_build_object(q.key, case when v_ok then q.letter else v_others[1 + floor(random() * 3)::int] end);
      answered[v_ai] := answered[v_ai] + 1;
      if v_ok then cor[v_ai] := cor[v_ai] + 1; end if;
    end loop;
    continue when (select sum(x) from unnest(answered) x) = 0;
    per := (select jsonb_agg(jsonb_build_object('name', area_names[g], 'total', tot[g], 'answered', answered[g], 'correct', cor[g]) order by g) from generate_series(1, 5) g where tot[g] > 0);
    v_att := v_att + 1;
    insert into public.attempts (id, profile_id, member_id, assignment_id, client_id, exam_slug, scope, mode, started_at, submitted_at, duration_sec, answers, times, score, key_status, device)
      values (dec0de(12, v_att), null, dec0de(2, 6000 + s.n), dec0de(3, 99), 'demo-' || v_att, 'S11-A_1ra', 'all', 'paper', v_now - interval '44 hours', v_now - interval '43 hours', 2700, ans, '{}',
              jsonb_build_object('keyed', true, 'correct', (select sum(x) from unnest(cor) x), 'answered', (select sum(x) from unnest(answered) x), 'total', (select sum(x) from unnest(tot) x), 'perArea', per), 'preliminary', 'paper');
  end loop;
  insert into public.paper_seating (assignment_id, plan) values (dec0de(3, 99), ${lit(plan)});

  -- grading models: school scale, a curve for Matemáticas, ICFES estimate, IRT (provisional) and a teacher formula
  insert into public.grading_models (id, school_id, scope, scope_id, model, updated_by) values
    (dec0de(11, 1), v_school, 'school', v_school, '{"_demo": true, "kind": "scale", "scale": {"min": 1, "max": 5, "pass": 3, "passPct": 60, "decimals": 1}}', v_me)
    on conflict (scope, scope_id) do nothing;
  insert into public.grading_models (id, school_id, scope, scope_id, model, updated_by) values
    (dec0de(11, 2), v_school, 'course', dec0de(1, 1), '{"_demo": true, "kind": "scale", "scale": {"min": 1, "max": 5, "pass": 3, "passPct": 60, "decimals": 1}, "curves": {"Matemáticas": {"strict": 0.9, "bonus": 4}}, "partial": {"hintCredit": 0.5, "wrongPenalty": 0}}', v_me),
    (dec0de(11, 3), v_school, 'assignment', dec0de(3, 63), '{"_demo": true, "kind": "icfes"}', v_me),
    (dec0de(11, 4), v_school, 'assignment', dec0de(3, 33), '{"_demo": true, "kind": "irt"}', v_me),
    (dec0de(11, 5), v_school, 'assignment', dec0de(3, 15), '{"_demo": true, "kind": "formula", "formula": {"expr": "round(pct / 20 - hints * 0.05, 1)", "unit": "", "decimals": 1}}', v_me);

  insert into public.saved_charts (id, school_id, owner_id, name, spec, created_at) values
    ${charts.map((p, i) => `(dec0de(5, ${i + 1}), v_school, v_me, '${p.name}', ${lit(p.spec)}, v_now - interval '${6 - i} days')`).join(",\n    ")};

  -- lessons and a saved activity format
  insert into public.lessons (id, school_id, owner_id, title, exam_slug, items, settings, visibility, updated_at)
    select dec0de(4, 1), v_school, v_me, 'Repaso: leer tablas y gráficos', 'S11-A_1ra',
           ${lit([{ type: "text", title: "Qué vamos a hacer hoy", body: "- Leer una tabla antes de mirar las opciones\n- Justificar la respuesta con un dato" }])} || coalesce((select jsonb_agg(jsonb_build_object('type', 'q', 'key', key) order by ord) from (select key, ord from d_bank where slug = 'S11-A_1ra' and area = 'M' order by ord limit 6) x), '[]'::jsonb)
           || ${lit([{ type: "text", title: "Para llevar", body: "Subraya el dato que usaste. Si no lo encuentras, vuelve a leer la pregunta." }])},
           '{"hideOptions": false, "seconds": 60, "titleSlide": true}', 'school', v_now - interval '3 days';
  insert into public.lessons (id, school_id, owner_id, title, exam_slug, items, settings, visibility, updated_at)
    select dec0de(4, 2), v_school, v_me, 'Argumentos en un texto', 'S11-A_1ra',
           coalesce((select jsonb_agg(jsonb_build_object('type', 'q', 'key', key) order by ord) from (select key, ord from d_bank where slug = 'S11-A_1ra' and area = 'L' order by ord limit 4) x), '[]'::jsonb),
           '{"hideOptions": false, "seconds": 90, "titleSlide": true}', 'school', v_now - interval '5 days';
  insert into public.activity_formats (id, school_id, owner_id, name, config, visibility, created_at)
    values (dec0de(6, 1), v_school, v_me, 'Quiz de salida (un intento)', '{"kind": "homework", "instant": false, "hints": false, "reveal": "after_close", "attempts": 1, "limit": "", "proctor": false}', 'private', v_now - interval '9 days');

  -- teacher workspace: statuses, follow-up, groups, notes, saved views
  insert into public.student_statuses (id, school_id, label, color, position, created_by) values
    (dec0de(7, 1), v_school, 'Al día', '#5ED3B4', 0, v_me), (dec0de(7, 2), v_school, 'En observación', '#FFB547', 1, v_me),
    (dec0de(7, 3), v_school, 'Necesita apoyo', '#FF7F6E', 2, v_me), (dec0de(7, 4), v_school, 'Con plan de refuerzo', '#8AB4FF', 3, v_me),
    (dec0de(7, 5), v_school, 'Avanza muy bien', '#C8F04A', 4, v_me);
  create temp table d_rank on commit drop as
    select st.n, st.home, st.email, coalesce(avg(case when (a.score ->> 'total')::int > 0 then (a.score ->> 'correct')::numeric / (a.score ->> 'total')::numeric end), 0) as avg
    from d_students st
    left join public.course_members cm on cm.email = st.email and cm.id::text like 'dec0de00-%'
    left join public.attempts a on a.member_id = cm.id and a.mode <> 'paper'
    group by st.n, st.home, st.email;
  insert into public.student_flags (school_id, email, status_id, follow_up, follow_up_due, follow_up_reason, updated_by, updated_at)
    select v_school, email,
           dec0de(7, case when rn <= 7 then 3 when rn <= 14 then 2 when rn <= 24 then 4 else 5 end),
           rn <= 9, case when rn <= 9 then current_date + (rn - 3)::int end,
           case when rn <= 9 then case when rn % 2 = 0 then 'Hablar con acudiente' else 'Revisar tareas pendientes' end end,
           v_me, v_now - (rn % 7) * interval '1 day'
    from (select email, row_number() over (order by avg, n) as rn, count(*) over () as cnt from d_rank) r
    where rn <= 24 or rn > cnt - 10;
  insert into public.student_groups (id, school_id, course_id, name, color, created_by) values
    (dec0de(8, 1), v_school, dec0de(1, 1), 'Refuerzo de matemáticas', '#FFB547', v_me),
    (dec0de(8, 2), v_school, null, 'Tutores entre pares', '#C8F04A', v_me),
    (dec0de(8, 3), v_school, dec0de(1, 3), 'Taller de lectura', '#8AB4FF', v_me);
  insert into public.student_group_members (group_id, email, added_by)
    select dec0de(8, 1), email, v_me from (select email from d_rank where home = 1 order by avg, n limit 8) x
    union all select dec0de(8, 2), email, v_me from (select email from d_rank order by avg desc, n limit 6) y
    union all select dec0de(8, 3), email, v_me from (select email from d_rank where home = 2 order by avg, n limit 7) z;
  insert into public.student_notes (id, school_id, email, body, author_id, author_name, created_at)
    select dec0de(9, rn::int), v_school, email,
           (array['Habló con la mamá: se compromete a revisar las tareas por la plataforma.', 'Mejoró en gráficos, sigue flojo en probabilidad. Asignar refuerzo.',
                  'Se distrae en los simulacros con tiempo; sentarlo adelante.', 'Muy buena actitud, puede ayudar a sus compañeros.'])[rn::int],
           v_me, v_name, v_now - (2 + rn * 3) * interval '1 day'
    from (select email, row_number() over (order by avg, n) as rn from d_rank) r where rn <= 4;
  insert into public.saved_views (id, profile_id, name, filters) values
    (dec0de(10, 1), v_me, 'Necesitan apoyo', ${lit({ q: "", course: "", group: "", status: did(7, 3), alert: "", followUp: "", joined: "", work: "", weakArea: "", minAvg: "", maxAvg: "", sort: "name" })}),
    (dec0de(10, 2), v_me, 'Seguimiento pendiente', ${lit({ q: "", course: "", group: "", status: "", alert: "", followUp: "yes", joined: "", work: "", weakArea: "", minAvg: "", maxAvg: "", sort: "name" })});

  select count(*) into v_rows from public.attempts where client_id like 'demo-%';
  raise notice 'Listo: 6 espacios, 120 estudiantes, % entregas de demostración. Entra a la app con tu cuenta.', v_rows;
end $seed$;
`;

const helper = `-- Id de demostración: siempre empiezan por dec0de00 (así el borrado sabe qué quitar).
create or replace function pg_temp.dec0de(kind int, n int) returns uuid language sql immutable as
$$ select ('dec0de00-' || lpad(to_hex(kind), 4, '0') || '-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
`;
writeFileSync(out + "seed.sql", helper + seed.replace(/(?<![\w.])dec0de\(/g, "pg_temp.dec0de("));
writeFileSync(out + "clean.sql", clean);
console.log("wrote seed.sql", (helper + seed).length, "bytes and clean.sql");
