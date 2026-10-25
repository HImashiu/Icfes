// Saber 11 scoring the way ICFES reports it. Pure functions, no network, no React.
//
// What ICFES does (sources: Icfes "niveles de desempeño Saber 11" 2025, Informe Nacional de Resultados 2022,
// Res. 677/2021, Icfes individual report guide):
// - Each prueba is scored 0-100 with item response theory (3PL: discrimination, difficulty, guessing). Ability comes
//   from the pattern of answers, so a hard item right is worth more than an easy one. Blanks count as wrong.
// - Global 0-500 = (3·LC + 3·MA + 3·SC + 3·CN + 1·IN) / 13 × 5. Without English: the average of the other four × 5.
// - Niveles de desempeño per prueba (official ranges, ICFES 2025) and the English MCER levels.
// - Percentil nacional per prueba and global: the share of the country below that score.
// - Schools: an index per prueba from the top 80 % of their students (at least 9), weighted into a global index,
//   cut into A+, A, B, C, D (Res. 677/2021).
//
// What we cannot know: ICFES's item parameters and its equating constants are not public. So items get standard 3PL
// values (guessing 0.2, one discrimination) with a difficulty from the item's tagged dificultad, or from the group's
// answers when there are enough; ability is placed on the national population (θ ~ N(0,1)), never on the group's own
// average, so a strong school is not pulled down to 250. Every number is an estimate and says so.

// National reference: Saber 11 2022 calendario A, mean (SD) per prueba and global (Informe Nacional de Resultados 2022).
export const NATIONAL = {
  "Lectura crítica": { mean: 54, sd: 11 },
  "Matemáticas": { mean: 52, sd: 12 },
  "Sociales y ciudadanas": { mean: 48, sd: 12 },
  "Ciencias naturales": { mean: 50, sd: 10 },
  "Inglés": { mean: 51, sd: 13 },
};
export const NATIONAL_GLOBAL = { mean: 254, sd: 51 };
export const NATIONAL_SOURCE = "Saber 11 2022, calendario A (Icfes)";
export const CORE = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales"];
export const WEIGHTS = { "Lectura crítica": 3, "Matemáticas": 3, "Sociales y ciudadanas": 3, "Ciencias naturales": 3, "Inglés": 1 };
export const weightOf = (name) => WEIGHTS[name] ?? 3;
const ref = (name) => NATIONAL[name] ?? { mean: 50, sd: 10 };

// Niveles de desempeño: the lowest score of levels 2, 3 and 4 (ICFES, niveles de desempeño Saber 11, 2025).
const LEVEL_CUTS = {
  "Lectura crítica": [36, 51, 66],
  "Matemáticas": [36, 51, 71],
  "Sociales y ciudadanas": [41, 56, 71],
  "Ciencias naturales": [41, 56, 71],
};
// English: Pre A1 (reported A-), A1, A2, B1 from the same 2025 ranges; the reports also show B+ above B1.
const ENGLISH = [{ min: 0, label: "A-" }, { min: 37, label: "A1" }, { min: 58, label: "A2" }, { min: 71, label: "B1" }];

// { n: 1-4 (English 0-3), label: "Nivel 3" | "A2", range: "51–70" } or null.
export function levelOf(area, score) {
  if (score == null || !Number.isFinite(score)) return null;
  if (area === "Inglés") {
    const i = ENGLISH.findLastIndex((l) => score >= l.min);
    const hi = ENGLISH[i + 1]?.min - 1 || 100;
    return { n: i + 1, of: ENGLISH.length, label: ENGLISH[i].label, range: `${ENGLISH[i].min}–${hi}` };
  }
  const cuts = LEVEL_CUTS[area];
  if (!cuts) return null;
  const n = 1 + cuts.filter((c) => score >= c).length;
  const lo = n === 1 ? 0 : cuts[n - 2];
  const hi = n === 4 ? 100 : cuts[n - 1] - 1;
  return { n, of: 4, label: `Nivel ${n}`, range: `${lo}–${hi}` };
}
export const LEVEL_TEXT = {
  1: "No supera las preguntas de menor complejidad",
  2: "Supera las preguntas de menor complejidad",
  3: "Supera las preguntas de complejidad media",
  4: "Supera las preguntas de mayor complejidad",
};

// Standard normal cumulative distribution (Abramowitz-Stegun 7.1.26, error < 1.5e-7).
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
const pctile = (score, { mean, sd }) => Math.min(99, Math.max(1, Math.round(100 * normCdf((score - mean) / sd))));
// Percentil nacional: the share of the country's students below this score (1-99). Never a position in a class.
export const percentileOf = (area, score) => (score == null ? null : pctile(score, ref(area)));
export const globalPercentile = (g) => (g == null ? null : pctile(g, NATIONAL_GLOBAL));

// Global 0-500 from the five 0-100 scores, ICFES's way. Needs the four core pruebas; English is optional (exempt).
export function globalScore(scores) {
  if (CORE.some((a) => scores[a] == null)) return null;
  const core = CORE.reduce((n, a) => n + scores[a], 0);
  if (scores["Inglés"] == null) return Math.round((core / 4) * 5);
  return Math.round(((3 * core + scores["Inglés"]) / 13) * 5);
}
// The same weights over whichever pruebas were taken (an activity of one or two areas): its 0-500 equivalent.
export function partialGlobal(scores) {
  const names = Object.keys(scores).filter((a) => scores[a] != null);
  if (!names.length) return null;
  const w = names.reduce((n, a) => n + weightOf(a), 0);
  return Math.round((names.reduce((n, a) => n + weightOf(a) * scores[a], 0) / w) * 5);
}

// ---------------------------------------------------------------- the 3PL model
const D = 1.7;
export const GUESS = 0.2;
export const DISCRIMINATION = 1;
// Tagged dificultad 1-5 -> item difficulty b on the national θ scale. An untagged item is a middle one (b = 0.4,
// which makes the national average student get about half of a booklet right).
const B_BY_DIFFICULTY = { 1: -1.4, 2: -0.5, 3: 0.4, 4: 1.3, 5: 2.2 };
export const bFromDifficulty = (d) => B_BY_DIFFICULTY[Math.round(Number(d))] ?? 0.4;
export const p3 = (theta, b, a = DISCRIMINATION, c = GUESS) => c + (1 - c) / (1 + Math.exp(-D * a * (theta - b)));

const GRID = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);
// A wide prior (SD 1.5) so a strong student is not pulled back toward the national average by the prior alone.
const PRIOR = GRID.map((t) => Math.exp(-(t * t) / (2 * 1.5 * 1.5)));

// Expected-a-posteriori ability from a pattern: items [{ b, right }]. Returns { theta, se }.
export function eap(items) {
  const post = GRID.map((t, k) => {
    let l = PRIOR[k];
    for (const it of items) { const p = p3(t, it.b); l *= it.right ? p : 1 - p; }
    return l;
  });
  const z = post.reduce((n, v) => n + v, 0) || 1;
  const theta = post.reduce((n, v, k) => n + v * GRID[k], 0) / z;
  const se = Math.sqrt(post.reduce((n, v, k) => n + v * (GRID[k] - theta) ** 2, 0) / z);
  return { theta, se };
}

// θ -> 0-100 on a prueba's scale. A perfect prueba is 100, like on the real report.
const toScale = (area, theta) => Math.round(Math.min(100, Math.max(0, ref(area).mean + ref(area).sd * theta)));

// Too few questions say nothing about a prueba: no score below this.
export const MIN_ITEMS = 5;

// One prueba from the answer pattern. items: [{ right: bool, b?: number, dificultad?: 1-5 }].
// Returns { score, low, high, theta, se, n, correct } or null.
export function scorePattern(area, items) {
  if (!items || items.length < MIN_ITEMS) return null;
  const its = items.map((it) => ({ right: Boolean(it.right), b: Number.isFinite(it.b) ? it.b : bFromDifficulty(it.dificultad) }));
  const correct = its.filter((i) => i.right).length;
  const { theta, se } = eap(its);
  const perfect = correct === its.length;
  const score = perfect ? 100 : toScale(area, theta);
  const spread = Math.round(ref(area).sd * se);
  return { score, low: Math.max(0, score - spread), high: Math.min(100, score + spread), theta, se, n: its.length, correct };
}

// One prueba from counts only (scanned sheets, stored summaries): the answers are taken as items of spread
// difficulty (b from -1.4 to 2.2, like a real booklet), each count right maps to one score.
export function scoreCounts(area, correct, total) {
  if (!total || total < MIN_ITEMS) return null;
  const k = Math.max(0, Math.min(total, Math.round(correct)));
  // Which items were right matters in 3PL; with counts only, assume the easiest were the ones answered right.
  const bs = Array.from({ length: total }, (_, i) => -1.4 + (3.6 * (i + 0.5)) / total);
  return scorePattern(area, bs.map((b, i) => ({ b, right: i < k })));
}

// A full report like ICFES's from 0-100 scores per prueba: { areas: [...], global, globalPercentile, complete }.
export function reportFrom(perArea) {
  const areas = perArea.map((a) => ({ ...a, level: levelOf(a.name, a.score), percentile: percentileOf(a.name, a.score) }));
  const scores = Object.fromEntries(areas.map((a) => [a.name, a.score]));
  const global = globalScore(scores);
  return { areas, global, globalPercentile: globalPercentile(global), complete: global != null };
}

// ---------------------------------------------------------------- the group's item difficulties
// With enough answers (15 people), the group says which items are harder than others. Only the ORDER and spacing
// are taken from the group: the items' average difficulty stays where the tags put it, so the group's own level is
// never mistaken for the items' difficulty (a strong group would otherwise make every item look easy).
// rows: persons x items 0/1 (null = not shown). prior: b per item. Returns b per item.
export function groupDifficulties(rows, prior) {
  const n = prior.length;
  const shown = (j) => rows.filter((r) => r[j] != null);
  const logit = (j) => {
    const r = shown(j);
    if (r.length < 15) return null;
    const p = (r.reduce((s, x) => s + x[j], 0) + 0.5) / (r.length + 1);
    const q = Math.min(0.97, Math.max(GUESS + 0.03, p));
    return -Math.log((q - GUESS) / (1 - q));
  };
  const raw = Array.from({ length: n }, (_, j) => logit(j));
  const have = raw.map((v, j) => (v == null ? null : j)).filter((j) => j != null);
  if (have.length < MIN_ITEMS) return prior;
  const m = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const shift = m(have.map((j) => prior[j])) - m(have.map((j) => raw[j]));
  return prior.map((b, j) => (raw[j] == null ? b : 0.5 * b + 0.5 * (raw[j] + shift)));
}

// ---------------------------------------------------------------- school category (Res. 677/2021)
// Per prueba: the school's scores high to low, the lowest 20 % left out (at least 9 kept), as shares of 100; the index
// is their mean over one plus their variance, so a uniform school scores higher than an uneven one with the same
// mean. Global index: the 3/3/3/3/1 average. ICFES uses three years of results; we use what the app has.
export const CATEGORY_CUTS = [{ min: 0.77, label: "A+" }, { min: 0.72, label: "A" }, { min: 0.67, label: "B" }, { min: 0.62, label: "C" }, { min: 0, label: "D" }];
export const MIN_SCHOOL = 9;

export function pruebaIndex(scores) {
  const xs = scores.filter((v) => v != null).sort((a, b) => b - a);
  if (xs.length < MIN_SCHOOL) return null;
  const keep = xs.slice(0, Math.max(MIN_SCHOOL, xs.length - Math.floor(xs.length * 0.2))).map((v) => v / 100);
  const mean = keep.reduce((s, v) => s + v, 0) / keep.length;
  const variance = keep.reduce((s, v) => s + (v - mean) ** 2, 0) / keep.length;
  return mean / (1 + variance);
}

// students: [{ "Lectura crítica": 61, ... }]. Returns { index, category, perArea: {name: index}, n } or null.
export function schoolCategory(students) {
  const perArea = {};
  for (const a of [...CORE, "Inglés"]) {
    const idx = pruebaIndex(students.map((s) => s[a]));
    if (idx != null) perArea[a] = idx;
  }
  if (CORE.some((a) => perArea[a] == null)) return null;
  const names = Object.keys(perArea);
  const w = names.reduce((n, a) => n + weightOf(a), 0);
  const index = names.reduce((n, a) => n + weightOf(a) * perArea[a], 0) / w;
  return { index, category: CATEGORY_CUTS.find((c) => index > c.min || c.min === 0).label, perArea, n: students.length };
}
