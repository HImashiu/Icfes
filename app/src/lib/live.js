// Live answering helpers: scoring, answer counts, the class's share of right answers and the shared countdown.
// Pure, no network. There is no leaderboard: students see the whole class's answers and their own progress, never a ranking.

export const LETTERS = ["A", "B", "C", "D"];

// Correct answers are worth 600 to 1000 depending on speed (the whole time = 600, instant = 1000),
// plus 50 per answer already in the player's streak (up to 5). Wrong or missing = 0.
export function pointsFor({ correct, elapsedMs, limitSec, streak }) {
  if (!correct) return 0;
  const frac = Math.min(1, Math.max(0, elapsedMs / (limitSec * 1000)));
  return Math.round(1000 - 400 * frac) + 50 * Math.min(5, streak ?? 0);
}

// session: live_sessions row; players: live_players rows; answers: live_answers rows of the current question;
// correct: letters that count as right. Returns [{ player_id, points }] for everyone who answered.
export function scoreQuestion(session, players, answers, correct) {
  const streak = new Map(players.map((p) => [p.player_id, p.streak]));
  const start = new Date(session.question_started_at).getTime();
  return answers.map((a) => ({
    player_id: a.player_id,
    points: pointsFor({
      correct: correct.includes(a.option),
      elapsedMs: new Date(a.answered_at).getTime() - start,
      limitSec: session.seconds_per_question,
      streak: streak.get(a.player_id) ?? 0,
    }),
  }));
}

// How much of the class got a question right: { answered, right, pct } (pct is null when nobody answered).
export function classShare(answers, correct) {
  const right = answers.filter((a) => correct.includes(a.option)).length;
  return { answered: answers.length, right, pct: answers.length ? Math.round((right / answers.length) * 100) : null };
}

export function distribution(answers, letters = LETTERS) {
  const counts = Object.fromEntries(letters.map((l) => [l, 0]));
  for (const a of answers) counts[a.option] = (counts[a.option] ?? 0) + 1;
  return counts;
}

// Seconds left in a question. `offsetMs` = how far this device's clock is ahead of the database clock.
export function secondsLeft(session, nowMs, offsetMs = 0) {
  if (!session?.question_started_at || session.state !== "question") return 0;
  const end = new Date(session.question_started_at).getTime() + session.seconds_per_question * 1000;
  return Math.max(0, Math.ceil((end - (nowMs - offsetMs)) / 1000));
}

export const resultsCsv = (title, players) => {
  const cell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  // For the teacher only, in alphabetical order (no positions).
  const rows = [...players].sort((a, b) => a.nickname.localeCompare(b.nickname, "es")).map((p) => [p.nickname, p.score, p.profile_id ? "Con cuenta" : "Invitado"].map(cell).join(","));
  return `﻿${[cell(title), "Apodo,Puntos,Tipo", ...rows].join("\n")}\n`;
};

export function liveMessage(err) {
  const m = String(err?.message ?? "");
  if (m.includes("session_not_found")) return "No encontramos ese código. Revisa que el juego siga abierto.";
  if (m.includes("not_allowed")) return "No tienes permiso para hacer eso.";
  return "No se pudo completar. Inténtalo de nuevo.";
}
