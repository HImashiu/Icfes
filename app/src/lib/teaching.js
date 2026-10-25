// Who teaches what. A class space ("course") is one group (11A) with one subject and its teachers. The teacher
// panel shows everything through a context: a subject and, optionally, one class. A teacher's contexts are the
// subjects they teach; coordination also has "Todo el colegio". A group director also reads every subject of
// their group (migration 0018), without editing it.
import { AREA_COLORS } from "./brand.js";
import { gradeLabel } from "./spaces.js";

export const AREAS = Object.keys(AREA_COLORS);
export const MIXED = "Varias áreas";

// School subjects grouped into the five ICFES areas. "Todas las áreas" (a full Saber 11 prep class) has none.
export const SUBJECT_AREA = {
  "Lectura crítica": "Lectura crítica",
  Español: "Lectura crítica",
  Matemáticas: "Matemáticas",
  "Sociales y ciudadanas": "Sociales y ciudadanas",
  "Ciencias naturales": "Ciencias naturales",
  Física: "Ciencias naturales",
  Química: "Ciencias naturales",
  Biología: "Ciencias naturales",
  Inglés: "Inglés",
};
const SHORT = { "Sociales y ciudadanas": "Sociales", "Ciencias naturales": "Naturales", "Lectura crítica": "Lectura crítica" };
export const areaShort = (a) => SHORT[a] ?? a;
export const contextColor = (key) => AREA_COLORS[key] ?? "var(--accent)";

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The ICFES area of a class: from its subject, or from its name for spaces made before subjects existed.
export function areaOf(course) {
  if (course?.subject && course.subject in SUBJECT_AREA) return SUBJECT_AREA[course.subject];
  if (course?.subject) return null;
  const name = fold(course?.name);
  const hit = Object.keys(SUBJECT_AREA).find((s) => name.startsWith(fold(s)));
  return hit ? SUBJECT_AREA[hit] : null;
}

// Grade and group read from the end of a class name: "Matemáticas 11 A", "11-A", "Curso Preparación Saber 11 C".
// Mirrors public.name_grade_group() in migration 0025, which fills them in on classes made without them.
export function gradeGroupFromName(name) {
  const m = String(name ?? "").trim().match(/(?:^|[^\d])(\d{1,2})\s*[-°º]?\s*([A-Za-z]|\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 13) return null;
  return { grade: String(Number(m[1])), label: m[2].toUpperCase() };
}

// The group a class belongs to: grade + group label ("11A"). Older spaces without them get them from their name
// ("Matemáticas 11 A"), or else use their own name.
export function groupOf(course) {
  let grade = course?.grade ? String(course.grade) : "";
  let label = String(course?.group_label ?? "").trim();
  if (!label) {
    const parsed = gradeGroupFromName(course?.name);
    if (parsed && (!grade || grade === parsed.grade)) ({ grade, label } = parsed);
  }
  if (grade && label) return { key: `${grade}|${label.toUpperCase()}`, name: `${grade}${label.toUpperCase()}`, grade, label: label.toUpperCase() };
  if (grade) return { key: `${grade}|`, name: `Grado ${gradeLabel(grade)}`, grade, label: "" };
  return { key: `name|${course?.name ?? course?.id}`, name: course?.name ?? "Sin grupo", grade: "", label: "" };
}

const teachersOf = (courseId, members) => members.filter((m) => m.course_id === courseId && m.role === "teacher");
const studentsOf = (courseId, members) => members.filter((m) => m.course_id === courseId && m.role === "student");

// Does a subject grant (migration 0020) cover this class? area "*" is every area; no grade is every grade.
export const grantCovers = (g, course) => (g.area === "*" || g.area === areaOf(course)) && (!g.grade || String(g.grade) === String(course?.grade ?? ""));

// The label a class carries everywhere: subject first, then the curso ("Matemáticas · 11A"), so two classes of the
// same curso never look alike.
export function classLabel(course) {
  if (!course) return "";
  const g = groupOf(course);
  if (!course.grade) return course.name ?? "";
  const area = areaOf(course);
  const subject = course.subject === "Todas las áreas" ? "Todas las áreas" : course.subject || (area ? areaShort(area) : null);
  return subject ? `${subject} · ${g.name}` : course.name ?? g.name;
}

// The classes this person works with. Row-level security already returns only the classes a teacher may see, so
// every class stays; readOnly marks the ones they only read: view-only roster rows and subject grants (migration
// 0020) and groups they direct (migration 0018) without teaching them.
export function myClasses({ courses, members = [], profile, directors = [], grants = [] }) {
  if (profile?.role === "school_admin") return courses.map((c) => ({ ...c, readOnly: false }));
  const me = (m) => (profile?.id && m.profile_id === profile.id) || (profile?.email && fold(m.email) === fold(profile.email));
  const mine = grants.filter((g) => g.profile_id === profile?.id);
  const directed = new Set(directors.filter((d) => d.profile_id === profile?.id).map((d) => `${d.grade}|${String(d.group_label ?? "").toUpperCase()}`));
  return courses.map((c) => {
    const rows = teachersOf(c.id, members).filter(me);
    const edits = c.created_by === profile?.id || rows.some((m) => (m.access ?? "edit") === "edit") || mine.some((g) => g.access === "edit" && grantCovers(g, c));
    const reads = rows.length > 0 || mine.some((g) => grantCovers(g, c)) || directed.has(groupOf(c).key);
    return { ...c, readOnly: !edits && reads };
  });
}

// Subjects (by ICFES area) with their classes, and cursos (11A) with their subjects, for the context switcher.
export function buildContexts({ courses, members = [], profile, directors = [], grants = [] }) {
  const mine = myClasses({ courses, members, profile, directors, grants });
  const bySubject = new Map();
  const byGroup = new Map();
  for (const c of mine) {
    const key = areaOf(c) ?? MIXED;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(c);
    const g = groupOf(c);
    if (!byGroup.has(g.key)) byGroup.set(g.key, { ...g, classes: [] });
    byGroup.get(g.key).classes.push(c);
  }
  const order = [...AREAS, MIXED];
  const subjects = [...bySubject]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([key, list]) => ({
      key,
      label: key,
      color: contextColor(key),
      classes: list
        .map((c) => ({ id: c.id, name: groupOf(c).name, full: classLabel(c), students: studentsOf(c.id, members).length, readOnly: c.readOnly }))
        .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
    }));
  const groups = [...byGroup.values()]
    .map((g) => ({
      key: g.key,
      name: g.name,
      grade: g.grade,
      classes: g.classes
        .map((c) => { const area = areaOf(c) ?? MIXED; return { id: c.id, area, name: c.subject && c.subject !== area ? c.subject : areaShort(area === MIXED ? "Varias áreas" : area), color: contextColor(area), readOnly: c.readOnly }; })
        .sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  return { admin: profile?.role === "school_admin", subjects, groups, all: mine.map((c) => c.id), readOnly: mine.filter((c) => c.readOnly).map((c) => c.id) };
}

// The class ids a context covers. { subject: null } is everything this person sees; { group } is one curso.
export function contextCourseIds(contexts, ctx) {
  if (ctx?.courseId) return [ctx.courseId];
  if (ctx?.group) return contexts.groups?.find((g) => g.key === ctx.group)?.classes.map((c) => c.id) ?? [];
  if (!ctx?.subject) return contexts.all;
  return contexts.subjects.find((s) => s.key === ctx.subject)?.classes.map((c) => c.id) ?? [];
}

export function contextLabel(contexts, ctx) {
  const all = contexts.admin ? "Todo el colegio" : "Todas mis clases";
  if (ctx?.group && !ctx.courseId) {
    const g = contexts.groups?.find((x) => x.key === ctx.group);
    return g ? `${g.name} · todas las materias` : all;
  }
  if (!ctx?.subject) return all;
  const subject = contexts.subjects.find((s) => s.key === ctx.subject);
  if (!subject) return all;
  const short = areaShort(subject.label);
  if (!ctx.courseId) return contexts.admin ? short : `${short} · todos mis cursos`;
  const cls = subject.classes.find((c) => c.id === ctx.courseId);
  return cls ? `${short} · ${cls.name}` : short;
}

// A context that still exists after the classes change; otherwise everything.
export function validContext(contexts, ctx) {
  if (ctx?.group && !ctx.courseId) return contexts.groups?.some((g) => g.key === ctx.group) ? { subject: null, courseId: null, group: ctx.group } : { subject: null, courseId: null };
  if (!ctx?.subject) return { subject: null, courseId: null };
  const subject = contexts.subjects.find((s) => s.key === ctx.subject);
  if (!subject) return { subject: null, courseId: null };
  if (ctx.courseId && !subject.classes.some((c) => c.id === ctx.courseId)) return { subject: subject.key, courseId: null };
  return { subject: subject.key, courseId: ctx.courseId ?? null };
}

// Groups × areas for coordination: who teaches each subject in each group. A cell may hold several classes
// (Física and Química both count as Naturales). staffRoles maps profile id to role, so the coordinator who
// created a class is not listed as its teacher.
export function classMatrix({ courses, members = [], staffRoles = {}, directors = [], records = [] }) {
  const groups = new Map();
  const cells = new Map();
  let mixed = false;
  for (const r of records) {
    const label = String(r.label ?? "").toUpperCase();
    const key = `${r.grade}|${label}`;
    if (!groups.has(key)) groups.set(key, { key, name: `${r.grade}${label}`, grade: String(r.grade), label, students: new Set(), director: null, record: r });
  }
  for (const c of courses) {
    const g = groupOf(c);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, students: new Set(), director: null, record: null });
    for (const m of studentsOf(c.id, members)) groups.get(g.key).students.add(fold(m.email));
    const area = areaOf(c) ?? MIXED;
    if (area === MIXED) mixed = true;
    const all = teachersOf(c.id, members);
    const editors = all.filter((m) => (m.access ?? "edit") === "edit");
    const teachers = all.filter((m) => staffRoles[m.profile_id] !== "school_admin" || editors.length === 1 || (m.access ?? "edit") === "view")
      .map((m) => ({ name: m.full_name || m.email, email: m.email, profileId: m.profile_id, memberId: m.id, access: m.access ?? "edit" }))
      .sort((a, b) => (a.access === b.access ? 0 : a.access === "edit" ? -1 : 1));
    const key = `${g.key}::${area}`;
    cells.set(key, [...(cells.get(key) ?? []), { course: c, teachers }]);
  }
  for (const d of directors) {
    const g = groups.get(`${d.grade}|${String(d.group_label ?? "").toUpperCase()}`);
    if (g) g.director = d;
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, students: g.students.size }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  const areas = mixed ? [...AREAS, MIXED] : AREAS;
  const hasEditor = (k) => (cells.get(k) ?? []).some((x) => x.teachers.some((t) => t.access === "edit"));
  const missingIn = (g) => areas.filter((a) => a !== MIXED && !hasEditor(`${g.key}::${a}`)).length;
  const missing = list.reduce((n, g) => n + missingIn(g), 0);
  // Subjects with no class at all in a curso (every curso should have its five).
  const missingClasses = (g) => AREAS.filter((a) => !(cells.get(`${g.key}::${a}`) ?? []).length).length;
  return { groups: list, areas, cell: (groupKey, area) => cells.get(`${groupKey}::${area}`) ?? [], missing, missingIn, missingClasses };
}

// The subject name a new class gets when coordination fills an empty cell of an area.
export const AREA_SUBJECT = {
  "Lectura crítica": "Lectura crítica",
  Matemáticas: "Matemáticas",
  "Sociales y ciudadanas": "Sociales y ciudadanas",
  "Ciencias naturales": "Ciencias naturales",
  Inglés: "Inglés",
};

// The same API, narrowed to some classes: every list the teacher screens read is filtered, so each screen obeys
// the context without knowing about it. null means no narrowing.
export function scopeApi(api, courseIds) {
  if (!api || !courseIds) return api;
  const ids = new Set(courseIds);
  let assignmentIds = null;
  const inScope = async () => {
    if (!assignmentIds) assignmentIds = new Set((await api.listAssignments()).filter((a) => ids.has(a.course_id)).map((a) => a.id));
    return assignmentIds;
  };
  const byAssignment = (fn) => async (...args) => {
    const [rows, allowed] = await Promise.all([fn(...args), inScope()]);
    return Array.isArray(rows) ? rows.filter((r) => r.assignment_id == null || allowed.has(r.assignment_id)) : rows;
  };
  return {
    ...api,
    listCourses: async () => (await api.listCourses()).filter((c) => ids.has(c.id)),
    listAssignments: async () => (await api.listAssignments()).filter((a) => ids.has(a.course_id)),
    allMembers: async () => (await api.allMembers()).filter((m) => ids.has(m.course_id)),
    allAttempts: byAssignment(api.allAttempts),
    reportAttempts: api.reportAttempts && byAssignment(api.reportAttempts),
    chartAttempts: api.chartAttempts && byAssignment(api.chartAttempts),
  };
}
