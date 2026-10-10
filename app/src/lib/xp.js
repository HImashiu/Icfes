import { WEAKEST_AREA } from "../data/mock.js";

// +10 XP per correct answer, +20 in the weakest area (the same rule in both modes).
export const xpFor = (section) => (section === WEAKEST_AREA ? 20 : 10);

// XP for a whole attempt. Practice counts as it goes (Test.jsx); timed attempts are graded at delivery.
export function attemptXp(questions, attempt, answerKey) {
  if (attempt.mode !== "timed") return attempt.xp ?? 0;
  if (!answerKey) return 0;
  return questions.reduce((sum, q) => {
    const given = attempt.answers[q.key];
    return given && given === answerKey.get(q.key) ? sum + xpFor(q.section) : sum;
  }, 0);
}
