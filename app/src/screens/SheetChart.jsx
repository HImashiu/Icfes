import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Select } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { AREA_COLORS } from "../lib/brand.js";
import { CATEGORY_TYPES, CHART_AGGS, CHART_TYPES, ONE_Y_TYPES, STYLE_DEFAULTS, autoTitle, chartData, defaultConfig, niceTicks, seriesMean, seriesTrend } from "../lib/sheetChart.js";

// Gráfica of the Hoja de datos, like the chart editor of Sheets: the chart sits in a panel beside the grid with a
// "Configurar" tab (type, data, aggregation) and a "Personalizar" tab (titles, legend, labels, axis range,
// reference and average lines, trend, colors). Drawn as plain SVG with resolved colors, so the downloaded file
// looks exactly like the screen. `compact` draws only the plot (dashboard tiles).

export const PALETTE = ["#5ED3B4", "#FFB547", "#8AB4FF", "#F59EC4", "#C79BFF", "#FF8A7A", "#9FC4A0", "#E0D060", "#6FC3E8", "#E8A06F", "#B0B8C0", "#D98BE0"];
const SWATCHES = ["#5ED3B4", "#2FA889", "#FFB547", "#E8833A", "#8AB4FF", "#3D6FD9", "#F59EC4", "#C79BFF", "#FF8A7A", "#D64545", "#9FC4A0", "#545E57"];
const colorFor = (name, i) => AREA_COLORS[name] ?? PALETTE[i % PALETTE.length];
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: d }));
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const W0 = 820, H0 = 420;
const isTrendOn = (cfg) => (cfg.trend === "auto" || cfg.trend == null ? cfg.type === "scatter" : !!cfg.trend);
const numOrNull = (v) => { const t = String(v ?? "").trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

export default function SheetChart({ rows, columns, selected = [], pivot = false, onClose, storeKey = null, preset = null, config = null, compact = false, onSave = null, onChange = null, tabs = null }) {
  const cardRef = useRef(null);
  const plotRef = useRef(null);
  const svgRef = useRef(null);
  const [cfg, setCfg] = useState(() => {
    const base = { ...STYLE_DEFAULTS, ...defaultConfig(columns, selected) };
    if (config) return { ...base, ...config };
    if (preset) return { ...base, ...preset };
    try { const s = storeKey ? JSON.parse(localStorage.getItem(storeKey) ?? "null") : null; if (s && columns.some((c) => c.id === s.x)) return { ...STYLE_DEFAULTS, ...s }; } catch { /* ignore */ }
    return base;
  });
  const [hover, setHover] = useState(null);
  const [full, setFull] = useState(false);
  const [tab, setTab] = useState("data");
  const [ink, setInk] = useState({ text: "#545E57", line: "#D8DED3", bg: "#FFFFFF", strong: "#121612", accent: "#E8833A" });
  // The chart draws at the size it has on screen, so its text stays readable in a narrow panel or a small tile.
  const [size, setSize] = useState({ w: W0, h: H0 });
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w < 40) return;
      const h = compact || full ? Math.round(el.clientHeight) : Math.round(Math.max(260, Math.min(460, w * 0.66)));
      setSize((s) => (s.w === w && s.h === h ? s : { w: Math.max(260, w), h: Math.max(150, h) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, full]);
  const VW = size.w, VH = size.h;

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  useEffect(() => { if (storeKey) { try { localStorage.setItem(storeKey, JSON.stringify(cfg)); } catch { /* storage blocked */ } } onChange?.(cfg); }, [cfg, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // A dashboard tile follows its saved recipe.
  useEffect(() => { if (config) setCfg((c) => ({ ...c, ...config })); }, [JSON.stringify(config)]); // eslint-disable-line react-hooks/exhaustive-deps
  // A pivot table, or new columns: start from its row field and its values.
  const colKey = columns.map((c) => c.id).join("|");
  useEffect(() => {
    setCfg((c) => {
      const ok = c.y.every((y) => columns.some((x) => x.id === y)) && (!c.x || columns.some((x) => x.id === c.x)) && (!c.series || columns.some((x) => x.id === c.series));
      if (ok && !pivot) return c;
      if (compact) return c;
      if (pivot) {
        const ys = columns.filter((x, i) => i > 0 && x.type === "num" && x.id !== "n" && x.id !== "Total").map((x) => x.id);
        return { ...c, x: columns[0]?.id, y: ["pie"].includes(c.type) ? ys.slice(0, 1) : ys.slice(0, 12), series: null, agg: "avg", type: ["scatter", "hist", "box"].includes(c.type) ? "bar" : c.type };
      }
      return { ...c, ...defaultConfig(columns, selected, c), ...pickStyle(c) };
    });
  }, [colKey, pivot]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    const v = (n, d) => root.getPropertyValue(n).trim() || d;
    setInk({ text: v("--text-2", "#545E57"), line: v("--line", "#D8DED3"), bg: v("--surface", "#fff"), strong: cs.color || "#121612", accent: "#E8833A" });
  }, [full]);
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  const data = useMemo(() => chartData(rows, cfg), [rows, cfg]);
  const num = columns.filter((c) => c.type === "num");
  const text = columns.filter((c) => c.type !== "num");
  const prefText = (text.find((c) => !["Estudiante", "Correo", "Actividad", "Fecha"].includes(c.id)) ?? text[0])?.id ?? null;
  const xOptions = (cfg.type === "scatter" ? num : cfg.type === "box" ? [{ id: "", name: "Todo junto" }, ...text] : text).map((c) => ({ value: c.id, label: c.name }));
  const aggLabel = CHART_AGGS.find((a) => a.id === cfg.agg)?.label ?? "";
  const title = cfg.title || (pivot ? `${cfg.y.length === 1 ? cfg.y[0] : cfg.y.slice(0, 3).join(", ") + (cfg.y.length > 3 ? "…" : "")} por ${cfg.x}` : autoTitle(cfg, aggLabel));
  const yTitle = cfg.yTitle || (cfg.type === "stacked100" ? "% del total" : cfg.type === "hist" ? "Filas" : pivot ? (cfg.y.length === 1 ? cfg.y[0] : "Valor") : cfg.y.length === 1 ? (cfg.type === "scatter" || cfg.type === "box" ? cfg.y[0] : `${aggLabel} de ${cfg.y[0]}`) : aggLabel);
  const xTitle = cfg.xTitle || (cfg.type === "hist" ? cfg.y[0] : cfg.x || "");
  const oneY = ONE_Y_TYPES.includes(cfg.type) || (cfg.series && !pivot);
  const isCat = CATEGORY_TYPES.includes(cfg.type);
  const toggleY = (id) => setCfg((c) => {
    if (oneY) return { ...c, y: [id] };
    const has = c.y.includes(id);
    const y = has ? c.y.filter((x) => x !== id) : [...c.y, id];
    return { ...c, y: y.length ? y : c.y };
  });
  const fromSelection = () => setCfg((c) => ({ ...c, ...defaultConfig(columns, selected, c), ...pickStyle(c), title: c.title, type: c.type }));
  const pickType = (id) => setCfg((c) => {
    const next = { ...c, type: id };
    if (id === "scatter" && !num.some((x) => x.id === c.x)) next.x = num.find((x) => !c.y.includes(x.id))?.id ?? num[0]?.id;
    if (id !== "scatter" && (num.some((x) => x.id === c.x) || !c.x)) next.x = pivot ? columns[0]?.id : prefText;
    if (ONE_Y_TYPES.includes(id)) next.y = c.y.slice(0, 1);
    if (id === "pie") { next.series = null; if (!["sum", "count"].includes(c.agg) && !pivot) next.agg = "count"; }
    if (c.type === "pie" && id !== "pie" && c.agg === "count") next.agg = "avg";
    if (id === "combo" && !pivot && c.y.length < 2 && !c.series) { const extra = num.find((x) => !c.y.includes(x.id) && x.id !== "n"); if (extra) next.y = [...c.y, extra.id]; }
    return next;
  });

  const toggleFull = async () => {
    if (full) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); setFull(false); return; }
    setFull(true);
    // Inside a sheet already in full screen the chart only takes the window; otherwise ask the browser.
    if (!document.fullscreenElement && cardRef.current?.requestFullscreen) await cardRef.current.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    if (!full) return undefined;
    const key = (e) => { if (e.key === "Escape" && !document.querySelector(".ui-pop")) { e.stopPropagation(); if (document.fullscreenElement === cardRef.current) document.exitFullscreen().catch(() => {}); setFull(false); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [full]);

  const svgText = () => {
    const svg = svgRef.current;
    if (!svg) return "";
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", VW * 2);
    clone.setAttribute("height", VH * 2);
    clone.querySelectorAll("[data-hover]").forEach((n) => n.removeAttribute("data-hover"));
    return new XMLSerializer().serializeToString(clone);
  };
  const fileName = (ext) => `${(title || "grafica").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.${ext}`;
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadSvg = () => save(new Blob([svgText()], { type: "image/svg+xml" }), fileName("svg"));
  const downloadPng = () => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText()], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: VW * 2, height: VH * 2 });
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, VW * 2, VH * 2);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => b && save(b, fileName("png")), "image/png");
    };
    img.src = url;
  };

  const tip = (e, lines) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
  };

  const showTitle = !compact;
  const svgEl = data && hasData(data) ? (
    <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} width="100%" height={compact || full ? "100%" : undefined} role="img" aria-label={title} className="sc-svg" style={{ fontFamily: "inherit" }} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={VW} height={VH} fill={ink.bg} />
      {showTitle && <text x={VW / 2} y="22" textAnchor="middle" fontSize="15" fontWeight="800" fill={ink.strong}>{cut(title, Math.floor(VW / 8.5))}</text>}
      <Plot data={data} cfg={cfg} ink={ink} tip={tip} clear={() => setHover(null)} xTitle={compact ? "" : xTitle} yTitle={compact ? "" : yTitle} W={VW} H={VH} compact={compact} top={showTitle ? 34 : 6} />
    </svg>
  ) : null;
  const tipEl = hover && (
    <div className="sc-tip" style={{ left: Math.max(0, Math.min(hover.x + 14, (plotRef.current?.clientWidth ?? 600) - 220)), top: hover.y + 14 }} role="status">
      {hover.lines.map((l, i) => <div key={i} className={i === 0 ? "sc-tip-h" : ""}>{l}</div>)}
    </div>
  );
  if (compact) {
    return (
      <div ref={cardRef} className="sc sc-compact" onMouseLeave={() => setHover(null)}>
        <div className="sc-plot" ref={plotRef}>{svgEl ?? <p className="caption sc-empty">Sin datos con estos filtros.</p>}{tipEl}</div>
      </div>
    );
  }

  const seriesNames = !data ? [] : data.kind === "pie" ? data.slices.map((s) => s.label) : data.kind === "category" ? (data.series.length === 1 && !data.hist ? data.labels : data.series.map((s) => s.name)) : data.kind === "scatter" ? data.groups : data.boxes.map((b) => b.label);
  const types = CHART_TYPES.filter((t) => !pivot || !["scatter", "hist", "box"].includes(t.id));
  const supportsLines = isCat && cfg.type !== "pie";
  const yOpts = num.filter((c) => c.id !== "n");

  return (
    <aside ref={cardRef} className={`sc sc-panel ${full ? "sc-full" : ""}`} aria-label="Editor de gráfica" onMouseLeave={() => setHover(null)}>
      <div className="sc-head">
        {tabs ?? <b className="sc-head-name">Gráfica</b>}
        <span className="hd-spacer" />
        {onSave && <button type="button" className="secondary sc-save" onClick={(e) => onSave(cfg, e.currentTarget.getBoundingClientRect())} title="Guardar esta gráfica en un tablero"><Icon name="plus" size={14} /> Al tablero</button>}
        <button type="button" className="icon-btn sc-tool" onClick={downloadPng} title="Descargar PNG" aria-label="Descargar PNG">PNG</button>
        <button type="button" className="icon-btn sc-tool" onClick={downloadSvg} title="Descargar SVG" aria-label="Descargar SVG">SVG</button>
        <button type="button" className="icon-btn sc-tool" onClick={toggleFull} title={full ? "Salir de pantalla completa" : "Pantalla completa"} aria-label="Pantalla completa"><Icon name="expand" size={16} /></button>
        {onClose && <button type="button" className="icon-btn sc-tool" onClick={onClose} aria-label="Cerrar gráfica" title="Cerrar"><Icon name="x" size={16} /></button>}
      </div>

      <div className="sc-plot" ref={plotRef}>
        {svgEl ?? <p className="caption sc-empty">{cfg.type === "scatter" ? "Elige dos columnas con números: una para cada eje." : "Elige una columna de categorías y al menos una de números."}</p>}
        {tipEl}
      </div>
      {data?.cut && <span className="caption">Se muestran las primeras {cfg.limit} categorías{data.total ? ` de ${data.total}` : ""}. Sube el límite, filtra la hoja u ordena por valor.</span>}
      {data?.kind === "scatter" && data.trend && isTrendOn(cfg) && <span className="caption">Tendencia: correlación r = {fmt(data.trend.r)} ({Math.abs(data.trend.r) >= 0.5 ? "fuerte" : Math.abs(data.trend.r) >= 0.3 ? "moderada" : "débil"}).</span>}

      {!full && (
        <div className="sc-edwrap">
          <div className="seg-tabs sc-tabs" role="tablist" aria-label="Editor">
            <button type="button" role="tab" aria-selected={tab === "data"} className={tab === "data" ? "on" : ""} onClick={() => setTab("data")}>Configurar</button>
            <button type="button" role="tab" aria-selected={tab === "style"} className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Personalizar</button>
          </div>

          {tab === "data" ? (
            <div className="sc-ed" role="tabpanel">
              <div className="sc-sec">
                <span className="label">Tipo de gráfica</span>
                <div className="sc-types" role="radiogroup" aria-label="Tipo de gráfica">
                  {types.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={cfg.type === t.id} className={`sc-type ${cfg.type === t.id ? "on" : ""}`} onClick={() => pickType(t.id)} title={t.label}>
                      <TypeIcon type={t.id} /><span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="sc-sec sc-grid2">
                {cfg.type !== "hist" && (
                  <label className="field"><span className="label">{cfg.type === "scatter" ? "Eje X (número)" : cfg.type === "box" ? "Cajas por" : cfg.type === "pie" ? "Porciones" : "Eje X (categorías)"}</span>
                    <Select aria-label="Eje X" value={cfg.x ?? ""} onChange={(v) => set({ x: v || null })} options={xOptions} /></label>
                )}
                {!["box", "pie"].includes(cfg.type) && <label className="field"><span className="label">Serie (color)</span>
                  <Select aria-label="Serie" value={cfg.series ?? ""} onChange={(v) => setCfg((c) => ({ ...c, series: v || null, y: v ? c.y.slice(0, 1) : c.y }))} options={[{ value: "", label: pivot ? "Las columnas" : "Ninguna" }, ...(pivot ? [] : text.filter((c) => c.id !== cfg.x).map((c) => ({ value: c.id, label: c.name })))]} disabled={pivot} /></label>}
                {isCat && !pivot && (
                  <label className="field"><span className="label">Agregar con</span>
                    <Select aria-label="Agregación" value={cfg.agg} onChange={(v) => set({ agg: v })} options={CHART_AGGS.map((a) => ({ value: a.id, label: a.label }))} /></label>
                )}
                {cfg.type === "hist" && (
                  <label className="field"><span className="label">Barras</span>
                    <Select aria-label="Número de barras" value={String(cfg.bins)} onChange={(v) => set({ bins: Number(v) })} options={[5, 8, 10, 12, 15, 20, 30, 40].map((n) => ({ value: String(n), label: `${n}` }))} /></label>
                )}
                {isCat && cfg.type !== "pie" && (
                  <label className="field"><span className="label">Orden</span>
                    <Select aria-label="Orden" value={cfg.sort} onChange={(v) => set({ sort: v })} options={[{ value: "label", label: "Por etiqueta" }, { value: "desc", label: "Mayor primero" }, { value: "asc", label: "Menor primero" }]} /></label>
                )}
                {(isCat || cfg.type === "box") && (
                  <label className="field"><span className="label">Máximo de categorías</span>
                    <Select aria-label="Máximo de categorías" value={String(cfg.limit)} onChange={(v) => set({ limit: Number(v) })} options={[5, 10, 15, 20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n}` }))} /></label>
                )}
              </div>
              <div className="sc-sec">
                <span className="label">{oneY ? "Valor (número)" : cfg.type === "combo" ? "Valores: el primero en barras, los demás en líneas" : "Valores (números)"}</span>
                <div className="sc-ychips">
                  {yOpts.map((c) => <button key={c.id} type="button" aria-pressed={cfg.y.includes(c.id)} className={`chip ${cfg.y.includes(c.id) ? "on" : ""}`} onClick={() => toggleY(c.id)}>{cfg.y.includes(c.id) && !oneY && cfg.y.length > 1 ? <b className="sc-ord">{cfg.y.indexOf(c.id) + 1}</b> : null}{c.name}</button>)}
                </div>
              </div>
              {selected.length > 0 && !pivot && <button type="button" className="secondary sc-sel" onClick={fromSelection}><Icon name="grid" size={14} /> Usar las columnas seleccionadas</button>}
              <p className="caption">La gráfica usa las filas que ves en la hoja: los filtros, el orden y la tabla dinámica se aplican.</p>
            </div>
          ) : (
            <div className="sc-ed" role="tabpanel">
              <div className="sc-sec">
                <span className="label">Títulos</span>
                <input className="sc-title" aria-label="Título de la gráfica" value={cfg.title || ""} placeholder={title} onChange={(e) => set({ title: e.target.value })} />
                {cfg.type !== "pie" && (
                  <div className="sc-grid2">
                    <input aria-label="Título del eje X" value={cfg.xTitle} placeholder={`Eje X: ${xTitle || "—"}`} onChange={(e) => set({ xTitle: e.target.value })} />
                    <input aria-label="Título del eje Y" value={cfg.yTitle} placeholder={`Eje Y: ${yTitle}`} onChange={(e) => set({ yTitle: e.target.value })} />
                  </div>
                )}
              </div>
              <Choice label="Leyenda" value={cfg.legend} onChange={(v) => set({ legend: v })} options={[["top", "Arriba"], ["bottom", "Abajo"], ["right", "Derecha"], ["none", "Ocultar"]]} />
              {cfg.type !== "scatter" && cfg.type !== "box" && <Choice label="Etiquetas de datos" value={cfg.labels} onChange={(v) => set({ labels: v })} options={[["auto", "Automáticas"], ["on", "Siempre"], ["off", "Nunca"]]} />}
              {cfg.type !== "pie" && (
                <div className="sc-sec">
                  <span className="label">{cfg.type === "hbar" ? "Eje de valores" : "Eje Y"}</span>
                  <div className="sc-grid2">
                    <NumInput label="Mínimo" value={cfg.yMin} onChange={(v) => set({ yMin: v })} placeholder="Automático" />
                    <NumInput label="Máximo" value={cfg.yMax} onChange={(v) => set({ yMax: v })} placeholder="Automático" />
                  </div>
                  <div className="sc-toggles">
                    <Toggle on={cfg.gridlines !== false} onChange={(v) => set({ gridlines: v })}>Líneas de cuadrícula</Toggle>
                    {(() => { const sc = cfg.type === "stacked100" || cfg.type === "hist" ? null : yOpts.find((x) => cfg.y.includes(x.id) && Array.isArray(x.scale))?.scale; return sc && (cfg.yMin !== sc[0] || cfg.yMax !== sc[1]) ? <button type="button" className="link" onClick={() => set({ yMin: sc[0], yMax: sc[1] })}>Usar la escala completa ({sc[0]}–{sc[1]})</button> : null; })()}
                  </div>
                </div>
              )}
              {cfg.type !== "pie" && cfg.type !== "hist" && (
                <div className="sc-sec">
                  <span className="label">Líneas de apoyo</span>
                  <div className="sc-grid2">
                    <NumInput label="Línea de meta" value={cfg.ref} onChange={(v) => set({ ref: v })} placeholder="p. ej. 60" />
                    <label className="field"><span className="label">Nombre de la meta</span><input value={cfg.refLabel ?? ""} placeholder="Meta" maxLength={30} onChange={(e) => set({ refLabel: e.target.value })} /></label>
                  </div>
                  <div className="sc-toggles">
                    {cfg.type !== "stacked100" && <Toggle on={!!cfg.avgLine} onChange={(v) => set({ avgLine: v })}>Línea de promedio</Toggle>}
                    {(cfg.type === "scatter" || (supportsLines && !["stacked", "stacked100", "hbar"].includes(cfg.type))) && <Toggle on={isTrendOn(cfg)} onChange={(v) => set({ trend: v })}>Línea de tendencia</Toggle>}
                    {["line", "area", "combo"].includes(cfg.type) && <Toggle on={!!cfg.smooth} onChange={(v) => set({ smooth: v })}>Líneas suaves</Toggle>}
                    {["line", "area", "combo"].includes(cfg.type) && <Toggle on={cfg.points !== false} onChange={(v) => set({ points: v })}>Puntos</Toggle>}
                  </div>
                </div>
              )}
              {cfg.type === "pie" && <div className="sc-toggles"><Toggle on={cfg.donut !== false} onChange={(v) => set({ donut: v })}>Anillo con el total en el centro</Toggle></div>}
              {seriesNames.length > 0 && (
                <div className="sc-sec">
                  <span className="label">Colores {Object.keys(cfg.colors ?? {}).length > 0 && <button type="button" className="link" onClick={() => set({ colors: {} })}>Restablecer</button>}</span>
                  <div className="sc-colors">
                    {seriesNames.slice(0, 12).map((name, i) => (
                      <ColorRow key={name} name={name} color={cfg.colors?.[name] ?? colorFor(name, i)} onPick={(c) => set({ colors: { ...(cfg.colors ?? {}), [name]: c } })} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

// Style fields carried over when the data part of the chart is reset.
function pickStyle(c) {
  const out = {};
  for (const k of Object.keys(STYLE_DEFAULTS)) if (c[k] !== undefined) out[k] = c[k];
  return out;
}

function Choice({ label, value, onChange, options }) {
  return (
    <div className="sc-sec">
      <span className="label">{label}</span>
      <div className="sc-choice" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={`chip ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}
function Toggle({ on, onChange, children }) {
  return <button type="button" role="switch" aria-checked={on} className={`sc-switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span className="sc-knob" aria-hidden="true" />{children}</button>;
}
function NumInput({ label, value, onChange, placeholder }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => { setText((t) => (numOrNull(t) === value ? t : value == null ? "" : String(value).replace(".", ","))); }, [value]);
  return (
    <label className="field"><span className="label">{label}</span>
      <input inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); const n = numOrNull(e.target.value); if (n != null || !e.target.value.trim()) onChange(n); }} />
    </label>
  );
}
function ColorRow({ name, color, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sc-color">
      <button type="button" className="sc-color-btn" aria-expanded={open} onClick={() => setOpen(!open)} title={`Color de ${name}`}>
        <span className="sc-dot" style={{ background: color }} /><span className="sc-color-name">{cut(name, 28)}</span>
      </button>
      {open && (
        <div className="sc-swatches" role="group" aria-label={`Colores para ${name}`}>
          {SWATCHES.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={c === color} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => { onPick(c); setOpen(false); }} />)}
        </div>
      )}
    </div>
  );
}

const hasData = (d) => (d.kind === "category" ? d.labels.length > 0 && d.series.length > 0 : d.kind === "scatter" ? d.points.length > 0 : d.kind === "pie" ? d.slices.length > 0 : d.boxes.length > 0);

function TypeIcon({ type }) {
  const p = {
    bar: "M4 20V10M10 20V4M16 20v-7", stacked: "M5 20v-9h5v9M5 15h5M14 20V6h5v14M14 12h5", stacked100: "M5 20V4h5v16M5 11h5M14 20V4h5v16M14 14h5",
    hbar: "M4 6h10M4 12h16M4 18h7", line: "M3 17l6-6 4 4 8-8", area: "M3 20V15l6-6 4 4 8-8v15z", combo: "M5 20v-6M11 20v-9M17 20v-4M3 10l6-4 5 3 7-5",
    pie: "M12 3a9 9 0 1 0 9 9h-9z M14 2.5V10h7.5A8 8 0 0 0 14 2.5z", scatter: "M6 16h.01M10 10h.01M15 13h.01M18 6h.01M8 7h.01", hist: "M3 20v-5h4v5M7 20V8h4v12M11 20V4h4v16M15 20v-9h4v9", box: "M7 7h10v10H7zM12 3v4M12 17v4M7 12h10",
  }[type];
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p} /></svg>;
}

// A path through points: straight segments, or a smooth curve (Catmull-Rom as Bézier).
function pathOf(pts, smooth) {
  if (!pts.length) return "";
  if (!smooth || pts.length < 3) return `M${pts.map((p) => p.join(",")).join("L")}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Legend items laid out in rows (top or bottom) or in a column (right).
function legendLayout(items, pos, maxW) {
  if (pos === "right") return { rows: items.length, width: Math.min(150, 26 + Math.max(...items.map((x) => Math.min(18, String(x.name).length))) * 6.4), items: items.map((it, i) => ({ ...it, x: 0, y: i * 18 })) };
  let x = 0, row = 0;
  const out = items.map((it) => {
    const w = 24 + Math.min(18, String(it.name).length) * 6.2;
    if (x > 0 && x + w > maxW) { x = 0; row += 1; }
    const p = { ...it, x, y: row * 18 };
    x += w;
    return p;
  });
  return { rows: row + 1, items: out };
}

// The plot area: axes, gridlines, marks, legend and the guide lines. Every mark reports its numbers to the tooltip.
function Plot({ data, cfg, ink, tip, clear, xTitle, yTitle, W, H, compact = false, top = 34 }) {
  const clipId = `sc-clip-${useId().replace(/:/g, "")}`;
  const colorOf = (name, i) => cfg.colors?.[name] ?? colorFor(name, i);
  const axisText = { fontSize: compact ? 10.5 : 11, fill: ink.text };
  const m = { l: compact ? 46 : 64, r: compact ? 12 : 18, t: top + 6, b: compact ? 40 : 70 };
  if (!xTitle) m.b -= compact ? 6 : 18;
  if (!yTitle) m.l -= compact ? 0 : 16;
  const horizontal = cfg.type === "hbar";
  if (horizontal) { m.l = compact ? 104 : 150; m.b = compact ? 26 : 50; }
  // Labels that fit flat need less room below the axis than rotated ones.
  const nCats = data.kind === "category" ? data.labels.length : data.kind === "box" ? data.boxes.length : 0;
  if (!horizontal && nCats && (W - m.l - m.r) / nCats >= 70) m.b -= compact ? 12 : 24;
  if (data.kind === "scatter") m.b -= compact ? 12 : 24;

  // Legend.
  const legendItems = data.kind === "pie" ? data.slices.map((s, i) => ({ name: s.label, color: colorOf(s.label, i) }))
    : data.kind === "category" && data.series.length > 1 ? data.series.map((s, i) => ({ name: s.name, color: colorOf(s.name, i), line: cfg.type === "combo" && i > 0 }))
    : data.kind === "scatter" && data.groups.length > 1 ? data.groups.map((g, i) => ({ name: g, color: colorOf(g, i) })) : [];
  const legendPos = legendItems.length && cfg.legend !== "none" ? (cfg.legend || "top") : null;
  let legend = null;
  if (legendPos === "right") { legend = legendLayout(legendItems.slice(0, 14), "right"); m.r += legend.width + 8; }
  else if (legendPos) { legend = legendLayout(legendItems.slice(0, 14), legendPos, W - m.l - m.r); if (legendPos === "top") m.t += legend.rows * 18 + 4; else m.b += legend.rows * 18 + 6; }
  const pw = Math.max(40, W - m.l - m.r), ph = Math.max(40, H - m.t - m.b);
  const legendEl = legend && (
    <g transform={`translate(${legendPos === "right" ? W - m.r + 12 : m.l}, ${legendPos === "right" ? m.t + 4 : legendPos === "top" ? top + 2 : H - legend.rows * 18 - 2})`}>
      {legend.items.map((it) => (
        <g key={it.name} transform={`translate(${it.x}, ${it.y})`}>
          {it.line ? <line x1="0" x2="12" y1="5" y2="5" stroke={it.color} strokeWidth="3" strokeLinecap="round" /> : <rect width="10" height="10" rx="2" fill={it.color} />}
          <text x="15" y="9" fontSize="11" fill={ink.text}>{cut(it.name, 18)}</text>
        </g>
      ))}
    </g>
  );

  if (data.kind === "pie") return <Pie data={data} cfg={cfg} ink={ink} tip={tip} clear={clear} colorOf={colorOf} box={{ x: m.l - (compact ? 40 : 50), y: m.t, w: pw + (compact ? 40 : 50), h: ph + (compact ? 30 : 40) }} legendEl={legendEl} compact={compact} />;

  // Value range: the data, the guide lines, then the teacher's own minimum and maximum.
  let lo = 0, hi = 1;
  const stacked = cfg.type === "stacked" || cfg.type === "stacked100" || (data.hist && data.series.length > 1);
  if (data.kind === "category") {
    const vals = stacked ? data.labels.map((_, i) => data.series.reduce((a, s) => a + (s.values[i] ?? 0), 0)) : data.series.flatMap((s) => s.values).filter((v) => v != null);
    lo = Math.min(0, ...vals); hi = Math.max(...vals, 0);
    if (cfg.type === "stacked100") { lo = 0; hi = 100; }
  } else if (data.kind === "scatter") {
    lo = Math.min(...data.points.map((p) => p.y)); hi = Math.max(...data.points.map((p) => p.y));
  } else {
    lo = Math.min(...data.boxes.map((b) => Math.min(b.lo, ...b.out))); hi = Math.max(...data.boxes.map((b) => Math.max(b.hi, ...b.out)));
  }
  const ref = cfg.type !== "hist" && typeof cfg.ref === "number" ? cfg.ref : null;
  const firstVals = data.kind === "category" ? data.series[0]?.values ?? [] : data.kind === "scatter" ? data.points.map((p) => p.y) : data.kind === "box" ? data.boxes.map((b) => b.mean) : [];
  const avg = cfg.avgLine && cfg.type !== "stacked100" && cfg.type !== "hist" ? seriesMean(firstVals) : null;
  if (ref != null) { lo = Math.min(lo, ref); hi = Math.max(hi, ref); }
  const ticks0 = niceTicks(typeof cfg.yMin === "number" ? cfg.yMin : lo, typeof cfg.yMax === "number" ? cfg.yMax : hi, ph < 160 ? 3 : 5);
  const ticks = ticks0.filter((t) => (typeof cfg.yMin !== "number" || t >= cfg.yMin - 1e-9) && (typeof cfg.yMax !== "number" || t <= cfg.yMax + 1e-9));
  const t0 = typeof cfg.yMin === "number" ? cfg.yMin : ticks[0], t1 = typeof cfg.yMax === "number" ? cfg.yMax : ticks[ticks.length - 1];
  const vy = (v) => m.t + ph - ((v - t0) / (t1 - t0 || 1)) * ph;
  const vx = (v) => m.l + ((v - t0) / (t1 - t0 || 1)) * pw;
  const unit = cfg.type === "stacked100" ? " %" : "";
  const grid = ticks.map((t) => horizontal
    ? <g key={t}>{cfg.gridlines !== false && <line x1={vx(t)} x2={vx(t)} y1={m.t} y2={m.t + ph} stroke={ink.line} strokeDasharray="3 4" />}<text x={vx(t)} y={m.t + ph + 16} textAnchor="middle" {...axisText}>{fmt(t)}{unit}</text></g>
    : <g key={t}>{cfg.gridlines !== false && <line x1={m.l} x2={m.l + pw} y1={vy(t)} y2={vy(t)} stroke={ink.line} strokeDasharray="3 4" />}<text x={m.l - 8} y={vy(t) + 4} textAnchor="end" {...axisText}>{fmt(t)}{unit}</text></g>);
  const clip = <clipPath id={clipId}><rect x={m.l - 6} y={m.t - 18} width={pw + 12 + (horizontal ? 40 : 0)} height={ph + 20} /></clipPath>;

  // Meta (reference) and average lines, drawn over the marks.
  const guide = (v, label, color, dash) => (horizontal
    ? <g key={label} pointerEvents="none"><line x1={vx(v)} x2={vx(v)} y1={m.t} y2={m.t + ph} stroke={color} strokeWidth="2" strokeDasharray={dash} /><text x={vx(v) + 4} y={m.t + 10} fontSize="10.5" fontWeight="700" fill={color}>{label}</text></g>
    : <g key={label} pointerEvents="none"><line x1={m.l} x2={m.l + pw} y1={vy(v)} y2={vy(v)} stroke={color} strokeWidth="2" strokeDasharray={dash} /><text x={dash === "6 4" ? m.l + 4 : m.l + pw - 4} y={vy(v) - 5} textAnchor={dash === "6 4" ? "start" : "end"} fontSize="10.5" fontWeight="700" fill={color} stroke={ink.bg} strokeWidth="3" paintOrder="stroke">{label}</text></g>);
  const guides = (
    <g clipPath={`url(#${clipId})`}>
      {ref != null && guide(ref, `${cfg.refLabel || "Meta"} ${fmt(ref)}`, ink.accent, "6 4")}
      {avg != null && guide(avg, `Promedio ${fmt(avg)}`, ink.strong, "2 4")}
    </g>
  );

  const yAxisTitle = yTitle ? <text transform={`translate(14, ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(yTitle, 50)}</text> : null;
  const xAxisTitle = xTitle ? <text x={m.l + pw / 2} y={legendPos === "bottom" ? H - legend.rows * 18 - 8 : H - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(xTitle, 60)}</text> : null;

  if (data.kind === "scatter") {
    const xs = data.points.map((p) => p.x);
    const xt = niceTicks(Math.min(...xs), Math.max(...xs), pw < 300 ? 4 : 6);
    const x0 = xt[0], x1 = xt[xt.length - 1];
    const px = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * pw;
    const r = data.points.length > 400 ? 3 : 4.5;
    return (
      <g onMouseLeave={clear}>
        {clip}{legendEl}{grid}
        {xt.map((t) => <text key={`x${t}`} x={px(t)} y={m.t + ph + 18} textAnchor="middle" {...axisText}>{fmt(t)}</text>)}
        <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke={ink.text} strokeOpacity="0.5" />
        <g clipPath={`url(#${clipId})`}>
          {data.trend && isTrendOn(cfg) && <line x1={px(x0)} x2={px(x1)} y1={vy(data.trend.m * x0 + data.trend.b)} y2={vy(data.trend.m * x1 + data.trend.b)} stroke={ink.text} strokeWidth="1.5" strokeDasharray="6 4" />}
          {data.points.map((p, i) => (
            <circle key={i} cx={px(p.x)} cy={vy(p.y)} r={r} fill={colorOf(p.s, data.groups.indexOf(p.s))} fillOpacity="0.75" stroke={ink.bg} strokeWidth="1"
              data-hover onMouseMove={(e) => tip(e, [String(p.label ?? ""), `${cfg.x}: ${fmt(p.x)}`, `${cfg.y[0]}: ${fmt(p.y)}`, ...(cfg.series ? [`${cfg.series}: ${p.s}`] : [])])} />
          ))}
        </g>
        {guides}{yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  if (data.kind === "box") {
    const n = data.boxes.length;
    const band = pw / n;
    const bw = Math.min(60, band * 0.55);
    return (
      <g onMouseLeave={clear}>
        {clip}{grid}
        <g clipPath={`url(#${clipId})`}>
          {data.boxes.map((b, i) => {
            const cx = m.l + band * i + band / 2;
            const c = colorOf(b.label, i);
            const lines = [b.label, `Mediana ${fmt(b.med)} · Promedio ${fmt(b.mean)}`, `Cuartiles ${fmt(b.q1)} – ${fmt(b.q3)}`, `Rango ${fmt(b.lo)} – ${fmt(b.hi)}`, `${b.n} filas${b.out.length ? ` · ${b.out.length} atípicos` : ""}`];
            return (
              <g key={b.label} data-hover onMouseMove={(e) => tip(e, lines)}>
                <line x1={cx} x2={cx} y1={vy(b.lo)} y2={vy(b.q1)} stroke={ink.text} />
                <line x1={cx} x2={cx} y1={vy(b.q3)} y2={vy(b.hi)} stroke={ink.text} />
                <line x1={cx - bw / 4} x2={cx + bw / 4} y1={vy(b.lo)} y2={vy(b.lo)} stroke={ink.text} />
                <line x1={cx - bw / 4} x2={cx + bw / 4} y1={vy(b.hi)} y2={vy(b.hi)} stroke={ink.text} />
                <rect x={cx - bw / 2} y={vy(b.q3)} width={bw} height={Math.max(1, vy(b.q1) - vy(b.q3))} rx="4" fill={c} fillOpacity="0.55" stroke={c} strokeWidth="2" />
                <line x1={cx - bw / 2} x2={cx + bw / 2} y1={vy(b.med)} y2={vy(b.med)} stroke={ink.strong} strokeWidth="2.5" />
                <circle cx={cx} cy={vy(b.mean)} r="3" fill={ink.bg} stroke={ink.strong} strokeWidth="1.5" />
                {b.out.map((v, k) => <circle key={k} cx={cx} cy={vy(v)} r="3" fill="none" stroke={c} strokeWidth="1.5" />)}
                <rect x={cx - band / 2} y={m.t} width={band} height={ph} fill="transparent" />
              </g>
            );
          })}
        </g>
        {data.boxes.map((b, i) => {
          const cx = m.l + band * i + band / 2;
          return band < 70 ? <text key={b.label} transform={`translate(${cx}, ${m.t + ph + 14}) rotate(-35)`} textAnchor="end" {...axisText}>{cut(b.label, 16)}</text>
            : <text key={b.label} x={cx} y={m.t + ph + 18} textAnchor="middle" {...axisText}>{cut(b.label, Math.max(6, Math.floor(band / 7)))}</text>;
        })}
        {guides}{yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  // Category charts.
  const { labels, series } = data;
  const n = labels.length;
  const band = (horizontal ? ph : pw) / n;
  const every = horizontal ? Math.max(1, Math.ceil(n / Math.floor(ph / 14))) : Math.max(1, Math.ceil(n / Math.floor(pw / 46)));
  const rot = !horizontal && band < 70;
  const catLabel = (i) => {
    if (i % every !== 0) return null;
    if (horizontal) return <text key={`l${i}`} x={m.l - 8} y={m.t + band * i + band / 2 + 4} textAnchor="end" {...axisText}>{cut(labels[i], compact ? 14 : 22)}</text>;
    const x = m.l + band * i + band / 2, y = m.t + ph + 14;
    return rot ? <text key={`l${i}`} transform={`translate(${x}, ${y}) rotate(-35)`} textAnchor="end" {...axisText}>{cut(labels[i], compact ? 10 : 16)}</text>
      : <text key={`l${i}`} x={x} y={y + 2} textAnchor="middle" {...axisText}>{cut(labels[i], Math.max(6, Math.floor(band / 7)))}</text>;
  };
  const raw = data.raw ?? series;
  const tipLines = (i) => [String(labels[i]), ...series.map((s, si) => `${s.name}: ${data.share ? `${fmt(s.values[i], 1)} % (${fmt(raw[si].values[i])})` : fmt(s.values[i])}`), ...(data.n?.[i] != null && !data.hist ? [`${data.n[i]} filas`] : [])];
  const hoverBands = labels.map((_, i) => (horizontal
    ? <rect key={`h${i}`} x={m.l} y={m.t + band * i} width={pw} height={band} fill="transparent" data-hover onMouseMove={(e) => tip(e, tipLines(i))} />
    : <rect key={`h${i}`} x={m.l + band * i} y={m.t} width={band} height={ph} fill="transparent" data-hover onMouseMove={(e) => tip(e, tipLines(i))} />));
  const cx = (i) => m.l + band * i + band / 2;
  const base = vy(Math.max(t0, Math.min(t1, 0)));
  const labelsOn = cfg.labels === "on" || (cfg.labels !== "off" && n * (stacked ? 1 : series.length) <= (compact ? 12 : 24));
  const trendOn = isTrendOn(cfg) && !horizontal && !stacked;
  const trendLines = trendOn ? series.slice(0, cfg.type === "combo" ? 1 : series.length).map((s, si) => {
    const t = seriesTrend(s.values);
    if (!t) return null;
    return <line key={`tr${si}`} x1={cx(0)} x2={cx(n - 1)} y1={vy(t.b)} y2={vy(t.m * (n - 1) + t.b)} stroke={colorOf(s.name, si)} strokeWidth="1.8" strokeDasharray="7 4" opacity="0.9" />;
  }) : null;

  const lineSeries = (list, offset = 0, fill = false) => list.map((s, k) => {
    const si = k + offset;
    const color = colorOf(s.name, si);
    const pts = s.values.map((v, i) => (v == null ? null : [cx(i), vy(v)])).filter(Boolean);
    const d = pathOf(pts, cfg.smooth);
    return (
      <g key={s.name}>
        {fill && pts.length > 1 && <path d={`${d}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`} fill={color} fillOpacity={list.length > 1 ? 0.18 : 0.28} />}
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {cfg.points !== false && pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r="3.5" fill={color} stroke={ink.bg} strokeWidth="1" />)}
        {labelsOn && s.values.map((v, i) => (v == null ? null : <text key={`v${i}`} x={cx(i)} y={vy(v) - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill={ink.text} stroke={ink.bg} strokeWidth="3" paintOrder="stroke">{fmt(v, 1)}</text>))}
      </g>
    );
  });

  if (cfg.type === "line" || cfg.type === "area") {
    return (
      <g onMouseLeave={clear}>
        {clip}{legendEl}{grid}
        <g clipPath={`url(#${clipId})`}>{lineSeries(series, 0, cfg.type === "area")}{trendLines}</g>
        {hoverBands}
        {labels.map((_, i) => catLabel(i))}
        {guides}{yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  // Bars (also the bar part of a combined chart).
  const barSeries = cfg.type === "combo" ? series.slice(0, 1) : series;
  const inner = data.hist ? band * 0.96 : band * 0.72;
  const k = stacked ? 1 : barSeries.length;
  const bwid = inner / k;
  const bars = [];
  labels.forEach((_, i) => {
    let acc = 0;
    barSeries.forEach((s, si) => {
      const v = s.values[i];
      if (v == null) return;
      const color = barSeries.length === 1 && series.length === 1 && !data.hist ? (cfg.colors?.[labels[i]] ?? AREA_COLORS[labels[i]] ?? colorOf(s.name, si)) : colorOf(s.name, si);
      const from = stacked ? acc : 0;
      const to = stacked ? acc + v : v;
      acc = to;
      const off = band * i + (band - inner) / 2 + (stacked ? 0 : bwid * si);
      const shown = data.share ? `${fmt(v, 0)} %` : fmt(v, 1);
      if (horizontal) {
        const x0 = vx(Math.min(from, to)), x1 = vx(Math.max(from, to));
        bars.push(<rect key={`${i}-${si}`} x={x0} y={m.t + off} width={Math.max(1, x1 - x0)} height={Math.max(1, bwid - 2)} rx="3" fill={color} />);
        if (labelsOn && !stacked) bars.push(<text key={`t${i}-${si}`} x={x1 + 4} y={m.t + off + bwid / 2 + 3} fontSize="10" fontWeight="700" fill={ink.text}>{shown}</text>);
        if (labelsOn && stacked && x1 - x0 > 30) bars.push(<text key={`t${i}-${si}`} x={(x0 + x1) / 2} y={m.t + off + bwid / 2 + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#121612">{shown}</text>);
      } else {
        const y0 = vy(Math.max(from, to)), y1 = vy(Math.min(from, to));
        bars.push(<rect key={`${i}-${si}`} x={m.l + off} y={y0} width={Math.max(1, bwid - (data.hist ? 0 : 2))} height={Math.max(1, y1 - y0)} rx={data.hist ? 0 : 3} fill={color} />);
        if (labelsOn && !stacked && bwid > 16) bars.push(<text key={`t${i}-${si}`} x={m.l + off + bwid / 2} y={y0 - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={ink.text}>{shown}</text>);
        if (labelsOn && stacked && y1 - y0 > 14 && bwid > 22) bars.push(<text key={`t${i}-${si}`} x={m.l + off + bwid / 2} y={(y0 + y1) / 2 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#121612">{shown}</text>);
      }
    });
  });
  return (
    <g onMouseLeave={clear}>
      {clip}{legendEl}{grid}
      {horizontal ? <line x1={vx(Math.max(t0, 0))} x2={vx(Math.max(t0, 0))} y1={m.t} y2={m.t + ph} stroke={ink.text} strokeOpacity="0.5" /> : <line x1={m.l} x2={m.l + pw} y1={base} y2={base} stroke={ink.text} strokeOpacity="0.5" />}
      <g clipPath={`url(#${clipId})`}>
        {bars}
        {cfg.type === "combo" && lineSeries(series.slice(1), 1)}
        {trendLines}
      </g>
      {hoverBands}
      {labels.map((_, i) => catLabel(i))}
      {guides}
      {horizontal ? (yTitle ? <text x={m.l + pw / 2} y={H - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(yTitle, 60)}</text> : null) : <>{yAxisTitle}{xAxisTitle}</>}
    </g>
  );
}

// Pie or donut: slices clockwise from the top, biggest first; labels on slices of 5 % or more.
function Pie({ data, cfg, ink, tip, clear, colorOf, box, legendEl, compact }) {
  const r = Math.max(30, Math.min(box.w, box.h) / 2 - 6);
  const c = [box.x + box.w / 2, box.y + box.h / 2 - 4];
  const ri = cfg.donut !== false ? r * 0.58 : 0;
  let a = -Math.PI / 2;
  const pt = (ang, rad) => [c[0] + Math.cos(ang) * rad, c[1] + Math.sin(ang) * rad];
  const labelsOn = cfg.labels !== "off";
  return (
    <g onMouseLeave={clear}>
      {legendEl}
      {data.slices.map((s, i) => {
        const span = (s.share / 100) * Math.PI * 2;
        const a0 = a, a1 = a + span;
        a = a1;
        const big = span > Math.PI ? 1 : 0;
        const color = colorOf(s.label, i);
        const lines = [s.label, `${data.name}: ${fmt(s.value)}`, `${fmt(s.share, 1)} % del total`, `${s.n} filas${s.others ? ` · ${s.others} categorías juntas` : ""}`];
        const whole = span >= Math.PI * 2 - 1e-6;
        const d = whole
          ? `M${c[0] - r},${c[1]}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0${ri ? `M${c[0] - ri},${c[1]}a${ri},${ri} 0 1,1 ${2 * ri},0a${ri},${ri} 0 1,1 ${-2 * ri},0` : ""}`
          : ri
            ? `M${pt(a0, r).join(",")}A${r},${r} 0 ${big},1 ${pt(a1, r).join(",")}L${pt(a1, ri).join(",")}A${ri},${ri} 0 ${big},0 ${pt(a0, ri).join(",")}Z`
            : `M${c.join(",")}L${pt(a0, r).join(",")}A${r},${r} 0 ${big},1 ${pt(a1, r).join(",")}Z`;
        const mid = pt((a0 + a1) / 2, ri ? (r + ri) / 2 : r * 0.64);
        return (
          <g key={s.label} data-hover onMouseMove={(e) => tip(e, lines)}>
            <path d={d} fill={color} stroke={ink.bg} strokeWidth="2" fillRule="evenodd" />
            {labelsOn && s.share >= (compact ? 8 : 5) && <text x={mid[0]} y={mid[1] + 4} textAnchor="middle" fontSize={compact ? 10 : 11.5} fontWeight="800" fill="#121612">{fmt(s.share, 0)} %</text>}
          </g>
        );
      })}
      {ri > 0 && (
        <g pointerEvents="none">
          <text x={c[0]} y={c[1] + 2} textAnchor="middle" fontSize={Math.max(14, Math.min(28, ri * 0.42))} fontWeight="800" fill={ink.strong}>{fmt(data.total, 1)}</text>
          <text x={c[0]} y={c[1] + 18} textAnchor="middle" fontSize="10.5" fill={ink.text}>{cut(data.name, 22)}</text>
        </g>
      )}
    </g>
  );
}
