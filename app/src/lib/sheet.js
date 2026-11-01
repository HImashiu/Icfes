// Hoja de datos: the results as a spreadsheet. Tables (one row per delivery, per student or per answer), filters typed
// like in Excel (">50", "a..b", text), sorting, formula columns that name other columns by letter (=E/20), column
// statistics, a pivot table and the series for a chart of the selection. Pure functions: no network, no React.
import { scorePct, whoOf } from "./assignments.js";
import { bandFor } from "./analytics.js";
import { FormulaError, evalTree, parseFormula } from "./formula.js";
import { gradeMany, itemFromRow, normalizeModel, resolveModel, valueRange } from "./grading.js";
import { areaOf, groupOf } from "./teaching.js";

export const AREAS = ["Lectura crítica", "Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
const KIND_LABEL = { task: "Práctica", homework: "Tarea", exam: "Simulacro" };
export const RANGE = Symbol("range");

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
// The class as the rest of the app names it, always subject first: "Matemáticas · 11A". A class with no subject is
// the curso itself (a full Saber 11 class), so it reads "Todas las áreas · 11A" instead of its raw name ("11-A").
export function classInfo(course) {
  if (!course) return { clase: "", materia: "" };
  const g = groupOf(course);
  const area = areaOf(course);
  const materia = course.subject && course.subject !== "Todas las áreas" ? course.subject : area ?? "Todas las áreas";
  if (!course.grade && !g.label) return { clase: course.name ?? "", materia };
  return { clase: `${materia} · ${g.name}`, materia };
}
// Short name of a grading scale, so a Nota of 4,2 (1–5) is never read like 4,2 of 100.
export function scaleName(rawModel) {
  const m = normalizeModel(rawModel);
  const r = valueRange(m);
  if (m.kind === "percent") return "0–100";
  if (m.kind === "formula") return "Fórmula";
  if (!r) return "";
  const d = m.kind === "scale" ? 1 : 0;
  return `${r[0].toLocaleString("es-CO", { minimumFractionDigits: d })}–${r[1].toLocaleString("es-CO", { minimumFractionDigits: d })}`;
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
    const range = valueRange(model);
    const escala = scaleName(model);
    list.forEach(([k, at], i) => {
      const p = who.get(whoOf(at)) ?? { name: "Sin nombre", group: "" };
      const c = cById.get(a.course_id) ?? a.courses ?? null;
      const info = classInfo(c);
      const s = at.score ?? {};
      const g = grades[i];
      const row = {
        Estudiante: p.name, Curso: p.group || (c ? groupOf(c).name : ""), Materia: info.materia, Actividad: a.title, Tipo: KIND_LABEL[a.kind] ?? "Práctica",
        Fecha: day(at.submitted_at), Aciertos: s.correct ?? null, Preguntas: s.total ?? null, "% aciertos": scorePct(at),
        Nota: g?.ok && Number.isFinite(g.value) ? Math.round(g.value * 100) / 100 : null, Escala: escala, Minutos: at.duration_sec ? r1(at.duration_sec / 60) : null, Intentos: count.get(k) ?? 1,
        Papel: at.mode === "paper" ? "Sí" : "No",
        ...Object.fromEntries(AREAS.map((n) => [n, areaPct(at, n)])),
      };
      // Not a column (a symbol key: CSV, pivot and filters never see it): the scale of this row's Nota, so the color scale reads 3,0 of 1–5 and 60 of 0–100 alike.
      if (range) row[RANGE] = range;
      rows.push(row);
    });
  }
  return { columns: tableColumns(rows, ["Estudiante", "Curso", "Materia", "Actividad", "Tipo", "Fecha", "Aciertos", "Preguntas", "% aciertos", "Nota", "Escala", "Minutos", "Intentos", "Papel", ...AREAS]), rows: sortBy(rows, [["Curso", 1], ["Estudiante", 1], ["Fecha", 1]]) };
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
export function answersTable(facts, courses = []) {
  const cById = new Map(courses.map((c) => [c.id, c]));
  const rows = facts.map((f) => ({
    Estudiante: f.student, Curso: f.course ?? "", "Grupo de estudiantes": f.group, Clase: (f.courseId && classInfo(cById.get(f.courseId)).clase) || f.space, Actividad: f.assignment, Tipo: KIND_LABEL[f.kindId] ?? f.kind, Semana: f.week, Fecha: day(f.date),
    Pregunta: f.qkey, Área: f.area, Competencia: f.competencia, Componente: f.componente, Tema: f.tema, Dificultad: f.difficulty,
    "Tipo de pregunta": f.qtype, Acierto: f.correct == null ? null : f.correct ? 1 : 0, Segundos: f.sec == null ? null : Math.round(f.sec), Pista: f.hint ? "Sí" : "No",
  }));
  return { columns: tableColumns(rows, ["Estudiante", "Curso", "Grupo de estudiantes", "Clase", "Actividad", "Tipo", "Semana", "Fecha", "Pregunta", "Área", "Competencia", "Componente", "Tema", "Dificultad", "Tipo de pregunta", "Acierto", "Segundos", "Pista"]), rows };
}

// Column descriptors: a column is numeric when every non-empty value is a number.
// decimals: how many every number of the column is written with (2 and 2,1 in one column read as 2,0 and 2,1).
// scale: the columns worth a color scale and their range (shares 0–100, Acierto 0–1, Nota on its own scale).
const PCT_COLS = new Set(["% aciertos", "% entregado", "Promedio %", ...AREAS]);
export function decimalsOf(values) {
  let d = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v) || Number.isInteger(v)) continue;
    const s = String(Math.round(v * 100) / 100);
    d = Math.max(d, s.includes(".") ? s.split(".")[1].length : 0);
    if (d >= 2) break;
  }
  return Math.min(2, d);
}
export function scaleOf(name) {
  if (PCT_COLS.has(name)) return [0, 100];
  if (name === "Acierto") return [0, 1];
  if (name === "Nota") return "row";
  if (name === "Estimado 0–500") return [0, 500];
  return null;
}
export function tableColumns(rows, names) {
  return names.map((name) => {
    let num = true, any = false;
    for (const r of rows) { const v = r[name]; if (v == null || v === "") continue; any = true; if (typeof v !== "number") { num = false; break; } }
    const type = any && num ? "num" : name === "Fecha" || name === "Semana" || name === "Última entrega" ? "date" : any ? "text" : "num";
    const col = { id: name, name, type };
    if (type === "num") { col.decimals = decimalsOf(rows.map((r) => r[name])); const sc = scaleOf(name); if (sc) col.scale = sc; }
    return col;
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
// A filter is either typed text (above) or a list of values ticked in the column menu: { values: [...] }.
export function compileFilter(f) {
  if (f && typeof f === "object" && Array.isArray(f.values)) {
    const set = new Set(f.values.map((v) => (v === "(vacías)" ? "\u0000" : fold(v))));
    return (v) => set.has(v == null || v === "" ? "\u0000" : fold(v));
  }
  return parseFilter(f);
}
// Typed text for a filter built with operators in the column menu: ("≥", 60) -> ">=60", ("entre", 2, 3) -> "2..3".
export const FILTER_OPS = [
  { id: "contiene", label: "Contiene", text: true }, { id: "no", label: "No contiene", text: true },
  { id: "=", label: "Es igual a", text: true, num: true }, { id: "!=", label: "Es distinto de", text: true, num: true },
  { id: ">", label: "Mayor que", num: true }, { id: ">=", label: "Mayor o igual que", num: true },
  { id: "<", label: "Menor que", num: true }, { id: "<=", label: "Menor o igual que", num: true },
  { id: "entre", label: "Entre", num: true, two: true }, { id: "vacias", label: "Está vacía", text: true, num: true, none: true },
];
export function filterText(op, a = "", b = "") {
  const x = String(a ?? "").trim(), y = String(b ?? "").trim();
  if (op === "vacias") return "(vacías)";
  if (op === "entre") return x && y ? `${x}..${y}` : "";
  if (!x) return "";
  if (op === "contiene") return x;
  if (op === "no") return `!${x}`;
  return `${op}${x}`;
}
// The other way around, so the menu opens showing the filter that is typed in the cell.
export function filterParts(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (s === "(vacías)") return { op: "vacias", a: "", b: "" };
  const range = /^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/.exec(s);
  if (range) return { op: "entre", a: range[1], b: range[2] };
  const cmp = /^(>=|<=|<>|!=|>|<|=)\s*(.*)$/.exec(s);
  if (cmp) return { op: cmp[1] === "<>" ? "!=" : cmp[1], a: cmp[2], b: "" };
  if (s.startsWith("!")) return { op: "no", a: s.slice(1), b: "" };
  return { op: "contiene", a: s, b: "" };
}
export const filterActive = (f) => (f && typeof f === "object" ? Array.isArray(f.values) : !!String(f ?? "").trim());
export function applyFilters(rows, filters) {
  const tests = Object.entries(filters ?? {}).map(([col, f]) => [col, compileFilter(f)]).filter(([, t]) => t);
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
  const src = namesToLetters(String(expr ?? "").trim().replace(/^=/, ""), columns).replace(/;/g, ",");
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

// Status-bar numbers of a selected block of cells (rows r0..r1, columns c0..c1 of the visible order).
export function rangeStats(rows, cols, { r0, r1, c0, c1 }) {
  const xs = [];
  let count = 0;
  for (let i = Math.min(r0, r1); i <= Math.max(r0, r1); i += 1) {
    const r = rows[i];
    if (!r) continue;
    for (let j = Math.min(c0, c1); j <= Math.max(c0, c1); j += 1) {
      const c = cols[j];
      if (!c) continue;
      const v = r[c.id];
      if (v == null || v === "") continue;
      count += 1;
      if (typeof v === "number" && Number.isFinite(v)) xs.push(v);
    }
  }
  const cells = (Math.abs(r1 - r0) + 1) * (Math.abs(c1 - c0) + 1);
  if (!xs.length) return { cells, count, n: 0, sum: null, avg: null, min: null, max: null };
  const sum = xs.reduce((a, b) => a + b, 0);
  return { cells, count, n: xs.length, sum: Math.round(sum * 100) / 100, avg: Math.round((sum / xs.length) * 100) / 100, min: Math.min(...xs), max: Math.max(...xs) };
}
// Text of a block of cells for the clipboard (pastes into Excel or Sheets as the same block).
export function rangeText(rows, cols, { r0, r1, c0, c1 }, withHeader = false) {
  const cs = cols.slice(Math.min(c0, c1), Math.max(c0, c1) + 1);
  const rs = rows.slice(Math.min(r0, r1), Math.max(r0, r1) + 1);
  const cell = (v) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v).replace(/\t|\n/g, " "));
  const lines = rs.map((r) => cs.map((c) => cell(r[c.id])).join("\t"));
  return (withHeader ? [cs.map((c) => c.name).join("\t"), ...lines] : lines).join("\n");
}

// Rows grouped by one column, with a summary line per group: how many rows and the average of each numeric column.
// Groups keep the order of their first row, so sorting the sheet also sorts the groups.
export function groupRows(rows, col, columns) {
  const map = new Map();
  for (const r of rows) {
    const k = r[col] == null || r[col] === "" ? "(vacías)" : r[col];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const nums = columns.filter((c) => c.type === "num");
  return [...map].map(([key, list]) => {
    const avg = {};
    for (const c of nums) {
      const xs = list.map((r) => r[c.id]).filter((v) => typeof v === "number" && Number.isFinite(v));
      avg[c.id] = xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
    }
    return { key, rows: list, n: list.length, avg };
  });
}

// Where a value sits on its column's scale, 0 (low) to 1 (high), or null when it has none.
export function scalePos(col, row, v) {
  if (typeof v !== "number" || !Number.isFinite(v) || !col?.scale) return null;
  const r = col.scale === "row" ? row?.[RANGE] : col.scale;
  if (!r || r[1] === r[0]) return null;
  return Math.max(0, Math.min(1, (v - r[0]) / (r[1] - r[0])));
}
// Distinct values of a column with how many rows have each (for the value list in the column menu).
export function distinctValues(rows, col, limit = 200) {
  const m = new Map();
  for (const r of rows) { const v = r[col] == null || r[col] === "" ? "(vacías)" : String(r[col]); m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).slice(0, limit).map(([value, n]) => ({ value, n }));
}

// Suggestions while typing a formula: the word being typed (letters or a function name) against the columns and
// the functions. Returns { from, to, items: [{ insert, label, hint }] }.
export const FX_HELP = {
  round: "round(x, decimales)", min: "min(a, b, …)", max: "max(a, b, …)", avg: "avg(a, b, …) promedio", abs: "abs(x) valor absoluto",
  sqrt: "sqrt(x) raíz", floor: "floor(x) hacia abajo", ceil: "ceil(x) hacia arriba", if: "if(condición, sí, no)", clamp: "clamp(x, mín, máx)",
  pow: "pow(x, y) potencia", log: "log(x) logaritmo", exp: "exp(x)",
};
export function fxSuggest(expr, caret, columns) {
  const upto = String(expr ?? "").slice(0, caret);
  // Inside an open bracket the name itself is being typed: offer the column names, closing the bracket.
  const br = /\[([^\]]*)$/.exec(upto);
  if (br) {
    const w = fold(br[1]);
    const items = columns.map((c, i) => ({ insert: `[${c.name}]`, label: `${colLetter(i)} · ${c.name}`, hint: c.type === "num" ? "número" : "texto", kind: "col", name: c.name, letter: colLetter(i) }))
      .filter((c) => fold(c.name).includes(w)).slice(0, 8);
    return { from: caret - br[0].length, to: caret, word: br[0], items };
  }
  const m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(upto);
  const word = m ? m[0] : "";
  const from = caret - word.length;
  const w = word.toLowerCase();
  const cols = columns.map((c, i) => ({ insert: colLetter(i), label: `${colLetter(i)} · ${c.name}`, hint: c.type === "num" ? "número" : "texto", kind: "col", name: c.name, letter: colLetter(i) }))
    .filter((c) => !w || c.insert.toLowerCase().startsWith(w) || fold(c.name).includes(fold(w)));
  const fns = Object.entries(FX_HELP).filter(([f]) => w && f.startsWith(w)).map(([f, h]) => ({ insert: `${f}(`, label: h, hint: "función", kind: "fn" }));
  return { from, to: caret, word, items: [...fns, ...cols].slice(0, 8) };
}
// Formulas may also name columns by name in brackets, [% aciertos]*5/100, which is turned into letters.
export function namesToLetters(expr, columns) {
  return String(expr ?? "").replace(/\[([^\]]+)\]/g, (all, name) => {
    const i = columns.findIndex((c) => fold(c.name) === fold(name.trim()));
    return i < 0 ? all : colLetter(i);
  });
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
