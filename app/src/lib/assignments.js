// Pure helpers for assignments: which questions, what state, who has finished. No network, no React.
import { summarizeProctor } from "./proctor.js";
import { questionsFor, scoreAttempt, timedSeconds } from "./exam.js";
import { roundedTimes } from "./studentRun.js";

export const KINDS = [
  { id: "task", label: "Práctica", mode: "practice" },
  { id: "homework", label: "Tarea", mode: "practice" },
  { id: "exam", label: "Simulacro con tiempo", mode: "timed" },
];
export const kindMode = (kind) => KINDS.find((k) => k.id === kind)?.mode ?? "practice";

// Keys of `count` questions spread evenly over the scope (so a short set still covers the whole booklet).
// null means "every question of the scope".
export function pickQuestionKeys(questions, count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0 || n >= questions.length) return null;
  const step = questions.length / n;
  return Array.from({ length: n }, (_, i) => questions[Math.floor(i * step)].key);
}

// The questions an attempt covers: the whole scope, or the assignment's chosen keys in booklet order.
export function questionsForAttempt(exam, attempt) {
  const all = questionsFor(exam, attempt.scope);
  if (!attempt.keys) return all;
  // The teacher's order wins; a key that no longer exists in the booklet is skipped.
  const byKey = new Map(all.map((q) => [q.key, q]));
  return attempt.keys.map((k) => byKey.get(k)).filter(Boolean);
}

export function assignmentState(a, now = Date.now()) {
  if (a.status === "draft") return "draft";
  if (a.status === "closed") return "closed";
  if (a.due_at && new Date(a.due_at).getTime() < now) return "closed";
  if (a.opens_at && new Date(a.opens_at).getTime() > now) return "scheduled";
  return "active";
}

export function attemptForAssignment(a, questions, now = Date.now()) {
  const mode = kindMode(a.kind);
  return {
    slug: a.exam_slug,
    scope: a.scope,
    keys: a.question_keys ?? null,
    assignmentId: a.id,
    mode,
    maxAttempts: a.max_attempts ?? null,
    reveal: a.reveal_policy ?? "after_submit",
    hints: a.allow_hints !== false,
    instant: a.instant_feedback !== false,
    proctor: a.proctor === true,
    proctorLog: [],
    durationSec: mode === "timed" ? (a.time_limit_min ? a.time_limit_min * 60 : timedSeconds(questions)) : null,
    startedAt: now,
    answers: {},
    flags: {},
    checked: {},
    times: {},
    hintsUsed: {},
    changes: {},
    xp: 0,
    current: 0,
    submittedAt: null,
    auto: false,
  };
}

// The row stored for a finished attempt. The score uses the key the app has, which is preliminary unless said otherwise.
export function attemptRow(attempt, questions, key, keyStatus) {
  const s = scoreAttempt(questions, attempt.answers, key);
  return {
    client_id: String(attempt.startedAt),
    assignment_id: attempt.assignmentId ?? null,
    exam_slug: attempt.slug,
    scope: attempt.scope,
    mode: attempt.mode,
    started_at: new Date(attempt.startedAt).toISOString(),
    submitted_at: new Date(attempt.submittedAt).toISOString(),
    duration_sec: Math.round((attempt.submittedAt - attempt.startedAt) / 1000),
    answers: attempt.answers,
    times: roundedTimes(attempt.times),
    // How the student worked, for the teacher's view of one run: hints opened and answers changed, per question.
    proctor: summarizeProctor(attempt.proctorLog),
    activity: { hints: attempt.hintsUsed ?? {}, changes: attempt.changes ?? {} },
    score: { keyed: s.keyed, correct: s.correct, answered: s.answered, total: s.total, perArea: s.perArea },
    key_status: keyStatus ?? "preliminary",
    device: typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches ? "desktop" : "phone",
  };
}

// Percent right out of the whole set (timed) or out of what was answered (practice), like the Results screen.
export function scorePct(row) {
  const s = row?.score;
  if (!s?.keyed) return null;
  const out = row.mode === "practice" ? s.answered : s.total;
  return out > 0 ? Math.round((s.correct / out) * 100) : null;
}

// Who an attempt belongs to: the signed-in student, or the roster row for paper results of students who never signed in.
export const whoOf = (a) => a.profile_id ?? a.member_id ?? null;

// Per student: did they deliver, and with what result. The best delivered attempt counts.
export function progressRows(members, attempts) {
  const byWho = new Map();
  const all = new Map();
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const k = whoOf(a);
    all.set(k, [...(all.get(k) ?? []), a]);
    const prev = byWho.get(k);
    if (!prev || (scorePct(a) ?? -1) > (scorePct(prev) ?? -1)) byWho.set(k, a);
  }
  const rows = members
    .filter((m) => m.role === "student")
    .map((m) => {
      const cands = [m.profile_id ? byWho.get(m.profile_id) : null, byWho.get(m.id)].filter(Boolean);
      const a = cands.sort((x, y) => (scorePct(y) ?? -1) - (scorePct(x) ?? -1))[0] ?? null;
      return {
        id: m.id,
        name: m.full_name || m.email,
        email: m.email,
        joined: Boolean(m.profile_id) || Boolean(a),
        done: Boolean(a),
        pct: a ? scorePct(a) : null,
        attempt: a ?? null,
        attempts: [m.profile_id, m.id].filter(Boolean).flatMap((id) => all.get(id) ?? []).sort((x, y) => String(x.submitted_at).localeCompare(String(y.submitted_at))),
        paper: a?.mode === "paper",
        at: a?.submitted_at ?? null,
      };
    });
  const done = rows.filter((r) => r.done).length;
  return { rows, done, total: rows.length, completion: rows.length ? Math.round((done / rows.length) * 100) : 0 };
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Opens in Excel and Google Sheets. The score is a percent against the PRELIMINARY key.
export function resultsCsv(title, rows) {
  const head = ["Estudiante", "Correo", "Estado", "Puntaje (%) clave preliminar", "Entregado"];
  const lines = rows.map((r) => [r.name, r.email, r.done ? "Entregado" : r.joined ? "Pendiente" : "Sin ingresar", r.pct ?? "", r.at ?? ""].map(csvCell).join(","));
  return `﻿${[`${csvCell(title)}`, head.join(","), ...lines].join("\n")}\n`;
}

// Attempts a student may make: exams default to one, other kinds to no limit (null = no limit).
export const effectiveMax = (a) => a.max_attempts ?? (a.kind === "exam" ? 1 : null);
export function attemptsLeft(a, used) {
  const max = effectiveMax(a);
  return max == null ? Infinity : Math.max(0, max - used);
}

// Whether a student may see the right answers of an assigned attempt now.
export function revealAllowed(policy, assignment, now = Date.now()) {
  if (!policy || policy === "after_submit") return true;
  if (policy === "never") return false;
  return assignment ? assignmentState(assignment, now) === "closed" : false;
}
