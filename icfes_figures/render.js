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

  const KINDS = ['bar', 'line', 'scatter', 'curve', 'pie', 'table', 'geometry', 'diagram'];
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
      if (spec.headers != null && (!Array.isArray(spec.headers) || spec.headers.length === 0)) errs.push('headers must be a non-empty array when given');
      if (!Array.isArray(spec.rows)) errs.push('rows must be an array');
      else {
        const g = layoutTable(spec);
        errs.push(...g.errors);
      }
    }
    if (spec.kind === 'diagram') {
      if (!Array.isArray(spec.shapes) || spec.shapes.length === 0) errs.push('shapes must be a non-empty array');
      else spec.shapes.forEach((s, i) => errs.push(...diagramShapeErrors(s, i)));
      if (spec.view != null && (!Array.isArray(spec.view) || spec.view.length !== 4 || !spec.view.every(isNum) || spec.view[2] <= 0 || spec.view[3] <= 0)) errs.push('view must be [x, y, width, height] with positive size');
    }
    if (spec.kind === 'geometry') {
      const pts = spec.points || {};
      const ok = (v) => (typeof v === 'string' ? pts[v] != null : Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]));
      if (!spec.points || typeof spec.points !== 'object') errs.push('points must be an object of name: [x, y]');
      Object.entries(pts).forEach(([k, v]) => { if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) errs.push(`points.${k} must be [x, y]`); });
      (spec.segments || []).forEach((g, i) => { if (!ok(g.a) || !ok(g.b)) errs.push(`segments[${i}] needs known endpoints a and b`); });
      (spec.polygons || []).forEach((g, i) => { if (!Array.isArray(g.vertices) || g.vertices.length < 3 || !g.vertices.every(ok)) errs.push(`polygons[${i}] needs at least three known vertices`); });
      (spec.circles || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.r) || g.r <= 0) errs.push(`circles[${i}] needs a center and a positive r`); });
      (spec.ellipses || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.rx) || !isNum(g.ry)) errs.push(`ellipses[${i}] needs a center, rx and ry`); });
      (spec.arcs || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.r) || !isNum(g.from) || !isNum(g.to)) errs.push(`arcs[${i}] needs center, r, from and to (degrees)`); });
      (spec.angles || []).forEach((g, i) => { if (!ok(g.vertex) || !ok(g.a) || !ok(g.b)) errs.push(`angles[${i}] needs known vertex, a and b`); });
      (spec.labels || []).forEach((g, i) => { if (!ok(g.at) || typeof g.text !== 'string') errs.push(`labels[${i}] needs at and text`); });
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

  function patternDefs(id) {
    return `<defs>` +
      `<pattern id="${id}-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#000" stroke-width="1.6"/></pattern>` +
      `<pattern id="${id}-dots" width="5" height="5" patternUnits="userSpaceOnUse">` +
      `<rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r="1.3" fill="#000"/></pattern>` +
      `</defs>`;
  }

  // Each chart gets its own id prefix, so several charts can share a page.
  function svgOpen(title, id) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title || 'gráfica')}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>${patternDefs(id)}`;
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

  // Cells are strings or {text, colspan, rowspan, header}. Headers, if given, are the first row.
  // Returns the placed cells per row and the column count, or errors when rows do not fill the grid.
  function layoutTable(spec) {
    const errors = [];
    const all = (Array.isArray(spec.headers) && spec.headers.length ? [{ cells: spec.headers, header: true }] : [])
      .concat((spec.rows || []).map((r) => ({ cells: r, header: false })));
    const width = Array.isArray(spec.headers) && spec.headers.length ? spec.headers.length : 0;
    const taken = [];
    const placed = all.map(() => []);
    let cols = width;
    all.forEach((row, r) => {
      if (!Array.isArray(row.cells)) { errors.push(`row ${r} must be an array`); return; }
      let c = 0;
      row.cells.forEach((cell) => {
        const o = typeof cell === 'object' && cell !== null ? cell : { text: cell };
        while (taken[r] && taken[r][c]) c++;
        const cs = o.colspan || 1;
        const rs = o.rowspan || 1;
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
          taken[r + dr] = taken[r + dr] || [];
          if (taken[r + dr][c + dc]) errors.push(`row ${r}: cell overlaps another span`);
          taken[r + dr][c + dc] = true;
        }
        placed[r].push({ text: o.text == null ? '' : String(o.text), colspan: cs, rowspan: rs, header: !!(o.header || row.header) });
        c += cs;
      });
      const span = (taken[r] || []).filter(Boolean).length;
      if (!width && r === 0) cols = span;
      if (cols && span !== cols) errors.push(`row ${r} covers ${span} columns, expected ${cols}`);
    });
    return { rows: placed, cols, errors };
  }

  function tableHtml(spec) {
    const g = layoutTable(spec);
    const body = g.rows.map((cells) => `<tr>${cells.map((c) => {
      const attrs = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
      return c.header ? `<th${attrs}>${esc(c.text)}</th>` : `<td${attrs}>${esc(c.text)}</td>`;
    }).join('')}</tr>`).join('');
    const cap = spec.title ? `<caption>${esc(spec.title)}</caption>` : '';
    return `<table class="icfes-table">${cap}<tbody>${body}</tbody></table>`;
  }

  // Geometry: named points, segments, polygons, circles, ellipses, arcs and angle marks, drawn in a
  // coordinate frame with y pointing up. Coordinates are fitted to the frame; axes are not drawn.
  function geometrySvg(spec, id) {
    const pts = spec.points || {};
    const at = (v) => (typeof v === 'string' ? pts[v] : v);
    const xs = [], ys = [];
    const add = (p) => { xs.push(p[0]); ys.push(p[1]); };
    Object.values(pts).forEach(add);
    (spec.ellipses || []).forEach((e) => { const c = at(e.center); add([c[0] - e.rx, c[1] - e.ry]); add([c[0] + e.rx, c[1] + e.ry]); });
    (spec.circles || []).forEach((e) => { const c = at(e.center); add([c[0] - e.r, c[1] - e.r]); add([c[0] + e.r, c[1] + e.r]); });
    const pad = 36;
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const sc = Math.min((W - 2 * pad) / ((maxx - minx) || 1), (H - 2 * pad) / ((maxy - miny) || 1));
    const offx = (W - (maxx - minx) * sc) / 2, offy = (H - (maxy - miny) * sc) / 2;
    const X = (x) => offx + (x - minx) * sc;
    const Y = (y) => H - offy - (y - miny) * sc;
    const P = (p) => [X(p[0]), Y(p[1])];
    const dash = (d) => (d ? ' stroke-dasharray="5 4"' : '');
    const out = [];
    const line = (a, b, d) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#000" stroke-width="1.6"${dash(d)}/>`;
    (spec.polygons || []).forEach((g) => {
      const v = g.vertices.map((q) => P(at(q)));
      out.push(`<polygon points="${v.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="1.6"${dash(g.dashed)}/>`);
    });
    (spec.segments || []).forEach((g) => {
      const a = P(at(g.a)), b = P(at(g.b));
      out.push(line(a, b, g.dashed));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      const n = g.ticks || 0;
      if (n > 0) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const nx = -uy, ny = ux;
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * 5;
          const cx = mx + ux * off, cy = my + uy * off;
          out.push(line([cx + nx * 5, cy + ny * 5], [cx - nx * 5, cy - ny * 5], false));
        }
      }
      if (g.label) out.push(text((a[0] + b[0]) / 2 + (-uy) * 12, (a[1] + b[1]) / 2 + ux * 12 + 4, g.label));
    });
    (spec.circles || []).forEach((g) => {
      const c = P(at(g.center));
      out.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(g.r * sc).toFixed(1)}" fill="none" stroke="#000" stroke-width="1.6"${dash(g.dashed)}/>`);
    });
    (spec.ellipses || []).forEach((g) => {
      const c = P(at(g.center));
      out.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(g.rx * sc).toFixed(1)}" ry="${(g.ry * sc).toFixed(1)}" fill="none" stroke="#000" stroke-width="1.6"${dash(g.dashed)}/>`);
    });
    const arcPath = (c, r, from, to) => {
      const rad = (d) => (d * Math.PI) / 180;
      const p0 = [c[0] + r * Math.cos(rad(from)), c[1] - r * Math.sin(rad(from))];
      const p1 = [c[0] + r * Math.cos(rad(to)), c[1] - r * Math.sin(rad(to))];
      const sweep = to - from > 180 || to - from < 0 ? 0 : 1;
      return `M${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 ${sweep === 1 ? 0 : 1} ${sweep === 1 ? 1 : 0} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    };
    (spec.arcs || []).forEach((g) => {
      const c = P(at(g.center));
      const d = arcPath(c, g.r * sc, g.from, g.to);
      out.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="1.2"/>`);
    });
    (spec.angles || []).forEach((g) => {
      const v = P(at(g.vertex)), a = P(at(g.a)), b = P(at(g.b));
      const ang = (p) => Math.atan2(-(p[1] - v[1]), p[0] - v[0]) * 180 / Math.PI;
      let from = ang(a), to = ang(b);
      let diff = ((to - from) % 360 + 360) % 360;
      if (diff > 180) { const t = from; from = to; to = t; diff = 360 - diff; }
      const r = g.r || 18;
      out.push(`<path d="${arcPath(v, r, from, from + diff)}" fill="none" stroke="#000" stroke-width="1"/>`);
      if (g.label) {
        const mid = ((from + diff / 2) * Math.PI) / 180;
        out.push(text(v[0] + Math.cos(mid) * (r + 12), v[1] - Math.sin(mid) * (r + 12) + 4, g.label));
      }
    });
    Object.entries(pts).filter(([name]) => !name.startsWith('_')).forEach(([name, p]) => {
      const q = P(p);
      out.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" fill="#000"/>`);
    });
    Object.entries(pts).filter(([name]) => !name.startsWith('_')).forEach(([name, p]) => {
      const q = P(p);
      out.push(text(q[0] + 8, q[1] - 6, name, { anchor: 'start' }));
    });
    (spec.labels || []).forEach((g) => {
      const q = P(at(g.at));
      out.push(text(q[0], q[1], g.text, { anchor: g.anchor || 'middle' }));
    });
    return out;
  }

  // Diagram: a free vector scene in SVG coordinates (y grows downward). Covers anything no chart kind does.
  const SHAPES = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'];
  const FILLS = ['none', 'solid', 'white', 'hatch', 'dots'];
  const SHAPE_NUMS = { rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], text: ['x', 'y'] };
  const isPt = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);

  function diagramShapeErrors(s, i) {
    if (!s || !SHAPES.includes(s.type)) return [`shapes[${i}].type must be one of ${SHAPES.join(', ')}`];
    const e = [];
    (SHAPE_NUMS[s.type] || []).forEach((k) => { if (!isNum(s[k])) e.push(`shapes[${i}].${k} must be a number`); });
    if ((s.type === 'circle' && s.r <= 0) || (s.type === 'rect' && (s.w <= 0 || s.h <= 0))) e.push(`shapes[${i}] needs a positive size`);
    if (s.type === 'polyline' || s.type === 'polygon') {
      const min = s.type === 'polygon' ? 3 : 2;
      if (!Array.isArray(s.points) || s.points.length < min || !s.points.every(isPt)) e.push(`shapes[${i}].points needs at least ${min} [x, y] pairs`);
    }
    if (s.type === 'path') {
      if (typeof s.d !== 'string' || !/^[MLHVCSQTAZmlhvcsqtaz0-9.,\s+-]+$/.test(s.d)) e.push(`shapes[${i}].d must be SVG path data`);
      if (!Array.isArray(s.extent) || s.extent.length !== 2 || !s.extent.every(isPt)) e.push(`shapes[${i}].extent needs [[x, y], [x, y]] for fitting`);
    }
    if (s.type === 'text' && typeof s.text !== 'string') e.push(`shapes[${i}].text must be a string`);
    if (s.fill != null && !FILLS.includes(s.fill)) e.push(`shapes[${i}].fill must be one of ${FILLS.join(', ')}`);
    if (s.arrow != null && !['end', 'start', 'both'].includes(s.arrow)) e.push(`shapes[${i}].arrow must be end, start or both`);
    return e;
  }

  // Points used to fit the view when the spec gives none.
  function diagramPoints(s) {
    switch (s.type) {
      case 'rect': return [[s.x, s.y], [s.x + s.w, s.y + s.h]];
      case 'circle': return [[s.cx - s.r, s.cy - s.r], [s.cx + s.r, s.cy + s.r]];
      case 'ellipse': return [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
      case 'line': return [[s.x1, s.y1], [s.x2, s.y2]];
      case 'polyline': case 'polygon': return s.points;
      case 'path': return s.extent;
      default: return [[s.x, s.y]];
    }
  }

  function paintFor(fill, id) {
    if (!fill || fill === 'none') return 'none';
    if (fill === 'solid') return '#000';
    if (fill === 'white') return '#fff';
    if (fill === 'dots') return `url(#${id}-dots)`;
    return `url(#${id}-hatch)`;
  }

  // Filled triangle at tip, pointing away from `from`.
  function arrowHead(tip, from) {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const L = 9, hw = 4;
    const bx = tip[0] - L * Math.cos(a), by = tip[1] - L * Math.sin(a);
    const p1 = [bx - hw * Math.sin(a), by + hw * Math.cos(a)];
    const p2 = [bx + hw * Math.sin(a), by - hw * Math.cos(a)];
    return `<polygon points="${[tip, p1, p2].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="#000"/>`;
  }

  function arrowsFor(s, pts) {
    const n = pts.length;
    const first = s.arrow === 'start' || s.arrow === 'both';
    const last = s.arrow === 'end' || s.arrow === 'both';
    return (last ? arrowHead(pts[n - 1], pts[n - 2]) : '') + (first ? arrowHead(pts[0], pts[1]) : '');
  }

  function diagramShape(s, id) {
    const st = `stroke="#000" stroke-width="${s.width || 1.6}"${s.dash ? ' stroke-dasharray="5 4"' : ''}`;
    const fill = paintFor(s.fill, id);
    const pl = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    switch (s.type) {
      case 'rect':
        return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx || 0}" fill="${fill}" ${st}/>`;
      case 'circle':
        return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${fill}" ${st}/>`;
      case 'ellipse':
        return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${fill}" ${st}/>`;
      case 'line': {
        const pts = [[s.x1, s.y1], [s.x2, s.y2]];
        return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" fill="none" ${st}/>` + arrowsFor(s, pts);
      }
      case 'polyline':
        return `<polyline points="${pl(s.points)}" fill="none" ${st}/>` + arrowsFor(s, s.points);
      case 'polygon':
        return `<polygon points="${pl(s.points)}" fill="${fill}" ${st}/>`;
      case 'path':
        return `<path d="${s.d}" fill="${fill}" ${st}/>`;
      case 'text':
        return text(s.x, s.y, s.text, { size: s.size, anchor: s.anchor, weight: s.weight, rotate: s.rotate });
    }
    return '';
  }

  function diagramSvg(spec, id) {
    let [x, y, w, h] = spec.view || [];
    if (!spec.view) {
      const pts = spec.shapes.flatMap(diagramPoints);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const pad = 12;
      x = Math.min(...xs) - pad;
      y = Math.min(...ys) - pad;
      w = Math.max(Math.max(...xs) - x + pad, 1);
      h = Math.max(Math.max(...ys) - y + pad, 1);
    }
    const body = spec.shapes.map((s) => diagramShape(s, id)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="100%" role="img" aria-label="${esc(spec.title || 'diagrama')}">` +
      `${patternDefs(id)}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
  }

  // Charts return an SVG string; tables return an HTML string. Invalid specs throw, so callers can fall back to the crop.
  function render(spec) {
    const errs = validate(spec);
    if (errs.length) throw new Error('invalid figure spec: ' + errs.join('; '));
    if (spec.kind === 'table') return tableHtml(spec);
    if (spec.kind === 'diagram') return diagramSvg(spec, `icf${++seq}`);
    const id = `icf${++seq}`;
    if (spec.kind === 'geometry') return svgOpen(spec.title, id) + geometrySvg(spec, id).join('') + '</svg>';
    const body = spec.kind === 'bar' ? barSvg(spec, id)
      : spec.kind === 'line' ? lineSvg(spec, id)
      : spec.kind === 'scatter' ? scatterSvg(spec, id)
      : spec.kind === 'curve' ? curveSvg(spec, id)
      : pieSvg(spec, id);
    return svgOpen(spec.title, id) + body.join('') + '</svg>';
  }

  return { KINDS, PATTERNS, validate, render, fmt, niceStep, scaleFor, TABLE_CSS };
});
