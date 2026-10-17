// Pure helpers for assignments: which questions, what state, who has finished. No network, no React.
import { questionsFor, scoreAttempt, timedSeconds } from "./exam.js";

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
  return attempt.keys ? all.filter((q) => attempt.keys.includes(q.key)) : all;
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
    durationSec: mode === "timed" ? (a.time_limit_min ? a.time_limit_min * 60 : timedSeconds(questions)) : null,
    startedAt: now,
    answers: {},
    flags: {},
    checked: {},
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
    score: { keyed: s.keyed, correct: s.correct, answered: s.answered, total: s.total, perArea: s.perArea },
    key_status: keyStatus ?? "preliminary",
    device: typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches ? "desktop" : "phone",
  };
}

// Percent right out of the whole set (timed) or out of what was answered (practice), like the Results screen.
export function scorePct(row) {
  const s = row?.score;
  if (!s?.keyed) return null;
  const out = row.mode === "timed" ? s.total : s.answered;
  return out > 0 ? Math.round((s.correct / out) * 100) : null;
}

// Per student: did they deliver, and with what result. The best delivered attempt counts.
export function progressRows(members, attempts) {
  const byProfile = new Map();
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const prev = byProfile.get(a.profile_id);
    if (!prev || (scorePct(a) ?? -1) > (scorePct(prev) ?? -1)) byProfile.set(a.profile_id, a);
  }
  const rows = members
    .filter((m) => m.role === "student")
    .map((m) => {
      const a = m.profile_id ? byProfile.get(m.profile_id) : null;
      return {
        id: m.id,
        name: m.full_name || m.email,
        email: m.email,
        joined: Boolean(m.profile_id),
        done: Boolean(a),
        pct: a ? scorePct(a) : null,
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
