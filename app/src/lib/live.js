// Live answering helpers: scoring, answer counts, the class's share of right answers and the shared countdown.
// Pure, no network. There is no leaderboard: students see the whole class's answers and their own progress, never a ranking.

export const LETTERS = ["A", "B", "C", "D"];

// Game modes (migration 0024). Before it runs every room is "classic".
//   classic:    speed counts, points and streaks on each phone.
//   accuracy:   every right answer is worth the same; time only closes the question (for harder questions).
//   class_goal: the class plays together for a share of right answers; phones show the class's progress, not points.
export const MODES = [
  { id: "classic", label: "Clásico", help: "Responder rápido da más puntos. Ideal para repasar." },
  { id: "accuracy", label: "Precisión", help: "Sin prisa: cada acierto vale lo mismo. Para preguntas que piden leer con calma." },
  { id: "class_goal", label: "Meta de la clase", help: "Todos juntos contra una meta de aciertos. Nadie ve puntos individuales." },
];
export const modeOf = (session) => (MODES.some((m) => m.id === session?.mode) ? session.mode : "classic");
export const GOALS = [50, 60, 70, 80];

// The question a re-ask round repeats (after the class discussed it), or null. `reasks` maps index -> original index.
export const reaskOf = (session, index) => {
  const v = session?.reasks?.[String(index)];
  return Number.isInteger(v) ? v : null;
};

// Correct answers are worth 600 to 1000 depending on speed (the whole time = 600, instant = 1000),
// plus 50 per answer already in the player's streak (up to 5). Wrong or missing = 0.
// In "accuracy" mode a right answer is a flat 1000 (+ streak); a re-ask round after a discussion gives no points.
export function pointsFor({ correct, elapsedMs, limitSec, streak, mode = "classic", reask = false }) {
  if (!correct || reask) return 0;
  if (mode === "accuracy") return 1000 + 50 * Math.min(5, streak ?? 0);
  const frac = Math.min(1, Math.max(0, elapsedMs / (limitSec * 1000)));
  return Math.round(1000 - 400 * frac) + 50 * Math.min(5, streak ?? 0);
}

// session: live_sessions row; players: live_players rows; answers: live_answers rows of the current question;
// correct: letters that count as right. Returns [{ player_id, points }] for everyone who answered.
export function scoreQuestion(session, players, answers, correct) {
  const streak = new Map(players.map((p) => [p.player_id, p.streak]));
  const start = new Date(session.question_started_at).getTime();
  const mode = modeOf(session);
  const reask = reaskOf(session, session.current_index) != null;
  return answers.map((a) => ({
    player_id: a.player_id,
    points: pointsFor({
      correct: correct.includes(a.option),
      elapsedMs: new Date(a.answered_at).getTime() - start,
      limitSec: session.seconds_per_question + (session.extra_seconds ?? 0),
      streak: streak.get(a.player_id) ?? 0,
      mode,
      reask,
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
// Added time (extra_seconds) counts, and while the teacher has paused the question the clock stands still.
export function secondsLeft(session, nowMs, offsetMs = 0) {
  if (!session?.question_started_at || session.state !== "question") return 0;
  const end = new Date(session.question_started_at).getTime() + (session.seconds_per_question + (session.extra_seconds ?? 0)) * 1000;
  const at = session.paused_at ? new Date(session.paused_at).getTime() : nowMs - offsetMs;
  return Math.max(0, Math.ceil((end - at) / 1000));
}
export const isPaused = (session) => Boolean(session?.paused_at) && session?.state === "question";

// ---------- After the game ----------
// Everything the teacher's report shows, from the rows the database already keeps. `answers` = every live_answers
// row of the room (all questions); `keyFor(questionKey)` = the booklet's letter or null. A question that was closed
// counts with the letters accepted then (session.closed, migration 0024, or what this host kept); otherwise the booklet key.
// Players are listed alphabetically, never by score.
export function gameReport({ session, players = [], answers = [], keyFor = () => null, closed = null }) {
  closed = { ...(session?.closed ?? {}), ...(closed ?? {}) };
  const keys = session?.question_keys ?? [];
  // Only the questions that were opened (a game may end early).
  const last = Math.min(keys.length - 1, session?.current_index ?? -1);
  const accepted = (i) => closed[i] ?? (keyFor(keys[i]) ? [keyFor(keys[i])] : []);
  const questions = [];
  for (let i = 0; i <= last; i++) {
    const rows = answers.filter((a) => a.question_index === i);
    const correct = accepted(i);
    const dist = distribution(rows);
    const wrong = Object.entries(dist).filter(([l, n]) => n > 0 && !correct.includes(l)).sort((a, b) => b[1] - a[1]);
    const share = classShare(rows, correct);
    questions.push({
      index: i, n: i + 1, key: keys[i], reaskOf: reaskOf(session, i), correct, dist, ...share,
      skipped: rows.length === 0,
      topWrong: wrong[0] ? { letter: wrong[0][0], count: wrong[0][1] } : null,
      // Sure and wrong = a misconception worth discussing, not a guess.
      sureWrong: rows.filter((a) => a.confident === true && !correct.includes(a.option)).length,
      unsureRight: rows.filter((a) => a.confident === false && correct.includes(a.option)).length,
      withConfidence: rows.some((a) => typeof a.confident === "boolean"),
    });
  }
  // Re-ask rounds: the same question before and after the class talked about it.
  const reasks = questions.filter((q) => q.reaskOf != null).map((after) => {
    const before = questions[after.reaskOf];
    const was = new Map(answers.filter((a) => a.question_index === after.reaskOf).map((a) => [a.player_id, a.option]));
    const now = answers.filter((a) => a.question_index === after.index);
    const changedToRight = now.filter((a) => after.correct.includes(a.option) && was.has(a.player_id) && !before.correct.includes(was.get(a.player_id))).length;
    return { n: after.n, of: before?.n ?? null, before: before?.pct ?? null, after: after.pct, changedToRight };
  });
  const firstRounds = questions.filter((q) => q.reaskOf == null && !q.skipped);
  const people = [...players].sort((a, b) => a.nickname.localeCompare(b.nickname, "es")).map((p) => {
    const mine = new Map(answers.filter((a) => a.player_id === p.player_id).map((a) => [a.question_index, a]));
    const cells = questions.map((q) => {
      const a = mine.get(q.index);
      return { n: q.n, option: a?.option ?? null, right: a ? q.correct.includes(a.option) : false, confident: a?.confident ?? null };
    });
    const counted = cells.filter((c, i) => questions[i].reaskOf == null && !questions[i].skipped);
    const right = counted.filter((c) => c.right).length;
    return {
      player_id: p.player_id, nickname: p.nickname, guest: !p.profile_id, profile_id: p.profile_id ?? null, score: p.score, cells,
      right, answered: counted.filter((c) => c.option).length, of: counted.length,
      pct: counted.length ? Math.round((right / counted.length) * 100) : null,
    };
  });
  const answeredRows = firstRounds.reduce((s, q) => s + q.answered, 0);
  const rightRows = firstRounds.reduce((s, q) => s + q.right, 0);
  return {
    questions, reasks, people,
    classPct: answeredRows ? Math.round((rightRows / answeredRows) * 100) : null,
    participation: players.length && firstRounds.length ? Math.round((answeredRows / (players.length * firstRounds.length)) * 100) : null,
    // Questions to reinforce: under 60 % right, hardest first. Re-ask rounds and skipped questions are left out.
    toReinforce: firstRounds.filter((q) => (q.pct ?? 0) < 60).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
    misconceptions: firstRounds.filter((q) => q.topWrong && q.topWrong.count >= Math.max(2, q.right)).map((q) => ({ n: q.n, key: q.key, letter: q.topWrong.letter, count: q.topWrong.count, answered: q.answered })),
  };
}

// Running class result for the "class goal" mode and for every phone: share right over the closed questions.
export function classProgress(trend, goal = null) {
  const rows = trend.filter((t) => !t.reask && t.pct != null);
  const answered = rows.reduce((s, t) => s + t.answered, 0);
  const right = rows.reduce((s, t) => s + t.right, 0);
  const pct = answered ? Math.round((right / answered) * 100) : null;
  return { pct, goal, reached: goal != null && pct != null && pct >= goal, closed: rows.length };
}

// The keys a player should practice afterwards: every first-round question they missed or left blank.
export function missedKeysOf(session, mine) {
  const keys = session?.question_keys ?? [];
  const correctAt = session?.closed ?? {};
  const out = [];
  keys.forEach((k, i) => {
    if (reaskOf(session, i) != null || i > (session.current_index ?? -1)) return;
    const a = mine.find((x) => x.question_index === i);
    const right = a && (a.points > 0 || (correctAt[String(i)] ?? []).includes(a.option));
    if (!right && !out.includes(k)) out.push(k);
  });
  return out;
}

const csvCell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const BOM = "\uFEFF";
// For the teacher only, in alphabetical order (no positions). With the report, one column per question too.
export const resultsCsv = (title, players, report = null) => {
  const cell = csvCell;
  if (report) {
    const head = ["Apodo", "Tipo", "Aciertos", "De", "%", ...report.questions.map((q) => `P${q.n}${q.reaskOf != null ? " (otra vez)" : ""}`)];
    const rows = report.people.map((p) => [p.nickname, p.guest ? "Invitado" : "Con cuenta", p.right, p.of, p.pct ?? "",
      ...p.cells.map((c) => (c.option ? `${c.option}${c.right ? " ✓" : ""}${c.confident === true ? " (seguro)" : c.confident === false ? " (duda)" : ""}` : "—"))].map(cell).join(","));
    const share = ["% de la clase", "", "", "", report.classPct ?? "", ...report.questions.map((q) => (q.pct == null ? "" : q.pct))].map(cell).join(",");
    return `${BOM}${[cell(title), head.map(cell).join(","), ...rows, share].join("\n")}\n`;
  }
  const rows = [...players].sort((a, b) => a.nickname.localeCompare(b.nickname, "es")).map((p) => [p.nickname, p.score, p.profile_id ? "Con cuenta" : "Invitado"].map(cell).join(","));
  return `${BOM}${[cell(title), "Apodo,Puntos,Tipo", ...rows].join("\n")}\n`;
};

export function liveMessage(err) {
  const m = String(err?.message ?? "");
  if (m.includes("session_not_found")) return "No encontramos ese código. Revisa que el juego siga abierto.";
  if (m.includes("not_allowed")) return "No tienes permiso para hacer eso.";
  if (m.includes("paused")) return "El docente pausó la pregunta. Espera un momento.";
  if (/function|column|schema cache|does not exist/i.test(m)) return "Esta opción necesita la migración 0024 en Supabase.";
  return "No se pudo completar. Inténtalo de nuevo.";
}
