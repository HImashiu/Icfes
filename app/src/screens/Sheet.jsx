import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { areaColor } from "../lib/brand.js";
import { useFacts } from "./useFacts.js";
import { AGGS, answersTable, applyFilters, chartSeries, colLetter, columnStats, deliveriesTable, formulaValues, pivotTable, sortBy, studentsTable, tableText } from "../lib/sheet.js";
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
const PAGE = 200;
const STORE = "condor.sheet.v1";
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) ?? "null") ?? {}; } catch { return {}; } };
const writeStore = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage blocked */ } };
const fmt = (v) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : String(v));
function download(name, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}\n`], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Resultados › Hoja de datos: the results as a spreadsheet, with pivot, formulas and a chart of what is selected.
export default function Sheet({ api, profile, courses, assignments, models = [], fetchExam, guard, ws = null }) {
  const saved = useRef(readStore()).current;
  const [mode, setMode] = useState("sheet"); // sheet | guided (the earlier chart builder)
  const [ds, setDs] = useState(saved.ds ?? "entregas");
  const [base, setBase] = useState(null); // { members, attempts }
  const [formulas, setFormulas] = useState(saved.formulas ?? {}); // ds -> [{ name, expr }]
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null); // [col, dir]
  const [selected, setSelected] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [pivot, setPivot] = useState(null); // { row, col, value, how, minN }
  const [pivotOpen, setPivotOpen] = useState(false);
  const [chart, setChart] = useState(null); // "bar" | "line"
  const [fx, setFx] = useState({ name: "", expr: "" });
  const [fxError, setFxError] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [copied, setCopied] = useState(false);

  useEffect(() => { writeStore({ ds, formulas }); }, [ds, formulas]);
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
    if (ds === "respuestas") return facts ? answersTable(facts) : null;
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
      columns = [...columns, { id: f.name, name: f.name, type: "num", formula: f.expr }];
    }
    return { columns, rows };
  }, [table, formulas, ds]);

  const filtered = useMemo(() => (withFx ? applyFilters(withFx.rows, filters) : []), [withFx, filters]);
  const piv = useMemo(() => (pivot && withFx && withFx.columns.some((c) => c.id === pivot.row) ? pivotTable(filtered, pivot) : null), [pivot, filtered, withFx]);
  const view = piv ?? (withFx ? { columns: withFx.columns, rows: filtered } : null);
  const shownCols = view ? view.columns.filter((c) => piv || !hidden.includes(c.id)) : [];
  const rows = useMemo(() => (view ? (sort && view.columns.some((c) => c.id === sort[0]) ? sortBy(view.rows, [sort]) : view.rows) : []), [view, sort]);

  const switchDs = (id) => { setDs(id); setFilters({}); setSort(null); setSelected([]); setHidden([]); setPivot(null); setChart(null); setLimit(PAGE); setFxError(null); };
  const pick = (id, e) => setSelected((s) => (e?.shiftKey || e?.ctrlKey || e?.metaKey ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : s.length === 1 && s[0] === id ? [] : [id]));
  const applyTemplate = (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    switchDs(t.ds);
    if (t.pivot) { setPivot({ minN: 1, ...t.pivot }); setPivotOpen(true); }
    if (t.sort) setSort(typeof t.sort[0] === "number" ? null : t.sort);
    if (t.chart) setChart(t.chart);
  };
  const addFormula = (e) => {
    e.preventDefault();
    const name = (fx.name.trim() || `Columna ${(formulas[ds]?.length ?? 0) + 1}`).slice(0, 40);
    if (!withFx) return;
    if (withFx.columns.some((c) => c.id === name)) { setFxError("Ya hay una columna con ese nombre."); return; }
    const r = formulaValues(fx.expr, withFx.rows.slice(0, 50), withFx.columns);
    if (r.error) { setFxError(r.error); return; }
    setFormulas((f) => ({ ...f, [ds]: [...(f[ds] ?? []), { name, expr: fx.expr.trim() }] }));
    setFx({ name: "", expr: "" });
    setFxError(null);
    setSelected([name]);
  };
  const removeFormula = (name) => setFormulas((f) => ({ ...f, [ds]: (f[ds] ?? []).filter((x) => x.name !== name) }));
  const copy = async () => { try { await navigator.clipboard.writeText(tableText(shownCols, rows)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };

  if (mode === "guided") {
    return (
      <>
        <button type="button" className="secondary hd-back" onClick={() => setMode("sheet")}><Icon name="left" size={16} /> Volver a la hoja de datos</button>
        <ChartBuilder api={api} profile={profile} courses={courses} assignments={assignments} fetchExam={fetchExam} guard={guard} ws={ws} />
      </>
    );
  }

  const numSel = shownCols.filter((c) => selected.includes(c.id) && c.type === "num");
  const stats = numSel.length === 1 ? columnStats(rows, numSel[0].id) : null;
  const series = chart ? chartSeries(rows, shownCols, selected.length ? selected : shownCols.map((c) => c.id), 40) : null;
  const colOptions = (withFx?.columns ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="hd">
      <header className="t-head">
        <div><h1>Hoja de datos</h1><span className="caption">Todos los resultados como en Excel o Google Sheets: filtra, ordena, agrega columnas con fórmulas, arma tablas dinámicas y grafica lo que selecciones.</span></div>
        <button type="button" className="link" onClick={() => setMode("guided")}>Gráficas guiadas</button>
      </header>

      <div className="hd-bar">
        <div className="seg-tabs hd-ds" role="tablist" aria-label="Tabla">
          {DATASETS.map((d) => <button key={d.id} type="button" role="tab" title={d.hint} aria-selected={ds === d.id} className={ds === d.id ? "on" : ""} onClick={() => switchDs(d.id)}>{d.label}</button>)}
        </div>
        <Select aria-label="Plantillas" placeholder="Plantillas" value="" onChange={applyTemplate} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} className="hd-tpl" />
        <span className="hd-spacer" />
        <button type="button" className={pivot || pivotOpen ? "secondary on" : "secondary"} onClick={() => { setPivotOpen(!pivotOpen); if (!pivot && withFx) setPivot({ row: withFx.columns.find((c) => c.type === "text")?.id, col: null, value: withFx.columns.find((c) => c.type === "num")?.id, how: "avg", minN: 1 }); }}><Icon name="grid" size={16} /> Tabla dinámica</button>
        <button type="button" className={chart ? "secondary on" : "secondary"} onClick={() => setChart(chart ? null : "bar")}><Icon name="chart" size={16} /> Gráfica</button>
        <button type="button" className="secondary" disabled={!rows.length} onClick={copy}>{copied ? "Copiada" : "Copiar"}</button>
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
          <span className="hd-fx-tag">fx</span>
          <input aria-label="Nombre de la nueva columna" className="hd-fx-name" placeholder="Nombre" value={fx.name} onChange={(e) => setFx({ ...fx, name: e.target.value })} maxLength={40} />
          <input aria-label="Fórmula" className="hd-fx-expr" spellCheck="false" placeholder={ds === "entregas" ? "=I*5/100   (usa las letras de las columnas)" : "=G/F*100   (usa las letras de las columnas)"} value={fx.expr} onChange={(e) => { setFx({ ...fx, expr: e.target.value }); setFxError(null); }} />
          <button type="submit" className="primary" disabled={!fx.expr.trim()}>Agregar columna</button>
        </form>
      )}
      {fxError && <p className="notice error" role="alert">{fxError}</p>}
      {!piv && (formulas[ds] ?? []).length > 0 && (
        <div className="chips-row hd-fxs">{formulas[ds].map((f) => <span key={f.name} className="chip">{f.name} = {f.expr}<button type="button" className="ws-x" aria-label={`Quitar ${f.name}`} onClick={() => removeFormula(f.name)}><Icon name="x" size={12} /></button></span>)}</div>
      )}

      {chart && series && (
        <div className="card t-card hd-chart">
          <div className="section-head">
            <strong>{series.series.length ? series.series.map((s) => s.name).join(", ") : "Elige columnas con números"}{series.labelName ? ` por ${series.labelName}` : ""}</strong>
            <div className="segmented small" role="group" aria-label="Tipo de gráfica">
              {[["bar", "Barras"], ["line", "Líneas"]].map(([id, l]) => <button key={id} type="button" className={chart === id ? "seg active" : "seg"} aria-pressed={chart === id} onClick={() => setChart(id)}>{l}</button>)}
            </div>
          </div>
          {series.series.length ? <MiniChart data={series} kind={chart} /> : <p className="caption">Selecciona una columna de texto (las etiquetas) y una o más de números tocando sus encabezados. Con Shift o Ctrl eliges varias.</p>}
          {series.cut && <span className="caption">Se grafican las primeras 40 filas, en el orden de la tabla. Filtra u ordena para elegir cuáles.</span>}
        </div>
      )}

      <div className="hd-status" aria-live="polite">
        <span>{!view ? (ds === "respuestas" && factsBusy ? "Cargando respuestas y cuadernillos…" : "Cargando…") : `${rows.length.toLocaleString("es-CO")} ${piv ? "filas en la tabla dinámica" : `de ${withFx.rows.length.toLocaleString("es-CO")} filas`}`}</span>
        {stats && <span className="hd-stats"><b>{numSel[0].name}</b> Suma {fmt(stats.sum)} · Promedio {fmt(stats.avg)} · Mín {fmt(stats.min)} · Máx {fmt(stats.max)} · Recuento {stats.n}</span>}
        {selected.length > 0 && !piv && (
          <span className="hd-colacts">
            <button type="button" className="link" onClick={() => setSort([selected[0], 1])}>Ordenar A→Z</button>
            <button type="button" className="link" onClick={() => setSort([selected[0], -1])}>Z→A</button>
            <button type="button" className="link" onClick={() => { setHidden((h) => [...h, ...selected]); setSelected([]); }}>Ocultar</button>
          </span>
        )}
        {hidden.length > 0 && !piv && <button type="button" className="link" onClick={() => setHidden([])}>Mostrar {hidden.length} ocultas</button>}
        {Object.values(filters).some(Boolean) && <button type="button" className="link" onClick={() => setFilters({})}>Quitar filtros</button>}
      </div>

      {view && (
        <div className="hd-wrap" role="region" aria-label="Hoja de datos" tabIndex={0}>
          <table className="hd-grid">
            <thead>
              <tr className="hd-letters">
                <th className="hd-corner" />
                {shownCols.map((c) => <th key={c.id} className={selected.includes(c.id) ? "sel" : ""}>{colLetter(view.columns.indexOf(c))}</th>)}
              </tr>
              <tr className="hd-names">
                <th className="hd-corner">#</th>
                {shownCols.map((c) => (
                  <th key={c.id} className={`${selected.includes(c.id) ? "sel" : ""} ${c.type === "num" ? "num" : ""}`}>
                    <button type="button" onClick={(e) => pick(c.id, e)} onDoubleClick={() => setSort([c.id, sort?.[0] === c.id ? -sort[1] : 1])} title={`${c.formula ? `${c.formula} · ` : ""}Toca para seleccionar (Shift o Ctrl para varias). Doble toque para ordenar.`}>
                      {c.name}{c.formula ? " ƒ" : ""}{sort?.[0] === c.id ? (sort[1] > 0 ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
              {!piv && (
                <tr className="hd-filters">
                  <th className="hd-corner"><Icon name="filter" size={13} /></th>
                  {shownCols.map((c) => (
                    <th key={c.id}><input aria-label={`Filtro de ${c.name}`} placeholder={c.type === "num" ? ">50" : "contiene…"} value={filters[c.id] ?? ""} onChange={(e) => { setFilters({ ...filters, [c.id]: e.target.value }); setLimit(PAGE); }} /></th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r, i) => (
                <tr key={i}>
                  <td className="hd-rn">{i + 1}</td>
                  {shownCols.map((c) => <td key={c.id} className={`${selected.includes(c.id) ? "sel" : ""} ${c.type === "num" ? "num" : ""}`}>{fmt(r[c.id])}</td>)}
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="hd-rn" /><td colSpan={shownCols.length} className="caption">Nada con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && <button type="button" className="secondary hd-more" onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, rows.length - limit)} filas más</button>}
      <span className="caption">Filtros: «&gt;50», «&lt;=3», «10..20», «=11 A», «!texto» o cualquier palabra. Fórmulas: letras de las columnas con + − * / ^, y funciones como round, min, max, avg, if. Puntajes con la clave preliminar.</span>
    </div>
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
