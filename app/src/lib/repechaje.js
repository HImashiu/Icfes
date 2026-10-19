// Repechaje: a second chance at the questions a student missed. Each finished attempt records which keys were missed
// and which were right (in this browser's history); a question stays "pending" until it is answered right later.

// Keys missed on one attempt: wrong, or blank in a timed exam (blanks count as wrong there).
export function missedKeys(questions, answers, key, mode) {
  if (!key) return [];
  return questions
    .filter((q) => key.get(q.key) && (answers[q.key] ? answers[q.key] !== key.get(q.key) : mode === "timed"))
    .map((q) => q.key);
}
export const rightKeys = (questions, answers, key) => (key ? questions.filter((q) => key.get(q.key) && answers[q.key] === key.get(q.key)).map((q) => q.key) : []);

// Pending misses of one booklet from the history entries (oldest first, so a later right answer clears a miss).
export function pendingMisses(history, slug) {
  const pending = new Set();
  for (const e of [...history].filter((h) => h.snapshot?.slug === slug).sort((a, b) => a.at - b.at)) {
    for (const k of e.missed ?? []) pending.add(k);
    for (const k of e.right ?? []) pending.delete(k);
  }
  return [...pending];
}

// Number-ordered keys, at most `max`.
export const repechajeKeys = (keys, max = 20) => [...keys].sort((a, b) => Number(a) - Number(b)).slice(0, max);
