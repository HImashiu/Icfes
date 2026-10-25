// Hoja de datos: the results as a spreadsheet. Tables (one row per delivery, per student or per answer), filters typed
// like in Excel (">50", "a..b", text), sorting, formula columns that name other columns by letter (=E/20), column
// statistics, a pivot table and the series for a chart of the selection. Pure functions: no network, no React.
import { scorePct, whoOf } from "./assignments.js";
import { bandFor } from "./analytics.js";
import { FormulaError, evalTree, parseFormula } from "./formula.js";
import { formatValue, gradeMany, itemFromRow, resolveModel } from "./grading.js";
import { groupOf } from "./teaching.js";

export const AREAS = ["Lectura crítica", "Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
const KIND_LABEL = { task: "Práctica", homework: "Tarea", exam: "Simulacro" };

// Column letters as in a spreadsheet: A…Z, AA, AB…
export function colLetter(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

function bestByWhoAndAssignment(attempts) {
  const best = new Map();
  const count = new Map();
  for (const a of attempts) {
    if (!a.submitted_at || !a.assignment_id) continue;
    const k = `${whoOf(a)}|${a.assignment_id}`;
    count.set(k, (count.get(k) ?? 0) + 1);
    const prev = best.get(k);
    if (!prev || (scorePct(a) ?? -1) > (scorePct(prev) ?? -1)) best.set(k, a);
  }
  return { best, count };
}
function people(members, courses) {
  const cById = new Map(courses.map((c) => [c.id, c]));
  const who = new Map();
  for (const m of members) {
    if (m.role !== "student") continue;
    const c = cById.get(m.course_id);
    const row = { name: m.full_name || m.email || "Sin nombre", email: m.email ?? "", group: c ? groupOf(c).name : "", memberIds: [m.id, m.profile_id].filter(Boolean) };
    for (const id of row.memberIds) if (!who.has(id)) who.set(id, row);
  }
  return who;
}
const areaPct = (attempt, name) => {
  const a = attempt?.score?.perArea?.find((x) => x.name === name);
  return a && a.total ? Math.round((a.correct / a.total) * 100) : null;
};

// One row per student and activity (their best delivery), graded with that activity's model.
export function deliveriesTable({ members, attempts, assignments, courses, models = [], schoolId }) {
  const aById = new Map(assignments.map((a) => [a.id, a]));
  const cById = new Map(courses.map((c) => [c.id, c]));
  const who = people(members, courses);
  const { best, count } = bestByWhoAndAssignment(attempts);
  const byAssignment = new Map();
  for (const [k, at] of best) {
    const a = aById.get(at.assignment_id);
    if (!a) continue;
    byAssignment.set(a.id, [...(byAssignment.get(a.id) ?? []), [k, at]]);
  }
  const rows = [];
  for (const [aid, list] of byAssignment) {
    const a = aById.get(aid);
    const { model } = resolveModel(models, { assignmentId: aid, courseId: a.course_id, schoolId });
    const grades = gradeMany(list.map(([, at]) => itemFromRow(at)), model, {});
    list.forEach(([k, at], i) => {
      const p = who.get(whoOf(at)) ?? { name: "Sin nombre", group: "" };
      const c = cById.get(a.course_id);
      const s = at.score ?? {};
      const g = grades[i];
      rows.push({
        Estudiante: p.name, Curso: p.group || (c ? groupOf(c).name : ""), Clase: c?.name ?? a.courses?.name ?? "", Actividad: a.title, Tipo: KIND_LABEL[a.kind] ?? "Práctica",
        Fecha: day(at.submitted_at), Aciertos: s.correct ?? null, Preguntas: s.total ?? null, "% aciertos": scorePct(at),
        Nota: g?.ok ? g.value : null, "Nota (texto)": g?.ok ? formatValue(model, g.value) : "", Minutos: at.duration_sec ? r1(at.duration_sec / 60) : null, Intentos: count.get(k) ?? 1,
        Papel: at.mode === "paper" ? 1 : 0,
        ...Object.fromEntries(AREAS.map((n) => [n, areaPct(at, n)])),
      });
    });
  }
  return { columns: tableColumns(rows, ["Estudiante", "Curso", "Clase", "Actividad", "Tipo", "Fecha", "Aciertos", "Preguntas", "% aciertos", "Nota", "Nota (texto)", "Minutos", "Intentos", "Papel", ...AREAS]), rows: sortBy(rows, [["Curso", 1], ["Estudiante", 1], ["Fecha", 1]]) };
}

// One row per student: deliveries, average, per-area share right, time and the latest full-simulacro estimate.
export function studentsTable({ members, attempts, assignments, courses }) {
  const ids = new Set(assignments.map((a) => a.id));
  const who = people(members, courses);
  const { best } = bestByWhoAndAssignment(attempts.filter((a) => ids.has(a.assignment_id)));
  const acc = new Map();
  const seen = new Set();
  for (const m of members) {
    if (m.role !== "student") continue;
    const p = who.get(m.id) ?? who.get(m.profile_id);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    acc.set(p, { p, list: [], assigned: assignments.filter((a) => members.some((x) => x.course_id === a.course_id && p.memberIds.includes(x.id))).length });
  }
  for (const at of best.values()) {
    const p = who.get(whoOf(at));
    if (p && acc.has(p)) acc.get(p).list.push(at);
  }
  const rows = [...acc.values()].map(({ p, list, assigned }) => {
    const pcts = list.map(scorePct).filter((v) => v != null);
    const areas = {};
    for (const n of AREAS) {
      let c = 0, t = 0;
      for (const at of list) { const a = at.score?.perArea?.find((x) => x.name === n); if (a) { c += a.correct; t += a.total; } }
      areas[n] = t ? Math.round((c / t) * 100) : null;
    }
    const exams = list.filter((at) => at.mode !== "practice" && at.score?.perArea?.length >= 4).sort((x, y) => String(y.submitted_at).localeCompare(String(x.submitted_at)));
    const band = exams[0] ? bandFor(exams[0].score.perArea) : null;
    const last = list.map((at) => at.submitted_at).sort().pop();
    return {
      Estudiante: p.name, Curso: p.group, Correo: p.email, Entregas: list.length, Asignadas: assigned,
      "% entregado": assigned ? Math.round((list.length / assigned) * 100) : null,
      "Promedio %": pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      ...areas,
      Minutos: r1(list.reduce((n, at) => n + (at.duration_sec ?? 0), 0) / 60) || null,
      "Última entrega": day(last), "Estimado 0–500": band?.global ?? null,
    };
  });
  return { columns: tableColumns(rows, ["Estudiante", "Curso", "Correo", "Entregas", "Asignadas", "% entregado", "Promedio %", ...AREAS, "Minutos", "Última entrega", "Estimado 0–500"]), rows: sortBy(rows, [["Curso", 1], ["Estudiante", 1]]) };
}

// One row per answer, from the chart builder's facts (needs the booklets for areas, topics and the key).
export function answersTable(facts) {
  const rows = facts.map((f) => ({
    Estudiante: f.student, Curso: f.course ?? "", Grupo: f.group, Clase: f.space, Actividad: f.assignment, Tipo: f.kind, Semana: f.week, Fecha: day(f.date),
    Pregunta: f.qkey, Área: f.area, Competencia: f.competencia, Componente: f.componente, Tema: f.tema, Dificultad: f.difficulty,
    "Tipo de pregunta": f.qtype, Acierto: f.correct == null ? null : f.correct ? 1 : 0, Segundos: f.sec == null ? null : Math.round(f.sec), Pista: f.hint ? 1 : 0,
  }));
  return { columns: tableColumns(rows, ["Estudiante", "Curso", "Grupo", "Clase", "Actividad", "Tipo", "Semana", "Fecha", "Pregunta", "Área", "Competencia", "Componente", "Tema", "Dificultad", "Tipo de pregunta", "Acierto", "Segundos", "Pista"]), rows };
}

// Column descriptors: a column is numeric when every non-empty value is a number.
export function tableColumns(rows, names) {
  return names.map((name) => {
    let num = true, any = false;
    for (const r of rows) { const v = r[name]; if (v == null || v === "") continue; any = true; if (typeof v !== "number") { num = false; break; } }
    return { id: name, name, type: any && num ? "num" : name === "Fecha" || name === "Semana" || name === "Última entrega" ? "date" : any ? "text" : "num" };
  });
}

// "Excel-like" filter: >50, <=3, =Matemáticas, 10..20, !texto, or plain text (contains, accents ignored).
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function parseFilter(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const range = /^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/.exec(s);
  const n = (x) => Number(String(x).replace(",", "."));
  if (range) { const lo = n(range[1]), hi = n(range[2]); return (v) => typeof v === "number" && v >= lo && v <= hi; }
  const cmp = /^(>=|<=|<>|!=|>|<|=)\s*(.*)$/.exec(s);
  if (cmp) {
    const [, op, rest] = cmp;
    const x = n(rest);
    const numeric = rest.trim() !== "" && Number.isFinite(x);
    return (v) => {
      if (numeric && typeof v === "number") return op === ">" ? v > x : op === "<" ? v < x : op === ">=" ? v >= x : op === "<=" ? v <= x : op === "=" ? v === x : v !== x;
      if (op === "=") return fold(v) === fold(rest);
      if (op === "<>" || op === "!=") return fold(v) !== fold(rest);
      if (numeric || v == null) return false;
      const c = fold(v).localeCompare(fold(rest), "es");
      return op === ">" ? c > 0 : op === "<" ? c < 0 : op === ">=" ? c >= 0 : c <= 0;
    };
  }
  if (s === "(vacías)") return (v) => v == null || v === "";
  if (s.startsWith("!")) { const t = fold(s.slice(1)); return (v) => !fold(v).includes(t); }
  const t = fold(s);
  return (v) => fold(v).includes(t);
}
export function applyFilters(rows, filters) {
  const tests = Object.entries(filters ?? {}).map(([col, f]) => [col, parseFilter(f)]).filter(([, t]) => t);
  return tests.length ? rows.filter((r) => tests.every(([col, t]) => t(r[col]))) : rows;
}
export function sortBy(rows, keys) {
  const cmp = (a, b) => {
    for (const [k, dir] of keys) {
      const x = a[k], y = b[k];
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
      if (c) return c * dir;
    }
    return 0;
  };
  return [...rows].sort(cmp);
}

// A formula column: `=E/20`, `=round(I*5/100, 1)`, `=if(I>=60, 1, 0)`. Letters name columns of the same row.
// Returns { values } aligned with rows, or { error }.
export function formulaValues(expr, rows, columns) {
  const src = String(expr ?? "").trim().replace(/^=/, "");
  let tree;
  try { tree = parseFormula(src); } catch (e) { return { error: e instanceof FormulaError ? e.message : "Fórmula no válida." }; }
  const letters = columns.map((c, i) => [colLetter(i), c]);
  const values = [];
  let errors = 0;
  let first = null;
  for (const r of rows) {
    const vars = {};
    for (const [L, c] of letters) {
      const v = r[c.id];
      vars[L] = typeof v === "number" ? v : v == null || v === "" ? 0 : String(v);
    }
    try {
      const v = evalTree(tree, vars);
      values.push(typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
    } catch (e) { errors += 1; first ??= e.message; values.push(null); }
  }
  if (errors === rows.length && rows.length) return { error: first };
  return { values };
}

// Status-bar numbers of a column, as Sheets shows them when you select a range.
export function columnStats(rows, col) {
  const xs = rows.map((r) => r[col]).filter((v) => typeof v === "number" && Number.isFinite(v));
  const filled = rows.filter((r) => r[col] != null && r[col] !== "").length;
  if (!xs.length) return { count: filled, n: 0, sum: null, avg: null, min: null, max: null };
  const sum = xs.reduce((a, b) => a + b, 0);
  return { count: filled, n: xs.length, sum: Math.round(sum * 100) / 100, avg: Math.round((sum / xs.length) * 100) / 100, min: Math.min(...xs), max: Math.max(...xs) };
}

export const AGGS = [
  { id: "avg", label: "Promedio" }, { id: "sum", label: "Suma" }, { id: "count", label: "Recuento" },
  { id: "min", label: "Mínimo" }, { id: "max", label: "Máximo" }, { id: "pct1", label: "% de unos (aciertos)" },
];
function agg(values, how) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (how === "count") return values.filter((v) => v != null && v !== "").length;
  if (!xs.length) return null;
  if (how === "sum") return Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  if (how === "min") return Math.min(...xs);
  if (how === "max") return Math.max(...xs);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return how === "pct1" ? Math.round(m * 1000) / 10 : Math.round(m * 10) / 10;
}

// Pivot table: rows by one column, optional columns by another, values aggregated. Returns a table like any other,
// so it can be sorted, copied and charted. minN hides cells with too few values (a thin sample is not a finding).
export function pivotTable(rows, { row, col = null, value, how = "avg", minN = 1 }) {
  const rk = [...new Set(rows.map((r) => r[row] ?? "(vacías)"))];
  const ck = col ? [...new Set(rows.map((r) => r[col] ?? "(vacías)"))].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true })) : null;
  const cells = new Map();
  for (const r of rows) {
    const k = `${r[row] ?? "(vacías)"}\u0000${col ? r[col] ?? "(vacías)" : ""}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(how === "count" ? r[value] ?? r[row] : r[value]);
  }
  const sizes = new Map();
  for (const r of rows) { const k = r[row] ?? "(vacías)"; sizes.set(k, (sizes.get(k) ?? 0) + 1); }
  const valueOf = (list) => (list && list.length >= minN ? agg(list, how) : null);
  const label = `${AGGS.find((a) => a.id === how)?.label ?? ""} de ${value}`;
  const out = rk.sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true })).map((rv) => {
    const o = { [row]: rv };
    if (ck) {
      for (const cv of ck) o[String(cv)] = valueOf(cells.get(`${rv}\u0000${cv}`));
      o.Total = valueOf(rows.filter((r) => (r[row] ?? "(vacías)") === rv).map((r) => (how === "count" ? r[value] ?? r[row] : r[value])));
    } else o[label] = valueOf(cells.get(`${rv}\u0000`));
    o.n = sizes.get(rv) ?? 0;
    return o;
  });
  const names = [row, ...(ck ? [...ck.map(String), "Total"] : [label]), "n"];
  return { columns: names.map((n, i) => ({ id: n, name: n === "n" ? "Filas" : n, type: i === 0 ? "text" : "num" })), rows: out };
}

// Series for a chart of the selected columns: labels from the first selected text column (or the first column),
// one series per selected numeric column. At most `limit` points.
export function chartSeries(rows, columns, selected, limit = 40) {
  const sel = columns.filter((c) => selected.includes(c.id));
  const labelCol = sel.find((c) => c.type !== "num") ?? columns.find((c) => c.type !== "num") ?? columns[0];
  // With nothing chosen, totals and row counts stay out: they would flatten every other bar.
  const auto = sel.length === columns.length;
  const series = sel.filter((c) => c.type === "num" && c.id !== labelCol?.id && !(auto && (c.id === "n" || c.id === "Total")));
  const used = rows.slice(0, limit);
  return {
    labels: used.map((r, i) => (labelCol ? String(r[labelCol.id] ?? "") : String(i + 1))),
    series: series.map((c) => ({ name: c.name, values: used.map((r) => (typeof r[c.id] === "number" ? r[c.id] : null)) })),
    cut: rows.length > limit, labelName: labelCol?.name ?? "",
  };
}

// Text for the clipboard (tab separated, pastes into Excel or Sheets) or a CSV file.
export function tableText(columns, rows, sep = "\t") {
  const cell = (v) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", sep === "\t" ? "," : ".") : String(v);
    return sep === "," && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.replace(/\t|\n/g, " ");
  };
  return [columns.map((c) => cell(c.name)).join(sep), ...rows.map((r) => columns.map((c) => cell(r[c.id])).join(sep))].join("\n");
}
