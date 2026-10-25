// Práctica a medida: the student builds a round from one booklet by area, competencia and difficulty, choosing
// where the questions come from (all, never answered, missed before, marked to review) and how many.
// Questions that share a text travel together, so a reading is never cut in half. Pure.
import { pendingMisses } from "./repechaje.js";

export const SOURCES = [
  { id: "all", label: "Todas" },
  { id: "unseen", label: "Nunca respondidas" },
  { id: "missed", label: "Las que fallé" },
  { id: "flagged", label: "Las que marqué" },
];
export const COUNTS = [10, 20, 30, 0]; // 0 = every matching question
export const PACES = [
  { id: "free", label: "Sin tiempo", help: "Corrección inmediata, a tu ritmo." },
  { id: "icfes", label: "Ritmo ICFES", help: "El tiempo del examen real para esas preguntas, corrección al final." },
  { id: "fast", label: "Reto rápido", help: "1 minuto por pregunta, corrección al final." },
];
export const ORDERS = [
  { id: "booklet", label: "Como el cuadernillo" },
  { id: "easy", label: "De fácil a difícil" },
  { id: "mixed", label: "Mezcladas" },
];

// What this browser's history says about each question of a booklet.
export function questionHistory(history, slug) {
  const seen = new Set();
  const flagged = new Set();
  for (const h of history) {
    if (h.snapshot?.slug !== slug) continue;
    Object.keys(h.snapshot.answers ?? {}).forEach((k) => seen.add(k));
    Object.keys(h.snapshot.flags ?? {}).filter((k) => h.snapshot.flags[k]).forEach((k) => flagged.add(k));
  }
  return { seen, flagged, missed: new Set(pendingMisses(history, slug)) };
}

// items: bankItems(); f: { areas, competencias, difficulty, source, count, order, seed }.
export function matching(items, f, qh) {
  return items.filter((it) => {
    if (!it.hasKey) return false;
    if (f.areas?.length && !f.areas.includes(it.section)) return false;
    if (f.competencias?.length && !f.competencias.includes(it.competencia)) return false;
    if (f.difficulty?.length && !f.difficulty.includes(it.dificultad)) return false;
    if (f.source === "unseen" && qh.seen.has(it.key)) return false;
    if (f.source === "missed" && !qh.missed.has(it.key)) return false;
    if (f.source === "flagged" && !qh.flagged.has(it.key)) return false;
    return true;
  });
}

const shuffle = (list, seed = 1) => {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// The keys of the round, at most `count` (0 = all), whole shared-text groups at a time.
export function pickKeys(pool, { count = 10, order = "booklet", seed = Date.now() } = {}) {
  const units = new Map();
  for (const it of pool) {
    const id = it.groupId ?? `q:${it.key}`;
    if (!units.has(id)) units.set(id, []);
    units.get(id).push(it);
  }
  let list = [...units.values()];
  const diff = (u) => Math.min(...u.map((x) => x.dificultad ?? 3));
  const pos = (u) => Math.min(...u.map((x) => x.number));
  // Random picking first, then the chosen order.
  list = shuffle(list, seed);
  const chosen = [];
  let n = 0;
  for (const u of list) {
    if (count && n >= count) break;
    if (count && n > 0 && n + u.length > count + 2) continue; // a long reading would overshoot: try a shorter unit
    chosen.push(u);
    n += u.length;
  }
  if (order === "booklet") chosen.sort((a, b) => pos(a) - pos(b));
  else if (order === "easy") chosen.sort((a, b) => diff(a) - diff(b) || pos(a) - pos(b));
  return chosen.flatMap((u) => u.sort((a, b) => a.number - b.number).map((x) => x.key));
}
