-- Borra los datos de demostración (todo lo que creó el seed). No toca nada más.
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
