// Chart builder for teachers: every answer a class gave becomes one "fact" with many attributes (class space, area, topic,
// question type, week, time spent...). A chart spec picks rows, optional columns, a metric and filters; pivot() computes
// the table and the chart screen draws it. Pure functions: no network, no React.
import { bankItems } from "./bank.js";
import { whoOf } from "./assignments.js";

const DAY = 86400000;
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIFF = { 1: "1 · Muy fácil", 2: "2 · Fácil", 3: "3 · Media", 4: "4 · Difícil", 5: "5 · Muy difícil" };
const KIND_LABEL = { task: "Tarea", homework: "Tarea para la casa", exam: "Examen", practice: "Práctica" };
export const TIME_BUCKETS = ["Menos de 30 s", "30 a 60 s", "1 a 2 min", "2 a 3 min", "Más de 3 min"];
const bucketOf = (s) => (s == null ? null : s < 30 ? TIME_BUCKETS[0] : s < 60 ? TIME_BUCKETS[1] : s < 120 ? TIME_BUCKETS[2] : s < 180 ? TIME_BUCKETS[3] : TIME_BUCKETS[4]);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Monday of the week of a date, as YYYY-MM-DD (sorts as time).
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}
const questionType = (q) => (q?.figure || q?.figures?.length || q?.traced?.length ? "Con figura o gráfico" : q?.group ? "Con texto compartido" : "Independiente");

// Dimensions: what a chart can group or filter by. `order` fixes the order of known values; time dimensions sort as text.
export const DIMENSIONS = [
  { id: "space", label: "Espacio de clase", hint: "Materia, grado y grupo", get: (f) => f.space },
  { id: "student", label: "Estudiante", hint: "Siempre en orden alfabético", get: (f) => f.student, alpha: true },
  { id: "assignment", label: "Asignación", get: (f) => f.assignment },
  { id: "kind", label: "Tipo de actividad", get: (f) => f.kind },
  { id: "area", label: "Área", get: (f) => f.area },
  { id: "competencia", label: "Competencia", get: (f) => f.competencia },
  { id: "componente", label: "Componente", get: (f) => f.componente },
  { id: "tema", label: "Tema", get: (f) => f.tema },
  { id: "difficulty", label: "Dificultad", get: (f) => f.difficulty },
  { id: "qtype", label: "Tipo de pregunta", hint: "Con figura, texto compartido o independiente", get: (f) => f.qtype },
  { id: "timeBucket", label: "Tiempo por pregunta", order: TIME_BUCKETS, get: (f) => f.timeBucket },
  { id: "week", label: "Semana", time: true, get: (f) => f.week },
  { id: "month", label: "Mes", time: true, get: (f) => f.month },
  { id: "weekday", label: "Día de la semana", order: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"], get: (f) => f.weekday },
  { id: "result", label: "Resultado", order: ["Acierto", "Error"], get: (f) => f.result },
];
export const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d]));

// Metrics: numbers computed over the answers of one cell.
const pctOf = (a) => (a.keyed ? Math.round((a.correct / a.keyed) * 1000) / 10 : null);
export const METRICS = [
  { id: "acc", label: "% de aciertos", unit: " %", max: 100, hint: "Según la clave preliminar", value: (a) => pctOf(a), min: (a) => a.keyed },
  { id: "n", label: "Respuestas", unit: "", value: (a) => a.n, min: (a) => a.n },
  { id: "correct", label: "Aciertos", unit: "", value: (a) => a.correct, min: (a) => a.n },
  { id: "wrong", label: "Errores", unit: "", value: (a) => a.keyed - a.correct, min: (a) => a.n },
  { id: "avgSec", label: "Tiempo medio por pregunta", unit: " s", value: (a) => (a.timed ? Math.round(a.sec / a.timed) : null), min: (a) => a.timed },
  { id: "totalMin", label: "Tiempo dedicado", unit: " min", hint: "Suma del tiempo por pregunta", value: (a) => (a.timed ? Math.round((a.sec / 60) * 10) / 10 : null), min: (a) => a.timed },
  { id: "students", label: "Estudiantes activos", unit: "", value: (a) => a.students.size, min: (a) => a.n },
  { id: "attempts", label: "Entregas", unit: "", value: (a) => a.attempts.size, min: (a) => a.n },
  { id: "hints", label: "Pistas usadas", unit: "", value: (a) => a.hints, min: (a) => a.n },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export const CHARTS = [
  { id: "bar", label: "Barras" },
  { id: "heat", label: "Mapa de calor" },
  { id: "line", label: "Tendencia" },
  { id: "table", label: "Tabla" },
];
export const RANGES = [{ days: 7, label: "7 días" }, { days: 30, label: "30 días" }, { days: 90, label: "90 días" }, { days: null, label: "Todo" }];

export const DEFAULT_SPEC = { rows: "area", cols: null, metric: "acc", filters: {}, range: null, chart: "bar", sort: "value-asc", minN: 1 };

// Ready-made charts so a teacher starts from something instead of an empty canvas.
export const PRESETS = [
  { name: "Aciertos por área", spec: { ...DEFAULT_SPEC } },
  { name: "Aciertos por tema", spec: { ...DEFAULT_SPEC, rows: "tema", minN: 5 } },
  { name: "Área por espacio de clase", spec: { ...DEFAULT_SPEC, rows: "area", cols: "space", chart: "heat", sort: "name" } },
  { name: "Tiempo semanal por espacio", spec: { ...DEFAULT_SPEC, rows: "week", cols: "space", metric: "totalMin", chart: "line", sort: "name" } },
  { name: "Evolución de aciertos", spec: { ...DEFAULT_SPEC, rows: "week", metric: "acc", chart: "line", sort: "name" } },
  { name: "Dificultad y tiempo", spec: { ...DEFAULT_SPEC, rows: "difficulty", metric: "avgSec", sort: "name" } },
  { name: "Tipo de pregunta", spec: { ...DEFAULT_SPEC, rows: "qtype", cols: "area", chart: "heat", sort: "name" } },
];

// One fact per answered question of every delivered attempt. bundles: Map exam slug -> { exam, key, enrich } (as fetchExam returns).
// members: course_members rows, to put names on students. Attempts of unknown assignments are ignored.
export function buildFacts({ attempts, assignments, members = [], courses = [], bundles }) {
  const aById = new Map(assignments.map((a) => [a.id, a]));
  const cName = new Map(courses.map((c) => [c.id, c.name]));
  const who = new Map();
  for (const m of members) {
    const label = m.full_name || m.email || "Sin nombre";
    if (m.profile_id) who.set(m.profile_id, label);
    who.set(m.id, label);
  }
  const itemsBySlug = new Map();
  const itemsFor = (slug) => {
    if (itemsBySlug.has(slug)) return itemsBySlug.get(slug);
    const b = bundles.get(slug);
    const map = b ? new Map(bankItems(b.exam, { enrich: b.enrich, key: b.key }).map((i) => [i.key, i])) : null;
    itemsBySlug.set(slug, map);
    return map;
  };
  const facts = [];
  for (const at of attempts) {
    if (!at.submitted_at || !at.answers) continue;
    const a = aById.get(at.assignment_id);
    const items = a ? itemsFor(a.exam_slug) : null;
    if (!a || !items) continue;
    const key = bundles.get(a.exam_slug)?.key;
    const when = new Date(at.submitted_at);
    const person = whoOf(at);
    const base = {
      attemptId: `${person}|${at.assignment_id}|${at.submitted_at}`, studentId: person, student: who.get(person) ?? "Sin nombre",
      space: a.courses?.name ?? cName.get(a.course_id) ?? "Sin espacio", assignment: a.title, kind: KIND_LABEL[a.kind] ?? "Tarea",
      date: at.submitted_at, ts: when.getTime(), week: weekStart(when), month: iso(when).slice(0, 7), weekday: DOW[when.getDay()],
    };
    for (const [qk, given] of Object.entries(at.answers)) {
      const it = items.get(qk);
      if (!it || !given) continue;
      const right = key?.get(qk) ?? null;
      const sec = Number.isFinite(at.times?.[qk]) && at.times[qk] > 0 ? at.times[qk] : null;
      facts.push({
        ...base, qkey: qk, area: it.section ?? "Sin área", competencia: it.competencia ?? "Sin etiquetar", componente: it.componente ?? "Sin etiquetar", tema: it.tema ?? "Sin etiquetar",
        difficulty: it.dificultad ? DIFF[it.dificultad] ?? `${it.dificultad}` : "Sin etiquetar", qtype: questionType(it.question),
        correct: right ? given === right : null, result: right ? (given === right ? "Acierto" : "Error") : null,
        sec, timeBucket: bucketOf(sec), hint: Boolean(at.activity?.hints?.[qk]),
      });
    }
  }
  return facts;
}

// Distinct values of a dimension in the facts, in display order.
export function valuesOf(facts, dimId) {
  const d = DIM[dimId];
  const set = new Set();
  for (const f of facts) { const v = d.get(f); if (v != null) set.add(v); }
  return sortValues([...set], d);
}
function sortValues(vals, d) {
  if (d.order) return [...vals].sort((a, b) => (d.order.indexOf(a) + 1 || 99) - (d.order.indexOf(b) + 1 || 99) || a.localeCompare(b, "es"));
  return [...vals].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
}

export function applyFilters(facts, spec, now = Date.now()) {
  const since = spec.range ? now - spec.range * DAY : null;
  const active = Object.entries(spec.filters ?? {}).filter(([, v]) => v?.length);
  return facts.filter((f) => {
    if (since != null && f.ts < since) return false;
    return active.every(([id, vals]) => vals.includes(DIM[id]?.get(f)));
  });
}

const blank = () => ({ n: 0, keyed: 0, correct: 0, sec: 0, timed: 0, hints: 0, students: new Set(), attempts: new Set() });
function add(acc, f) {
  acc.n += 1;
  if (f.correct != null) { acc.keyed += 1; if (f.correct) acc.correct += 1; }
  if (f.sec != null) { acc.sec += f.sec; acc.timed += 1; }
  if (f.hint) acc.hints += 1;
  acc.students.add(f.studentId);
  acc.attempts.add(f.attemptId);
}

// The pivot table. Returns { rows: [label], cols: [label] | null, cell(r, c) -> { value, n } | null, rowTotal(r), total, metric }.
// Cells with fewer observations than spec.minN have no value (shown as "—"), so a thin sample never looks like a finding.
export function pivot(facts, spec, now = Date.now()) {
  const m = METRIC[spec.metric] ?? METRIC.acc;
  const rd = DIM[spec.rows] ?? DIM.area;
  const cd = spec.cols ? DIM[spec.cols] : null;
  const rows = applyFilters(facts, spec, now);
  const cells = new Map();
  const rowAcc = new Map();
  const total = blank();
  const rowSet = new Set(), colSet = new Set();
  for (const f of rows) {
    const r = rd.get(f);
    const c = cd ? cd.get(f) : "";
    if (r == null || c == null) continue;
    rowSet.add(r); colSet.add(c);
    const k = `${r}\u0000${c}`;
    if (!cells.has(k)) cells.set(k, blank());
    add(cells.get(k), f);
    if (!rowAcc.has(r)) rowAcc.set(r, blank());
    add(rowAcc.get(r), f);
    add(total, f);
  }
  const out = (acc) => {
    if (!acc) return null;
    const enough = (m.min(acc) ?? 0) >= Math.max(1, spec.minN ?? 1);
    return { value: enough ? m.value(acc) : null, n: acc.n };
  };
  let labels = sortValues([...rowSet], rd);
  if (spec.sort !== "name" && !rd.alpha && !rd.time && !rd.order) {
    const dir = spec.sort === "value-desc" ? -1 : 1;
    labels = [...labels].sort((a, b) => {
      const va = out(rowAcc.get(a))?.value, vb = out(rowAcc.get(b))?.value;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
  }
  const colLabels = cd ? sortValues([...colSet], cd) : null;
  return {
    rows: labels, cols: colLabels, metric: m, n: total.n,
    cell: (r, c) => out(cells.get(`${r}\u0000${cd ? c : ""}`)),
    rowTotal: (r) => out(rowAcc.get(r)),
    total: out(total),
  };
}

// Highest value of a pivot, to scale bars and heat.
export function pivotMax(p) {
  if (p.metric.max) return p.metric.max;
  let mx = 0;
  for (const r of p.rows) for (const c of p.cols ?? [""]) { const v = p.cell(r, c)?.value; if (v != null && v > mx) mx = v; }
  return mx || 1;
}

// A short sentence that says what the chart shows, for the caption and for screen readers.
export function describeSpec(spec) {
  const m = METRIC[spec.metric] ?? METRIC.acc;
  const by = [DIM[spec.rows]?.label, spec.cols ? DIM[spec.cols]?.label : null].filter(Boolean).join(" y ");
  return `${m.label} por ${by.toLowerCase()}`;
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// The pivot as CSV for Excel or Sheets (one row per row label, one column per column label).
export function pivotCsv(p, spec) {
  const rd = DIM[spec.rows]?.label ?? "Fila";
  const head = p.cols ? [rd, ...p.cols, "Total"] : [rd, p.metric.label, "Respuestas"];
  const lines = p.rows.map((r) => (p.cols
    ? [r, ...p.cols.map((c) => p.cell(r, c)?.value ?? ""), p.rowTotal(r)?.value ?? ""]
    : [r, p.cell(r, "")?.value ?? "", p.cell(r, "")?.n ?? 0]));
  return `﻿${[cell(describeSpec(spec)), head.map(cell).join(","), ...lines.map((l) => l.map(cell).join(","))].join("\n")}\n`;
}

// Saved charts keep only the spec; filters that name values that no longer exist are harmless.
export const cleanSpec = (s) => ({
  ...DEFAULT_SPEC, ...s,
  rows: DIM[s?.rows] ? s.rows : DEFAULT_SPEC.rows,
  cols: DIM[s?.cols] ? s.cols : null,
  metric: METRIC[s?.metric] ? s.metric : DEFAULT_SPEC.metric,
  filters: Object.fromEntries(Object.entries(s?.filters ?? {}).filter(([k, v]) => DIM[k] && Array.isArray(v))),
});
