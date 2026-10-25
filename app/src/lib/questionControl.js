// Loads what the question-control screens need: every use of every question in the school, the holds and the rules.
// Before migration 0021 runs, the uses are rebuilt from this teacher's own lists, holds are unavailable (null) and the
// rules are the defaults.
import { DEFAULT_RULES, holdFromRow, normalizeRules, useFromRow, usesFromLists, WHOLE } from "./questionUse.js";

const soft = (fn) => Promise.resolve().then(fn).catch(() => null);

export async function loadQuestionControl(api) {
  const [rows, holds, rules] = await Promise.all([soft(() => api.questionUses?.()), soft(() => api.questionHolds?.()), soft(() => api.questionRules?.())]);
  let uses;
  let schoolWide = true;
  if (Array.isArray(rows)) uses = rows.map(useFromRow);
  else {
    schoolWide = false;
    const [assignments, lessons, live, courses, staff] = await Promise.all([
      soft(() => api.listAssignments()), soft(() => api.lessons?.()), soft(() => api.liveHistory?.()), soft(() => api.listCourses()), soft(() => api.listStaff?.()),
    ]);
    uses = usesFromLists({ assignments: assignments ?? [], lessons: lessons ?? [], live: live ?? [], courses: courses ?? [], staff: staff ?? [] });
  }
  return {
    uses,
    schoolWide,
    holds: Array.isArray(holds) ? holds.map(holdFromRow) : null,
    rules: rules ? normalizeRules(rules) : { ...DEFAULT_RULES },
    rulesSaved: rules !== null,
  };
}

// The rows to upsert for holding some keys of a booklet (key null = the whole booklet).
export const holdRows = ({ schoolId, userId, slug, keys, reserve, hide, label = "", until = null, assignmentId = null }) =>
  keys.map((k) => ({
    school_id: schoolId, exam_slug: slug, qkey: k ?? WHOLE, reserve: Boolean(reserve), hide_from_students: Boolean(hide),
    label: String(label ?? "").slice(0, 120), until, assignment_id: assignmentId, created_by: userId,
  }));
