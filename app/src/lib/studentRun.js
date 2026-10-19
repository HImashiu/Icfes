// What one student did in one run of an assignment: answer, verdict and time per question, plus the class norms
// the teacher compares it to. Pure functions, no network, no React.

// Seconds spent per question: add a stretch to what the question already has.
export function addTime(times, key, sec) {
  return { ...(times ?? {}), [key]: Math.round(((times?.[key] ?? 0) + sec) * 10) / 10 };
}
export const roundedTimes = (times) => Object.fromEntries(Object.entries(times ?? {}).map(([k, v]) => [k, Math.round(v)]));

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// "1 min 05 s" for a duration in seconds; "—" when unknown.
export function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return `${m} min ${String(rest).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

// Whether an attempt recorded per-question times (attempts delivered before this feature did not).
export const hasTimes = (attempt) => Object.keys(attempt?.times ?? {}).length > 0;

// Average seconds per question over the delivered attempts that recorded times.
export function classTimes(questions, attempts) {
  const out = new Map();
  for (const q of questions) {
    const v = attempts.map((a) => a.times?.[q.key]).filter((t) => Number.isFinite(t));
    out.set(q.key, v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);
  }
  return out;
}

// One row per question of the assignment for one attempt.
// verdict: "ok" right, "bad" wrong, "blank" no answer, "open" answered but the key is unknown.
export function studentRun(questions, key, attempt, avgTimes = new Map()) {
  const rows = questions.map((q) => {
    const given = attempt?.answers?.[q.key] ?? null;
    const keyed = key?.get(q.key) ?? null;
    const verdict = !given ? "blank" : !keyed ? "open" : given === keyed ? "ok" : "bad";
    const sec = attempt?.times?.[q.key];
    const avg = avgTimes.get(q.key) ?? null;
    return {
      key: q.key, number: q.number, section: q.section, given, keyed, verdict,
      sec: Number.isFinite(sec) ? sec : null,
      avg,
      slow: Number.isFinite(sec) && avg != null && sec >= 30 && sec >= avg * 1.8,
      hint: Boolean(attempt?.activity?.hints?.[q.key]),
      changes: attempt?.activity?.changes?.[q.key] ?? 0,
    };
  });
  const timed = rows.filter((r) => r.sec != null);
  const total = timed.reduce((n, r) => n + r.sec, 0);
  return {
    rows,
    correct: rows.filter((r) => r.verdict === "ok").length,
    wrong: rows.filter((r) => r.verdict === "bad").length,
    blank: rows.filter((r) => r.verdict === "blank").length,
    hints: rows.filter((r) => r.hint).length,
    changed: rows.filter((r) => r.changes > 0).length,
    hasTimes: timed.length > 0,
    questionSec: timed.length ? total : null,
    avgSec: timed.length ? total / timed.length : null,
    slowest: [...timed].sort((a, b) => b.sec - a.sec).slice(0, 3),
  };
}

// A made-up delivered attempt so a teacher can preview an individual report before any student has delivered.
export function sampleRunAttempt(questions, key) {
  const answers = {}, times = {}, hints = {}, changes = {};
  questions.forEach((q, i) => {
    const right = key?.get(q.key);
    if (i % 7 === 6) { times[q.key] = 6; return; }
    const letter = ["A", "B", "C", "D"].find((l) => l !== right) ?? "A";
    answers[q.key] = right && i % 3 !== 2 ? right : letter;
    times[q.key] = 25 + ((i * 37) % 90);
    if (i % 5 === 4) hints[q.key] = true;
    if (i % 6 === 3) changes[q.key] = 1;
  });
  return { answers, times, activity: { hints, changes }, duration_sec: Object.values(times).reduce((n, t) => n + t, 0), started_at: new Date(Date.now() - 3600e3).toISOString(), submitted_at: new Date().toISOString() };
}
