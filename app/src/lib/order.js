// The order of the areas in a full mock exam. The booklet's own order is the default; a student can move areas
// around (for example English first) and the choice is remembered in this browser.
const KEY = "condor:area-order";

export function normalizeOrder(order, areas) {
  const keep = (order ?? []).filter((a) => areas.includes(a));
  return [...keep, ...areas.filter((a) => !keep.includes(a))];
}

export function loadOrder(areas) {
  try {
    return normalizeOrder(JSON.parse(window.localStorage.getItem(KEY) ?? "[]"), areas);
  } catch {
    return areas;
  }
}

export function saveOrder(order) {
  try { window.localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* the order only lasts for this visit */ }
}

// Moves the area at `index` one place (dir -1 up, +1 down).
export function moveArea(order, index, dir) {
  const to = index + dir;
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// Questions of a full exam grouped by area in the chosen order, each area keeping its booklet order.
export function orderQuestions(questions, order) {
  if (!order?.length) return questions;
  const rank = new Map(order.map((a, i) => [a, i]));
  const at = (q) => rank.get(q.section) ?? order.length;
  return questions.map((q, i) => ({ q, i })).sort((a, b) => at(a.q) - at(b.q) || a.i - b.i).map((x) => x.q);
}
