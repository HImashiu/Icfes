// Time per question for the student's own views (results and review). Pure functions; the teacher's view of the same
// data lives in studentRun.js.
import { fmtDuration, median } from "./studentRun.js";

// One row per question that has a recorded time, plus totals and the slowest ones.
export function timeSummary(questions, times) {
  const rows = questions
    .map((q) => ({ key: q.key, number: q.number, section: q.section, sec: Number.isFinite(times?.[q.key]) ? times[q.key] : null }))
    .filter((r) => r.sec != null && r.sec > 0);
  const total = rows.reduce((n, r) => n + r.sec, 0);
  const perArea = new Map();
  for (const r of rows) {
    const a = perArea.get(r.section) ?? { name: r.section, sec: 0, n: 0 };
    a.sec += r.sec;
    a.n += 1;
    perArea.set(r.section, a);
  }
  return {
    has: rows.length > 0,
    total,
    avg: rows.length ? total / rows.length : null,
    median: median(rows.map((r) => r.sec)),
    perArea: [...perArea.values()].map((a) => ({ ...a, avg: a.sec / a.n })),
    slowest: [...rows].sort((a, b) => b.sec - a.sec).slice(0, 3),
  };
}

// "45 s", or "—" when the question has no time.
export const fmtSec = (sec) => (sec == null || !(sec > 0) ? "—" : fmtDuration(sec));

// How a question's time compares with the student's own median: "más lenta", "más rápida" or null.
export function paceOf(sec, med) {
  if (!(sec > 0) || !(med > 0)) return null;
  if (sec >= Math.max(30, med * 1.8)) return "slow";
  if (sec <= med * 0.5) return "fast";
  return null;
}
