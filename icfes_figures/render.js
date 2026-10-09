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

  const KINDS = ['bar', 'line', 'scatter', 'curve', 'pie', 'table'];
  const AXIS_KINDS = ['bar', 'line', 'scatter', 'curve'];
  // Booklets print in grey-scale, so series use fill patterns, not grey shades.
  const PATTERNS = ['hatch', 'solid', 'white', 'dots'];
  const W = 480;
  const H = 300;
  const FONT = 'Arial, Helvetica, sans-serif';
  let seq = 0;

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
      if (a.domain != null && (!Array.isArray(a.domain) || a.domain.length !== 2 || !isNum(a.domain[0]) || !isNum(a.domain[1]) || a.domain[0] >= a.domain[1])) errs.push(`${name}.domain must be [lo, hi] with lo below hi`);
    };
    const series = Array.isArray(spec.series) ? spec.series : [];
    if (AXIS_KINDS.includes(spec.kind)) {
      if (!spec.x || typeof spec.x.label !== 'string' || !spec.x.label) errs.push('x.label is required (axis title)');
      if (!spec.y || typeof spec.y.label !== 'string' || !spec.y.label) errs.push('y.label is required (axis title)');
    }
    if (spec.kind === 'bar' || spec.kind === 'line') {
      const numericLine = spec.kind === 'line' && series.some((s) => Array.isArray(s.points));
      if (numericLine) {
        series.forEach((s, i) => {
          if (!Array.isArray(s.points) || s.points.length === 0) return errs.push(`series[${i}].points must be a non-empty array`);
          s.points.forEach((p, j) => {
            if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) errs.push(`series[${i}].points[${j}] must be [x, y]`);
          });
        });
        axis('x', spec.x);
      } else {
        if (!Array.isArray(spec.categories) || spec.categories.length === 0) errs.push('categories must be a non-empty array');
        if (series.length === 0) errs.push('series must be a non-empty array');
        series.forEach((s, i) => {
          if (!Array.isArray(s.values) || s.values.length !== (spec.categories || []).length) {
            errs.push(`series[${i}].values must have one entry per category`);
            return;
          }
          s.values.forEach((v, j) => {
            if (v === null && spec.kind === 'line') return;     // gap in a line
            if (!isNum(v)) errs.push(`series[${i}].values[${j}] must be a number`);
            else if (spec.kind === 'bar' && v < 0) errs.push(`series[${i}].values[${j}] must not be negative`);
          });
        });
      }
      series.forEach((s, i) => {
        if (s.axis != null && s.axis !== 1 && s.axis !== 2) errs.push(`series[${i}].axis must be 1 or 2`);
        if (s.axis === 2 && !spec.y2) errs.push(`series[${i}] uses axis 2 but y2 is missing`);
      });
      if (spec.y2) {
        axis('y2', spec.y2);
        if (!spec.y2.label) errs.push('y2.label is required (axis title)');
      }
      axis('y', spec.y);
    } else if (spec.kind === 'scatter') {
      if (series.length === 0) errs.push('series must be a non-empty array');
      series.forEach((s, i) => (s.points || []).forEach((p, j) => {
        if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) errs.push(`series[${i}].points[${j}] must be [x, y]`);
      }));
      axis('x', spec.x);
      axis('y', spec.y);
    } else if (spec.kind === 'curve') {
      if (series.length === 0) errs.push('series must be a non-empty array');
      series.forEach((s, i) => {
        if (!Array.isArray(s.points) || s.points.length < 2) return errs.push(`series[${i}].points needs at least two [x, y] pairs`);
        s.points.forEach((p, j) => { if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) errs.push(`series[${i}].points[${j}] must be [x, y]`); });
        if (s.style != null && s.style !== 'solid' && s.style !== 'dashed') errs.push(`series[${i}].style must be solid or dashed`);
      });
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

  // Spanish separators, as on the exam paper: "." groups thousands, "," is the decimal mark.
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
  // axis.domain = [lo, hi] widens the drawn scale without adding ticks outside min..max.
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
    const tickLo = lo;
    const tickHi = hi;
    if (axis && Array.isArray(axis.domain)) { lo = Math.min(axis.domain[0], lo); hi = Math.max(axis.domain[1], hi); }
    const ticks = [];
    for (let v = tickLo; v <= tickHi + step * 1e-9; v += step) ticks.push(Math.round(v / step * 1e9) / 1e9 * step);
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

  // Each chart gets its own id prefix, so several charts can share a page.
  function svgOpen(title, id) {
    const defs = `<defs>` +
      `<pattern id="${id}-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#000" stroke-width="1.6"/></pattern>` +
      `<pattern id="${id}-dots" width="5" height="5" patternUnits="userSpaceOnUse">` +
      `<rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r="1.3" fill="#000"/></pattern>` +
      `</defs>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title || 'gráfica')}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>${defs}`;
  }

  // Fill for series i: printed grey-scale, so patterns, not tints.
  function fillFor(series, i, id) {
    const p = series.pattern || PATTERNS[i % PATTERNS.length];
    if (p === 'solid') return '#000';
    if (p === 'white') return '#fff';
    if (p === 'dots') return `url(#${id}-dots)`;
    return `url(#${id}-hatch)`;
  }

  // Shared frame: title, legend, y axis with gridlines, and x axis line. `right` moves the plot edge for a second axis.
  function frame(spec, showLegend, yScale, right, extraBottom) {
    const out = [];
    let top = 14;
    if (spec.title) { out.push(text(W / 2, 18, spec.title, { weight: 'bold' })); top = 30; }
    if (showLegend) top += 18;
    const left = 58;
    const plotRight = right == null ? W - 16 : right;
    const bottom = H - 50 - (extraBottom || 0);
    const y = (v) => bottom - (v - yScale.lo) / (yScale.hi - yScale.lo) * (bottom - top);
    for (const t of yScale.ticks) {
      out.push(`<line x1="${left}" x2="${plotRight}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#e4e4e4" stroke-width="1"/>`);
      out.push(text(left - 6, (y(t) + 4).toFixed(1), fmt(t), { anchor: 'end' }));
    }
    out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<line x1="${left}" x2="${plotRight}" y1="${bottom}" y2="${bottom}" stroke="#000"/>`);
    if (spec.y && spec.y.label) out.push(text(14, (top + bottom) / 2, spec.y.label, { rotate: -90 }));
    if (spec.x && spec.x.label) out.push(text((left + plotRight) / 2, H - 6, spec.x.label));
    return { out, left, right: plotRight, top, bottom, y };
  }

  function legend(series, left, top, id) {
    const out = [];
    let x = left;
    series.forEach((s, i) => {
      const label = s.name || s.label || `serie ${i + 1}`;
      out.push(`<rect x="${x}" y="${top - 10}" width="10" height="10" fill="${fillFor(s, i, id)}" stroke="#000"/>`);
      out.push(text(x + 14, top - 1, label, { anchor: 'start' }));
      x += 24 + String(label).length * 7;
    });
    return out;
  }

  function barSvg(spec, id) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    const primary = series.filter((s) => s.axis !== 2);
    const secondary = series.filter((s) => s.axis === 2);
    const yScale = scaleFor(spec.y, primary.flatMap((s) => s.values), true);
    const y2Scale = spec.y2 ? scaleFor(spec.y2, secondary.flatMap((s) => s.values), true) : null;
    // Rotated category labels need room below the axis; decide before the frame is laid out.
    const rotateLabels = spec.categories.some((c) => c.length * 6.5 > (W - 74) / spec.categories.length);
    const fr = frame(spec, showLegend, yScale, y2Scale ? W - 58 : W - 16, rotateLabels ? 36 : 0);
    const out = fr.out;
    if (y2Scale) {
      const yy = (v) => fr.bottom - (v - y2Scale.lo) / (y2Scale.hi - y2Scale.lo) * (fr.bottom - fr.top);
      out.push(`<line x1="${fr.right}" x2="${fr.right}" y1="${fr.top}" y2="${fr.bottom}" stroke="#000"/>`);
      for (const t of y2Scale.ticks) out.push(text(fr.right + 6, (yy(t) + 4).toFixed(1), fmt(t), { anchor: 'start' }));
      out.push(text(W - 12, (fr.top + fr.bottom) / 2, spec.y2.label, { rotate: 90 }));
    }
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6, id));
    const n = spec.categories.length;
    const band = (fr.right - fr.left) / n;
    const barW = Math.min(44, band * 0.7 / series.length);
    spec.categories.forEach((cat, c) => {
      const cx = fr.left + band * (c + 0.5);
      series.forEach((s, si) => {
        const v = s.values[c];
        if (!isNum(v)) return;
        const sc = s.axis === 2 ? y2Scale : yScale;
        const y = (val) => fr.bottom - (val - sc.lo) / (sc.hi - sc.lo) * (fr.bottom - fr.top);
        const x = cx - (barW * series.length) / 2 + si * barW;
        const yTop = y(Math.max(v, 0));
        const yBase = y(Math.min(0, sc.lo));
        out.push(`<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, yBase - yTop).toFixed(1)}" fill="${fillFor(s, si, id)}" stroke="#000" stroke-width="0.8"/>`);
      });
      if (rotateLabels) out.push(text(cx.toFixed(1), fr.bottom + 12, cat, { anchor: 'end', rotate: -45 }));
      else wrapLabel(cat, 14).forEach((line, k) => out.push(text(cx.toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    return out;
  }

  function lineSvg(spec, id) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    if (series.some((s) => Array.isArray(s.points))) return numericLine(spec, id, showLegend);
    const yScale = scaleFor(spec.y, series.flatMap((s) => s.values), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6, id));
    const n = spec.categories.length;
    const xAt = (c) => fr.left + (fr.right - fr.left) * (n === 1 ? 0.5 : c / (n - 1));
    spec.categories.forEach((cat, c) => {
      wrapLabel(cat, 14).forEach((line, k) => out.push(text(xAt(c).toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    series.forEach((s, si) => out.push(...polyline(s, si, s.values.map((v, c) => (isNum(v) ? [xAt(c), fr.y(v)] : null)))));
    return out;
  }

  // Lines on a numeric x axis: each point sits at its real x, so uneven time steps are kept.
  function numericLine(spec, id, showLegend) {
    const series = spec.series;
    const xs = series.flatMap((s) => s.points.map((p) => p[0]));
    const ys = series.flatMap((s) => s.points.map((p) => p[1]));
    const xScale = scaleFor(spec.x, xs, false);
    const yScale = scaleFor(spec.y, ys, false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6, id));
    const xAt = (v) => fr.left + (v - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
    for (const t of xScale.ticks) out.push(text(xAt(t).toFixed(1), fr.bottom + 15, fmt(t)));
    series.forEach((s, si) => out.push(...polyline(s, si, s.points.map(([x, y]) => [xAt(x), fr.y(y)]))));
    return out;
  }

  // Solid lines unless style is dashed. Markers: open circle (default), filled square, or open triangle.
  function marker(kind, x, y) {
    const f = (v) => v.toFixed(1);
    if (kind === 'square') return `<rect x="${f(x - 3)}" y="${f(y - 3)}" width="6" height="6" fill="#000"/>`;
    if (kind === 'triangle') return `<polygon points="${f(x)},${f(y - 4)} ${f(x - 4)},${f(y + 3)} ${f(x + 4)},${f(y + 3)}" fill="#fff" stroke="#000" stroke-width="1.2"/>`;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
  }
  // Open markers keep grey-scale legibility.
  function polyline(s, si, pts) {
    const out = [];
    const dash = s.style === 'dashed' ? ' stroke-dasharray="5 3"' : '';
    const real = pts.filter(Boolean);
    if (real.length > 1) out.push(`<polyline points="${real.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="1.8"${dash}/>`);
    for (const [x, y] of real) out.push(marker(s.marker, x, y));
    return out;
  }

  function scatterSvg(spec, id) {
    const series = spec.series;
    const showLegend = series.length > 1 || (series[0] && series[0].name);
    const pts = series.flatMap((s) => s.points);
    const xScale = scaleFor(spec.x, pts.map((p) => p[0]), false);
    const yScale = scaleFor(spec.y, pts.map((p) => p[1]), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(series, fr.left, fr.top - 6, id));
    for (const t of xScale.ticks) {
      const x = fr.left + (t - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
      out.push(text(x.toFixed(1), fr.bottom + 15, fmt(t)));
    }
    series.forEach((s, si) => {
      s.points.forEach(([px, py]) => {
        const x = fr.left + (px - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
        const y = fr.y(py);
        if (si % 2 === 0) out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${fillFor(s, si, id)}" stroke="#000"/>`);
        else out.push(`<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="7" height="7" fill="${fillFor(s, si, id)}" stroke="#000"/>`);
      });
    });
    return out;
  }

  // Shape-only graph: no tick values, so axes are drawn without numbers and curves are smoothed through their points.
  function curveSvg(spec, id) {
    const series = spec.series;
    const pts = series.flatMap((s) => s.points);
    const range = (a, vals) => {
      const lo = a && isNum(a.min) ? a.min : Math.min(...vals);
      const hi = a && isNum(a.max) ? a.max : Math.max(...vals);
      const pad = (hi - lo || 1) * 0.04;
      return { lo: a && isNum(a.min) ? a.min : lo - pad, hi: a && isNum(a.max) ? a.max : hi + pad };
    };
    const xr = range(spec.x, pts.map((p) => p[0]));
    const yr = range(spec.y, pts.map((p) => p[1]));
    const left = 58;
    const right = W - 24;
    const top = spec.title ? 34 : 18;
    const bottom = H - 40;
    const sx = (v) => left + (v - xr.lo) / (xr.hi - xr.lo) * (right - left);
    const sy = (v) => bottom - (v - yr.lo) / (yr.hi - yr.lo) * (bottom - top);
    const out = [];
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<polygon points="${left},${top - 4} ${left - 4},${top + 6} ${left + 4},${top + 6}" fill="#000"/>`);
    out.push(`<polygon points="${right + 4},${bottom} ${right - 6},${bottom - 4} ${right - 6},${bottom + 4}" fill="#000"/>`);
    out.push(text(14, (top + bottom) / 2, spec.y.label, { rotate: -90 }));
    out.push(text((left + right) / 2, H - 8, spec.x.label));
    series.forEach((s, si) => {
      const P = s.points.map(([x, y]) => [sx(x), sy(y)]);
      let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)];
        const p1 = P[i];
        const p2 = P[i + 1];
        const p3 = P[Math.min(P.length - 1, i + 2)];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      const dash = s.style === 'dashed' ? ' stroke-dasharray="6 4"' : '';
      out.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="2"${dash}/>`);
      if (s.label) {
        const at = Math.min(P.length - 1, s.labelAt != null ? s.labelAt : Math.floor(P.length / 2));
        out.push(text(P[at][0].toFixed(1), (P[at][1] - 8).toFixed(1), s.label));
      }
    });
    void id;
    return out;
  }

  function pieSvg(spec, id) {
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
      const fill = fillFor(spec.slices[i], i, id);
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

  // Table styling for the page that hosts the HTML. Kept here so the viewer and the app share one look.
  const TABLE_CSS = '.icfes-table{border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#000;background:#fff}' +
    '.icfes-table th,.icfes-table td{border:1px solid #000;padding:4px 10px;text-align:center}' +
    '.icfes-table caption{font-weight:bold;margin-bottom:4px}';

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
    const id = `icf${++seq}`;
    const body = spec.kind === 'bar' ? barSvg(spec, id)
      : spec.kind === 'line' ? lineSvg(spec, id)
      : spec.kind === 'scatter' ? scatterSvg(spec, id)
      : spec.kind === 'curve' ? curveSvg(spec, id)
      : pieSvg(spec, id);
    return svgOpen(spec.title, id) + body.join('') + '</svg>';
  }

  return { KINDS, PATTERNS, validate, render, fmt, niceStep, scaleFor, TABLE_CSS };
});
