import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Select } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { areaColor } from "../lib/brand.js";
import { useFacts } from "./useFacts.js";
import { AGGS, FILTER_OPS, answersTable, applyFilters, chartSeries, colLetter, deliveriesTable, distinctValues, filterActive, filterParts, filterText, formulaValues, fxSuggest, groupRows, namesToLetters, pivotTable, rangeStats, rangeText, scalePos, sortBy, studentsTable, tableText } from "../lib/sheet.js";
import ChartBuilder from "./ChartBuilder.jsx";
import "./results.css";

const DATASETS = [
  { id: "entregas", label: "Entregas", hint: "Una fila por estudiante y actividad" },
  { id: "estudiantes", label: "Estudiantes", hint: "Una fila por estudiante" },
  { id: "respuestas", label: "Respuestas", hint: "Una fila por pregunta respondida" },
];
// Ready-made starting points: each sets the table and, when useful, a pivot and a chart.
const TEMPLATES = [
  { id: "curso", label: "Promedio por curso", ds: "entregas", pivot: { row: "Curso", col: null, value: "% aciertos", how: "avg" }, chart: "bar" },
  { id: "curso-tipo", label: "Cursos por tipo de actividad", ds: "entregas", pivot: { row: "Curso", col: "Tipo", value: "% aciertos", how: "avg" }, chart: "bar" },
  { id: "area-curso", label: "Áreas por curso", ds: "respuestas", pivot: { row: "Curso", col: "Área", value: "Acierto", how: "pct1", minN: 10 }, chart: "bar" },
  { id: "semana", label: "Evolución semanal por área", ds: "respuestas", pivot: { row: "Semana", col: "Área", value: "Acierto", how: "pct1", minN: 10 }, chart: "line" },
  { id: "tema", label: "Temas más difíciles", ds: "respuestas", pivot: { row: "Tema", col: null, value: "Acierto", how: "pct1", minN: 8 }, sort: [1, 1], chart: "bar" },
  { id: "tiempo", label: "Tiempo y acierto por dificultad", ds: "respuestas", pivot: { row: "Dificultad", col: null, value: "Segundos", how: "avg" }, chart: "bar" },
  { id: "pendientes", label: "Estudiantes con menos entregas", ds: "estudiantes", sort: ["% entregado", 1] },
];
const SERIES = ["#5ED3B4", "#FFB547", "#8AB4FF", "#F59EC4", "#C79BFF", "#FF8A7A", "#9FC4A0", "#E0D060"];
const AREA_NAMES = ["Lectura crítica", "Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
const colorOf = (name, i) => (AREA_NAMES.includes(name) ? areaColor(name) : SERIES[i % SERIES.length]);
const ROW_H = 32;
const OVERSCAN = 12;
const RN_W = 44;
const STORE = "condor.sheet.v2";
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) ?? "null") ?? {}; } catch { return {}; } };
const writeStore = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage blocked */ } };
const fmt = (v, d = null) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("es-CO", d == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: d, maximumFractionDigits: d }) : String(v));
// Color scale from low (coral) through amber to high (green), soft enough to read the number on top.
const heat = (t) => (t == null ? undefined : t < 0.5
  ? `color-mix(in srgb, color-mix(in srgb, var(--bad) ${Math.round((1 - t * 2) * 100)}%, var(--flame)) 30%, transparent)`
  : `color-mix(in srgb, color-mix(in srgb, var(--flame) ${Math.round((1 - (t - 0.5) * 2) * 100)}%, var(--ok)) 30%, transparent)`);
// Starting width of a column: wide enough for its name and its usual values, never a whole screen.
function autoWidth(col, rows) {
  let w = col.name.length * 8.6 + 66;
  for (let i = 0; i < Math.min(rows.length, 300); i += 1) {
    const v = rows[i][col.id];
    if (v == null) continue;
    w = Math.max(w, String(typeof v === "number" ? fmt(v, col.decimals) : v).length * 7.6 + 22);
  }
  return Math.round(Math.max(col.type === "num" ? 92 : 104, Math.min(w, 300)));
}
const norm = (r) => ({ r0: Math.min(r.r0, r.r1), r1: Math.max(r.r0, r.r1), c0: Math.min(r.c0, r.c1), c1: Math.max(r.c0, r.c1) });
function download(name, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}\n`], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Resultados › Hoja de datos: the results as a real spreadsheet. Frozen header and first column, columns that resize,
// sort, filter (operators or a list of values), group and hide; cells selected with the mouse or the keyboard show
// their sum, average and count; a color scale on shares and notas; formulas with suggestions as you type.
export default function Sheet({ api, profile, courses, assignments, models = [], fetchExam, guard, ws = null }) {
  const saved = useRef(readStore()).current;
  const [mode, setMode] = useState("sheet"); // sheet | guided (the earlier chart builder)
  const [ds, setDs] = useState(saved.ds ?? "entregas");
  const [base, setBase] = useState(null); // { members, attempts }
  const [formulas, setFormulas] = useState(saved.formulas ?? {}); // ds -> [{ name, expr }]
  const [prefs, setPrefs] = useState(saved.prefs ?? {}); // ds -> { widths, hidden, frozen }
  const [colors, setColors] = useState(saved.colors ?? true);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null); // [[col, dir], …]
  const [groupBy, setGroupBy] = useState(null);
  const [collapsed, setCollapsed] = useState([]);
  const [sel, setSel] = useState(null); // { r0, c0, r1, c1 } in visible rows and columns
  const [pivot, setPivot] = useState(null); // { row, col, value, how, minN }
  const [pivotOpen, setPivotOpen] = useState(false);
  const [chart, setChart] = useState(null); // "bar" | "line"
  const [fx, setFx] = useState({ name: "", expr: "", editing: null });
  const [fxError, setFxError] = useState(null);
  const [fxFocus, setFxFocus] = useState(false);
  const [fxCaret, setFxCaret] = useState(0);
  const [fxActive, setFxActive] = useState(0);
  const [menu, setMenu] = useState(null); // { col, rect }
  const [colsOpen, setColsOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(560);
  const wrapRef = useRef(null);
  const fxRef = useRef(null);
  const drag = useRef(null);

  const pref = prefs[ds] ?? {};
  const setPref = (patch) => setPrefs((p) => ({ ...p, [ds]: { ...(p[ds] ?? {}), ...patch } }));
  const hidden = pref.hidden ?? [];
  const frozen = pref.frozen ?? 1;

  useEffect(() => { writeStore({ ds, formulas, prefs, colors }); }, [ds, formulas, prefs, colors]);
  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
      setBase({ members, attempts });
    });
  }, [api, guard]);
  // Answers need the booklets (areas, topics, key): loaded only when that table is opened.
  const [factsOn, setFactsOn] = useState(false);
  useEffect(() => { if (ds === "respuestas") setFactsOn(true); }, [ds]);
  const facts = useFacts({ api, assignments, courses, fetchExam, ws, on: factsOn });
  const factsBusy = factsOn && !facts;

  const table = useMemo(() => {
    if (ds === "respuestas") return facts ? answersTable(facts, courses) : null;
    if (!base) return null;
    const args = { members: base.members, attempts: base.attempts, assignments, courses, models, schoolId: profile?.school_id };
    return ds === "estudiantes" ? studentsTable(args) : deliveriesTable(args);
  }, [ds, base, facts, assignments, courses, models, profile]);

  // Formula columns are computed on the table, in order, so a later one can use an earlier one.
  const withFx = useMemo(() => {
    if (!table) return null;
    let columns = table.columns;
    let rows = table.rows;
    for (const f of formulas[ds] ?? []) {
      const r = formulaValues(f.expr, rows, columns);
      if (r.error) continue;
      rows = rows.map((row, i) => ({ ...row, [f.name]: r.values[i] }));
      const dec = Math.min(2, Math.max(0, ...r.values.map((v) => (v == null || Number.isInteger(v) ? 0 : String(Math.round(v * 100) / 100).split(".")[1]?.length ?? 0))));
      columns = [...columns, { id: f.name, name: f.name, type: "num", formula: f.expr, decimals: dec }];
    }
    return { columns, rows };
  }, [table, formulas, ds]);

  const filtered = useMemo(() => (withFx ? applyFilters(withFx.rows, filters) : []), [withFx, filters]);
  const piv = useMemo(() => (pivot && withFx && withFx.columns.some((c) => c.id === pivot.row) ? pivotTable(filtered, pivot) : null), [pivot, filtered, withFx]);
  const view = piv ?? (withFx ? { columns: withFx.columns, rows: filtered } : null);
  const allCols = view?.columns ?? [];
  const shownCols = useMemo(() => allCols.filter((c) => piv || !hidden.includes(c.id)), [allCols, piv, hidden]);
  const sorted = useMemo(() => {
    if (!view) return [];
    const keys = (sort ?? []).filter(([k]) => view.columns.some((c) => c.id === k));
    return keys.length ? sortBy(view.rows, keys) : view.rows;
  }, [view, sort]);
  const groups = useMemo(() => (!piv && groupBy && allCols.some((c) => c.id === groupBy) ? groupRows(sorted, groupBy, allCols) : null), [piv, groupBy, sorted, allCols]);
  // What is drawn, in order: group lines and data rows. `rows` are the data rows that can be selected.
  const { items, rows } = useMemo(() => {
    if (!groups) return { items: sorted.map((r, i) => ({ r, i })), rows: sorted };
    const it = [];
    const rs = [];
    for (const g of groups) {
      it.push({ g });
      if (collapsed.includes(String(g.key))) continue;
      for (const r of g.rows) { it.push({ r, i: rs.length }); rs.push(r); }
    }
    return { items: it, rows: rs };
  }, [groups, sorted, collapsed]);

  const widthOf = useCallback((c) => pref.widths?.[c.id] ?? autoWidth(c, view?.rows ?? []), [pref.widths, view]);
  const widths = shownCols.map(widthOf);
  const nFrozen = piv ? 1 : Math.min(frozen, shownCols.length);
  const lefts = [];
  widths.reduce((x, w, j) => { lefts[j] = x; return x + w; }, RN_W);
  const totalW = RN_W + widths.reduce((a, b) => a + b, 0);

  // Virtual rows: only what is on screen (plus a margin) is in the page, so 20 000 answers scroll as smoothly as 20.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setViewH(el.clientHeight || 560);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [view != null]);
  const headH = piv ? 54 : 90;
  const first = Math.max(0, Math.floor((scrollTop - headH) / ROW_H) - OVERSCAN);
  const last = Math.min(items.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);

  const resetView = () => { setFilters({}); setSort(null); setSel(null); setGroupBy(null); setCollapsed([]); setPivot(null); setChart(null); setFxError(null); setMenu(null); };
  const switchDs = (id) => { setDs(id); resetView(); };
  const applyTemplate = (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    switchDs(t.ds);
    if (t.pivot) { setPivot({ minN: 1, ...t.pivot }); setPivotOpen(true); }
    if (t.sort) setSort(typeof t.sort[0] === "number" ? null : [t.sort]);
    if (t.chart) setChart(t.chart);
  };

  // ---- Selection -------------------------------------------------------------------------------------------------
  const lastRow = rows.length - 1;
  const lastCol = shownCols.length - 1;
  const selN = sel ? norm(sel) : null;
  const selCols = selN ? shownCols.slice(selN.c0, selN.c1 + 1).map((c) => c.id) : [];
  const wholeCols = selN && selN.r0 === 0 && selN.r1 === lastRow;
  const inSel = (i, j) => selN && i >= selN.r0 && i <= selN.r1 && j >= selN.c0 && j <= selN.c1;
  const colInSel = (j) => selN && j >= selN.c0 && j <= selN.c1;
  const ref = selN ? (selN.r0 === selN.r1 && selN.c0 === selN.c1 ? `${colLetter(allCols.indexOf(shownCols[selN.c0]))}${selN.r0 + 1}`
    : `${colLetter(allCols.indexOf(shownCols[selN.c0]))}${selN.r0 + 1}:${colLetter(allCols.indexOf(shownCols[selN.c1]))}${selN.r1 + 1}`) : "";
  const stats = selN && rows.length ? rangeStats(rows, shownCols, selN) : null;
  const active = sel && rows[sel.r1] && shownCols[sel.c1] ? rows[sel.r1][shownCols[sel.c1].id] : null;

  const scrollToCell = (i, j) => {
    const el = wrapRef.current;
    if (!el) return;
    const itemIndex = items.findIndex((x) => x.r && x.i === i);
    const y = headH + itemIndex * ROW_H;
    if (y < el.scrollTop + headH) el.scrollTop = y - headH;
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight;
    const x = lefts[j];
    const frozenW = j < nFrozen ? 0 : lefts[nFrozen] ?? RN_W;
    if (x < el.scrollLeft + frozenW) el.scrollLeft = x - frozenW;
    else if (x + widths[j] > el.scrollLeft + el.clientWidth) el.scrollLeft = x + widths[j] - el.clientWidth;
  };
  const onKey = (e) => {
    if (!rows.length || !shownCols.length) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel({ r0: 0, c0: 0, r1: lastRow, c1: lastCol }); return; }
    if (mod && e.key.toLowerCase() === "c" && selN) { e.preventDefault(); copyText(rangeText(rows, shownCols, selN, wholeCols), "sel"); return; }
    if (e.key === "Escape") { setSel(null); return; }
    const moves = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1], PageDown: [Math.floor(viewH / ROW_H) - 3, 0], PageUp: [-(Math.floor(viewH / ROW_H) - 3), 0] };
    let m = moves[e.key];
    if (e.key === "Home") m = mod ? [-1e9, -1e9] : [0, -1e9];
    if (e.key === "End") m = mod ? [1e9, 1e9] : [0, 1e9];
    if (!m) return;
    e.preventDefault();
    const cur = sel ?? { r0: 0, c0: 0, r1: 0, c1: 0 };
    const big = mod && e.key.startsWith("Arrow");
    const r = Math.max(0, Math.min(lastRow, big ? (m[0] > 0 ? lastRow : m[0] < 0 ? 0 : cur.r1) : cur.r1 + m[0]));
    const c = Math.max(0, Math.min(lastCol, big ? (m[1] > 0 ? lastCol : m[1] < 0 ? 0 : cur.c1) : cur.c1 + m[1]));
    const extend = e.shiftKey && e.key !== "Tab" && sel;
    setSel(extend ? { ...cur, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c });
    scrollToCell(r, c);
  };
  const cellDown = (i, j, e) => {
    if (e.button !== 0) return;
    if (e.pointerType === "mouse") e.preventDefault();
    wrapRef.current?.focus({ preventScroll: true });
    if (e.shiftKey && sel) { setSel({ ...sel, r1: i, c1: j }); return; }
    setSel({ r0: i, c0: j, r1: i, c1: j });
    if (e.pointerType === "mouse") drag.current = { kind: "cells" };
  };
  const cellEnter = (i, j) => { if (drag.current?.kind === "cells") setSel((s) => (s ? { ...s, r1: i, c1: j } : s)); };
  const headDown = (j, e) => {
    if (e.button !== 0) return;
    const c = shownCols[j];
    // While writing a formula, a header click writes its letter (as in Sheets) instead of selecting.
    if (fxFocus && !piv) { e.preventDefault(); insertFx(colLetter(allCols.indexOf(c)), fxCaret, fxCaret); return; }
    if (e.pointerType === "mouse") e.preventDefault();
    wrapRef.current?.focus({ preventScroll: true });
    if (!rows.length) return;
    if (e.shiftKey && sel) setSel({ ...sel, r0: 0, r1: lastRow, c1: j });
    else setSel({ r0: 0, c0: j, r1: lastRow, c1: j });
    if (e.pointerType === "mouse") drag.current = { kind: "cols" };
  };
  const headEnter = (j) => { if (drag.current?.kind === "cols") setSel((s) => (s ? { ...s, c1: j } : s)); };
  useEffect(() => {
    const up = () => { drag.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  useEffect(() => { setSel(null); }, [ds, piv != null, filters, groupBy]);

  // ---- Columns ---------------------------------------------------------------------------------------------------
  const startResize = (c, e) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = widthOf(c);
    const move = (ev) => setPref({ widths: { ...(prefs[ds]?.widths ?? {}), [c.id]: Math.max(56, Math.min(600, Math.round(w0 + ev.clientX - x0))) } });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const fitWidth = (c) => { const w = { ...(pref.widths ?? {}) }; delete w[c.id]; setPref({ widths: w }); };
  const sortCol = (id, dir, add = false) => setSort((s) => {
    const rest = add ? (s ?? []).filter(([k]) => k !== id) : [];
    return [...rest, [id, dir]];
  });
  const cycleSort = (id, e) => {
    const cur = sort?.find(([k]) => k === id);
    const add = e?.shiftKey;
    if (!cur) sortCol(id, 1, add);
    else if (cur[1] > 0) sortCol(id, -1, add);
    else setSort((s) => { const n = (s ?? []).filter(([k]) => k !== id); return n.length ? n : null; });
  };
  const hideCols = (ids) => { setPref({ hidden: [...new Set([...hidden, ...ids])] }); setSel(null); setMenu(null); };
  const setFilter = (id, f) => setFilters((x) => { const n = { ...x }; if (filterActive(f)) n[id] = f; else delete n[id]; return n; });

  // ---- Formulas --------------------------------------------------------------------------------------------------
  const fxCols = withFx?.columns ?? [];
  const suggest = fxFocus && !piv ? fxSuggest(fx.expr, fxCaret, fxCols) : null;
  const showSuggest = suggest && suggest.word && suggest.items.length > 0;
  const preview = useMemo(() => {
    if (!withFx || !fx.expr.trim()) return null;
    const cols = fx.editing ? withFx.columns.filter((c) => c.id !== fx.editing) : withFx.columns;
    const r = formulaValues(fx.expr, withFx.rows.slice(0, 50), cols);
    return r.error ? { error: r.error } : { values: r.values.slice(0, 4) };
  }, [fx.expr, fx.editing, withFx]);
  const insertFx = (text, from, to) => {
    const e = fx.expr || "=";
    const a = Math.max(0, Math.min(from, e.length)), b = Math.max(a, Math.min(to, e.length));
    const head = fx.expr ? e.slice(0, a) : "=";
    const next = `${head}${text}${e.slice(fx.expr ? b : 1)}`;
    const caret = head.length + text.length;
    setFx((f) => ({ ...f, expr: next }));
    setFxError(null);
    setFxCaret(caret);
    requestAnimationFrame(() => { const el = fxRef.current; if (el) { el.focus(); el.setSelectionRange(caret, caret); } });
  };
  const fxKey = (e) => {
    if (!showSuggest) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFxActive((a) => (a + 1) % suggest.items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFxActive((a) => (a - 1 + suggest.items.length) % suggest.items.length); }
    else if (e.key === "Tab" || (e.key === "Enter" && suggest.word)) {
      e.preventDefault();
      const it = suggest.items[fxActive] ?? suggest.items[0];
      insertFx(it.insert, suggest.from, suggest.to);
      setFxActive(0);
    }
  };
  const addFormula = (e) => {
    e.preventDefault();
    if (!withFx) return;
    const editing = fx.editing;
    const name = (fx.name.trim() || editing || `Columna ${(formulas[ds]?.length ?? 0) + 1}`).slice(0, 40);
    if (withFx.columns.some((c) => c.id === name && c.id !== editing)) { setFxError("Ya hay una columna con ese nombre."); return; }
    const cols = editing ? withFx.columns.filter((c) => c.id !== editing) : withFx.columns;
    const expr = namesToLetters(fx.expr.trim(), cols);
    const r = formulaValues(expr, withFx.rows.slice(0, 50), cols);
    if (r.error) { setFxError(r.error); return; }
    setFormulas((f) => {
      const list = f[ds] ?? [];
      const next = editing ? list.map((x) => (x.name === editing ? { name, expr } : x)) : [...list, { name, expr }];
      return { ...f, [ds]: next };
    });
    setFx({ name: "", expr: "", editing: null });
    setFxError(null);
  };
  const removeFormula = (name) => { setFormulas((f) => ({ ...f, [ds]: (f[ds] ?? []).filter((x) => x.name !== name) })); if (fx.editing === name) setFx({ name: "", expr: "", editing: null }); };
  const editFormula = (f) => { setFx({ name: f.name, expr: f.expr, editing: f.name }); setFxError(null); requestAnimationFrame(() => fxRef.current?.focus()); };

  const copyText = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ } };

  if (mode === "guided") {
    return (
      <>
        <button type="button" className="secondary hd-back" onClick={() => setMode("sheet")}><Icon name="left" size={16} /> Volver a la hoja de datos</button>
        <ChartBuilder api={api} profile={profile} courses={courses} assignments={assignments} fetchExam={fetchExam} guard={guard} ws={ws} />
      </>
    );
  }

  const chartCols = selCols.length ? selCols : shownCols.map((c) => c.id);
  const series = chart ? chartSeries(groups ? groups.map((g) => ({ [groupBy]: g.key, ...g.avg })) : rows, groups ? [{ id: groupBy, name: groupBy, type: "text" }, ...shownCols.filter((c) => c.type === "num")] : shownCols, groups ? [groupBy, ...chartCols] : chartCols, 40) : null;
  const colOptions = (withFx?.columns ?? []).map((c) => ({ value: c.id, label: c.name }));
  const nFilters = Object.values(filters).filter(filterActive).length;
  const cellClass = (c, j, extra = "") => `${c.type === "num" ? "num" : ""} ${j < nFrozen ? "fz" : ""} ${j === nFrozen - 1 ? "fz-last" : ""} ${extra}`;
  const stick = (j) => (j < nFrozen ? { left: lefts[j] } : undefined);
  const visible = items.slice(first, last);

  return (
    <div className="hd">
      <header className="t-head">
        <div><h1>Hoja de datos</h1><span className="caption">Todos los resultados como en Excel o Google Sheets. Arrastra para seleccionar celdas y ver su suma y promedio; usa el menú ▾ de cada columna para ordenar, filtrar, agrupar o fijarla.</span></div>
        <button type="button" className="link" onClick={() => setMode("guided")}>Gráficas guiadas</button>
      </header>

      <div className="hd-bar">
        <div className="seg-tabs hd-ds" role="tablist" aria-label="Tabla">
          {DATASETS.map((d) => <button key={d.id} type="button" role="tab" title={d.hint} aria-selected={ds === d.id} className={ds === d.id ? "on" : ""} onClick={() => switchDs(d.id)}>{d.label}</button>)}
        </div>
        <Select aria-label="Plantillas" placeholder="Plantillas" value="" onChange={applyTemplate} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} className="hd-tpl" />
        <span className="hd-spacer" />
        {!piv && <ColumnsButton open={colsOpen} setOpen={setColsOpen} columns={allCols} hidden={hidden} setHidden={(h) => setPref({ hidden: h })} />}
        <button type="button" className={colors ? "secondary on" : "secondary"} aria-pressed={colors} onClick={() => setColors(!colors)} title="Escala de color en Nota, % aciertos y áreas"><Icon name="sliders" size={16} /> Colores</button>
        <button type="button" className={pivot || pivotOpen ? "secondary on" : "secondary"} onClick={() => { setPivotOpen(!pivotOpen); if (!pivot && withFx) setPivot({ row: withFx.columns.find((c) => c.type === "text")?.id, col: null, value: withFx.columns.find((c) => c.type === "num")?.id, how: "avg", minN: 1 }); }}><Icon name="grid" size={16} /> Tabla dinámica</button>
        <button type="button" className={chart ? "secondary on" : "secondary"} onClick={() => setChart(chart ? null : "bar")}><Icon name="chart" size={16} /> Gráfica</button>
        <button type="button" className="secondary" disabled={!rows.length} onClick={() => copyText(tableText(shownCols, rows), "all")}>{copied === "all" ? "Copiada" : "Copiar"}</button>
        <button type="button" className="secondary" disabled={!rows.length} onClick={() => download(`Cóndor · ${piv ? "tabla dinámica" : DATASETS.find((d) => d.id === ds).label}.csv`, tableText(shownCols, rows, ","))}>CSV</button>
      </div>

      {pivotOpen && pivot && (
        <div className="card t-card hd-pivot">
          <div className="hd-pivot-grid">
            <label className="field"><span className="label">Filas</span><Select aria-label="Filas" value={pivot.row ?? ""} onChange={(v) => setPivot({ ...pivot, row: v })} options={colOptions} /></label>
            <label className="field"><span className="label">Columnas (opcional)</span><Select aria-label="Columnas" value={pivot.col ?? ""} onChange={(v) => setPivot({ ...pivot, col: v || null })} options={[{ value: "", label: "Ninguna" }, ...colOptions]} /></label>
            <label className="field"><span className="label">Valores</span><Select aria-label="Valores" value={pivot.value ?? ""} onChange={(v) => setPivot({ ...pivot, value: v })} options={colOptions} /></label>
            <label className="field"><span className="label">Función</span><Select aria-label="Función" value={pivot.how} onChange={(v) => setPivot({ ...pivot, how: v })} options={AGGS.map((a) => ({ value: a.id, label: a.label }))} /></label>
          </div>
          <div className="hd-pivot-foot">
            <span className="caption">«% de unos» sirve con la columna Acierto (1 = correcta): da el porcentaje de aciertos. Los filtros de la hoja se aplican antes.</span>
            <button type="button" className="link" onClick={() => { setPivot(null); setPivotOpen(false); }}>Quitar tabla dinámica</button>
          </div>
        </div>
      )}

      {!piv && (
        <form className="hd-fx" onSubmit={addFormula}>
          <span className="hd-namebox" title="Celda activa" aria-label="Celda activa">{ref || "—"}</span>
          <span className="hd-fx-tag">fx</span>
          <input aria-label="Nombre de la nueva columna" className="hd-fx-name" placeholder="Nombre" value={fx.name} onChange={(e) => setFx({ ...fx, name: e.target.value })} maxLength={40} />
          <div className="hd-fx-box">
            <input ref={fxRef} aria-label="Fórmula" className="hd-fx-expr" spellCheck="false" autoComplete="off"
              placeholder={fxFocus ? "Escribe una letra, un nombre o toca un encabezado" : sel && active != null ? `${colLetter(allCols.indexOf(shownCols[sel.c1]))}${sel.r1 + 1}: ${fmt(active)}` : ds === "entregas" ? "=round(J*5/100, 1)   o   =[% aciertos]*5/100" : "=G/F*100"}
              value={fx.expr}
              onChange={(e) => { setFx({ ...fx, expr: e.target.value }); setFxCaret(e.target.selectionStart ?? e.target.value.length); setFxActive(0); setFxError(null); }}
              onSelect={(e) => setFxCaret(e.target.selectionStart ?? 0)}
              onFocus={() => setFxFocus(true)} onBlur={() => setTimeout(() => setFxFocus(false), 150)} onKeyDown={fxKey}
              role="combobox" aria-expanded={!!showSuggest} aria-controls="hd-fx-list" aria-autocomplete="list" />
            {showSuggest && (
              <ul id="hd-fx-list" className="ui-pop hd-fx-list" role="listbox">
                {suggest.items.map((it, k) => (
                  <li key={it.label} role="option" aria-selected={k === fxActive} className={`ui-option${k === fxActive ? " active" : ""}`}
                    onPointerDown={(e) => { e.preventDefault(); insertFx(it.insert, suggest.from, suggest.to); setFxActive(0); }}>
                    <span>{it.kind === "col" ? <><b className="hd-fx-letter">{it.letter}</b> {it.name}</> : <code>{it.label}</code>}</span><span className="caption">{it.hint}</span>
                  </li>
                ))}
              </ul>
            )}
            {fxFocus && !showSuggest && (
              <div className="hd-fx-help caption">
                {preview?.error ? <span className="hd-fx-err">{preview.error}</span>
                  : preview?.values ? <span>Primeras filas: <b>{preview.values.map((v) => fmt(v)).join(" · ")}</b></span>
                  : <span>Columnas por letra (J) o por nombre entre corchetes ([Nota]). Funciones: round, min, max, avg, if, abs. Tab completa.</span>}
              </div>
            )}
          </div>
          {fx.editing && <button type="button" className="secondary" onClick={() => setFx({ name: "", expr: "", editing: null })}>Cancelar</button>}
          <button type="submit" className="primary" disabled={!fx.expr.trim()}>{fx.editing ? "Guardar" : <><span className="hd-wide">Agregar columna</span><span className="hd-narrow">Agregar</span></>}</button>
        </form>
      )}
      {fxError && <p className="notice error" role="alert">{fxError}</p>}
      {!piv && (formulas[ds] ?? []).length > 0 && (
        <div className="chips-row hd-fxs">{formulas[ds].map((f) => (
          <span key={f.name} className={`chip ${fx.editing === f.name ? "on" : ""}`}>
            <button type="button" className="hd-chip-edit" onClick={() => editFormula(f)} title="Editar la fórmula">{f.name} = {f.expr}</button>
            <button type="button" className="ws-x" aria-label={`Quitar ${f.name}`} onClick={() => removeFormula(f.name)}><Icon name="x" size={12} /></button>
          </span>
        ))}</div>
      )}

      {chart && series && (
        <div className="card t-card hd-chart">
          <div className="section-head">
            <strong>{series.series.length ? series.series.map((s) => s.name).join(", ") : "Elige columnas con números"}{series.labelName ? ` por ${series.labelName}` : ""}</strong>
            <div className="segmented small" role="group" aria-label="Tipo de gráfica">
              {[["bar", "Barras"], ["line", "Líneas"]].map(([id, l]) => <button key={id} type="button" className={chart === id ? "seg active" : "seg"} aria-pressed={chart === id} onClick={() => setChart(id)}>{l}</button>)}
            </div>
          </div>
          {series.series.length ? <MiniChart data={series} kind={chart} /> : <p className="caption">Selecciona una columna de texto (las etiquetas) y una o más de números tocando sus encabezados. Con Shift eliges varias seguidas.</p>}
          {series.cut && <span className="caption">Se grafican las primeras 40 filas, en el orden de la tabla. Filtra, ordena o agrupa para elegir cuáles.</span>}
        </div>
      )}

      <div className="hd-status" aria-live="polite">
        <span>{!view ? (ds === "respuestas" && factsBusy ? "Cargando respuestas y cuadernillos…" : "Cargando…") : piv ? `${rows.length.toLocaleString("es-CO")} filas en la tabla dinámica` : `${filtered.length.toLocaleString("es-CO")} de ${withFx.rows.length.toLocaleString("es-CO")} filas`}</span>
        {groups && <span className="chip on hd-pill">Agrupado por {groupBy} · {groups.length}<button type="button" className="ws-x" aria-label="Quitar grupos" onClick={() => { setGroupBy(null); setCollapsed([]); }}><Icon name="x" size={12} /></button></span>}
        {groups && <button type="button" className="link" onClick={() => setCollapsed(collapsed.length ? [] : groups.map((g) => String(g.key)))}>{collapsed.length ? "Abrir todos" : "Cerrar todos"}</button>}
        {nFilters > 0 && <span className="chip on hd-pill">{nFilters === 1 ? "1 filtro" : `${nFilters} filtros`}<button type="button" className="ws-x" aria-label="Quitar filtros" onClick={() => setFilters({})}><Icon name="x" size={12} /></button></span>}
        {sort?.length > 0 && <span className="chip hd-pill">Orden: {sort.map(([k, d]) => `${k} ${d > 0 ? "↑" : "↓"}`).join(", ")}<button type="button" className="ws-x" aria-label="Quitar orden" onClick={() => setSort(null)}><Icon name="x" size={12} /></button></span>}
        {hidden.length > 0 && !piv && <button type="button" className="link" onClick={() => setPref({ hidden: [] })}>Mostrar {hidden.length} {hidden.length === 1 ? "oculta" : "ocultas"}</button>}
      </div>

      {view && (
        <div ref={wrapRef} className="hd-wrap" role="grid" aria-label="Hoja de datos" aria-rowcount={rows.length} aria-colcount={shownCols.length} tabIndex={0}
          onKeyDown={onKey} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <table className="hd-grid" style={{ width: totalW }}>
            <colgroup><col style={{ width: RN_W }} />{widths.map((w, j) => <col key={shownCols[j].id} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr className="hd-letters">
                <th className="hd-corner" onPointerDown={(e) => { e.preventDefault(); wrapRef.current?.focus({ preventScroll: true }); if (rows.length) setSel({ r0: 0, c0: 0, r1: lastRow, c1: lastCol }); }} title="Seleccionar todo" />
                {shownCols.map((c, j) => <th key={c.id} className={cellClass(c, j, colInSel(j) ? "sel" : "")} style={stick(j)}>{colLetter(allCols.indexOf(c))}</th>)}
              </tr>
              <tr className="hd-names">
                <th className="hd-corner">#</th>
                {shownCols.map((c, j) => {
                  const s = sort?.find(([k]) => k === c.id);
                  const filt = filterActive(filters[c.id]);
                  return (
                    <th key={c.id} className={cellClass(c, j, colInSel(j) ? "sel" : "")} style={stick(j)} aria-sort={s ? (s[1] > 0 ? "ascending" : "descending") : undefined}>
                      <div className="hd-h">
                        <button type="button" className="hd-h-name" title={`${c.name}${c.formula ? ` = ${c.formula}` : ""}\nToca para seleccionar la columna; Shift para varias.`}
                          onPointerDown={(e) => headDown(j, e)} onPointerEnter={() => headEnter(j)}>
                          {c.formula && <span className="hd-fxmark">ƒ</span>}<span className="hd-h-text">{c.name}</span>
                        </button>
                        <button type="button" className={`hd-h-sort ${s ? "on" : ""}`} aria-label={`Ordenar por ${c.name}`} title="Ordenar (Shift para agregar otro orden)" onClick={(e) => cycleSort(c.id, e)}>
                          {s ? (s[1] > 0 ? "↑" : "↓") : "↕"}{s && sort.length > 1 ? <sub>{sort.indexOf(s) + 1}</sub> : null}
                        </button>
                        {!piv && <button type="button" className={`hd-h-menu ${filt ? "on" : ""}`} aria-label={`Menú de ${c.name}`} aria-haspopup="menu" onClick={(e) => setMenu({ col: c.id, rect: e.currentTarget.closest("th").getBoundingClientRect() })}>{filt ? <Icon name="filter" size={12} /> : "▾"}</button>}
                      </div>
                      <span className="hd-resize" aria-hidden="true" onPointerDown={(e) => startResize(c, e)} onDoubleClick={() => fitWidth(c)} />
                    </th>
                  );
                })}
              </tr>
              {!piv && (
                <tr className="hd-filters">
                  <th className="hd-corner"><Icon name="filter" size={13} /></th>
                  {shownCols.map((c, j) => {
                    const f = filters[c.id];
                    const list = f && typeof f === "object";
                    return (
                      <th key={c.id} className={cellClass(c, j)} style={stick(j)}>
                        {list ? <button type="button" className="hd-flt on" onClick={(e) => setMenu({ col: c.id, rect: e.currentTarget.closest("th").getBoundingClientRect() })}>{f.values.length === 1 ? f.values[0] : `${f.values.length} valores`}</button>
                          : <input aria-label={`Filtro de ${c.name}`} className={filterActive(f) ? "on" : ""} placeholder={c.type === "num" ? "≥, <, a..b" : "contiene…"} value={f ?? ""} onChange={(e) => setFilter(c.id, e.target.value)} />}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {first > 0 && <tr aria-hidden="true" style={{ height: first * ROW_H }}><td colSpan={shownCols.length + 1} className="hd-pad" /></tr>}
              {visible.map((it) => {
                if (it.g) {
                  const closed = collapsed.includes(String(it.g.key));
                  return (
                    <tr key={`g-${it.g.key}`} className="hd-group">
                      <td className="hd-rn" />
                      {shownCols.map((c, j) => (
                        <td key={c.id} className={cellClass(c, j)} style={stick(j)}>
                          {j === 0 ? (
                            <button type="button" className="hd-group-btn" aria-expanded={!closed} onClick={() => setCollapsed((x) => (closed ? x.filter((k) => k !== String(it.g.key)) : [...x, String(it.g.key)]))}>
                              <Icon name="right" size={12} strokeWidth={3} className={closed ? "" : "open"} /> {fmt(it.g.key)} <span className="caption">({it.g.n})</span>
                            </button>
                          ) : c.id === groupBy ? fmt(it.g.key) : c.type === "num" && it.g.avg[c.id] != null ? <span title="Promedio del grupo"><span className="hd-avg">prom.</span> {fmt(it.g.avg[c.id], Math.max(1, c.decimals ?? 0))}</span> : ""}
                        </td>
                      ))}
                    </tr>
                  );
                }
                const { r, i } = it;
                return (
                  <tr key={i} aria-rowindex={i + 1}>
                    <td className={`hd-rn ${selN && i >= selN.r0 && i <= selN.r1 ? "sel" : ""}`}>{i + 1}</td>
                    {shownCols.map((c, j) => {
                      const v = r[c.id];
                      const isSel = inSel(i, j);
                      const isActive = sel && sel.r1 === i && sel.c1 === j;
                      const bg = colors && !isSel ? heat(scalePos(c, r, v)) : undefined;
                      return (
                        <td key={c.id} className={cellClass(c, j, `${isSel ? "sel" : ""} ${isActive ? "act" : ""}`)} style={bg ? { ...stick(j), background: bg } : stick(j)}
                          onPointerDown={(e) => cellDown(i, j, e)} onPointerEnter={() => cellEnter(i, j)} title={typeof v === "string" && v.length > 24 ? v : undefined}>
                          {fmt(v, c.decimals)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {last < items.length && <tr aria-hidden="true" style={{ height: (items.length - last) * ROW_H }}><td colSpan={shownCols.length + 1} className="hd-pad" /></tr>}
              {rows.length === 0 && !groups && <tr><td className="hd-rn" /><td colSpan={shownCols.length} className="caption hd-empty">Nada con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="hd-foot">
        {stats && stats.cells > 1 ? (
          <span className="hd-stats">
            <b>{ref}</b>
            {stats.n > 0 ? <>Suma <b>{fmt(stats.sum)}</b> · Promedio <b>{fmt(stats.avg)}</b> · Mín <b>{fmt(stats.min)}</b> · Máx <b>{fmt(stats.max)}</b> · </> : null}
            Recuento <b>{stats.count.toLocaleString("es-CO")}</b>
            <button type="button" className="link" onClick={() => copyText(rangeText(rows, shownCols, selN, wholeCols), "sel")}>{copied === "sel" ? "Copiado" : "Copiar selección"}</button>
            {!piv && <button type="button" className="link" onClick={() => hideCols(selCols)}>Ocultar {selCols.length === 1 ? "columna" : "columnas"}</button>}
          </span>
        ) : (
          <span className="caption">Arrastra o usa Shift + flechas para seleccionar · Ctrl+C copia · Doble clic en el borde de un encabezado ajusta el ancho · Puntajes con la clave preliminar.</span>
        )}
      </div>

      {menu && !piv && (() => {
        const c = allCols.find((x) => x.id === menu.col);
        if (!c) return null;
        const j = shownCols.indexOf(c);
        return (
          <ColumnMenu col={c} rect={menu.rect} rows={withFx.rows} filter={filters[c.id]} onClose={() => setMenu(null)}
            onSort={(d) => { sortCol(c.id, d); setMenu(null); }}
            onFilter={(f) => setFilter(c.id, f)}
            grouped={groupBy === c.id} onGroup={() => { setGroupBy(groupBy === c.id ? null : c.id); setCollapsed([]); setMenu(null); }}
            frozenHere={j >= 0 && j === nFrozen - 1} onFreeze={() => { setPref({ frozen: j === nFrozen - 1 ? 0 : j + 1 }); setMenu(null); }}
            onHide={() => hideCols([c.id])} onFit={() => { fitWidth(c); setMenu(null); }}
            formula={c.formula ? (formulas[ds] ?? []).find((f) => f.name === c.id) : null}
            onEditFormula={(f) => { editFormula(f); setMenu(null); }} onRemoveFormula={() => { removeFormula(c.id); setMenu(null); }} />
        );
      })()}
    </div>
  );
}

// A small panel anchored to a rectangle, closed by a tap outside or Escape.
function Anchored({ rect, onClose, className = "", children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = window.innerHeight - rect.bottom - 8;
    const want = below < h && rect.top > below ? rect.top - h - 4 : rect.bottom + 4;
    const top = Math.max(8, Math.min(want, window.innerHeight - h - 8));
    setPos({ top, left });
  }, [rect]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("pointerdown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={`ui-pop hd-menu ${className}`} style={pos ?? { top: rect.bottom + 4, left: rect.left, visibility: "hidden" }}>{children}</div>,
    document.body,
  );
}

// The ▾ menu of a column: sort, filter with an operator or a list of values, group, freeze, hide, width.
function ColumnMenu({ col, rect, rows, filter, onClose, onSort, onFilter, grouped, onGroup, frozenHere, onFreeze, onHide, onFit, formula, onEditFormula, onRemoveFormula }) {
  const num = col.type === "num";
  const parts = filter && typeof filter !== "object" ? filterParts(filter) : null;
  const [op, setOp] = useState(parts?.op ?? (num ? ">=" : "contiene"));
  const [a, setA] = useState(parts?.a ?? "");
  const [b, setB] = useState(parts?.b ?? "");
  const values = useMemo(() => distinctValues(rows, col.id), [rows, col.id]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set(filter && typeof filter === "object" ? filter.values : values.map((v) => v.value)));
  const ops = FILTER_OPS.filter((o) => (num ? o.num : o.text));
  const cur = ops.find((o) => o.id === op) ?? ops[0];
  const shownValues = values.filter((v) => !q || v.value.toLowerCase().includes(q.toLowerCase()));
  const listMode = !num && values.length <= 200;
  const applyOp = (e) => { e?.preventDefault(); onFilter(filterText(cur.id, a, b)); onClose(); };
  const applyList = () => { onFilter(picked.size === values.length ? "" : { values: [...picked] }); onClose(); };
  const toggle = (v) => setPicked((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const onClose_ = useCallback(onClose, [onClose]);
  return (
    <Anchored rect={rect} onClose={onClose_} label={`Columna ${col.name}`}>
      <div className="hd-menu-head"><strong>{col.name}</strong>{formula && <code className="caption">= {formula.expr}</code>}</div>
      <div className="hd-menu-row">
        <button type="button" className="secondary" onClick={() => onSort(1)}>{num ? "Menor a mayor" : "A → Z"}</button>
        <button type="button" className="secondary" onClick={() => onSort(-1)}>{num ? "Mayor a menor" : "Z → A"}</button>
      </div>
      <form className="hd-menu-sec" onSubmit={applyOp}>
        <span className="label">Filtrar por condición</span>
        <div className="hd-ops" role="radiogroup" aria-label="Condición">
          {ops.map((o) => <button key={o.id} type="button" role="radio" aria-checked={o.id === cur.id} className={`chip ${o.id === cur.id ? "on" : ""}`} onClick={() => setOp(o.id)}>{o.label}</button>)}
        </div>
        {!cur.none && (
          <div className="hd-menu-row">
            <input aria-label="Valor" inputMode={num ? "decimal" : "text"} placeholder={num ? "Número" : "Texto"} value={a} onChange={(e) => setA(e.target.value)} autoFocus />
            {cur.two && <><span className="caption">y</span><input aria-label="Hasta" inputMode="decimal" placeholder="Número" value={b} onChange={(e) => setB(e.target.value)} /></>}
          </div>
        )}
        <div className="hd-menu-row">
          <button type="submit" className="primary">Aplicar</button>
          {filter != null && filter !== "" && <button type="button" className="link" onClick={() => { onFilter(""); onClose(); }}>Quitar filtro</button>}
        </div>
      </form>
      {listMode && (
        <div className="hd-menu-sec">
          <span className="label">O elige valores</span>
          {values.length > 8 && <input aria-label="Buscar valor" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="hd-menu-row small">
            <button type="button" className="link" onClick={() => setPicked(new Set(values.map((v) => v.value)))}>Todos</button>
            <button type="button" className="link" onClick={() => setPicked(new Set())}>Ninguno</button>
          </div>
          <ul className="hd-values">
            {shownValues.map((v) => (
              <li key={v.value}><label><input type="checkbox" checked={picked.has(v.value)} onChange={() => toggle(v.value)} /> <span>{v.value}</span> <span className="caption">{v.n}</span></label></li>
            ))}
          </ul>
          <button type="button" className="primary" disabled={!picked.size} onClick={applyList}>Mostrar {picked.size === values.length ? "todos" : `${picked.size} ${picked.size === 1 ? "valor" : "valores"}`}</button>
        </div>
      )}
      <div className="hd-menu-list">
        <button type="button" onClick={onGroup}>{grouped ? "Quitar grupos" : "Agrupar por esta columna"}</button>
        <button type="button" onClick={onFreeze}>{frozenHere ? "Soltar columnas fijas" : "Fijar columnas hasta aquí"}</button>
        <button type="button" onClick={onFit}>Ajustar ancho</button>
        <button type="button" onClick={onHide}>Ocultar columna</button>
        {formula && <button type="button" onClick={() => onEditFormula(formula)}>Editar fórmula</button>}
        {formula && <button type="button" className="danger" onClick={onRemoveFormula}>Quitar columna</button>}
      </div>
    </Anchored>
  );
}

// "Columnas": every column with a tick to show or hide it.
function ColumnsButton({ open, setOpen, columns, hidden, setHidden }) {
  const [rect, setRect] = useState(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <>
      <button type="button" className={hidden.length ? "secondary on" : "secondary"} aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { setRect(e.currentTarget.getBoundingClientRect()); setOpen(!open); }}>
        <Icon name="eyeOff" size={16} /> Columnas{hidden.length ? ` · ${columns.length - hidden.length}/${columns.length}` : ""}
      </button>
      {open && rect && (
        <Anchored rect={rect} onClose={close} label="Columnas visibles" className="hd-cols">
          <div className="hd-menu-row small">
            <button type="button" className="link" onClick={() => setHidden([])}>Mostrar todas</button>
            <button type="button" className="link" onClick={() => setHidden(columns.slice(1).map((c) => c.id))}>Solo la primera</button>
          </div>
          <ul className="hd-values">
            {columns.map((c, i) => (
              <li key={c.id}><label><input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => setHidden(hidden.includes(c.id) ? hidden.filter((x) => x !== c.id) : [...hidden, c.id])} /> <span><b className="hd-fx-letter">{colLetter(i)}</b> {c.name}</span></label></li>
            ))}
          </ul>
        </Anchored>
      )}
    </>
  );
}

// Bars or lines for the chosen series. Labels stay readable: long ones are cut, numbers are always written on bars.
function MiniChart({ data, kind }) {
  const all = data.series.flatMap((s) => s.values).filter((v) => v != null);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  if (kind === "line") {
    const w = 640, h = 240, l = 40, b = 46, t = 12;
    const n = data.labels.length;
    const x = (i) => l + (n <= 1 ? 0 : (i * (w - l - 12)) / (n - 1));
    const y = (v) => t + (1 - (v - min) / (max - min || 1)) * (h - t - b);
    const every = Math.max(1, Math.ceil(n / 8));
    return (
      <>
        <ul className="cb-legend">{data.series.map((s, i) => <li key={s.name}><span className="dot" style={{ background: colorOf(s.name, i) }} />{s.name}</li>)}</ul>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Gráfica de líneas" className="hd-svg">
          {[0, 0.5, 1].map((f) => { const v = min + f * (max - min); return <g key={f}><line x1={l} x2={w - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" /><text x={l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-2)">{fmt(Math.round(v))}</text></g>; })}
          {data.series.map((s, si) => {
            const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
            return <g key={s.name}><polyline fill="none" stroke={colorOf(s.name, si)} strokeWidth="2.5" strokeLinejoin="round" points={pts.map((p) => p.join(",")).join(" ")} />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={colorOf(s.name, si)} />)}</g>;
          })}
          {data.labels.map((lb, i) => (i % every === 0 || i === n - 1 ? <text key={i} x={x(i)} y={h - b + 16} textAnchor="middle" fontSize="10" fill="var(--text-2)">{lb.length > 12 ? `${lb.slice(0, 11)}…` : lb}</text> : null))}
        </svg>
      </>
    );
  }
  return (
    <>
      {data.series.length > 1 && <ul className="cb-legend">{data.series.map((s, i) => <li key={s.name}><span className="dot" style={{ background: colorOf(s.name, i) }} />{s.name}</li>)}</ul>}
      <div className="hd-bars">
        {data.labels.map((lb, i) => (
          <div key={i} className="hd-bar-group">
            <span className="hd-bar-label" title={lb}>{lb}</span>
            <div className="hd-bar-stack">
              {data.series.map((s, si) => (
                <div key={s.name} className="d-bar-row">
                  <span className="d-bar-track"><span style={{ width: `${s.values[i] == null ? 0 : Math.max(1.5, ((s.values[i] - Math.min(0, min)) / (max - Math.min(0, min) || 1)) * 100)}%`, background: data.series.length > 1 ? colorOf(s.name, si) : AREA_NAMES.includes(lb) ? areaColor(lb) : "var(--accent)" }} /></span>
                  <span className="d-bar-num">{s.values[i] == null ? "—" : fmt(s.values[i])}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
