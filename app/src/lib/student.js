// The student's side of "by subject": each class they belong to (a subject with its teacher), and an analysis of
// their own practice per ICFES area. Never compares a student with classmates.
import { firstTries } from "./firstTry.js";
import { assignmentState, attemptsLeft, scorePct } from "./assignments.js";
import { AREA_SUBJECT, areaOf, contextColor, groupOf } from "./teaching.js";

const DAY = 864e5;
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Classes from the database (student_classes(), migration 0018) or, before it runs, from the assignments' course names.
export function classesFrom({ classes, assignments = [] }) {
  if (classes?.length) return classes;
  const seen = new Map();
  for (const a of assignments) if (a.course_id && !seen.has(a.course_id)) seen.set(a.course_id, { id: a.course_id, name: a.courses?.name ?? "Mi clase", teachers: [] });
  return [...seen.values()];
}

const GENERAL = "Simulacros Saber 11";

// One card per SUBJECT the student has, each with its teacher(s), what is pending, the next due date and the
// student's own average. A class with a subject (Matemáticas 11A) is a subject. A class without one ("11-A", or a
// "Todas las áreas" prep class) is the student's course, not a subject: its tasks are filed under the area each task
// covers, and its whole-exam simulacros under "Simulacros Saber 11".
export function studentSubjects({ classes, assignments = [], attempts = [], now = Date.now() }) {
  const delivered = new Set(attempts.filter((t) => t.submitted_at).map((t) => t.assignment_id));
  const cards = new Map();
  const card = (key, base) => {
    if (!cards.has(key)) cards.set(key, { ...base, teachers: new Set(), courseTeachers: new Set(), groups: new Set(), courseIds: new Set(), items: [] });
    return cards.get(key);
  };
  const byArea = new Map(); // area -> card key, so a course task joins the subject class of the same area
  const list = classesFrom({ classes, assignments });
  for (const c of list) {
    const area = areaOf(c);
    if (!area) continue;
    const key = byArea.get(area) ?? c.id;
    byArea.set(area, key);
    const x = card(key, { id: key, name: c.subject || AREA_SUBJECT[area] || c.name, full: c.name, area, kind: "subject" });
    x.courseIds.add(c.id);
    (c.teachers ?? []).filter(Boolean).forEach((t) => x.teachers.add(t));
    x.groups.add(groupOf(c).name);
    x.items.push(...assignments.filter((a) => a.course_id === c.id));
  }
  for (const c of list) {
    if (areaOf(c)) continue;
    for (const a of assignments.filter((t) => t.course_id === c.id)) {
      const area = a.scope && a.scope !== "all" && a.scope in AREA_SUBJECT ? a.scope : null;
      const key = area ? byArea.get(area) ?? `area:${area}` : `general:${c.id}`;
      if (area) byArea.set(area, key);
      const x = card(key, area ? { id: key, name: AREA_SUBJECT[area], full: c.name, area, kind: "subject" } : { id: key, name: GENERAL, full: c.name, area: null, kind: "general" });
      x.courseIds.add(c.id);
      // A course task in an area with no class of its own: its teacher is the course's teacher, not the subject's.
      const subjectClass = area && !String(key).startsWith("area:");
      if (area && !subjectClass) x.noClass = true;
      (c.teachers ?? []).filter(Boolean).forEach((t) => (subjectClass || !area ? x.teachers : x.courseTeachers).add(t));
      x.groups.add(groupOf(c).name);
      x.items.push(a);
    }
  }
  // Every ICFES area is a subject of the exam, even before the school names a class for it: its card shows the
  // student's results in that area (also from whole-exam simulacros) and who teaches it, when the school says so.
  const courseTeachers = [...new Set(list.filter((c) => !areaOf(c)).flatMap((c) => (c.teachers ?? []).filter(Boolean)))];
  for (const area of AREA_ORDER) {
    if (byArea.has(area)) continue;
    const x = card(`area:${area}`, { id: `area:${area}`, name: AREA_SUBJECT[area], full: AREA_SUBJECT[area], area, kind: "subject" });
    list.filter((c) => !areaOf(c)).forEach((c) => { x.courseIds.add(c.id); x.groups.add(groupOf(c).name); });
    x.noClass = true;
    courseTeachers.forEach((t) => x.courseTeachers.add(t));
  }
  const areaScores = (area) => attempts.filter((t) => t.submitted_at && t.score?.keyed)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
    .map((t) => (t.score.perArea ?? []).find((p) => p.name === area))
    .filter((p) => p && (p.total || p.answered))
    .map((p) => Math.round((p.correct / (p.total || p.answered)) * 100));
  return [...cards.values()].map((x) => {
    const mine = x.items;
    const pending = mine.filter((a) => assignmentState(a, now) === "active" && !delivered.has(a.id))
      .sort((a, b) => new Date(a.due_at ?? 8.64e15) - new Date(b.due_at ?? 8.64e15));
    const own = attempts.filter((t) => t.submitted_at && mine.some((a) => a.id === t.assignment_id))
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)).map(scorePct).filter((p) => p != null);
    // Without tasks of its own, an area shows how the student did in it inside every delivered task.
    const scores = own.length || !x.area ? own : areaScores(x.area);
    return {
      id: x.id,
      kind: x.kind,
      name: x.name,
      full: x.full,
      group: [...x.groups].join(", "),
      area: x.area,
      color: x.area ? contextColor(x.area) : "var(--accent)",
      teacher: [...x.teachers].join(", "),
      // No class of this subject yet: the course's teacher(s), shown as such.
      courseTeacher: [...x.courseTeachers].join(", "),
      noClass: Boolean(x.noClass),
      fromTasks: own.length > 0,
      courseIds: [...x.courseIds],
      assignmentIds: mine.map((a) => a.id),
      pending: pending.length,
      next: pending[0] ?? null,
      done: mine.filter((a) => delivered.has(a.id)).length,
      total: mine.length,
      avg: mean(scores),
      // What the student sees: the result of their latest activity, never an average across activities.
      last: scores.length ? scores[scores.length - 1] : null,
      series: scores.slice(-6),
    };
  }).sort((a, b) => (a.kind === "general") - (b.kind === "general") || AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area));
}

const AREA_ORDER = Object.keys(AREA_SUBJECT);

// The student's course(s), named as the school names them ("11A"), from every class they are in.
export function studentCourses(classes = []) {
  return [...new Set((classes ?? []).map((c) => groupOf(c).name))];
}

// Every task with what the student sees about it: state, attempts used, own score, and the subject it belongs to.
export function studentTasks({ subjects, assignments = [], attempts = [], now = Date.now() }) {
  const of = new Map();
  for (const s of subjects) for (const id of s.assignmentIds) of.set(id, s);
  return assignments.filter((a) => a.status !== "draft").map((a) => {
    const mine = attempts.filter((t) => t.assignment_id === a.id && t.submitted_at).sort((x, y) => new Date(x.submitted_at) - new Date(y.submitted_at));
    const state = assignmentState(a, now);
    // A paper activity is answered on the printed sheet in the classroom: it never opens in the app.
    const status = mine.length ? "delivered" : a.delivery === "paper" ? "paper" : state === "active" ? "pending" : state === "scheduled" ? "scheduled" : "missed";
    const last = mine[mine.length - 1];
    return { a, subject: of.get(a.id) ?? null, status, used: mine.length, pct: last ? scorePct(last) : null, deliveredAt: last?.submitted_at ?? null, left: attemptsLeft(a, mine.length), state };
  }).sort((x, y) => {
    const rank = { pending: 0, paper: 1, scheduled: 1, delivered: 2, missed: 3 };
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    const dx = new Date(x.a.due_at ?? 8.64e15); const dy = new Date(y.a.due_at ?? 8.64e15);
    return x.status === "pending" || x.status === "scheduled" ? dx - dy : dy - dx;
  });
}

// What the practice history says, per area and overall. history: loadHistory() rows, newest first.
// The analysis by area uses first tries only (firstTry.js), so redoing questions never raises it, and an area's
// share right is shown only once it rests on MIN_AREA_ANSWERS new questions (`enough`).
export const MIN_AREA_ANSWERS = 40;
export function practiceInsights(history = [], now = Date.now()) {
  const rows = [...history].filter((h) => h.keyed !== false).sort((a, b) => a.at - b.at);
  const first = firstTries(rows);
  const areas = new Map();
  let seconds = 0;
  let timedQs = 0;
  for (const h of rows) {
    if (first.get(h)?.first === false) continue;
    for (const a of h.perArea ?? []) {
      if (!a.answered) continue;
      const x = areas.get(a.name) ?? { name: a.name, answered: 0, correct: 0, sessions: 0, series: [], last: 0 };
      x.answered += a.answered; x.correct += a.correct; x.sessions += 1; x.last = Math.max(x.last, h.at);
      x.series.push(Math.round((a.correct / a.answered) * 100));
      areas.set(a.name, x);
    }
    const t = Object.values(h.snapshot?.times ?? {}).filter((v) => v > 0);
    if (t.length) { seconds += t.reduce((a, b) => a + b, 0); timedQs += t.length; }
  }
  const list = [...areas.values()].map((x) => {
    const half = Math.floor(x.series.length / 2);
    const trend = x.series.length >= 2 ? mean(x.series.slice(half)) - mean(x.series.slice(0, half || 1)) : null;
    return { ...x, pct: Math.round((x.correct / x.answered) * 100), enough: x.answered >= MIN_AREA_ANSWERS, trend, series: x.series.slice(-8), color: contextColor(x.name) };
  }).sort((a, b) => a.pct - b.pct);
  const ready = list.filter((x) => x.enough);

  // Streak: consecutive days with practice, ending today or yesterday.
  const days = new Set(rows.map((h) => dayStart(h.at)));
  let streak = 0;
  let d = dayStart(now);
  if (!days.has(d)) d -= DAY;
  while (days.has(d)) { streak += 1; d -= DAY; }
  // XP per weekday of this week (Monday first).
  const monday = dayStart(now) - ((new Date(now).getDay() + 6) % 7) * DAY;
  const week = Array.from({ length: 7 }, (_, i) => rows.filter((h) => dayStart(h.at) === monday + i * DAY).reduce((a, h) => a + (h.xp ?? 0), 0));
  const answered = list.reduce((a, x) => a + x.answered, 0);
  const correct = list.reduce((a, x) => a + x.correct, 0);
  return {
    sessions: rows.length,
    answered,
    // Overall share right on first tries, only with enough of them behind it.
    pct: answered >= MIN_AREA_ANSWERS * 2 ? Math.round((correct / answered) * 100) : null,
    repeats: rows.filter((h) => first.get(h)?.first === false).length,
    secPerQuestion: timedQs ? Math.round(seconds / timedQs) : null,
    xp: rows.reduce((a, h) => a + (h.xp ?? 0), 0),
    streak,
    practicedToday: days.has(dayStart(now)),
    week,
    areas: list,
    weakest: ready[0] ?? null,
    strongest: ready.length > 1 ? ready[ready.length - 1] : null,
    recent: [...rows].reverse().slice(0, 5),
  };
}

// Calendar events for the student: each pending task on its due date, in its subject's color.
export function studentEvents({ subjects, assignments = [], attempts = [], now = Date.now() }) {
  const delivered = new Set(attempts.filter((t) => t.submitted_at).map((t) => t.assignment_id));
  const of = new Map();
  for (const s of subjects) for (const id of s.assignmentIds ?? []) of.set(id, s);
  return assignments
    .filter((a) => a.due_at && !delivered.has(a.id) && assignmentState(a, now) !== "draft")
    .map((a) => ({ id: a.id, at: a.due_at, color: of.get(a.id)?.color ?? "var(--accent)", label: `${a.title}${of.get(a.id) ? ` · ${of.get(a.id).name}` : ""}` }));
}

// Who a subject card names: its teacher; for an area with no class yet, the course's teacher, said as such.
export function teacherLabel(s) {
  if (s.teacher) return s.teacher;
  if (s.courseTeacher) return `Docente del curso: ${s.courseTeacher}`;
  return s.kind === "general" ? "Tareas de tu curso" : "Tu colegio aún no asigna docente";
}
