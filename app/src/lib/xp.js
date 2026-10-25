import { WEAKEST_AREA } from "../data/mock.js";

// +10 XP per correct answer, +20 in the weakest area (the same rule in both modes).
// `factor` < 1 is a teacher's diminishing-XP setting for repeat attempts (see grading.js xpFactor); it never drops below 1 XP.
export const xpFor = (section, factor = 1) => {
  const base = section === WEAKEST_AREA ? 20 : 10;
  return factor >= 1 ? base : factor > 0 ? Math.max(1, Math.round(base * factor)) : 0;
};

// XP for a whole attempt. Practice counts as it goes (Test.jsx); timed attempts are graded at delivery.
export function attemptXp(questions, attempt, answerKey) {
  // Practice with immediate feedback counts as it goes; without it, XP is counted at the end like a simulacro.
  if (attempt.mode !== "timed" && attempt.instant !== false) return attempt.xp ?? 0;
  if (!answerKey) return 0;
  return questions.reduce((sum, q) => {
    const given = attempt.answers[q.key];
    return given && given === answerKey.get(q.key) ? sum + xpFor(q.section, attempt.xpFactor ?? 1) : sum;
  }, 0);
}
