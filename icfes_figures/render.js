// ICFES figure specs -> SVG (charts) or HTML (tables). No dependencies.
//
// Works in the browser (window.ICFESFigures) and in Node (require('./render.js')).
// The spec format is documented in SPEC.md. Every function here is pure: spec in, string out.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ICFESFigures = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const KINDS = ['bar', 'line', 'scatter', 'pie', 'table'];
  // ICFES prints figures in black, white and grey, so the palette stays grey-scale.
  const FILLS = ['#3d3d3d', '#9a9a9a', '#dcdcdc'];
  const W = 480;
  const H = 300;
  const FONT = 'Arial, Helvetica, sans-serif';

  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

  function validate(spec) {
    const errs = [];
    if (!spec || typeof spec !== 'object') return ['spec must be an object'];
    if (!KINDS.includes(spec.kind)) return [`kind must be one of ${KINDS.join(', ')}`];
    const axis = (name, a) => {
      if (a == null) return;
      if (typeof a !== 'object') return errs.push(`${name} must be an object`);
      for (const k of ['min', 'max', 'step']) if (a[k] != null && !isNum(a[k])) errs.push(`${name}.${k} must be a number`);
      if (isNum(a.min) && isNum(a.max) && a.min >= a.max) errs.push(`${name}: min must be below max`);
      if (isNum(a.step) && a.step <= 0) errs.push(`${name}.step must be positive`);
    };
    if (spec.kind === 'bar' || spec.kind === 'line') {
      if (!Array.isArray(spec.categories) || spec.categories.length === 0) errs.push('categories must be a non-empty array');
      if (!Array.isArray(spec.series) || spec.series.length === 0) errs.push('series must be a non-empty array');
      (spec.series || []).forEach((s, i) => {
        if (!Array.isArray(s.values) || s.values.length !== (spec.categories || []).length) {
          errs.push(`series[${i}].values must have one entry per category`);
          return;
        }
        s.values.forEach((v, j) => {
          if (v === null && spec.kind === 'line') return;     // gap in a line
          if (!isNum(v)) errs.push(`series[${i}].values[${j}] must be a number`);
        });
      });
      if (spec.kind === 'bar') (spec.series || []).forEach((s, i) => (s.values || []).forEach((v, j) => {
        if (v != null && isNum(v) && v < 0) errs.push(`series[${i}].values[${j}] must not be negative`);
      }));
      axis('y', spec.y);
    } else if (spec.kind === 'scatter') {
      if (!Array.isArray(spec.series) || spec.series.length === 0) errs.push('series must be a non-empty array');
      (spec.series || []).forEach((s, i) => (s.points || []).forEach((p, j) => {
        if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) errs.push(`series[${i}].points[${j}] must be [x, y]`);
      }));
      axis('x', spec.x);
      axis('y', spec.y);
    } else if (spec.kind === 'pie') {
      if (!Array.isArray(spec.slices) || spec.slices.length < 2) errs.push('slices needs at least two entries');
      else {
        spec.slices.forEach((s, i) => { if (!isNum(s.value) || s.value < 0) errs.push(`slices[${i}].value must be a number >= 0`); });
        const total = spec.slices.reduce((t, s) => t + (isNum(s.value) ? s.value : 0), 0);
        if (!(total > 0)) errs.push('slice values must add up to more than 0');
      }
    } else if (spec.kind === 'table') {
      if (!Array.isArray(spec.headers) || spec.headers.length === 0) errs.push('headers must be a non-empty array');
      if (!Array.isArray(spec.rows)) errs.push('rows must be an array');
      else spec.rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== (spec.headers || []).length) errs.push(`rows[${i}] must have one cell per header`);
      });
    }
    return errs;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Spanish-style separators, as on the exam paper: "." groups thousands, "," is the decimal mark.
  function fmt(n) {
    const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (Number.isInteger(n)) return group(String(n));
    const [whole, frac] = String(Math.round(n * 1000) / 1000).split('.');
    return (Math.abs(n) >= 1000 ? group(whole) : whole) + (frac ? ',' + frac : '');
  }

  function niceStep(span, target) {
    const raw = span / (target || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / mag;
    const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
    return m * mag;
  }

  // Linear scale from a data extent, honouring explicit min/max/step from the spec.
  function scaleFor(axis, values, forceZero) {
    const vals = values.filter(isNum);
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (forceZero) lo = Math.min(0, lo);
    if (axis && isNum(axis.min)) lo = axis.min;
    if (axis && isNum(axis.max)) hi = axis.max;
    if (hi === lo) hi = lo + 1;
    const step = axis && isNum(axis.step) ? axis.step : niceStep(hi - lo, 5);
    if (!(axis && isNum(axis.min))) lo = Math.floor(lo / step) * step;
    if (!(axis && isNum(axis.max))) hi = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v / step * 1e9) / 1e9 * step);
    return { lo, hi, step, ticks };
  }

  function wrapLabel(text, max) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  function text(x, y, s, opts) {
    const o = opts || {};
    const attrs = [`x="${x}"`, `y="${y}"`, `font-family="${FONT}"`, `font-size="${o.size || 12}"`,
      `text-anchor="${o.anchor || 'middle'}"`, `fill="#000"`];
    if (o.weight) attrs.push(`font-weight="${o.weight}"`);
    if (o.rotate) attrs.push(`transform="rotate(${o.rotate} ${x} ${y})"`);
    return `<text ${attrs.join(' ')}>${esc(s)}</text>`;
  }

  function svgOpen(title) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title || 'gráfica')}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>`;
  }

  // Shared frame: title, legend, y axis with gridlines, and an x axis line.
  function frame(spec, showLegend, yScale) {
    const out = [];
    let top = 14;
    if (spec.title) { out.push(text(W / 2, 18, spec.title, { weight: 'bold' })); top = 30; }
    if (showLegend) top += 18;
    const left = 58;
    const right = W - 16;
    const bottom = H - 50;
    const y = (v) => bottom - (v - yScale.lo) / (yScale.hi - yScale.lo) * (bottom - top);
    for (const t of yScale.ticks) {
      out.push(`<line x1="${left}" x2="${right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#e4e4e4" stroke-width="1"/>`);
      out.push(text(left - 6, (y(t) + 4).toFixed(1), fmt(t), { anchor: 'end' }));
    }
    out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#000"/>`);
    if (spec.y && spec.y.label) out.push(text(14, (top + bottom) / 2, spec.y.label, { rotate: -90 }));
    if (spec.x && spec.x.label) out.push(text((left + right) / 2, H - 6, spec.x.label));
    return { out, left, right, top, bottom, y };
  }

  function legend(series, left, top) {
    const out = [];
    let x = left;
    series.forEach((s, i) => {
      const fill = FILLS[i % FILLS.length];
      out.push(`<rect x="${x}" y="${top - 10}" width="10" height="10" fill="${fill}" stroke="#000"/>`);
      out.push(text(x + 14, top - 1, s.name || `serie ${i + 1}`, { anchor: 'start' }));
      x += 24 + String(s.name || `serie ${i + 1}`).length * 7;
    });
    return out;
  }

  function barSvg(spec) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    const yScale = scaleFor(spec.y, series.flatMap((s) => s.values), true);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6));
    const n = spec.categories.length;
    const band = (fr.right - fr.left) / n;
    const barW = Math.min(44, band * 0.7 / series.length);
    spec.categories.forEach((cat, c) => {
      const cx = fr.left + band * (c + 0.5);
      series.forEach((s, si) => {
        const v = s.values[c];
        if (!isNum(v)) return;
        const x = cx - (barW * series.length) / 2 + si * barW;
        const yTop = fr.y(Math.max(v, 0));
        const yBase = fr.y(Math.min(0, yScale.lo));
        out.push(`<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, yBase - yTop).toFixed(1)}" fill="${FILLS[si % FILLS.length]}" stroke="#000" stroke-width="0.8"/>`);
      });
      wrapLabel(cat, 14).forEach((line, k) => out.push(text(cx.toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    return out;
  }

  function lineSvg(spec) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    const yScale = scaleFor(spec.y, series.flatMap((s) => s.values), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6));
    const n = spec.categories.length;
    const xAt = (c) => fr.left + (fr.right - fr.left) * (n === 1 ? 0.5 : c / (n - 1)) ;
    spec.categories.forEach((cat, c) => {
      wrapLabel(cat, 14).forEach((line, k) => out.push(text(xAt(c).toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    series.forEach((s, si) => {
      const stroke = si === 0 ? '#000' : '#555';
      const dash = si === 0 ? '' : ' stroke-dasharray="5 3"';
      let seg = [];
      const flush = () => {
        if (seg.length > 1) out.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="${stroke}" stroke-width="1.8"${dash}/>`);
        seg = [];
      };
      s.values.forEach((v, c) => {
        if (!isNum(v)) return flush();
        const px = xAt(c).toFixed(1);
        const py = fr.y(v).toFixed(1);
        seg.push(`${px},${py}`);
        out.push(`<circle cx="${px}" cy="${py}" r="3" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>`);
      });
      flush();
    });
    return out;
  }

  function scatterSvg(spec) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    const pts = series.flatMap((s) => s.points);
    const xScale = scaleFor(spec.x, pts.map((p) => p[0]), false);
    const yScale = scaleFor(spec.y, pts.map((p) => p[1]), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6));
    for (const t of xScale.ticks) {
      const x = fr.left + (t - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
      out.push(text(x.toFixed(1), fr.bottom + 15, fmt(t)));
    }
    series.forEach((s, si) => {
      const shape = si % 2 === 0 ? 'circle' : 'rect';
      s.points.forEach(([px, py]) => {
        const x = fr.left + (px - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
        const y = fr.y(py);
        if (shape === 'circle') out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${FILLS[si % FILLS.length]}" stroke="#000"/>`);
        else out.push(`<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="7" height="7" fill="${FILLS[si % FILLS.length]}" stroke="#000"/>`);
      });
    });
    return out;
  }

  function pieSvg(spec) {
    const out = [];
    const total = spec.slices.reduce((t, s) => t + s.value, 0);
    const cx = 130;
    const cy = H / 2 + (spec.title ? 8 : 0);
    const r = 100;
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    let angle = -Math.PI / 2;
    spec.slices.forEach((s, i) => {
      const frac = s.value / total;
      const a2 = angle + frac * 2 * Math.PI;
      const fill = FILLS[i % FILLS.length];
      if (frac >= 0.9999) {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#000"/>`);
      } else if (frac > 0) {
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        const large = frac > 0.5 ? 1 : 0;
        out.push(`<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${fill}" stroke="#000"/>`);
      }
      angle = a2;
      const ly = 80 + i * 24;
      out.push(`<rect x="262" y="${ly - 10}" width="10" height="10" fill="${fill}" stroke="#000"/>`);
      const pct = Math.round(frac * 1000) / 10;
      out.push(text(278, ly - 1, `${s.label}: ${fmt(s.value)} (${fmt(pct)} %)`, { anchor: 'start' }));
    });
    return out;
  }

  function tableHtml(spec) {
    const head = spec.headers.map((h) => `<th>${esc(h)}</th>`).join('');
    const body = spec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
    const cap = spec.title ? `<caption>${esc(spec.title)}</caption>` : '';
    return `<table class="icfes-table">${cap}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // Charts return an SVG string; tables return an HTML string. Invalid specs throw, so callers can fall back to the crop.
  function render(spec) {
    const errs = validate(spec);
    if (errs.length) throw new Error('invalid figure spec: ' + errs.join('; '));
    if (spec.kind === 'table') return tableHtml(spec);
    const body = spec.kind === 'bar' ? barSvg(spec)
      : spec.kind === 'line' ? lineSvg(spec)
      : spec.kind === 'scatter' ? scatterSvg(spec)
      : pieSvg(spec);
    return svgOpen(spec.title) + body.join('') + '</svg>';
  }

  return { KINDS, validate, render, fmt, niceStep, scaleFor };
});
