-- Fix: creating a course failed with "new row violates row-level security policy".
-- The app inserts a course and reads it back in one statement (insert ... returning). The read-back is checked
-- against courses_select before the trigger has added the creator to course_members, so the creator could not read
-- the row they had just made. The creator may always read their own course.
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select
  using (created_by = auth.uid() or public.is_course_member(id) or public.is_course_teacher(id));
