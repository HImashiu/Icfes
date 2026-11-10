// Free practice draws its questions at random and in a random order. Questions that share a text travel together
// (a reading is never cut in half), and a run never holds more questions than the allowance gives. The areas keep the
// order the student chose. Pure.
import { orderQuestions } from "./order.js";

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

// Seeded shuffle (the same seed gives the same order; a fresh seed each run).
function shuffled(list, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// pool: the booklet's questions (exam.questions) for the chosen scope. count: how many the allowance gives.
// Returns { keys, questions } in the order the run shows them.
export function drawPractice(pool, count, { areaOrder = null, seed = randomSeed() } = {}) {
  const units = new Map();
  for (const q of pool) {
    const id = q.group?.id ?? `q:${q.key}`;
    if (!units.has(id)) units.set(id, []);
    units.get(id).push(q);
  }
  const limit = count >= pool.length ? Infinity : Math.max(0, count);
  const chosen = [];
  let n = 0;
  for (const u of shuffled([...units.values()], seed)) {
    if (n >= limit) break;
    if (n + u.length > limit) continue; // a text that would not fit waits; a shorter one may still fill the run
    chosen.push(...u.sort((a, b) => a.number - b.number));
    n += u.length;
  }
  const questions = orderQuestions(chosen, areaOrder);
  return { keys: questions.map((q) => q.key), questions };
}
