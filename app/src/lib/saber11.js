// The Saber 11 score the way the ICFES reports it. Pure functions, no network, no React.
//
// EXACT ICFES RULES (official documents):
//   - Five tests, each 0-100: Lectura crítica, Matemáticas, Sociales y ciudadanas, Ciencias naturales, Inglés.
//   - Global 0-500 = round(5 × (3·LC + 3·MA + 3·SC + 3·CN + 1·IN) / 13). Without Inglés, the four others weigh the same.
//   - Niveles de desempeño per test and their cut points (ICFES "Niveles de desempeño" sheets, 2022 and 2025).
//   - Inglés by MCER level: Pre A1, A1, A2, B1 (ICFES sheet of 22 Sept 2025; until 2024 it was A-, A1, A2, B1, B+).
//   - Percentile = share of the country's students with a lower score, for each test and for the global.
//   - The score comes from the whole exam: Sesión 1 + Sesión 2 together, every unanswered question counts as wrong.
//   - Scoring is by item response theory (3PL): the pattern of answers matters, not only how many are right.
// ESTIMATES (the ICFES does not publish them):
//   - The parameters of each question (difficulty, discrimination, guessing). Defaults below, refined by the item's
//     difficulty tag or by the group's own answers (grading.js, IRT model).
//   - The national distributions are the real ones from ICFES open data (Saber 11 calendario A 2022, 532 940
//     students), used to turn ability into the 0-100 scale and to give percentiles. The current cohort is close
//     to it (2024 national global mean 256-260) but it is not the year the student will sit.
import NATIONAL from "./saber11-national-2022.json";

export const SABER11_VERSION = "saber11-3pl-2025.1";
export const NATIONAL_SOURCE = "Saber 11 calendario A 2022, datos abiertos del ICFES (532.940 estudiantes)";

const L = (n, from, to, desc) => ({ code: String(n), label: `Nivel ${n}`, from, to, desc });
const E = (code, from, to, desc) => ({ code, label: code, from, to, desc });

export const TESTS = [
  {
    id: "lc", name: "Lectura crítica", weight: 3,
    levels: [
      L(1, 0, 35, "Identifica elementos literales de un texto, sin relacionarlos aún con su sentido global."),
      L(2, 36, 50, "Comprende el texto de forma literal: ubica información explícita y la relaciona con su contexto."),
      L(3, 51, 65, "Infiere información implícita y reconoce la estructura, las estrategias y los juicios del texto."),
      L(4, 66, 100, "Reflexiona sobre la visión del autor, evalúa sus argumentos y asume una postura crítica."),
    ],
  },
  {
    id: "ma", name: "Matemáticas", weight: 3,
    levels: [
      L(1, 0, 35, "Lee datos puntuales en tablas y gráficas cotidianas con escalas claras."),
      L(2, 36, 50, "Compara variables en una gráfica, interpreta promedio, moda, máximo y mínimo, y probabilidades simples."),
      L(3, 51, 70, "Elige representaciones, compara gráficas con cálculos, relaciona desarrollos planos con sólidos y hace manipulaciones algebraicas simples."),
      L(4, 71, 100, "Resuelve problemas con eventos dependientes y porcentajes, modela algebraicamente y valida afirmaciones con propiedades formales."),
    ],
  },
  {
    id: "sc", name: "Sociales y ciudadanas", weight: 3,
    levels: [
      L(1, 0, 40, "Reconoce derechos ciudadanos en situaciones sencillas y factores que generan conflictos."),
      L(2, 41, 55, "Reconoce deberes del Estado, situaciones de protección o vulneración de derechos y las relaciona con cosmovisiones."),
      L(3, 56, 70, "Identifica prejuicios e intereses de los actores, usa conceptos de las ciencias sociales y valora las fuentes."),
      L(4, 71, 100, "Conoce la reforma constitucional, los mecanismos de participación y los órganos de control, y analiza fuentes primarias y secundarias."),
    ],
  },
  {
    id: "cn", name: "Ciencias naturales", weight: 3,
    levels: [
      L(1, 0, 40, "Reconoce información explícita en tablas o gráficas con una sola variable."),
      L(2, 41, 55, "Identifica patrones y relaciona datos y esquemas simples con conceptos básicos."),
      L(3, 56, 70, "Relaciona conceptos, leyes y teorías para explicar causas y efectos con dos o más variables."),
      L(4, 71, 100, "Usa teorías y leyes para resolver problemas, plantear preguntas de investigación y comunicar resultados."),
    ],
  },
  {
    id: "in", name: "Inglés", weight: 1, mcer: true,
    levels: [
      E("Pre A1", 0, 36, "Reconoce palabras y frases muy simples y vocabulario básico de su entorno."),
      E("A1", 37, 57, "Comprende enunciados simples de la vida diaria: datos personales, saludos, indicaciones."),
      E("A2", 58, 70, "Comprende información puntual de textos cortos y sencillos sobre temas conocidos."),
      E("B1", 71, 100, "Comprende textos generales y específicos de ámbitos académicos, laborales y culturales, e infiere por contexto."),
    ],
  },
];
// Inglés until 2024 (for reading older reports): A- 0-47, A1 48-57, A2 58-67, B1 68-78, B+ 79-100.
export const ENGLISH_LEVELS_2016_2024 = [E("A-", 0, 47, ""), E("A1", 48, 57, ""), E("A2", 58, 67, ""), E("B1", 68, 78, ""), E("B+", 79, 100, "")];

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const PREFIX = { lc: "lectura", ma: "matem", sc: "social", cn: "cienc", in: "ingl" };
export function testOf(name) {
  const n = norm(name);
  return TESTS.find((t) => n.startsWith(PREFIX[t.id])) ?? null;
}
export const weightOf = (name) => testOf(name)?.weight ?? 3;

export function levelFor(name, score) {
  const t = testOf(name);
  if (!t || score == null || !Number.isFinite(score)) return null;
  const s = Math.round(score);
  return t.levels.find((l) => s >= l.from && s <= l.to) ?? t.levels[t.levels.length - 1];
}

// ---------------------------------------------------------------- national distributions
function distribution(entry) {
  const counts = entry.counts;
  const n = counts.reduce((a, b) => a + b, 0);
  const below = [];
  let acc = 0;
  for (const c of counts) { below.push(acc); acc += c; }
  // mid[i]: share of students below score min+i, plus half of those exactly at it (a smooth cumulative curve).
  const mid = counts.map((c, i) => (below[i] + c / 2) / n);
  return { min: entry.min, max: entry.min + counts.length - 1, counts, n, below, mid };
}
const DIST = Object.fromEntries(Object.entries(NATIONAL).map(([k, v]) => [k, distribution(v)]));
// Area names we do not know use the theoretical ICFES scale (mean 50, SD 10).
const distOf = (name) => DIST[testOf(name)?.id] ?? null;

// The ICFES percentile: the share of the country's students whose score is lower ("superas al X %").
function percentileIn(d, score) {
  if (!d || score == null) return null;
  const s = Math.round(score);
  if (s <= d.min) return 0;
  if (s > d.max) return 100;
  return Math.min(99, Math.floor((d.below[s - d.min] / d.n) * 100));
}
export const percentileOf = (name, score) => percentileIn(distOf(name) ?? null, score);
export const globalPercentile = (score) => percentileIn(DIST.global, score);

// ---------------------------------------------------------------- item response theory (3PL)
const D = 1.7;
// Defaults (ESTIMATE). Set so a student at the national median gets about 45 % right and a student at the
// national 99th percentile about 88 % right on a released booklet. Phase 3 calibrates them against real results.
export const ITEM_DEFAULTS = { a: 0.64, b: 0.73, guessFactor: 0.8 };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const logistic = (x) => 1 / (1 + Math.exp(-x));

// One item's parameters. options: how many choices it has (Inglés has parts with 3 and with 8). dificultad: the
// 1-5 tag of the enrichment, if any. b: a difficulty already calibrated on the 3PL ability scale.
export function itemParams({ options, dificultad, b } = {}) {
  const k = Number(options) >= 2 ? Number(options) : 4;
  const c = ITEM_DEFAULTS.guessFactor / k;
  let bb = ITEM_DEFAULTS.b;
  if (Number.isFinite(b)) bb = b;
  else if (Number(dificultad) >= 1 && Number(dificultad) <= 5) bb = ITEM_DEFAULTS.b + (Number(dificultad) - 3) * 0.5;
  return { a: ITEM_DEFAULTS.a, b: bb, c };
}
const p3 = (theta, { a, b, c }) => c + (1 - c) * logistic(D * a * (theta - b));

const GRID = Array.from({ length: 121 }, (_, i) => -4.5 + (9 * i) / 120);
const PRIOR = GRID.map((t) => Math.exp(-(t * t) / 2));

// Ability by expected a posteriori (standard normal prior) from the pattern: items [{ r: 0|1, a, b, c }].
export function eapTheta(items) {
  if (!items?.length) return null;
  const logPost = GRID.map((t, g) => {
    let s = Math.log(PRIOR[g]);
    for (const it of items) { const p = clamp(p3(t, it), 1e-9, 1 - 1e-9); s += it.r ? Math.log(p) : Math.log(1 - p); }
    return s;
  });
  const top = Math.max(...logPost);
  const w = logPost.map((v) => Math.exp(v - top));
  const sw = w.reduce((a, b) => a + b, 0);
  const theta = GRID.reduce((a, t, g) => a + t * w[g], 0) / sw;
  const v = GRID.reduce((a, t, g) => a + (t - theta) ** 2 * w[g], 0) / sw;
  return { theta, se: Math.sqrt(v) };
}

// Standard normal cumulative (Abramowitz-Stegun 26.2.17, error < 1e-7).
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Ability -> the 0-100 scale: the score that holds the same place in the country as the ability does in a normal
// population (equipercentile on the real national distribution). Unknown areas use 50 + 10·theta.
export function scaleFromTheta(name, theta) {
  const d = distOf(name);
  if (!d) return clamp(50 + 10 * theta, 0, 100);
  const p = phi(theta);
  const { mid, min } = d;
  if (p <= mid[0]) return min;
  for (let i = 1; i < mid.length; i += 1) {
    if (p <= mid[i]) return min + i - 1 + (p - mid[i - 1]) / Math.max(mid[i] - mid[i - 1], 1e-12);
  }
  return d.max;
}

// The items of one area: its stored pattern when there is one, otherwise `correct` right out of `total` with
// default parameters (the same estimate for any pattern of that many right).
export function areaItems(a) {
  if (Array.isArray(a.resp) && a.resp.length) {
    return a.resp.map(([r, options, dificultad, b]) => ({ r: r ? 1 : 0, ...itemParams({ options, dificultad, b: b ?? undefined }) }));
  }
  const total = Math.max(0, Math.round(a.total ?? 0));
  const right = clamp(Math.round(a.correct ?? 0), 0, total);
  const p = itemParams({});
  return Array.from({ length: total }, (_, i) => ({ r: i < right ? 1 : 0, ...p }));
}

// One test: { name, correct, total, resp? } -> { name, scale (0-100), low, high, level, percentile, pct, total }.
export function scoreTest(a) {
  const items = a.items ?? areaItems(a);
  const pct = a.total > 0 ? Math.round(((a.correct ?? 0) / a.total) * 100) : null;
  const est = eapTheta(items);
  // Every question right: the ICFES reports 100 (a spike at 100 in its national data), not a finite estimate.
  if (est && items.every((it) => it.r)) {
    const low = Math.round(scaleFromTheta(a.name, est.theta - est.se));
    return { name: a.name, scale: 100, low, high: 100, theta: est.theta, se: est.se, level: levelFor(a.name, 100), percentile: percentileOf(a.name, 100), pct, total: a.total ?? items.length };
  }
  if (!est) return { name: a.name, scale: null, low: null, high: null, level: null, percentile: null, pct, total: a.total ?? 0 };
  const scale = Math.round(scaleFromTheta(a.name, est.theta));
  const low = Math.round(scaleFromTheta(a.name, est.theta - est.se));
  const high = Math.round(scaleFromTheta(a.name, est.theta + est.se));
  return { name: a.name, scale, low, high, theta: est.theta, se: est.se, level: levelFor(a.name, scale), percentile: percentileOf(a.name, scale), pct, total: a.total ?? items.length };
}

// The official global: weights 3 (core tests) and 1 (Inglés), divided by their sum, times 5, rounded.
export function globalFrom(areas) {
  const xs = areas.filter((a) => a.scale != null);
  if (!xs.length) return null;
  const w = xs.reduce((n, a) => n + weightOf(a.name), 0);
  return Math.round((5 * xs.reduce((n, a) => n + weightOf(a.name) * a.scale, 0)) / w);
}

// The whole result. perArea: [{ name, correct, total, resp? }]. The likely range is ±1 standard error.
export function scoreSaber11(perArea = []) {
  const areas = perArea.filter((a) => (a.total ?? a.resp?.length ?? 0) > 0).map(scoreTest);
  const global = globalFrom(areas);
  if (global == null) return { areas, global: null, low: null, high: null, percentile: null, version: SABER11_VERSION };
  const xs = areas.filter((a) => a.scale != null);
  const w = xs.reduce((n, a) => n + weightOf(a.name), 0);
  const se = (5 / w) * Math.sqrt(xs.reduce((n, a) => n + (weightOf(a.name) * (a.high - a.low)) ** 2 / 4, 0));
  const margin = Math.max(5, Math.round(se));
  return {
    areas, global, low: Math.max(0, global - margin), high: Math.min(500, global + margin),
    percentile: globalPercentile(global), version: SABER11_VERSION,
  };
}

// Raw share right -> score for one test, for the "how it is calculated" table.
export function expectedScale(name, share, n = 50) {
  return scoreTest({ name, correct: Math.round(share * n), total: n }).scale;
}

// For a group, like the ICFES report for schools: per test the average score and the share of students at each
// level. sims: complete simulacros (one per student). Returns [{ name, mean, n, levels: [{ label, n, pct }] }].
export function levelDistribution(sims = []) {
  return TESTS.map((t) => {
    const scores = sims.map((s) => s?.areas?.find((a) => testOf(a.name)?.id === t.id)?.scale).filter((v) => v != null);
    const n = scores.length;
    return {
      name: t.name, n, mean: n ? Math.round(scores.reduce((a, b) => a + b, 0) / n) : null,
      levels: t.levels.map((l) => {
        const k = scores.filter((v) => v >= l.from && v <= l.to).length;
        return { label: l.label, n: k, pct: n ? Math.round((k / n) * 100) : 0 };
      }),
    };
  }).filter((r) => r.n > 0);
}

// One activity's own ICFES-style estimate (never a mix of activities). Each test with at least MIN_ACTIVITY_ITEMS
// keyed questions gets its 0-100 score, level and percentile; the global only when `withGlobal` (a whole session or
// a whole simulacro). In practice only what was answered counts (stopping early is normal there); with time, blanks
// are wrong like on exam day.
export const MIN_ACTIVITY_ITEMS = 8;
export function activityEstimate(questions = [], answers = {}, key, { mode = "practice", withGlobal = false } = {}) {
  if (!key) return null;
  const by = new Map();
  for (const q of questions) {
    const right = key.get(q.key);
    if (!right) continue;
    const given = answers?.[q.key];
    if (mode === "practice" && !given) continue;
    const a = by.get(q.section) ?? { name: q.section, correct: 0, total: 0, resp: [] };
    const r = given === right ? 1 : 0;
    a.correct += r; a.total += 1; a.resp.push([r, q.options?.length || 4]);
    by.set(q.section, a);
  }
  const areas = [...by.values()].filter((a) => a.total >= MIN_ACTIVITY_ITEMS && testOf(a.name));
  if (!areas.length) return { areas: [], global: null, few: [...by.values()].filter((a) => testOf(a.name)) };
  const r = scoreSaber11(areas);
  return withGlobal ? r : { ...r, global: null, low: null, high: null, percentile: null };
}
