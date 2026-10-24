// Grading models: how a delivered attempt becomes the number a teacher reports. Pure functions, no network, no React.
//
// A model is a small JSON object chosen per school, class space or assignment (the nearest one wins):
//   kind      percent | scale | icfes | irt | formula
//   partial   { hintCredit, wrongPenalty }   share of credit for an answer given after a hint / points lost per wrong answer
//   curves    { [area]: { strict, bonus } }  per-topic curve on the share right: 100*(p/100)^strict + bonus
//   xp        { decay, floor }               power law: attempt n earns n^-decay of the XP (never below floor)
//   scale     { min, max, pass, passPct, decimals }   linear in two pieces, so passPct % earns the pass grade
//   formula   { expr, unit, decimals }       teacher-defined, see formula.js
//   denominator auto | total | answered
// Every key here is preliminary, so every result is too. IRT is provisional: it is calibrated on the group's own answers.
import { areaScale, bandFor, weight } from "./analytics.js";
import { FormulaError, evalTree, parseFormula } from "./formula.js";

export const MODEL_KINDS = [
  { id: "percent", label: "Porcentaje", hint: "Aciertos sobre el total, de 0 a 100." },
  { id: "scale", label: "Escala propia", hint: "Por ejemplo notas de 1,0 a 5,0 con nota mínima de aprobación y exigencia del 60 %." },
  { id: "icfes", label: "Estimado ICFES (0–500)", hint: "Corrige el azar y pondera las áreas como el Saber 11. Curva provisional." },
  { id: "irt", label: "Puntaje IRT (provisional)", hint: "Dificultad de cada pregunta calculada con las respuestas del grupo. Necesita varias entregas." },
  { id: "formula", label: "Fórmula del docente", hint: "Escribe tu propia fórmula con porcentaje, aciertos, tiempo, pistas y más." },
];

export const FORMULA_VARS = {
  pct: "Porcentaje final (0–100), con tus ajustes de crédito parcial y curvas",
  raw_pct: "Porcentaje sin ajustes",
  correct: "Respuestas correctas",
  wrong: "Respuestas incorrectas",
  omitted: "Preguntas sin responder",
  answered: "Preguntas respondidas",
  total: "Preguntas del intento",
  hints: "Pistas usadas",
  minutes: "Minutos empleados",
  attempt: "Número de intento",
  band: "Estimado ICFES (0–500)",
  nota: "Resultado en tu escala propia",
};

const num = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function normalizeModel(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const kind = MODEL_KINDS.some((k) => k.id === m.kind) ? m.kind : "percent";
  const scale = m.scale ?? {};
  const min = num(scale.min, -1000, 1000, 1);
  const max = Math.max(min + 0.1, num(scale.max, -1000, 1000, 5));
  const curves = {};
  for (const [name, c] of Object.entries(m.curves ?? {})) {
    const strict = num(c?.strict, 0.5, 2, 1);
    const bonus = num(c?.bonus, -30, 30, 0);
    if (strict !== 1 || bonus !== 0) curves[String(name).slice(0, 60)] = { strict, bonus };
  }
  return {
    kind,
    partial: { hintCredit: num(m.partial?.hintCredit, 0, 1, 1), wrongPenalty: num(m.partial?.wrongPenalty, 0, 1, 0) },
    curves,
    xp: { decay: num(m.xp?.decay, 0, 3, 0), floor: num(m.xp?.floor, 0, 1, 0.1) },
    scale: { min, max, pass: num(scale.pass, min, max, Math.min(max, 3)), passPct: num(scale.passPct, 1, 99, 60), decimals: Math.round(num(scale.decimals, 0, 3, 1)) },
    formula: { expr: String(m.formula?.expr ?? "pct / 20").slice(0, 400), unit: String(m.formula?.unit ?? "").slice(0, 12), decimals: Math.round(num(m.formula?.decimals, 0, 3, 1)) },
    denominator: ["total", "answered"].includes(m.denominator) ? m.denominator : "auto",
  };
}
export const DEFAULT_MODEL = normalizeModel({});

// The nearest model wins: assignment, then class space, then school. `rows` are grading_models rows.
export function resolveModel(rows, { assignmentId, courseId, schoolId } = {}) {
  const find = (scope, id) => (id ? rows?.find((r) => r.scope === scope && r.scope_id === id) : null);
  const hit = find("assignment", assignmentId) ?? find("course", courseId) ?? find("school", schoolId);
  return hit ? { model: normalizeModel(hit.model), source: hit.scope } : { model: DEFAULT_MODEL, source: "default" };
}
export const SOURCE_LABEL = { assignment: "esta asignación", course: "este espacio de clase", school: "el colegio", default: "el modelo por defecto (porcentaje)" };

// The XP an attempt earns, as a share of the usual: attempt 1 earns all of it, attempt 2 earns 2^-decay, and so on.
export function xpFactor(model, attemptNo) {
  const { decay, floor } = normalizeModel(model).xp;
  if (!decay || !(attemptNo > 1)) return 1;
  return Math.max(floor, Math.pow(attemptNo, -decay));
}

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Counts and credit per area. `item`: { answers, hints, mode, perArea } ; ctx: { questions, key }.
export function attemptStats(item, model, ctx = {}) {
  const m = normalizeModel(model);
  const { hintCredit, wrongPenalty } = m.partial;
  const areas = new Map();
  const area = (name) => {
    if (!areas.has(name)) areas.set(name, { name, total: 0, answered: 0, correct: 0, wrong: 0, credit: 0, hints: 0 });
    return areas.get(name);
  };
  let keyed = true;
  if (ctx.questions && ctx.key && (!item.perArea?.length || Object.keys(item.answers ?? {}).length > 0)) {
    for (const q of ctx.questions) {
      const a = area(q.section);
      a.total += 1;
      const given = item.answers?.[q.key];
      if (!given) continue;
      a.answered += 1;
      const right = ctx.key.get(q.key);
      if (!right) continue;
      if (given === right) {
        const hinted = Boolean(item.hints?.[q.key]);
        a.correct += 1;
        a.credit += hinted ? hintCredit : 1;
        if (hinted) a.hints += 1;
      } else {
        a.wrong += 1;
        a.credit -= wrongPenalty;
      }
    }
  } else if (item.perArea?.length) {
    // No questions at hand: the stored score still has counts per area (hints are unknown here).
    for (const s of item.perArea) {
      const a = area(s.name);
      a.total = s.total ?? 0;
      a.answered = s.answered ?? 0;
      a.correct = s.correct ?? 0;
      a.wrong = Math.max(0, a.answered - a.correct);
      a.credit = a.correct - wrongPenalty * a.wrong;
    }
  } else keyed = false;

  const practice = item.mode === "practice";
  const useAnswered = m.denominator === "answered" || (m.denominator === "auto" && practice);
  const perArea = [...areas.values()].map((a) => {
    const denom = useAnswered ? a.answered : a.total;
    const credit = Math.max(0, a.credit);
    const raw = denom > 0 ? (a.correct / denom) * 100 : null;
    const adj = denom > 0 ? (credit / denom) * 100 : null;
    const c = m.curves[a.name];
    const pct = adj == null ? null : c ? clamp(100 * Math.pow(adj / 100, c.strict) + c.bonus, 0, 100) : adj;
    return { ...a, denom, rawPct: raw, adjPct: adj, pct };
  });
  const sum = (f) => perArea.reduce((n, a) => n + f(a), 0);
  const denom = sum((a) => a.denom);
  const wavg = (f) => (denom > 0 ? sum((a) => (a.denom > 0 ? f(a) * a.denom : 0)) / denom : null);
  return {
    keyed: keyed && denom > 0, perArea,
    total: sum((a) => a.total), answered: sum((a) => a.answered), correct: sum((a) => a.correct), wrong: sum((a) => a.wrong),
    hints: sum((a) => a.hints),
    rawPct: wavg((a) => a.rawPct ?? 0), pct: wavg((a) => a.pct ?? 0),
  };
}

// Two straight pieces: 0 % -> min, passPct -> pass, 100 % -> max.
export function toScale(pct, scale) {
  const { min, max, pass, passPct } = scale;
  const v = pct < passPct ? min + (pass - min) * (pct / passPct) : pass + (max - pass) * ((pct - passPct) / (100 - passPct));
  return clamp(v, min, max);
}

const fmt = (v, d) => Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

// Estimate on the 0-500 scale from the (curved) share right in each area.
function icfesBand(stats) {
  return bandFor(stats.perArea.filter((a) => a.total > 0 && a.pct != null).map((a) => ({ name: a.name, total: a.total, correct: (a.pct / 100) * a.total })));
}

// ---------------------------------------------------------------- IRT (Rasch, joint maximum likelihood)
const logistic = (x) => 1 / (1 + Math.exp(-x));
const MIN_PEOPLE = 15;
const MIN_ITEMS = 5;

// x: persons x items matrix of 0/1. Items everybody or nobody got right carry no information and are dropped.
export function raschCalibrate(x) {
  const nP = x.length;
  const nI = x[0]?.length ?? 0;
  const keep = [];
  for (let j = 0; j < nI; j += 1) {
    const s = x.reduce((n, row) => n + row[j], 0);
    if (s > 0 && s < nP) keep.push(j);
  }
  if (nP < MIN_PEOPLE || keep.length < MIN_ITEMS) return null;
  const L = keep.length;
  const r = x.map((row) => clamp(keep.reduce((n, j) => n + row[j], 0), 0.5, L - 0.5));
  const s = keep.map((j) => x.reduce((n, row) => n + row[j], 0));
  const theta = r.map((v) => Math.log(v / (L - v)));
  const b = s.map((v) => Math.log((nP - v) / v));
  for (let it = 0; it < 40; it += 1) {
    for (let i = 0; i < nP; i += 1) {
      let e = 0, v = 0;
      for (let k = 0; k < L; k += 1) { const p = logistic(theta[i] - b[k]); e += p; v += p * (1 - p); }
      theta[i] += clamp((r[i] - e) / Math.max(v, 1e-6), -1, 1);
    }
    for (let k = 0; k < L; k += 1) {
      let e = 0, v = 0;
      for (let i = 0; i < nP; i += 1) { const p = logistic(theta[i] - b[k]); e += p; v += p * (1 - p); }
      b[k] += clamp((e - s[k]) / Math.max(v, 1e-6), -1, 1);
    }
    const mb = b.reduce((n, v) => n + v, 0) / L;
    for (let k = 0; k < L; k += 1) b[k] -= mb;
  }
  return { keep, b, theta };
}

// Score every item (person) of a group on the 0-100 area scale (mean 50, SD 10 within the group) and the 0-500 global.
// Returns an array aligned with `items`, each { areas: {name: score|null}, global|null, fallback: bool }.
export function irtScores(items, ctx) {
  const { questions, key } = ctx;
  const byArea = new Map();
  for (const q of questions) if (key?.get(q.key)) byArea.set(q.section, [...(byArea.get(q.section) ?? []), q]);
  const out = items.map(() => ({ areas: {}, global: null, fallback: false }));
  for (const [name, qs] of byArea) {
    const people = items.map((it, i) => ({ i, it })).filter(({ it }) => qs.some((q) => it.answers?.[q.key]));
    const x = people.map(({ it }) => qs.map((q) => (it.answers?.[q.key] === key.get(q.key) ? 1 : 0)));
    const fit = raschCalibrate(x);
    if (!fit) {
      for (const { i, it } of people) {
        const right = qs.filter((q) => it.answers?.[q.key] === key.get(q.key)).length;
        out[i].areas[name] = areaScale(right, qs.length);
        out[i].fallback = true;
      }
      continue;
    }
    const mean = fit.theta.reduce((n, v) => n + v, 0) / fit.theta.length;
    const sd = Math.sqrt(fit.theta.reduce((n, v) => n + (v - mean) ** 2, 0) / fit.theta.length) || 1;
    people.forEach(({ i }, k) => { out[i].areas[name] = Math.round(clamp(50 + (10 * (fit.theta[k] - mean)) / sd, 0, 100)); });
  }
  for (const o of out) {
    const names = Object.keys(o.areas).filter((n) => o.areas[n] != null);
    if (names.length === 0) continue;
    const w = names.reduce((n, a) => n + weight(a), 0);
    o.global = Math.round((names.reduce((n, a) => n + weight(a) * o.areas[a], 0) / w) * 5);
  }
  return out;
}

// ---------------------------------------------------------------- grading
// items: [{ id, answers, hints, mode, minutes, attemptNo, perArea }]. ctx: { questions, key }.
// Returns one result per item: { ok, value, display, kind, provisional, note, pct, rawPct, areas, low, high, stats, error }.
export function gradeMany(items, rawModel, ctx = {}) {
  const m = normalizeModel(rawModel);
  const irt = m.kind === "irt" && ctx.questions && ctx.key ? irtScores(items, ctx) : null;
  let tree = null;
  let treeError = null;
  if (m.kind === "formula") {
    try { tree = parseFormula(m.formula.expr); } catch (e) { treeError = e instanceof FormulaError ? e.message : "Fórmula no válida."; }
  }
  return items.map((item, idx) => {
    const st = attemptStats(item, m, ctx);
    const base = { kind: m.kind, stats: st, pct: st.pct, rawPct: st.rawPct, areas: st.perArea.map((a) => ({ name: a.name, pct: a.pct == null ? null : Math.round(a.pct) })) };
    if (!st.keyed) return { ...base, ok: false, value: null, display: "—", error: "Sin clave de respuestas." };
    const pct = st.pct;
    const band = icfesBand(st);
    switch (m.kind) {
      case "percent":
        return { ...base, ok: true, value: Math.round(pct), display: `${Math.round(pct)} %`, min: 0, max: 100 };
      case "scale": {
        const v = toScale(pct, m.scale);
        return { ...base, ok: true, value: Number(v.toFixed(m.scale.decimals)), display: fmt(v, m.scale.decimals), min: m.scale.min, max: m.scale.max, passed: v >= m.scale.pass };
      }
      case "icfes":
        return { ...base, ok: band.global != null, value: band.global, display: band.global == null ? "—" : String(band.global), low: band.low, high: band.high, min: 0, max: 500, provisional: true, note: "Estimado con curva provisional y clave preliminar." };
      case "irt": {
        const r = irt?.[idx];
        if (!r || r.global == null) return { ...base, ok: band.global != null, value: band.global, display: band.global == null ? "—" : String(band.global), low: band.low, high: band.high, min: 0, max: 500, provisional: true, note: "Sin grupo suficiente para IRT: se muestra el estimado ICFES." };
        return {
          ...base, ok: true, value: r.global, display: String(r.global), min: 0, max: 500, provisional: true,
          areas: Object.entries(r.areas).map(([name, v]) => ({ name, pct: st.perArea.find((a) => a.name === name)?.pct == null ? null : Math.round(st.perArea.find((a) => a.name === name).pct), score: v })),
          note: r.fallback ? "Algunas áreas no tienen grupo suficiente y usan el estimado ICFES." : `Calibrado con las respuestas de ${items.length} entregas del grupo (media 50, DE 10 por área). Provisional.`,
        };
      }
      case "formula": {
        if (treeError) return { ...base, ok: false, value: null, display: "—", error: treeError };
        const scaleV = toScale(pct, m.scale);
        const vars = {
          pct, raw_pct: st.rawPct, correct: st.correct, wrong: st.wrong, omitted: st.total - st.answered, answered: st.answered, total: st.total,
          hints: st.hints, minutes: item.minutes ?? 0, attempt: item.attemptNo ?? 1, band: band.global ?? 0, nota: scaleV,
        };
        const areaOf = (name) => {
          const q = norm(name);
          const a = st.perArea.find((x) => norm(x.name).startsWith(q)) ?? st.perArea.find((x) => norm(x.name).includes(q));
          return a?.pct ?? 0;
        };
        try {
          const v = evalTree(tree, vars, areaOf);
          return { ...base, ok: true, value: Number(v.toFixed(m.formula.decimals)), display: `${fmt(v, m.formula.decimals)}${m.formula.unit ? ` ${m.formula.unit}` : ""}` };
        } catch (e) {
          return { ...base, ok: false, value: null, display: "—", error: e instanceof FormulaError ? e.message : "Fórmula no válida." };
        }
      }
      default:
        return { ...base, ok: false, value: null, display: "—" };
    }
  });
}

export const gradeAttempt = (item, model, ctx) => gradeMany([item], model, ctx)[0];

// Adapters. A stored attempt row (Supabase) and the local attempt object carry hints under different names.
export function itemFromRow(row, attemptNo = 1) {
  return {
    id: row.client_id ?? row.id, answers: row.answers ?? {}, hints: row.activity?.hints ?? {}, mode: row.mode,
    minutes: row.duration_sec ? row.duration_sec / 60 : 0, attemptNo, perArea: row.score?.perArea,
  };
}
export function itemFromAttempt(attempt, attemptNo = 1) {
  return {
    id: String(attempt.startedAt), answers: attempt.answers ?? {}, hints: attempt.hintsUsed ?? {}, mode: attempt.mode,
    minutes: attempt.submittedAt && attempt.startedAt ? (attempt.submittedAt - attempt.startedAt) / 60000 : 0, attemptNo,
  };
}

// A value of this model as text ("4,2", "340", "78 %").
export function formatValue(rawModel, v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const m = normalizeModel(rawModel);
  if (m.kind === "percent") return `${Math.round(v)} %`;
  if (m.kind === "scale") return fmt(v, m.scale.decimals);
  if (m.kind === "formula") return `${fmt(v, m.formula.decimals)}${m.formula.unit ? ` ${m.formula.unit}` : ""}`;
  return String(Math.round(v));
}
// Range for charts: [min, max].
export function valueRange(rawModel) {
  const m = normalizeModel(rawModel);
  if (m.kind === "percent") return [0, 100];
  if (m.kind === "scale") return [m.scale.min, m.scale.max];
  if (m.kind === "icfes" || m.kind === "irt") return [0, 500];
  return null;
}
// True when the model changes the plain share of answers right (so the raw share is worth showing next to it).
export function isAdjusted(rawModel) {
  const m = normalizeModel(rawModel);
  return m.kind !== "percent" || m.partial.hintCredit < 1 || m.partial.wrongPenalty > 0 || Object.keys(m.curves).length > 0;
}

// One line for the settings screen: what this model does.
export function describeModel(rawModel) {
  const m = normalizeModel(rawModel);
  const parts = [MODEL_KINDS.find((k) => k.id === m.kind).label];
  if (m.kind === "scale") parts.push(`${fmt(m.scale.min, 1)}–${fmt(m.scale.max, 1)}, aprueba con ${fmt(m.scale.pass, m.scale.decimals)} (${m.scale.passPct} %)`);
  if (m.partial.wrongPenalty > 0) parts.push(`cada error resta ${m.partial.wrongPenalty}`);
  if (m.partial.hintCredit < 1) parts.push(`con pista vale ${Math.round(m.partial.hintCredit * 100)} %`);
  if (Object.keys(m.curves).length) parts.push(`${Object.keys(m.curves).length} curva(s) por área`);
  if (m.xp.decay > 0) parts.push("XP decreciente en reintentos");
  return parts.join(" · ");
}
