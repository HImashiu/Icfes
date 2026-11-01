import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Select } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { AREA_COLORS } from "../lib/brand.js";
import { CHART_AGGS, CHART_TYPES, autoTitle, chartData, defaultConfig, niceTicks } from "../lib/sheetChart.js";

// Gráfica of the Hoja de datos: chart types, axes and series chosen from the columns (or the selected cells),
// aggregation, editable titles, tooltips, PNG/SVG download and full screen. Drawn as plain SVG with resolved colors,
// so the downloaded file looks exactly like the screen.
const PALETTE = ["#5ED3B4", "#FFB547", "#8AB4FF", "#F59EC4", "#C79BFF", "#FF8A7A", "#9FC4A0", "#E0D060", "#6FC3E8", "#E8A06F", "#B0B8C0", "#D98BE0"];
const colorFor = (name, i) => AREA_COLORS[name] ?? PALETTE[i % PALETTE.length];
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: d }));
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const W = 820, H = 420;

export default function SheetChart({ rows, columns, selected = [], pivot = false, onClose, storeKey, preset = null }) {
  const cardRef = useRef(null);
  const plotRef = useRef(null);
  const svgRef = useRef(null);
  const [cfg, setCfg] = useState(() => {
    if (preset) return { ...defaultConfig(columns, selected), ...preset };
    try { const s = JSON.parse(localStorage.getItem(storeKey) ?? "null"); if (s && columns.some((c) => c.id === s.x)) return s; } catch { /* ignore */ }
    return defaultConfig(columns, selected);
  });
  const [hover, setHover] = useState(null);
  const [full, setFull] = useState(false);
  const [ink, setInk] = useState({ text: "#545E57", line: "#D8DED3", bg: "#FFFFFF", strong: "#121612" });
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(cfg)); } catch { /* storage blocked */ } }, [cfg, storeKey]);
  // A pivot table, or new columns: start from its row field and its values.
  const colKey = columns.map((c) => c.id).join("|");
  useEffect(() => {
    setCfg((c) => {
      const ok = c.y.every((y) => columns.some((x) => x.id === y)) && (!c.x || columns.some((x) => x.id === c.x)) && (!c.series || columns.some((x) => x.id === c.series));
      if (ok && !pivot) return c;
      if (pivot) {
        const ys = columns.filter((x, i) => i > 0 && x.type === "num" && x.id !== "n" && x.id !== "Total").map((x) => x.id);
        return { ...c, x: columns[0]?.id, y: ys.slice(0, 12), series: null, agg: "avg", type: ["scatter", "hist", "box"].includes(c.type) ? "bar" : c.type };
      }
      return { ...defaultConfig(columns, selected, c) };
    });
  }, [colKey, pivot]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    setInk({ text: root.getPropertyValue("--text-2").trim() || "#545E57", line: root.getPropertyValue("--line").trim() || "#D8DED3", bg: root.getPropertyValue("--surface").trim() || "#fff", strong: cs.color || "#121612" });
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
  const yTitle = cfg.yTitle || (cfg.type === "hist" ? "Filas" : pivot ? (cfg.y.length === 1 ? cfg.y[0] : "Valor") : cfg.y.length === 1 ? (cfg.type === "scatter" || cfg.type === "box" ? cfg.y[0] : `${aggLabel} de ${cfg.y[0]}`) : aggLabel);
  const xTitle = cfg.xTitle || (cfg.type === "hist" ? cfg.y[0] : cfg.x || "");
  const oneY = ["scatter", "hist", "box"].includes(cfg.type) || (cfg.series && !pivot);
  const toggleY = (id) => setCfg((c) => {
    if (oneY) return { ...c, y: [id] };
    const has = c.y.includes(id);
    const y = has ? c.y.filter((x) => x !== id) : [...c.y, id];
    return { ...c, y: y.length ? y : c.y };
  });
  const fromSelection = () => setCfg((c) => ({ ...defaultConfig(columns, selected, c), title: c.title, type: c.type }));

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
    clone.setAttribute("width", W * 2);
    clone.setAttribute("height", H * 2);
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
      const canvas = Object.assign(document.createElement("canvas"), { width: W * 2, height: H * 2 });
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W * 2, H * 2);
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

  return (
    <div ref={cardRef} className={`card t-card hd-chart sc ${full ? "sc-full" : ""}`} onMouseLeave={() => setHover(null)}>
      <div className="sc-types" role="radiogroup" aria-label="Tipo de gráfica">
        {CHART_TYPES.filter((t) => !pivot || !["scatter", "hist", "box"].includes(t.id)).map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={cfg.type === t.id} className={`chip ${cfg.type === t.id ? "on" : ""}`}
            onClick={() => setCfg((c) => {
              const next = { ...c, type: t.id };
              if (t.id === "scatter" && !num.some((x) => x.id === c.x)) next.x = num.find((x) => !c.y.includes(x.id))?.id ?? num[0]?.id;
              if (t.id !== "scatter" && (num.some((x) => x.id === c.x) || !c.x)) next.x = pivot ? columns[0]?.id : prefText;
              if (["scatter", "hist", "box"].includes(t.id)) next.y = c.y.slice(0, 1);
              return next;
            })}>
            <TypeIcon type={t.id} /> {t.label}
          </button>
        ))}
        <span className="hd-spacer" />
        {selected.length > 0 && !pivot && <button type="button" className="link" onClick={fromSelection}>Usar la selección</button>}
        <button type="button" className="icon-btn sc-tool" onClick={downloadPng} title="Descargar PNG" aria-label="Descargar PNG">PNG</button>
        <button type="button" className="icon-btn sc-tool" onClick={downloadSvg} title="Descargar SVG" aria-label="Descargar SVG">SVG</button>
        <button type="button" className="icon-btn sc-tool" onClick={toggleFull} title={full ? "Salir de pantalla completa" : "Pantalla completa"} aria-label="Pantalla completa"><Icon name="expand" size={16} /></button>
        {onClose && <button type="button" className="icon-btn sc-tool" onClick={onClose} aria-label="Cerrar gráfica"><Icon name="x" size={16} /></button>}
      </div>

      <div className="sc-cfg">
        {cfg.type !== "hist" && (
          <label className="field"><span className="label">{cfg.type === "scatter" ? "Eje X (número)" : cfg.type === "box" ? "Cajas por" : "Eje X (categorías)"}</span>
            <Select aria-label="Eje X" value={cfg.x ?? ""} onChange={(v) => set({ x: v || null })} options={xOptions} /></label>
        )}
        {cfg.type !== "box" && <label className="field"><span className="label">Serie (color)</span>
          <Select aria-label="Serie" value={cfg.series ?? ""} onChange={(v) => setCfg((c) => ({ ...c, series: v || null, y: v ? c.y.slice(0, 1) : c.y }))} options={[{ value: "", label: pivot ? "Las columnas" : "Ninguna" }, ...(pivot ? [] : text.filter((c) => c.id !== cfg.x).map((c) => ({ value: c.id, label: c.name })))]} disabled={pivot} /></label>}
        {["bar", "stacked", "hbar", "line"].includes(cfg.type) && !pivot && (
          <label className="field"><span className="label">Agregar con</span>
            <Select aria-label="Agregación" value={cfg.agg} onChange={(v) => set({ agg: v })} options={CHART_AGGS.map((a) => ({ value: a.id, label: a.label }))} /></label>
        )}
        {cfg.type === "hist" && (
          <label className="field"><span className="label">Barras</span>
            <Select aria-label="Número de barras" value={String(cfg.bins)} onChange={(v) => set({ bins: Number(v) })} options={[5, 8, 10, 15, 20, 30].map((n) => ({ value: String(n), label: `${n}` }))} /></label>
        )}
        {["bar", "stacked", "hbar", "line"].includes(cfg.type) && (
          <label className="field"><span className="label">Orden</span>
            <Select aria-label="Orden" value={cfg.sort} onChange={(v) => set({ sort: v })} options={[{ value: "label", label: "Por etiqueta" }, { value: "desc", label: "Mayor primero" }, { value: "asc", label: "Menor primero" }]} /></label>
        )}
        <div className="field sc-y"><span className="label">{oneY ? "Valor (número)" : "Valores (números)"}</span>
          <div className="sc-ychips">
            {num.filter((c) => c.id !== "n").map((c) => <button key={c.id} type="button" aria-pressed={cfg.y.includes(c.id)} className={`chip ${cfg.y.includes(c.id) ? "on" : ""}`} onClick={() => toggleY(c.id)}>{c.name}</button>)}
          </div>
        </div>
      </div>

      <div className="sc-titles">
        <input className="sc-title" aria-label="Título de la gráfica" value={cfg.title || ""} placeholder={title} onChange={(e) => set({ title: e.target.value })} />
        <input aria-label="Título del eje X" value={cfg.xTitle} placeholder={`Eje X: ${xTitle || "—"}`} onChange={(e) => set({ xTitle: e.target.value })} />
        <input aria-label="Título del eje Y" value={cfg.yTitle} placeholder={`Eje Y: ${yTitle}`} onChange={(e) => set({ yTitle: e.target.value })} />
      </div>

      <div className="sc-plot" ref={plotRef}>
        {data && hasData(data) ? (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} className="sc-svg" style={{ fontFamily: "inherit" }}>
            <rect x="0" y="0" width={W} height={H} fill={ink.bg} />
            <text x={W / 2} y="22" textAnchor="middle" fontSize="15" fontWeight="800" fill={ink.strong}>{cut(title, 90)}</text>
            <Plot data={data} cfg={cfg} ink={ink} tip={tip} clear={() => setHover(null)} xTitle={xTitle} yTitle={yTitle} />
          </svg>
        ) : <p className="caption sc-empty">{cfg.type === "scatter" ? "Elige dos columnas con números: una para cada eje." : "Elige una columna de categorías y al menos una de números."}</p>}
        {hover && (
          <div className="sc-tip" style={{ left: Math.max(0, Math.min(hover.x + 14, (plotRef.current?.clientWidth ?? 600) - 220)), top: hover.y + 14 }} role="status">
            {hover.lines.map((l, i) => <div key={i} className={i === 0 ? "sc-tip-h" : ""}>{l}</div>)}
          </div>
        )}
      </div>
      {data?.cut && <span className="caption">Se muestran las primeras {cfg.limit} categorías{data.total ? ` de ${data.total}` : ""}. Filtra la hoja u ordena por valor para elegir cuáles.</span>}
      {data?.kind === "scatter" && data.trend && <span className="caption">Línea de tendencia: correlación r = {fmt(data.trend.r)} ({Math.abs(data.trend.r) >= 0.5 ? "fuerte" : Math.abs(data.trend.r) >= 0.3 ? "moderada" : "débil"}).</span>}
    </div>
  );
}

const hasData = (d) => (d.kind === "category" ? d.labels.length > 0 && d.series.length > 0 : d.kind === "scatter" ? d.points.length > 0 : d.boxes.length > 0);

function TypeIcon({ type }) {
  const p = { bar: "M4 20V10M10 20V4M16 20v-7", stacked: "M5 20v-9h5v9M5 15h5M14 20V6h5v14M14 12h5", hbar: "M4 6h10M4 12h16M4 18h7", line: "M3 17l6-6 4 4 8-8", scatter: "M6 16h.01M10 10h.01M15 13h.01M18 6h.01M8 7h.01", hist: "M3 20v-5h4v5M7 20V8h4v12M11 20V4h4v16M15 20v-9h4v9", box: "M7 7h10v10H7zM12 3v4M12 17v4M7 12h10" }[type];
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p} /></svg>;
}

// The plot area: axes, gridlines, marks and a legend. Every mark reports its numbers to the tooltip.
function Plot({ data, cfg, ink, tip, clear, xTitle, yTitle }) {
  const m = { l: 64, r: 18, t: 40, b: 78 };
  const legend = data.kind === "category" && data.series.length > 1 ? data.series.map((s) => s.name) : data.kind === "scatter" && data.groups.length > 1 ? data.groups : [];
  if (legend.length) m.t = 62;
  const horizontal = cfg.type === "hbar";
  if (horizontal) { m.l = 150; m.b = 50; }
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const axisText = { fontSize: 11, fill: ink.text };

  // Value range.
  let lo = 0, hi = 1;
  if (data.kind === "category") {
    const stacked = cfg.type === "stacked" || data.hist && data.series.length > 1;
    const vals = stacked ? data.labels.map((_, i) => data.series.reduce((a, s) => a + (s.values[i] ?? 0), 0)) : data.series.flatMap((s) => s.values).filter((v) => v != null);
    lo = Math.min(0, ...vals); hi = Math.max(...vals, 0);
  } else if (data.kind === "scatter") {
    lo = Math.min(...data.points.map((p) => p.y)); hi = Math.max(...data.points.map((p) => p.y));
  } else {
    lo = Math.min(...data.boxes.map((b) => Math.min(b.lo, ...b.out))); hi = Math.max(...data.boxes.map((b) => Math.max(b.hi, ...b.out)));
  }
  const ticks = niceTicks(lo, hi);
  const t0 = ticks[0], t1 = ticks[ticks.length - 1];
  const vy = (v) => m.t + ph - ((v - t0) / (t1 - t0 || 1)) * ph;
  const vx = (v) => m.l + ((v - t0) / (t1 - t0 || 1)) * pw;

  const legendEl = legend.length > 0 && (
    <g transform={`translate(${m.l}, 36)`}>
      {legend.slice(0, 12).reduce((acc, name, i) => {
        const x = acc.x;
        acc.items.push(<g key={name} transform={`translate(${x}, 0)`}><rect width="10" height="10" rx="2" fill={colorFor(name, i)} /><text x="14" y="9" fontSize="11" fill={ink.text}>{cut(name, 18)}</text></g>);
        acc.x += 24 + Math.min(18, String(name).length) * 6.2;
        return acc;
      }, { x: 0, items: [] }).items}
    </g>
  );
  const yAxisTitle = <text transform={`translate(16, ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(yTitle, 50)}</text>;
  const xAxisTitle = <text x={m.l + pw / 2} y={H - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(xTitle, 60)}</text>;

  if (data.kind === "scatter") {
    const xs = data.points.map((p) => p.x);
    const xt = niceTicks(Math.min(...xs), Math.max(...xs));
    const x0 = xt[0], x1 = xt[xt.length - 1];
    const px = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * pw;
    return (
      <g onMouseLeave={clear}>
        {legendEl}
        {ticks.map((t) => <g key={`y${t}`}><line x1={m.l} x2={m.l + pw} y1={vy(t)} y2={vy(t)} stroke={ink.line} strokeDasharray="3 4" /><text x={m.l - 8} y={vy(t) + 4} textAnchor="end" {...axisText}>{fmt(t)}</text></g>)}
        {xt.map((t) => <text key={`x${t}`} x={px(t)} y={m.t + ph + 18} textAnchor="middle" {...axisText}>{fmt(t)}</text>)}
        <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke={ink.text} strokeOpacity="0.5" />
        <clipPath id="sc-clip"><rect x={m.l} y={m.t} width={pw} height={ph} /></clipPath>
        {data.trend && <line clipPath="url(#sc-clip)" x1={px(x0)} x2={px(x1)} y1={vy(data.trend.m * x0 + data.trend.b)} y2={vy(data.trend.m * x1 + data.trend.b)} stroke={ink.text} strokeWidth="1.5" strokeDasharray="6 4" />}
        {data.points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={vy(p.y)} r="4.5" fill={colorFor(p.s, data.groups.indexOf(p.s))} fillOpacity="0.75" stroke={ink.bg} strokeWidth="1"
            data-hover onMouseMove={(e) => tip(e, [String(p.label ?? ""), `${cfg.x}: ${fmt(p.x)}`, `${cfg.y[0]}: ${fmt(p.y)}`, ...(cfg.series ? [`${cfg.series}: ${p.s}`] : [])])} />
        ))}
        {yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  if (data.kind === "box") {
    const n = data.boxes.length;
    const band = pw / n;
    const bw = Math.min(60, band * 0.55);
    return (
      <g onMouseLeave={clear}>
        {ticks.map((t) => <g key={t}><line x1={m.l} x2={m.l + pw} y1={vy(t)} y2={vy(t)} stroke={ink.line} strokeDasharray="3 4" /><text x={m.l - 8} y={vy(t) + 4} textAnchor="end" {...axisText}>{fmt(t)}</text></g>)}
        {data.boxes.map((b, i) => {
          const cx = m.l + band * i + band / 2;
          const c = colorFor(b.label, i);
          const lines = [b.label, `Mediana ${fmt(b.med)} · Promedio ${fmt(b.mean)}`, `Cuartiles ${fmt(b.q1)} – ${fmt(b.q3)}`, `Rango ${fmt(b.lo)} – ${fmt(b.hi)}`, `${b.n} filas${b.out.length ? ` · ${b.out.length} atípicos` : ""}`];
          return (
            <g key={b.label} data-hover onMouseMove={(e) => tip(e, lines)}>
              <line x1={cx} x2={cx} y1={vy(b.lo)} y2={vy(b.q1)} stroke={ink.text} />
              <line x1={cx} x2={cx} y1={vy(b.q3)} y2={vy(b.hi)} stroke={ink.text} />
              <line x1={cx - bw / 4} x2={cx + bw / 4} y1={vy(b.lo)} y2={vy(b.lo)} stroke={ink.text} />
              <line x1={cx - bw / 4} x2={cx + bw / 4} y1={vy(b.hi)} y2={vy(b.hi)} stroke={ink.text} />
              <rect x={cx - bw / 2} y={vy(b.q3)} width={bw} height={Math.max(1, vy(b.q1) - vy(b.q3))} rx="4" fill={c} fillOpacity="0.55" stroke={c} strokeWidth="2" />
              <line x1={cx - bw / 2} x2={cx + bw / 2} y1={vy(b.med)} y2={vy(b.med)} stroke={ink.strong} strokeWidth="2.5" />
              {b.out.map((v, k) => <circle key={k} cx={cx} cy={vy(v)} r="3" fill="none" stroke={c} strokeWidth="1.5" />)}
              <rect x={cx - band / 2} y={m.t} width={band} height={ph} fill="transparent" />
              {band < 70 ? <text transform={`translate(${cx}, ${m.t + ph + 14}) rotate(-35)`} textAnchor="end" {...axisText}>{cut(b.label, 16)}</text>
                : <text x={cx} y={m.t + ph + 18} textAnchor="middle" {...axisText}>{cut(b.label, Math.max(6, Math.floor(band / 7)))}</text>}
            </g>
          );
        })}
        {yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  // Category charts.
  const { labels, series } = data;
  const n = labels.length;
  const stacked = cfg.type === "stacked" || (data.hist && series.length > 1);
  const grid = ticks.map((t) => horizontal
    ? <g key={t}><line x1={vx(t)} x2={vx(t)} y1={m.t} y2={m.t + ph} stroke={ink.line} strokeDasharray="3 4" /><text x={vx(t)} y={m.t + ph + 16} textAnchor="middle" {...axisText}>{fmt(t)}</text></g>
    : <g key={t}><line x1={m.l} x2={m.l + pw} y1={vy(t)} y2={vy(t)} stroke={ink.line} strokeDasharray="3 4" /><text x={m.l - 8} y={vy(t) + 4} textAnchor="end" {...axisText}>{fmt(t)}</text></g>);
  const band = (horizontal ? ph : pw) / n;
  const every = horizontal ? 1 : Math.max(1, Math.ceil(n / Math.floor(pw / 46)));
  const rot = !horizontal && band < 70;
  const catLabel = (i) => {
    if (horizontal) return <text key={`l${i}`} x={m.l - 8} y={m.t + band * i + band / 2 + 4} textAnchor="end" {...axisText}>{cut(labels[i], 22)}</text>;
    if (i % every !== 0) return null;
    const x = m.l + band * i + band / 2, y = m.t + ph + 14;
    return rot ? <text key={`l${i}`} transform={`translate(${x}, ${y}) rotate(-35)`} textAnchor="end" {...axisText}>{cut(labels[i], 16)}</text>
      : <text key={`l${i}`} x={x} y={y + 2} textAnchor="middle" {...axisText}>{cut(labels[i], Math.max(6, Math.floor(band / 7)))}</text>;
  };
  const tipLines = (i) => [String(labels[i]), ...series.map((s) => `${s.name}: ${fmt(s.values[i])}`), ...(data.n?.[i] != null && !data.hist ? [`${data.n[i]} filas`] : [])];

  if (cfg.type === "line") {
    const x = (i) => m.l + band * i + band / 2;
    return (
      <g onMouseLeave={clear}>
        {legendEl}{grid}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), vy(v)])).filter(Boolean);
          return <g key={s.name}><polyline fill="none" stroke={colorFor(s.name, si)} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => p.join(",")).join(" ")} />{pts.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r="3.5" fill={colorFor(s.name, si)} />)}</g>;
        })}
        {labels.map((_, i) => <rect key={`h${i}`} x={m.l + band * i} y={m.t} width={band} height={ph} fill="transparent" data-hover onMouseMove={(e) => tip(e, tipLines(i))} />)}
        {labels.map((_, i) => catLabel(i))}
        {yAxisTitle}{xAxisTitle}
      </g>
    );
  }

  const inner = data.hist ? band * 0.96 : band * 0.72;
  const k = stacked ? 1 : series.length;
  const bwid = inner / k;
  const showNums = !stacked && n * k <= 24;
  const bars = [];
  labels.forEach((_, i) => {
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i];
      if (v == null) return;
      const color = series.length === 1 && AREA_COLORS[labels[i]] ? AREA_COLORS[labels[i]] : colorFor(s.name, si);
      const from = stacked ? acc : 0;
      const to = stacked ? acc + v : v;
      acc = to;
      const off = band * i + (band - inner) / 2 + (stacked ? 0 : bwid * si);
      if (horizontal) {
        const x0 = vx(Math.min(from, to)), x1 = vx(Math.max(from, to));
        bars.push(<rect key={`${i}-${si}`} x={x0} y={m.t + off} width={Math.max(1, x1 - x0)} height={bwid - 2} rx="3" fill={color} />);
        if (showNums) bars.push(<text key={`t${i}-${si}`} x={x1 + 4} y={m.t + off + bwid / 2 + 3} fontSize="10" fill={ink.text}>{fmt(v, 1)}</text>);
      } else {
        const y0 = vy(Math.max(from, to)), y1 = vy(Math.min(from, to));
        bars.push(<rect key={`${i}-${si}`} x={m.l + off} y={y0} width={Math.max(1, bwid - (data.hist ? 0 : 2))} height={Math.max(1, y1 - y0)} rx={data.hist ? 0 : 3} fill={color} />);
        if (showNums && bwid > 18) bars.push(<text key={`t${i}-${si}`} x={m.l + off + bwid / 2} y={y0 - 4} textAnchor="middle" fontSize="10" fill={ink.text}>{fmt(v, 1)}</text>);
      }
    });
  });
  return (
    <g onMouseLeave={clear}>
      {legendEl}{grid}
      {horizontal ? <line x1={vx(0)} x2={vx(0)} y1={m.t} y2={m.t + ph} stroke={ink.text} strokeOpacity="0.5" /> : <line x1={m.l} x2={m.l + pw} y1={vy(0)} y2={vy(0)} stroke={ink.text} strokeOpacity="0.5" />}
      {bars}
      {labels.map((_, i) => (horizontal
        ? <rect key={`h${i}`} x={m.l} y={m.t + band * i} width={pw} height={band} fill="transparent" data-hover onMouseMove={(e) => tip(e, tipLines(i))} />
        : <rect key={`h${i}`} x={m.l + band * i} y={m.t} width={band} height={ph} fill="transparent" data-hover onMouseMove={(e) => tip(e, tipLines(i))} />))}
      {labels.map((_, i) => catLabel(i))}
      {horizontal ? <text x={m.l + pw / 2} y={H - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.text}>{cut(yTitle, 60)}</text> : <>{yAxisTitle}{xAxisTitle}</>}
    </g>
  );
}
