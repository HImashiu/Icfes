-- Id de demostración: siempre empiezan por dec0de00 (así el borrado sabe qué quitar).
create or replace function pg_temp.dec0de(kind int, n int) returns uuid language sql immutable as
$$ select ('dec0de00-' || lpad(to_hex(kind), 4, '0') || '-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid $$;
-- Colegio de demostración dentro de tu cuenta real: 6 espacios de clase, 120 estudiantes inventados, 8 semanas de trabajo,
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
  firsts text[] := array['Valentina', 'Santiago', 'Sofía', 'Mateo', 'Isabella', 'Samuel', 'Camila', 'Juan Esteban', 'Mariana', 'Sebastián', 'Daniela', 'Nicolás', 'Luciana', 'Emmanuel', 'Gabriela', 'Andrés', 'Salomé', 'Tomás', 'Paula', 'Felipe', 'Manuela', 'David', 'Juliana', 'Alejandro', 'Sara', 'Miguel Ángel', 'Laura', 'Simón', 'Natalia', 'Joaquín', 'Antonia', 'Esteban', 'María José', 'Daniel', 'Catalina', 'Julián', 'Ana Sofía', 'Cristian', 'Karen', 'Brayan', 'Luisa', 'Diego', 'Tatiana', 'Kevin', 'Mónica', 'Jhon', 'Yurany', 'Óscar', 'Lina', 'Camilo'];
  lasts text[] := array['Rodríguez', 'Gómez', 'González', 'Martínez', 'López', 'Hernández', 'Díaz', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Vargas', 'Castro', 'Rojas', 'Moreno', 'Jiménez', 'Ortiz', 'Gutiérrez', 'Ruiz', 'Mendoza', 'Cárdenas', 'Pineda', 'Quintero', 'Ospina', 'Cortés', 'Arias', 'Salazar', 'Parra', 'Herrera', 'Zapata', 'Acosta', 'Cifuentes', 'Bermúdez', 'Reyes', 'Montoya', 'Calderón', 'Duarte', 'Franco', 'Lozano', 'Navarro'];
  teachers text[] := array['Marcela Ríos', 'Hernán Castaño', 'Liliana Peña', 'Jorge Ballesteros', 'Adriana Fonseca', 'Ricardo Tamayo'];
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
    from (values ('S11-A_1ra', '1BM1 2BM4 3AM1 5BM1 7BM2 8AM2 9AM3 11CM4 12DM4 13AM1 14DM4 15DM2 16AM2 17CM1 19CM3 20AM3 21AM3 22CM4 23CM5 24AM3 25DM2 26DL2 27CL3 28AL2 29AL3 31BL4 32AL3 33DL5 34AL1 36BL2 37CL1 38AL1 39CL2 40BL3 41AL3 42DL3 43CL1 44AL1 45AL1 46BL2 47CL1 48BL2 49DL4 50AL5 52DL1 53CL4 54AL3 55DL5 56DL4 60CL4 61BL4 62DL4 65DL4 66CL2 67CS4 68BS3 69BS4 70CS1 71AS1 73AS1 74CS4 75CS1 76CS4 77AS2 78BS2 79AS1 81DS2 82DS4 83CS2 84CS2 85AS5 86DS3 87AS3 88AS5 89BS3 90DS3 92DN2 95AN1 97BN1 98AN5 99DN5 100AN4 101CN5 102BN2 103AN2 104DN3 105CN1 107AN1 108DN1 109DN3 110BN4 113BN3 116BN2 117DN1 118CN3 119BN2 120AN4'), ('S11-A_2da', '1AS2 2BS2 3BS2 4BS5 5CS2 6BS2 7DS3 8CS3 9CS4 10DS4 11DS5 12AS4 13DS5 14BS1 15BS3 16CS1 17CS1 18CS5 19CS5 20AS1 21AS4 22DS3 23AS1 25BS3 26CM1 29AM4 30BM3 31BM2 32CM5 33CM3 34CM1 35BM1 37DM5 38AM3 39BM5 40BM1 41AM3 42BM2 43CM4 44DM5 45BM2 47BM2 48DM4 49BM4 50AM1 52BN4 53AN2 54BN1 56BN2 57BN4 59BN2 60AN3 61CN4 62DN3 65BN4 67DN3 68CN1 69CN4 70BN2 71DN2 72BN5 73AN3 74BN5 76AN2 78BN1 79CN3 80BI1 81AI1 82BI3 84BI1 85BI1 86GI1 87HI1 88DI1 89CI2 90CI1 91BI3 92BI1 94CI2 95BI2 96CI3 97AI3 98CI2 99CI4 100BI2 101BI4 102CI2 107CI3 108BI2 109CI3 110DI5 111DI3 112CI5 113AI5 114CI5 115BI4 116DI4 117CI4 118CI5 119BI5 121BI5 122DI4 123AI4 124BI4')) as b(slug, items),
         lateral regexp_matches(b.items, '(\d+)([A-D])([MLSNI])(\d)', 'g') with ordinality as m(a, o);

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
      values (pg_temp.dec0de(1, c.idx), v_school, c.name, '11', 2026, v_me, c.subject, c.grp);
    insert into public.course_members (id, course_id, profile_id, email, full_name, role)
      values (pg_temp.dec0de(2, c.idx * 1000), pg_temp.dec0de(1, c.idx), null, lower(replace(translate(c.teacher, 'áéíóú ', 'aeiou.'), '..', '.')) || '@demo.invalid', c.teacher, 'teacher');
    insert into public.course_members (id, course_id, profile_id, email, full_name, role)
      select pg_temp.dec0de(2, c.idx * 1000 + st.n), pg_temp.dec0de(1, c.idx), null, st.email, st.name, 'student' from d_students st where st.home = c.home;
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
        values (pg_temp.dec0de(3, c.idx * 10 + j), pg_temp.dec0de(1, c.idx), v_me, kinds[j], c.titles[j], v_slug, v_scope, v_keys, v_open, v_due, case when v_exam then 45 end,
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
          values (pg_temp.dec0de(12, v_att), null, pg_temp.dec0de(2, c.idx * 1000 + s.n), pg_temp.dec0de(3, c.idx * 10 + j), 'demo-' || v_att, v_slug, v_scope, case when v_exam then 'timed' else 'practice' end,
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
    values (pg_temp.dec0de(3, 99), pg_temp.dec0de(1, 6), v_me, 'exam', 'Simulacro en papel · sesión 1', 'S11-A_1ra', 'all', v_keys, v_now - interval '2 days', v_now - interval '1 day', 45, 'after_close', 'active', v_now - interval '6 hours', false, false, false, 1);
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
      values (pg_temp.dec0de(12, v_att), null, pg_temp.dec0de(2, 6000 + s.n), pg_temp.dec0de(3, 99), 'demo-' || v_att, 'S11-A_1ra', 'all', 'paper', v_now - interval '44 hours', v_now - interval '43 hours', 2700, ans, '{}',
              jsonb_build_object('keyed', true, 'correct', (select sum(x) from unnest(cor) x), 'answered', (select sum(x) from unnest(answered) x), 'total', (select sum(x) from unnest(tot) x), 'perArea', per), 'preliminary', 'paper');
  end loop;
  insert into public.paper_seating (assignment_id, plan) values (pg_temp.dec0de(3, 99), $j${"rows":7,"cols":7,"blocked":["0,3","3,3","6,3"],"versions":4,"seed":20261024,"orderSeed":7351,"apart":[],"seatVersion":{"0,0":0,"0,1":2,"0,2":0,"0,4":0,"0,5":2,"0,6":0,"1,0":3,"1,1":1,"1,2":3,"1,3":1,"1,4":3,"1,5":1,"1,6":3,"2,0":0,"2,1":2,"2,2":0,"2,3":2,"2,4":0,"2,5":2,"2,6":0,"3,0":3,"3,1":1,"3,2":3,"3,4":3,"3,5":1,"3,6":3,"4,0":0,"4,1":2,"4,2":0,"4,3":2,"4,4":0,"4,5":2,"4,6":0,"5,0":3,"5,1":1,"5,2":3,"5,3":1,"5,4":3,"5,5":1,"5,6":3,"6,0":0,"6,1":2,"6,2":0,"6,4":0,"6,5":2,"6,6":0},"seats":{"4,3":"dec0de00-0002-4000-8000-0000000017c7","5,1":"dec0de00-0002-4000-8000-0000000017d7","0,5":"dec0de00-0002-4000-8000-0000000017c5","4,6":"dec0de00-0002-4000-8000-0000000017d5","0,6":"dec0de00-0002-4000-8000-0000000017d9","0,4":"dec0de00-0002-4000-8000-0000000017da","1,5":"dec0de00-0002-4000-8000-0000000017dd","5,3":"dec0de00-0002-4000-8000-0000000017dc","2,0":"dec0de00-0002-4000-8000-0000000017e2","1,0":"dec0de00-0002-4000-8000-0000000017d2","1,2":"dec0de00-0002-4000-8000-0000000017cc","4,2":"dec0de00-0002-4000-8000-0000000017e5","1,6":"dec0de00-0002-4000-8000-0000000017df","5,4":"dec0de00-0002-4000-8000-0000000017d3","0,0":"dec0de00-0002-4000-8000-0000000017db","4,5":"dec0de00-0002-4000-8000-0000000017d8","6,0":"dec0de00-0002-4000-8000-0000000017e6","6,5":"dec0de00-0002-4000-8000-0000000017c3","3,6":"dec0de00-0002-4000-8000-0000000017cd","6,4":"dec0de00-0002-4000-8000-0000000017c8","1,3":"dec0de00-0002-4000-8000-0000000017c6","6,1":"dec0de00-0002-4000-8000-0000000017c9","0,2":"dec0de00-0002-4000-8000-0000000017c2","1,4":"dec0de00-0002-4000-8000-0000000017d4","2,2":"dec0de00-0002-4000-8000-0000000017ce","3,5":"dec0de00-0002-4000-8000-0000000017e1","2,1":"dec0de00-0002-4000-8000-0000000017d0","0,1":"dec0de00-0002-4000-8000-0000000017e8","5,2":"dec0de00-0002-4000-8000-0000000017d6","2,4":"dec0de00-0002-4000-8000-0000000017cb","2,6":"dec0de00-0002-4000-8000-0000000017d1","2,5":"dec0de00-0002-4000-8000-0000000017cf","3,2":"dec0de00-0002-4000-8000-0000000017e7","4,1":"dec0de00-0002-4000-8000-0000000017ca","1,1":"dec0de00-0002-4000-8000-0000000017c1","5,0":"dec0de00-0002-4000-8000-0000000017de","5,5":"dec0de00-0002-4000-8000-0000000017c4","2,3":"dec0de00-0002-4000-8000-0000000017e0","3,0":"dec0de00-0002-4000-8000-0000000017e3","6,6":"dec0de00-0002-4000-8000-0000000017e4"}}$j$::jsonb);

  -- grading models: school scale, a curve for Matemáticas, ICFES estimate, IRT (provisional) and a teacher formula
  insert into public.grading_models (id, school_id, scope, scope_id, model, updated_by) values
    (pg_temp.dec0de(11, 1), v_school, 'school', v_school, '{"_demo": true, "kind": "scale", "scale": {"min": 1, "max": 5, "pass": 3, "passPct": 60, "decimals": 1}}', v_me)
    on conflict (scope, scope_id) do nothing;
  insert into public.grading_models (id, school_id, scope, scope_id, model, updated_by) values
    (pg_temp.dec0de(11, 2), v_school, 'course', pg_temp.dec0de(1, 1), '{"_demo": true, "kind": "scale", "scale": {"min": 1, "max": 5, "pass": 3, "passPct": 60, "decimals": 1}, "curves": {"Matemáticas": {"strict": 0.9, "bonus": 4}}, "partial": {"hintCredit": 0.5, "wrongPenalty": 0}}', v_me),
    (pg_temp.dec0de(11, 3), v_school, 'assignment', pg_temp.dec0de(3, 63), '{"_demo": true, "kind": "icfes"}', v_me),
    (pg_temp.dec0de(11, 4), v_school, 'assignment', pg_temp.dec0de(3, 33), '{"_demo": true, "kind": "irt"}', v_me),
    (pg_temp.dec0de(11, 5), v_school, 'assignment', pg_temp.dec0de(3, 15), '{"_demo": true, "kind": "formula", "formula": {"expr": "round(pct / 20 - hints * 0.05, 1)", "unit": "", "decimals": 1}}', v_me);

  insert into public.saved_charts (id, school_id, owner_id, name, spec, created_at) values
    (pg_temp.dec0de(5, 1), v_school, v_me, 'Aciertos por área', $j${"rows":"area","cols":null,"metric":"acc","filters":{},"range":null,"chart":"bar","sort":"value-asc","minN":1}$j$::jsonb, v_now - interval '6 days'),
    (pg_temp.dec0de(5, 2), v_school, v_me, 'Área por espacio de clase', $j${"rows":"area","cols":"space","metric":"acc","filters":{},"range":null,"chart":"heat","sort":"name","minN":1}$j$::jsonb, v_now - interval '5 days'),
    (pg_temp.dec0de(5, 3), v_school, v_me, 'Tiempo semanal por espacio', $j${"rows":"week","cols":"space","metric":"totalMin","filters":{},"range":null,"chart":"line","sort":"name","minN":1}$j$::jsonb, v_now - interval '4 days');

  -- lessons and a saved activity format
  insert into public.lessons (id, school_id, owner_id, title, exam_slug, items, settings, visibility, updated_at)
    select pg_temp.dec0de(4, 1), v_school, v_me, 'Repaso: leer tablas y gráficos', 'S11-A_1ra',
           $j$[{"type":"text","title":"Qué vamos a hacer hoy","body":"- Leer una tabla antes de mirar las opciones\n- Justificar la respuesta con un dato"}]$j$::jsonb || coalesce((select jsonb_agg(jsonb_build_object('type', 'q', 'key', key) order by ord) from (select key, ord from d_bank where slug = 'S11-A_1ra' and area = 'M' order by ord limit 6) x), '[]'::jsonb)
           || $j$[{"type":"text","title":"Para llevar","body":"Subraya el dato que usaste. Si no lo encuentras, vuelve a leer la pregunta."}]$j$::jsonb,
           '{"hideOptions": false, "seconds": 60, "titleSlide": true}', 'school', v_now - interval '3 days';
  insert into public.lessons (id, school_id, owner_id, title, exam_slug, items, settings, visibility, updated_at)
    select pg_temp.dec0de(4, 2), v_school, v_me, 'Argumentos en un texto', 'S11-A_1ra',
           coalesce((select jsonb_agg(jsonb_build_object('type', 'q', 'key', key) order by ord) from (select key, ord from d_bank where slug = 'S11-A_1ra' and area = 'L' order by ord limit 4) x), '[]'::jsonb),
           '{"hideOptions": false, "seconds": 90, "titleSlide": true}', 'school', v_now - interval '5 days';
  insert into public.activity_formats (id, school_id, owner_id, name, config, visibility, created_at)
    values (pg_temp.dec0de(6, 1), v_school, v_me, 'Quiz de salida (un intento)', '{"kind": "homework", "instant": false, "hints": false, "reveal": "after_close", "attempts": 1, "limit": "", "proctor": false}', 'private', v_now - interval '9 days');

  -- teacher workspace: statuses, follow-up, groups, notes, saved views
  insert into public.student_statuses (id, school_id, label, color, position, created_by) values
    (pg_temp.dec0de(7, 1), v_school, 'Al día', '#5ED3B4', 0, v_me), (pg_temp.dec0de(7, 2), v_school, 'En observación', '#FFB547', 1, v_me),
    (pg_temp.dec0de(7, 3), v_school, 'Necesita apoyo', '#FF7F6E', 2, v_me), (pg_temp.dec0de(7, 4), v_school, 'Con plan de refuerzo', '#8AB4FF', 3, v_me),
    (pg_temp.dec0de(7, 5), v_school, 'Avanza muy bien', '#C8F04A', 4, v_me);
  create temp table d_rank on commit drop as
    select st.n, st.home, st.email, coalesce(avg(case when (a.score ->> 'total')::int > 0 then (a.score ->> 'correct')::numeric / (a.score ->> 'total')::numeric end), 0) as avg
    from d_students st
    left join public.course_members cm on cm.email = st.email and cm.id::text like 'dec0de00-%'
    left join public.attempts a on a.member_id = cm.id and a.mode <> 'paper'
    group by st.n, st.home, st.email;
  insert into public.student_flags (school_id, email, status_id, follow_up, follow_up_due, follow_up_reason, updated_by, updated_at)
    select v_school, email,
           pg_temp.dec0de(7, case when rn <= 7 then 3 when rn <= 14 then 2 when rn <= 24 then 4 else 5 end),
           rn <= 9, case when rn <= 9 then current_date + (rn - 3)::int end,
           case when rn <= 9 then case when rn % 2 = 0 then 'Hablar con acudiente' else 'Revisar tareas pendientes' end end,
           v_me, v_now - (rn % 7) * interval '1 day'
    from (select email, row_number() over (order by avg, n) as rn, count(*) over () as cnt from d_rank) r
    where rn <= 24 or rn > cnt - 10;
  insert into public.student_groups (id, school_id, course_id, name, color, created_by) values
    (pg_temp.dec0de(8, 1), v_school, pg_temp.dec0de(1, 1), 'Refuerzo de matemáticas', '#FFB547', v_me),
    (pg_temp.dec0de(8, 2), v_school, null, 'Tutores entre pares', '#C8F04A', v_me),
    (pg_temp.dec0de(8, 3), v_school, pg_temp.dec0de(1, 3), 'Taller de lectura', '#8AB4FF', v_me);
  insert into public.student_group_members (group_id, email, added_by)
    select pg_temp.dec0de(8, 1), email, v_me from (select email from d_rank where home = 1 order by avg, n limit 8) x
    union all select pg_temp.dec0de(8, 2), email, v_me from (select email from d_rank order by avg desc, n limit 6) y
    union all select pg_temp.dec0de(8, 3), email, v_me from (select email from d_rank where home = 2 order by avg, n limit 7) z;
  insert into public.student_notes (id, school_id, email, body, author_id, author_name, created_at)
    select pg_temp.dec0de(9, rn::int), v_school, email,
           (array['Habló con la mamá: se compromete a revisar las tareas por la plataforma.', 'Mejoró en gráficos, sigue flojo en probabilidad. Asignar refuerzo.',
                  'Se distrae en los simulacros con tiempo; sentarlo adelante.', 'Muy buena actitud, puede ayudar a sus compañeros.'])[rn::int],
           v_me, v_name, v_now - (2 + rn * 3) * interval '1 day'
    from (select email, row_number() over (order by avg, n) as rn from d_rank) r where rn <= 4;
  insert into public.saved_views (id, profile_id, name, filters) values
    (pg_temp.dec0de(10, 1), v_me, 'Necesitan apoyo', $j${"q":"","course":"","group":"","status":"dec0de00-0007-4000-8000-000000000003","alert":"","followUp":"","joined":"","work":"","weakArea":"","minAvg":"","maxAvg":"","sort":"name"}$j$::jsonb),
    (pg_temp.dec0de(10, 2), v_me, 'Seguimiento pendiente', $j${"q":"","course":"","group":"","status":"","alert":"","followUp":"yes","joined":"","work":"","weakArea":"","minAvg":"","maxAvg":"","sort":"name"}$j$::jsonb);

  select count(*) into v_rows from public.attempts where client_id like 'demo-%';
  raise notice 'Listo: 6 espacios, 120 estudiantes, % entregas de demostración. Entra a la app con tu cuenta.', v_rows;
end $seed$;
