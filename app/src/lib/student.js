// The student's side of "by subject": each class they belong to (a subject with its teacher), and an analysis of
// their own practice per ICFES area. Never compares a student with classmates.
import { assignmentState, scorePct } from "./assignments.js";
import { areaOf, contextColor, groupOf } from "./teaching.js";

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

// One card per class: subject color, teacher, what is pending, the next due date and the student's own average.
export function studentSubjects({ classes, assignments = [], attempts = [], now = Date.now() }) {
  const delivered = new Set(attempts.filter((t) => t.submitted_at).map((t) => t.assignment_id));
  return classesFrom({ classes, assignments }).map((c) => {
    const area = areaOf(c);
    const mine = assignments.filter((a) => a.course_id === c.id);
    const pending = mine.filter((a) => assignmentState(a, now) === "active" && !delivered.has(a.id))
      .sort((a, b) => new Date(a.due_at ?? 8.64e15) - new Date(b.due_at ?? 8.64e15));
    const scores = attempts.filter((t) => t.submitted_at && mine.some((a) => a.id === t.assignment_id))
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)).map(scorePct).filter((p) => p != null);
    return {
      id: c.id,
      name: c.subject || c.name,
      full: c.name,
      group: groupOf(c).name,
      area,
      color: contextColor(area ?? ""),
      teacher: (c.teachers ?? []).filter(Boolean).join(", "),
      pending: pending.length,
      next: pending[0] ?? null,
      done: mine.filter((a) => delivered.has(a.id)).length,
      total: mine.length,
      avg: mean(scores),
      series: scores.slice(-6),
    };
  });
}

// What the practice history says, per area and overall. history: loadHistory() rows, newest first.
export function practiceInsights(history = [], now = Date.now()) {
  const rows = [...history].filter((h) => h.keyed !== false).sort((a, b) => a.at - b.at);
  const areas = new Map();
  let seconds = 0;
  let timedQs = 0;
  for (const h of rows) {
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
    return { ...x, pct: Math.round((x.correct / x.answered) * 100), trend, series: x.series.slice(-8), color: contextColor(x.name) };
  }).sort((a, b) => a.pct - b.pct);

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
    pct: answered ? Math.round((correct / answered) * 100) : null,
    secPerQuestion: timedQs ? Math.round(seconds / timedQs) : null,
    xp: rows.reduce((a, h) => a + (h.xp ?? 0), 0),
    streak,
    practicedToday: days.has(dayStart(now)),
    week,
    areas: list,
    weakest: list[0] ?? null,
    strongest: list.length > 1 ? list[list.length - 1] : null,
    recent: [...rows].reverse().slice(0, 5),
  };
}

// Calendar events for the student: each pending task on its due date, in its subject's color.
export function studentEvents({ subjects, assignments = [], attempts = [], now = Date.now() }) {
  const delivered = new Set(attempts.filter((t) => t.submitted_at).map((t) => t.assignment_id));
  const color = Object.fromEntries(subjects.map((s) => [s.id, s.color]));
  const name = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
  return assignments
    .filter((a) => a.due_at && !delivered.has(a.id) && assignmentState(a, now) !== "draft")
    .map((a) => ({ id: a.id, at: a.due_at, color: color[a.course_id] ?? "var(--accent)", label: `${a.title}${name[a.course_id] ? ` · ${name[a.course_id]}` : ""}` }));
}
