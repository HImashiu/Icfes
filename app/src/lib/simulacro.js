// The Saber 11 score is computed over the WHOLE exam: a simulacro is Sesión 1 + Sesión 2 of the same cuadernillo.
// This pairs the two sessions from the practice history and gives the estimated 0-500 global score and the 0-100
// area scores only when both are done. One session alone is a partial result and is labelled so.
// The curve is the PLACEHOLDER in analytics.js (plan §5.1) and every key is preliminary: always "estimado".
import { bandFor } from "./analytics.js";
import { bookletCode, sessionOf } from "./booklets.js";

// A history row that counts as a whole session: the whole booklet (not one area), and nearly all of it answered when
// it was practice (a timed session counts as delivered, blanks are wrong like the real exam).
export function isFullSession(h) {
  const slug = h?.snapshot?.slug;
  if (!slug || !sessionOf(slug) || h.keyed === false) return false;
  if ((h.snapshot.scope ?? "all") !== "all" || h.snapshot.keys) return false;
  if (h.mode === "timed") return true;
  return h.total > 0 && h.answered / h.total >= 0.9;
}

const sum = (rows) => {
  const acc = new Map();
  for (const r of rows) for (const a of r.perArea ?? []) {
    const x = acc.get(a.name) ?? { name: a.name, correct: 0, total: 0 };
    x.correct += a.correct; x.total += a.total; acc.set(a.name, x);
  }
  return [...acc.values()];
};

// A partial or complete simulacro from up to two session rows.
function result(code, s1, s2) {
  const done = [s1, s2].filter(Boolean);
  const band = bandFor(sum(done));
  return {
    code,
    s1: s1 ?? null,
    s2: s2 ?? null,
    complete: Boolean(s1 && s2),
    at: Math.max(...done.map((r) => r.at)),
    global: s1 && s2 ? band.global : null,
    low: s1 && s2 ? band.low : null,
    high: s1 && s2 ? band.high : null,
    globalPercentile: s1 && s2 ? band.globalPercentile : null,
    areas: band.areas, // 0-100 per area, from the sessions done so far
  };
}

// Every simulacro in time order. A simulacro is a Sesión 1 and a Sesión 2 of one cuadernillo done one after the
// other (either order). Repeating a session before the other is done replaces it; once both are done, the next
// session of that cuadernillo starts a new simulacro, so an old session is never mixed with a new one.
export function simulacros(history = []) {
  const rows = history.filter(isFullSession).sort((a, b) => a.at - b.at);
  const current = new Map(); // code -> index in out of the simulacro being filled
  const out = [];
  for (const r of rows) {
    const code = bookletCode(r.snapshot.slug);
    const n = sessionOf(r.snapshot.slug);
    const i = current.get(code);
    const open = i != null && !out[i].complete ? out[i] : null;
    const s1 = n === 1 ? r : open?.s1;
    const s2 = n === 2 ? r : open?.s2;
    const sim = result(code, s1, s2);
    if (open) out[i] = sim; else { current.set(code, out.length); out.push(sim); }
  }
  return out;
}

// What the student sees: the latest complete simulacro (the score), the one in progress (a session missing), and
// the trend of complete scores.
export function scoreSummary(history = []) {
  const all = simulacros(history);
  const complete = all.filter((s) => s.complete);
  const latest = complete[complete.length - 1] ?? null;
  const open = [...all].reverse().find((s) => !s.complete && (!latest || s.at > latest.at)) ?? null;
  return { latest, open, trend: complete.map((s) => ({ at: s.at, global: s.global, code: s.code })), count: complete.length };
}

// The cuadernillo and session a student should do next to finish a simulacro: { code, n, slug } or null.
export function nextSession(open, exams = []) {
  if (!open) return null;
  const n = open.s1 ? 2 : 1;
  const entry = exams.find((e) => bookletCode(e.slug) === open.code && sessionOf(e.slug) === n && e.status !== "proximamente");
  return entry ? { code: open.code, n, slug: entry.slug } : null;
}

// Teachers: one student's simulacros from their delivered assignment attempts. Attempts need exam_slug, scope and
// score.perArea (the assignment's own scope when the attempt has none). Returns the latest complete global per student.
export function studentScores({ attempts = [], assignments = [] }) {
  const out = new Map();
  for (const [who, rows] of sessionRows(attempts, assignments)) out.set(who, scoreSummary(rows).latest);
  return out;
}

// One student's latest complete simulacro from their attempts (exam_slug and scope on each attempt), or null.
export function latestScore(attempts = [], assignments = []) {
  const rows = [...sessionRows(attempts, assignments).values()].flat();
  return scoreSummary(rows).latest;
}

const MIN_SESSION_QUESTIONS = 60;

function sessionRows(attempts, assignments) {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const people = new Map();
  for (const t of attempts) {
    if (!t.submitted_at || !t.score?.keyed) continue;
    const a = byId.get(t.assignment_id);
    const slug = t.exam_slug ?? a?.exam_slug;
    const scope = t.scope ?? a?.scope ?? "all";
    if (!slug || scope !== "all" || a?.question_keys?.length) continue;
    // Without the assignment at hand, a chosen subset of questions shows in its size: a whole session has 100+.
    if (!a && (t.score.total ?? 0) < MIN_SESSION_QUESTIONS) continue;
    const who = t.profile_id ?? t.member_id;
    const list = people.get(who) ?? [];
    list.push({ at: Date.parse(t.submitted_at), mode: "timed", keyed: true, total: t.score.total, answered: t.score.answered, perArea: t.score.perArea ?? [], snapshot: { slug, scope: "all" } });
    people.set(who, list);
  }
  return people;
}

// Teachers: every simulacro of one student (complete and in progress) with the trend of complete scores.
export function scoreHistory(attempts = [], assignments = []) {
  return scoreSummary([...sessionRows(attempts, assignments).values()].flat());
}
