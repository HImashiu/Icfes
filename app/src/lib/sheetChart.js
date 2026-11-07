// Charts of the Hoja de datos, like Sheets or Excel: the data behind each chart type, from the sheet's rows and a
// config { type, x, y: [cols], series, agg, bins, sort, limit }. Pure functions: no DOM, no React.

export const CHART_TYPES = [
  { id: "bar", label: "Columnas" },
  { id: "stacked", label: "Apiladas" },
  { id: "stacked100", label: "Apiladas 100 %" },
  { id: "hbar", label: "Barras" },
  { id: "line", label: "Líneas" },
  { id: "area", label: "Área" },
  { id: "combo", label: "Combinada" },
  { id: "pie", label: "Circular" },
  { id: "scatter", label: "Dispersión" },
  { id: "hist", label: "Histograma" },
  { id: "box", label: "Caja" },
];
// Types drawn from categories of x (one value per category and series).
export const CATEGORY_TYPES = ["bar", "stacked", "stacked100", "hbar", "line", "area", "combo", "pie"];
// One value column only.
export const ONE_Y_TYPES = ["scatter", "hist", "box", "pie"];
// Look and feel, the "Personalizar" tab. Every chart starts from these.
export const STYLE_DEFAULTS = { legend: "top", labels: "auto", yMin: null, yMax: null, ref: null, refLabel: "", avgLine: false, trend: "auto", smooth: false, points: true, donut: true, colors: {}, gridlines: true };
export const CHART_AGGS = [
  { id: "avg", label: "Promedio" }, { id: "sum", label: "Suma" }, { id: "count", label: "Recuento" },
  { id: "median", label: "Mediana" }, { id: "min", label: "Mínimo" }, { id: "max", label: "Máximo" },
];

const nums = (xs) => xs.filter((v) => typeof v === "number" && Number.isFinite(v));
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function aggregate(values, how) {
  if (how === "count") return values.filter((v) => v != null && v !== "").length;
  const xs = nums(values);
  if (!xs.length) return null;
  if (how === "sum") return r2(xs.reduce((a, b) => a + b, 0));
  if (how === "min") return Math.min(...xs);
  if (how === "max") return Math.max(...xs);
  if (how === "median") return r2(quantile([...xs].sort((a, b) => a - b), 0.5));
  return r2(xs.reduce((a, b) => a + b, 0) / xs.length);
}
const key = (v) => (v == null || v === "" ? "(vacías)" : String(v));
const cmpLabel = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });

// Sensible starting config for these columns (and, when given, the columns of the selected cells).
export function defaultConfig(columns, selected = [], prev = {}) {
  const sel = selected.length ? columns.filter((c) => selected.includes(c.id)) : [];
  const text = (sel.find((c) => c.type !== "num") ?? columns.find((c) => c.type !== "num" && !["Estudiante", "Correo", "Actividad", "Fecha"].includes(c.id)) ?? columns.find((c) => c.type !== "num"))?.id ?? null;
  const ys = (sel.filter((c) => c.type === "num").length ? sel.filter((c) => c.type === "num") : columns.filter((c) => c.type === "num" && c.scale).slice(0, 1)).map((c) => c.id);
  const y = ys.length ? ys : columns.filter((c) => c.type === "num").slice(0, 1).map((c) => c.id);
  return { ...STYLE_DEFAULTS, type: prev.type ?? "bar", x: text, y, series: null, agg: prev.agg ?? "avg", bins: 10, sort: "label", limit: 30, title: "", xTitle: "", yTitle: "" };
}

// Category charts (bar, stacked, hbar, line): one value per category of x and per y column (or per value of the
// series column when there is one y and a series column).
function categoryData(rows, cfg) {
  const { x, y, series, agg } = cfg;
  const cats = new Map();
  for (const r of rows) {
    const k = key(r[x]);
    if (!cats.has(k)) cats.set(k, []);
    cats.get(k).push(r);
  }
  let labels = [...cats.keys()];
  let out;
  if (series && y.length) {
    const sk = [...new Set(rows.map((r) => key(r[series])))].sort(cmpLabel).slice(0, 12);
    out = sk.map((s) => ({ name: s, values: labels.map((l) => aggregate(cats.get(l).filter((r) => key(r[series]) === s).map((r) => r[y[0]]), agg)) }));
  } else {
    out = y.map((col) => ({ name: col, values: labels.map((l) => aggregate(cats.get(l).map((r) => r[col]), agg)) }));
  }
  const ns = labels.map((l) => cats.get(l).length);
  // Order: by label (dates and numbers in order), or by the first series' value.
  let order = labels.map((_, i) => i);
  if (cfg.sort === "desc" || cfg.sort === "asc") {
    const v = out[0]?.values ?? [];
    order.sort((a, b) => ((v[a] ?? -Infinity) - (v[b] ?? -Infinity)) * (cfg.sort === "desc" ? -1 : 1));
  } else order.sort((a, b) => cmpLabel(labels[a], labels[b]));
  const cut = order.length > cfg.limit;
  order = order.slice(0, cfg.limit);
  labels = order.map((i) => labels[i]);
  out = out.map((s) => ({ ...s, values: order.map((i) => s.values[i]) }));
  return { kind: "category", labels, series: out, n: order.map((i) => ns[i]), cut, total: cats.size };
}

// Scatter: one point per row, x and the first y numeric; color by the series column.
function scatterData(rows, cfg) {
  const yc = cfg.y[0];
  const pts = [];
  for (const r of rows) {
    const xv = r[cfg.x], yv = r[yc];
    if (typeof xv !== "number" || typeof yv !== "number") continue;
    pts.push({ x: xv, y: yv, s: cfg.series ? key(r[cfg.series]) : yc, label: r.Estudiante ?? r[Object.keys(r)[0]] });
  }
  const groups = [...new Set(pts.map((p) => p.s))].sort(cmpLabel).slice(0, 12);
  // Trend line (least squares) over every point.
  let trend = null;
  if (pts.length >= 3) {
    const n = pts.length, sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
    const sxx = pts.reduce((a, p) => a + p.x * p.x, 0), sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
    const d = n * sxx - sx * sx;
    if (d) {
      const m = (n * sxy - sx * sy) / d, b = (sy - m * sx) / n;
      const syy = pts.reduce((a, p) => a + p.y * p.y, 0);
      const rr = (n * sxy - sx * sy) / Math.sqrt(d * (n * syy - sy * sy) || 1);
      trend = { m, b, r: r2(rr) };
    }
  }
  return { kind: "scatter", points: pts.slice(0, 5000), groups, trend, cut: pts.length > 5000 };
}

// Histogram: how many rows fall in each bin of one numeric column (split by series when given).
function histData(rows, cfg) {
  const col = cfg.y[0];
  const xs = nums(rows.map((r) => r[col]));
  if (!xs.length) return { kind: "category", labels: [], series: [], n: [] };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const bins = Math.max(2, Math.min(40, cfg.bins || 10));
  const w = (hi - lo) / bins || 1;
  const binOf = (v) => Math.min(bins - 1, Math.floor((v - lo) / w));
  const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString("es-CO");
  const labels = [...Array(bins)].map((_, i) => `${fmt(lo + i * w)}–${fmt(lo + (i + 1) * w)}`);
  const groups = cfg.series ? [...new Set(rows.map((r) => key(r[cfg.series])))].sort(cmpLabel).slice(0, 8) : [col];
  const series = groups.map((g) => {
    const counts = Array(bins).fill(0);
    for (const r of rows) {
      const v = r[col];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (cfg.series && key(r[cfg.series]) !== g) continue;
      counts[binOf(v)] += 1;
    }
    return { name: g, values: counts };
  });
  return { kind: "category", labels, series, n: series[0].values.map((_, i) => series.reduce((a, s) => a + s.values[i], 0)), hist: true };
}

// Box plot: quartiles, whiskers (1.5 IQR) and outliers of one numeric column per category of x.
function boxData(rows, cfg) {
  const col = cfg.y[0];
  const cats = new Map();
  for (const r of rows) {
    const v = r[col];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const k = cfg.x ? key(r[cfg.x]) : col;
    if (!cats.has(k)) cats.set(k, []);
    cats.get(k).push(v);
  }
  const boxes = [...cats].sort((a, b) => cmpLabel(a[0], b[0])).slice(0, cfg.limit).map(([label, list]) => {
    const s = [...list].sort((a, b) => a - b);
    const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75);
    const iqr = q3 - q1;
    const inside = s.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    return { label, n: s.length, q1: r2(q1), med: r2(med), q3: r2(q3), lo: inside[0], hi: inside[inside.length - 1], mean: r2(s.reduce((a, b) => a + b, 0) / s.length), out: s.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).slice(0, 50) };
  });
  return { kind: "box", boxes, cut: cats.size > cfg.limit };
}

export function chartData(rows, cfg) {
  if (!cfg?.y?.length) return null;
  if (cfg.type === "scatter") return cfg.x ? scatterData(rows, cfg) : null;
  if (cfg.type === "hist") return histData(rows, cfg);
  if (cfg.type === "box") return boxData(rows, cfg);
  if (cfg.type === "pie") return cfg.x ? pieData(categoryData(rows, { ...cfg, series: null, y: cfg.y.slice(0, 1) })) : null;
  const d = cfg.x ? categoryData(rows, cfg) : null;
  return d && cfg.type === "stacked100" ? toShares(d) : d;
}

// 100 % stacked: each category's values as shares of its total.
export function toShares(d) {
  const totals = d.labels.map((_, i) => d.series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0));
  return { ...d, raw: d.series, series: d.series.map((s) => ({ ...s, values: s.values.map((v, i) => (v == null || !totals[i] ? null : r2((Math.abs(v) / totals[i]) * 100))) })), share: true };
}

// Pie: slices from the first series, biggest first, small ones folded into "Otros" past 9 slices.
function pieData(d) {
  const vals = d.labels.map((l, i) => ({ label: l, value: d.series[0]?.values[i] ?? null, n: d.n[i] })).filter((x) => x.value != null && x.value > 0);
  vals.sort((a, b) => b.value - a.value);
  let slices = vals;
  if (vals.length > 10) {
    const rest = vals.slice(9);
    slices = [...vals.slice(0, 9), { label: "Otros", value: r2(rest.reduce((a, x) => a + x.value, 0)), n: rest.reduce((a, x) => a + x.n, 0), others: rest.length }];
  }
  const total = slices.reduce((a, x) => a + x.value, 0);
  return { kind: "pie", slices: slices.map((x) => ({ ...x, share: total ? r2((x.value / total) * 100) : 0 })), total: r2(total), name: d.series[0]?.name ?? "" };
}

// Least squares line through (i, value) of one series: the trend of a line or bar chart.
export function seriesTrend(values) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 3) return null;
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const d = n * sxx - sx * sx;
  if (!d) return null;
  const m = (n * sxy - sx * sy) / d;
  return { m, b: (sy - m * sx) / n };
}

// Mean of every plotted value of the first series (for the average line).
export function seriesMean(values) {
  const xs = nums(values);
  return xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

// "Nice" axis ticks between lo and hi.
export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) { hi = lo + 1; lo = Math.min(0, lo); }
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(Math.round((out[out.length - 1] + step) * 1e6) / 1e6);
  return out;
}

// Automatic title when the teacher has not written one.
export function autoTitle(cfg, aggLabel) {
  if (!cfg) return "";
  const y = cfg.y.join(", ");
  if (cfg.type === "hist") return `Distribución de ${y}${cfg.series ? ` por ${cfg.series}` : ""}`;
  if (cfg.type === "box") return `${y}${cfg.x ? ` por ${cfg.x}` : ""}`;
  if (cfg.type === "scatter") return `${y} frente a ${cfg.x}`;
  if (cfg.type === "pie") return `${aggLabel} de ${cfg.y[0]} por ${cfg.x}`;
  if (cfg.type === "stacked100") return `Reparto de ${y}${cfg.x ? ` por ${cfg.x}` : ""}${cfg.series ? ` y ${cfg.series}` : ""}`;
  return `${aggLabel} de ${y}${cfg.x ? ` por ${cfg.x}` : ""}${cfg.series ? ` y ${cfg.series}` : ""}`;
}
