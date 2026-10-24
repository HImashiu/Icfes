import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { CHARTS, DEFAULT_SPEC, DIM, DIMENSIONS, METRICS, PRESETS, RANGES, applyFilters, buildFacts, cleanSpec, describeSpec, pivot, pivotCsv, pivotMax, valuesOf } from "../lib/chartBuilder.js";
import { Kpi } from "./Dashboard.jsx";
import { areaColor } from "../lib/brand.js";

const SERIES = ["#5ED3B4", "#FFB547", "#8AB4FF", "#F59EC4", "#C79BFF", "#FF8A7A", "#9FC4A0", "#E0D060"];
const LOCAL_KEY = "condor.savedCharts";
// Areas keep their app colour in every chart; any other field uses the series palette.
const seriesColor = (dimId, value, i) => (dimId === "area" && value ? areaColor(value) : SERIES[i % SERIES.length]);
const rowColor = (spec, r) => (spec.rows === "area" ? areaColor(r) : "var(--accent)");
const fmtVal = (v, m) => (v == null ? "—" : `${Number.isInteger(v) ? v : String(v).replace(".", ",")}${m.unit}`);
// Week and month labels read as dates; everything else is shown as it is.
const label = (dimId, v) => {
  if (dimId === "week") return new Date(`${v}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  if (dimId === "month") return new Date(`${v}-15T12:00:00`).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
  return v;
};

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* storage blocked: the chart just is not kept */ } };

/* ---------- Charts ---------- */

function BarChart({ p, spec }) {
  const max = pivotMax(p);
  const cols = p.cols;
  return (
    <>
    {cols && <ul className="cb-legend">{cols.map((c, i) => <li key={c}><span className="dot" style={{ background: seriesColor(spec.cols, c, i) }} />{label(spec.cols, c)}</li>)}</ul>}
    <div className="cb-bars" role="img" aria-label={describeSpec(spec)}>
      {p.rows.map((r) => (
        <div key={r} className="cb-bar-group">
          <span className="cb-bar-label">{label(spec.rows, r)}</span>
          <div className="cb-bar-stack">
            {(cols ?? [""]).map((c, i) => {
              const cell = p.cell(r, c);
              if (!cell) return null;
              return (
                <div key={c} className="d-bar-row cb-bar-row" title={`${cell.n} respuestas`}>
                  <span className="d-bar-track"><span style={{ width: `${cell.value == null ? 0 : Math.max(2, (cell.value / max) * 100)}%`, background: cols ? seriesColor(spec.cols, c, i) : rowColor(spec, r) }} /></span>
                  <span className="d-bar-num">{fmtVal(cell.value, p.metric)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

function Heatmap({ p, spec }) {
  const max = pivotMax(p);
  return (
    <div className="table-wrap">
      <table className="cb-heat" aria-label={describeSpec(spec)}>
        <thead><tr><th />{p.cols.map((c) => <th key={c}>{label(spec.cols, c)}</th>)}</tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r}>
              <th scope="row">{label(spec.rows, r)}</th>
              {p.cols.map((c) => {
                const cell = p.cell(r, c);
                const t = cell?.value == null ? 0 : Math.min(1, cell.value / max);
                return (
                  <td key={c} title={cell ? `${cell.n} respuestas` : "Sin datos"} style={cell?.value == null ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(12 + t * 78)}%, var(--surface-2))`, color: t > 0.45 ? "#121612" : "var(--text)" }}>
                    {fmtVal(cell?.value, p.metric)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineChart({ p, spec }) {
  const w = 640, h = 240, l = 44, r = 14, t = 14, b = 34;
  const cols = p.cols ?? [""];
  const max = pivotMax(p);
  const top = p.metric.max ?? Math.ceil(max * 1.1);
  const n = p.rows.length;
  const x = (i) => (n === 1 ? (l + w - r) / 2 : l + (i * (w - l - r)) / (n - 1));
  const y = (v) => t + (1 - v / top) * (h - t - b);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={describeSpec(spec)} className="cb-line">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={l} x2={w - r} y1={y(top * g)} y2={y(top * g)} stroke="var(--line)" strokeWidth="1" />
            <text x={l - 6} y={y(top * g) + 4} textAnchor="end" fontSize="11" fill="var(--text-2)">{Math.round(top * g)}</text>
          </g>
        ))}
        {p.rows.map((row, i) => (i % step === 0 ? <text key={row} x={x(i)} y={h - 10} textAnchor="middle" fontSize="11" fill="var(--text-2)">{label(spec.rows, row)}</text> : null))}
        {cols.map((c, ci) => {
          const color = p.cols ? seriesColor(spec.cols, c, ci) : "var(--accent)";
          const pts = p.rows.map((row, i) => ({ i, row, cell: p.cell(row, c) })).filter((q) => q.cell?.value != null);
          return (
            <g key={c}>
              <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts.map((q) => `${x(q.i)},${y(q.cell.value)}`).join(" ")} />
              {pts.map((q) => <circle key={q.row} cx={x(q.i)} cy={y(q.cell.value)} r="4" fill={color}><title>{`${p.cols ? `${label(spec.cols, c)} · ` : ""}${label(spec.rows, q.row)}: ${fmtVal(q.cell.value, p.metric)} (${q.cell.n} respuestas)`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      {p.cols && <ul className="cb-legend">{p.cols.map((c, i) => <li key={c}><span className="dot" style={{ background: seriesColor(spec.cols, c, i) }} />{label(spec.cols, c)}</li>)}</ul>}
    </>
  );
}

function DataTable({ p, spec }) {
  return (
    <div className="table-wrap">
      <table className="t-table" aria-label={describeSpec(spec)}>
        <thead><tr><th>{DIM[spec.rows].label}</th>{p.cols ? <>{p.cols.map((c) => <th key={c}>{label(spec.cols, c)}</th>)}<th>Total</th></> : <><th>{p.metric.label}</th><th>Respuestas</th></>}</tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r}>
              <td>{label(spec.rows, r)}</td>
              {p.cols ? <>{p.cols.map((c) => <td key={c}>{fmtVal(p.cell(r, c)?.value, p.metric)}</td>)}<td>{fmtVal(p.rowTotal(r)?.value, p.metric)}</td></> : <><td>{fmtVal(p.cell(r, "")?.value, p.metric)}</td><td>{p.cell(r, "")?.n ?? 0}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Builder controls ---------- */

// A zone that takes a field dragged from the palette. The Select inside does the same without dragging (keyboard, touch).
function Zone({ title, hint, accepts, onDrop, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={over ? "cb-zone over" : "cb-zone"}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(accepts)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData(accepts); if (id) onDrop(id); }}
    >
      <span className="label">{title}</span>
      {children}
      <span className="caption">{hint}</span>
    </div>
  );
}

function Field({ kind, id, text, hint }) {
  return (
    <span className="cb-field" draggable onDragStart={(e) => { e.dataTransfer.setData(kind, id); e.dataTransfer.effectAllowed = "copy"; }} title={hint ? `${hint}. Arrástralo a una zona.` : "Arrástralo a una zona."}>
      <Icon name={kind === "dim" ? "book" : "chart"} size={14} />{text}
    </span>
  );
}

function FilterRow({ facts, id, selected, onChange, onRemove }) {
  const values = useMemo(() => valuesOf(facts, id), [facts, id]);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="cb-filter">
      <div className="section-head"><strong>{DIM[id].label}</strong><button type="button" className="icon-btn" onClick={onRemove} aria-label={`Quitar filtro ${DIM[id].label}`}><Icon name="close" size={16} /></button></div>
      <div className="chips-row">
        {values.length === 0 && <span className="caption">Sin valores todavía.</span>}
        {values.slice(0, 40).map((v) => <button key={v} type="button" className={selected.includes(v) ? "chip on" : "chip"} aria-pressed={selected.includes(v)} onClick={() => toggle(v)}>{label(id, v)}</button>)}
      </div>
      {values.length > 40 && <span className="caption">Se muestran 40 de {values.length} valores.</span>}
    </div>
  );
}

const dimOptions = (extra) => <>{extra}{DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</>;

/* ---------- Screen ---------- */

export default function ChartBuilder({ api, profile, courses, assignments, fetchExam, guard }) {
  const [data, setData] = useState(null);
  const [facts, setFacts] = useState(null);
  const [progress, setProgress] = useState(null);
  const [skipped, setSkipped] = useState(0);
  const [spec, setSpec] = useState(DEFAULT_SPEC);
  const [saved, setSaved] = useState([]);
  const [local, setLocal] = useState(false);
  const [name, setName] = useState("");
  const [addFilter, setAddFilter] = useState("");
  const [tune, setTune] = useState(false); // phone: the field zones fold under the chart
  const bundles = useRef(new Map());

  useEffect(() => {
    guard(async () => {
      const [members, attempts, charts] = await Promise.all([api.allMembers(), api.chartAttempts(), api.savedCharts()]);
      setData({ members, attempts });
      if (charts) setSaved(charts); else { setLocal(true); setSaved(readLocal()); }
    });
  }, [api, guard]);

  // Load the booklets behind the delivered work once, then flatten everything into facts.
  useEffect(() => {
    if (!data) return undefined;
    let live = true;
    const used = new Set(data.attempts.map((a) => a.assignment_id));
    const mine = assignments.filter((a) => used.has(a.id));
    const slugs = [...new Set(mine.map((a) => a.exam_slug))];
    const keysOf = (slug) => [...new Set(mine.filter((a) => a.exam_slug === slug).flatMap((a) => a.question_keys ?? []))];
    (async () => {
      let miss = 0;
      for (let i = 0; i < slugs.length; i += 1) {
        if (!live) return;
        if (!bundles.current.has(slugs[i])) {
          setProgress({ done: i, total: slugs.length });
          try { bundles.current.set(slugs[i], await fetchExam(slugs[i], slugs[i] === "teacher" ? keysOf(slugs[i]) : null)); } catch { miss += 1; }
        }
      }
      if (!live) return;
      setSkipped(miss);
      setProgress(null);
      setFacts(buildFacts({ attempts: data.attempts, assignments, members: data.members, courses, bundles: bundles.current }));
    })();
    return () => { live = false; };
  }, [data, assignments, courses, fetchExam]);

  const patch = (p) => setSpec((s) => ({ ...s, ...p }));
  const setFilter = (id, vals) => setSpec((s) => ({ ...s, filters: { ...s.filters, [id]: vals } }));
  const dropFilter = (id) => setSpec((s) => { const f = { ...s.filters }; delete f[id]; return { ...s, filters: f }; });
  const addFilterDim = (id) => { if (id && !(id in spec.filters)) setFilter(id, []); setAddFilter(""); };

  const view = useMemo(() => (facts ? applyFilters(facts, spec) : []), [facts, spec]);
  const p = useMemo(() => (facts ? pivot(facts, spec) : null), [facts, spec]);
  const chartKind = spec.chart === "heat" && !spec.cols ? "bar" : spec.chart;
  const noteHeat = spec.chart === "heat" && !spec.cols;
  const known = p?.rows.map((r) => ({ r, v: p.rowTotal(r)?.value })).filter((x) => x.v != null) ?? [];
  const lowest = spec.rows === "student" || spec.metric === "n" ? null : [...known].sort((a, b) => a.v - b.v)[0];

  const students = new Set(view.map((f) => f.studentId)).size;
  const keyedN = view.filter((f) => f.correct != null);
  const acc = keyedN.length ? Math.round((keyedN.filter((f) => f.correct).length / keyedN.length) * 100) : null;
  const timed = view.filter((f) => f.sec != null);

  const save = () => guard(async () => {
    const nm = name.trim();
    if (!nm) return;
    if (local) {
      const next = [{ id: `local-${Date.now()}`, name: nm, spec, created_at: new Date().toISOString() }, ...saved];
      writeLocal(next); setSaved(next);
    } else {
      const row = await api.saveChart({ schoolId: profile.school_id, name: nm, spec });
      setSaved([row, ...saved]);
    }
    setName("");
  });
  const remove = (c) => guard(async () => {
    if (!(await confirmDialog(`¿Borrar la gráfica «${c.name}»?`, { confirmLabel: "Borrar", danger: true }))) return;
    if (local) { const next = saved.filter((x) => x.id !== c.id); writeLocal(next); setSaved(next); } else { await api.deleteChart(c.id); setSaved(saved.filter((x) => x.id !== c.id)); }
  });
  const open = useCallback((s) => setSpec(cleanSpec(s)), []);

  return (
    <>
      <header className="t-head"><div><h1>Reportes</h1><span className="caption">Arma tu propia gráfica: arrastra campos a las zonas o elígelos en la lista. Los resultados se actualizan al instante.</span></div>
        <button type="button" className="secondary" disabled={!p || p.rows.length === 0} onClick={() => download("Grafica.csv", pivotCsv(p, spec))}>Exportar CSV</button></header>

      {!facts && <div className="card t-card"><p className="caption">{progress ? `Preparando los datos… cuadernillo ${progress.done + 1} de ${progress.total}` : "Cargando la actividad de tus estudiantes…"}</p></div>}

      {facts && (
        <>
          <div className="d-kpis cb-kpis">
            <Kpi label="Respuestas en la gráfica" value={String(view.length)} hint={`de ${facts.length}`} />
            <Kpi label="Estudiantes" value={String(students)} />
            <Kpi label="% de aciertos" value={acc == null ? null : `${acc} %`} hint="Clave preliminar" />
            <Kpi label="Tiempo medio por pregunta" value={timed.length ? `${Math.round(timed.reduce((n, f) => n + f.sec, 0) / timed.length)} s` : null} />
          </div>
          {skipped > 0 && <p className="notice">No se pudieron cargar {skipped} cuadernillo(s); sus respuestas no aparecen en la gráfica.</p>}

          <div className="card t-card cb-gallery">
            {saved.length > 0 && (
              <div className="cb-gallery-row">
                <span className="label">Mis gráficas</span>
                <ul className="cb-saved" aria-label="Gráficas guardadas">
                  {saved.map((c) => (
                    <li key={c.id} className={JSON.stringify(cleanSpec(c.spec)) === JSON.stringify(spec) ? "on" : ""}>
                      <button type="button" className="cb-saved-open" onClick={() => open(c.spec)}><Icon name="chart" size={14} />{c.name}</button>
                      <button type="button" className="cb-saved-x" onClick={() => remove(c)} aria-label={`Borrar ${c.name}`}><Icon name="close" size={14} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="cb-gallery-row">
              <span className="label">Ejemplos</span>
              <div className="chips-row">{PRESETS.map((x) => <button key={x.name} type="button" className={JSON.stringify(cleanSpec(x.spec)) === JSON.stringify(spec) ? "chip on" : "chip"} onClick={() => open(x.spec)}>{x.name}</button>)}</div>
            </div>
            {local && <span className="caption">Las gráficas se guardan en este navegador hasta que se ejecute la migración 0015.</span>}
          </div>

          <div className="cb-layout">
            <div className="card t-card cb-result">
              <div className="cb-bar-head">
                <div className="segmented small" role="group" aria-label="Tipo de gráfica">
                  {CHARTS.map((c) => <button key={c.id} type="button" className={spec.chart === c.id ? "seg active" : "seg"} onClick={() => patch({ chart: c.id })}>{c.label}</button>)}
                </div>
                {chartKind === "bar" && !DIM[spec.rows].alpha && !DIM[spec.rows].time && !DIM[spec.rows].order && (
                  <Select value={spec.sort} onChange={(v) => patch({ sort: v })} aria-label="Orden">
                    <option value="value-asc">Menor a mayor</option><option value="value-desc">Mayor a menor</option><option value="name">Por nombre</option>
                  </Select>
                )}
              </div>
              <div className="cb-title"><strong>{describeSpec(spec)[0].toUpperCase() + describeSpec(spec).slice(1)}</strong>
              <button type="button" className="secondary cb-tune" aria-expanded={tune} aria-controls="cb-controls" onClick={() => setTune(!tune)}><Icon name="sliders" size={16} />{tune ? "Ocultar ajustes" : "Ajustar gráfica"}</button>
              </div>
              {noteHeat && <p className="notice">El mapa de calor necesita un campo en Columnas. Se muestra en barras.</p>}
              {p.rows.length === 0 ? (
                <p className="caption">No hay datos con estos filtros. Cuando tus estudiantes entreguen tareas aparecerán aquí; prueba quitar un filtro o ampliar el periodo.</p>
              ) : (
                <>
                  {lowest && p.rows.length > 1 && <p className="cb-callout"><Icon name="bolt" size={16} /> El valor más bajo es <strong>{label(spec.rows, lowest.r)}</strong> ({fmtVal(lowest.v, p.metric)}).</p>}
                  {chartKind === "bar" && <BarChart p={p} spec={spec} />}
                  {chartKind === "heat" && <Heatmap p={p} spec={spec} />}
                  {chartKind === "line" && <LineChart p={p} spec={spec} />}
                  {chartKind === "table" && <DataTable p={p} spec={spec} />}
                </>
              )}
              <span className="caption">Puntajes según la clave preliminar, no oficial. Pasa el cursor sobre una barra o punto para ver cuántas respuestas la respaldan.</span>

              <div className="cb-save">
                <input className="cb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre para guardar esta gráfica" aria-label="Nombre de la gráfica" maxLength={80} onKeyDown={(e) => e.key === "Enter" && save()} />
                <button type="button" className="secondary" disabled={!name.trim()} onClick={save}>Guardar</button>
              </div>
            </div>
            <div className={tune ? "card t-card cb-controls open" : "card t-card cb-controls"} id="cb-controls">
              <div className="cb-palette-wrap">
                <span className="label">Campos · arrástralos a una zona</span>
                <div className="cb-palette">
                  {DIMENSIONS.map((d) => <Field key={d.id} kind="dim" id={d.id} text={d.label} hint={d.hint} />)}
                </div>
                <div className="cb-palette">
                  {METRICS.map((m) => <Field key={m.id} kind="metric" id={m.id} text={m.label} hint={m.hint} />)}
                </div>
              </div>
              <Zone title="Filas" hint="Qué se compara" accepts="dim" onDrop={(id) => patch({ rows: id })}>
                <Select value={spec.rows} onChange={(v) => patch({ rows: v })} aria-label="Filas">{dimOptions()}</Select>
              </Zone>
              <Zone title="Columnas (opcional)" hint="Una segunda mirada: series o mapa de calor" accepts="dim" onDrop={(id) => patch({ cols: id })}>
                <Select value={spec.cols ?? ""} onChange={(v) => patch({ cols: v || null })} aria-label="Columnas">{dimOptions(<option value="">Ninguna</option>)}</Select>
              </Zone>
              <Zone title="Métrica" hint={METRICS.find((m) => m.id === spec.metric)?.hint ?? "Qué se mide"} accepts="metric" onDrop={(id) => patch({ metric: id })}>
                <Select value={spec.metric} onChange={(v) => patch({ metric: v })} aria-label="Métrica">{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
              </Zone>
              <Zone title="Filtros" hint="Deja solo lo que quieres ver" accepts="dim" onDrop={addFilterDim}>
                {Object.entries(spec.filters).map(([id, vals]) => <FilterRow key={id} facts={facts} id={id} selected={vals} onChange={(v) => setFilter(id, v)} onRemove={() => dropFilter(id)} />)}
                <Select value={addFilter} onChange={addFilterDim} aria-label="Agregar filtro" placeholder="＋ Agregar filtro">{dimOptions()}</Select>
              </Zone>
              <div>
                <span className="label">Periodo</span>
                <div className="segmented small" role="group" aria-label="Periodo">
                  {RANGES.map((r) => <button key={r.label} type="button" className={spec.range === r.days ? "seg active" : "seg"} onClick={() => patch({ range: r.days })}>{r.label}</button>)}
                </div>
              </div>
              <div>
                <span className="label">Mínimo de respuestas por barra</span>
                <div className="segmented small" role="group" aria-label="Mínimo de respuestas">
                  {[1, 5, 10, 20].map((n) => <button key={n} type="button" className={spec.minN === n ? "seg active" : "seg"} onClick={() => patch({ minN: n })}>{n}</button>)}
                </div>
                <span className="caption">Con pocas respuestas un promedio engaña. Lo que no llega al mínimo se muestra como «—».</span>
              </div>
            </div>

          </div>
        </>
      )}
    </>
  );
}
