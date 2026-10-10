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

  const MARKERS = ['circle', 'square', 'triangle', 'dot', 'star', 'diamond', 'cross', 'none'];
  const KINDS = ['bar', 'line', 'scatter', 'curve', 'pie', 'table', 'geometry', 'diagram', 'combo', 'map'];
  const AXIS_KINDS = ['bar', 'line', 'scatter', 'curve', 'combo'];
  // Booklets print in grey-scale, so series use fill patterns, not grey shades.
  const PATTERNS = ['hatch', 'solid', 'white', 'dots', 'vhatch', 'hhatch', 'xhatch', 'sparse', 'dense', 'grey'];
  // Print greys for bars and lines: light, mid and dark, so a grey-scale print can show three tints.
  const GREYS = { lightgrey: '#dcdcdc', grey: '#b8b8b8', darkgrey: '#666666' };
  const SERIES_PATTERNS = ['hatch', 'solid', 'white', 'dots', 'vhatch', 'hhatch', 'xhatch', 'sparse', 'dense', 'lightgrey', 'grey', 'darkgrey'];
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
      if (a.scale != null && a.scale !== 'linear' && a.scale !== 'log') errs.push(`${name}.scale must be linear or log`);
      if (a.scale === 'log' && ((isNum(a.min) && a.min <= 0) || (isNum(a.max) && a.max <= 0))) errs.push(`${name}: a log axis needs positive min and max`);
      if (a.format != null && a.format !== 'plain' && a.format !== 'grouped') errs.push(`${name}.format must be plain or grouped`);
      if (a.domain != null && (!Array.isArray(a.domain) || a.domain.length !== 2 || !isNum(a.domain[0]) || !isNum(a.domain[1]) || a.domain[0] >= a.domain[1])) errs.push(`${name}.domain must be [lo, hi] with lo below hi`);
    };
    const series = Array.isArray(spec.series) ? spec.series : [];
    series.forEach((s, i) => { if (s && s.style != null && !['solid', 'dashed', 'dotted', 'dashdot'].includes(s.style)) errs.push(`series[${i}].style must be solid, dashed, dotted or dashdot`); });
    series.forEach((s, i) => { if (s && s.marker != null && !MARKERS.includes(s.marker)) errs.push(`series[${i}].marker must be one of ${MARKERS.join(', ')}`); });
    series.forEach((s, i) => { if (s && s.marker === 'none' && spec.kind !== 'line' && spec.kind !== 'curve') errs.push(`series[${i}].marker none is only for line and curve charts`); });
    series.forEach((s, i) => { if (s && s.pattern != null && !SERIES_PATTERNS.includes(s.pattern)) errs.push(`series[${i}].pattern must be one of ${SERIES_PATTERNS.join(', ')}`); });
    series.forEach((s, i) => {
      if (!s || s.note == null) return;
      if (typeof s.note !== 'string') errs.push(`series[${i}].note must be a string`);
      if (s.noteSide != null && !['above', 'right', 'left'].includes(s.noteSide)) errs.push(`series[${i}].noteSide must be above, right or left`);
      if (s.noteAt != null && !(Number.isInteger(s.noteAt) && s.noteAt >= 0)) errs.push(`series[${i}].noteAt must be a point index`);
    });
    if (AXIS_KINDS.includes(spec.kind)) {
      if (!spec.x || typeof spec.x.label !== 'string' || !spec.x.label) errs.push('x.label is required (axis title)');
      if (!spec.y || typeof spec.y.label !== 'string' || !spec.y.label) errs.push('y.label is required (axis title)');
    }
    if (spec.orientation != null && spec.orientation !== 'vertical' && spec.orientation !== 'horizontal') errs.push('orientation must be vertical or horizontal');
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
      });
    } else if (spec.kind === 'pie' && spec.rings != null) {
      if (!Array.isArray(spec.rings) || spec.rings.length < 1 || spec.rings.length > 3) errs.push('rings must be an array of 1 to 3 rings, outer ring first');
      else spec.rings.forEach((ring, k) => {
        if (!ring || !Array.isArray(ring.slices) || ring.slices.length < 1) return errs.push(`rings[${k}].slices needs at least one entry`);
        ring.slices.forEach((s, i) => { if (!isNum(s.value) || s.value < 0) errs.push(`rings[${k}].slices[${i}].value must be a number >= 0`); });
        if (!(ring.slices.reduce((t, s) => t + (isNum(s.value) ? s.value : 0), 0) > 0)) errs.push(`rings[${k}] values must add up to more than 0`);
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
      if (spec.maxWidth != null && !(isNum(spec.maxWidth) && spec.maxWidth > 0)) errs.push('maxWidth must be a positive number');
      if (spec.minSize != null && !(isNum(spec.minSize) && spec.minSize > 0)) errs.push('minSize must be a positive number');
      if (!Array.isArray(spec.rows)) errs.push('rows must be an array');
      else {
        const g = layoutTable(spec);
        errs.push(...g.errors);
      }
    }
    if (spec.kind === 'map' && spec.bounds != null && !(Array.isArray(spec.bounds) && spec.bounds.length === 4 && spec.bounds.every(isNum) && spec.bounds[0] < spec.bounds[2] && spec.bounds[1] < spec.bounds[3])) errs.push('bounds must be [minLon, minLat, maxLon, maxLat]');
    if (spec.kind === 'map') {
      if (!MAP_KEYS.includes(spec.region)) errs.push(`region must be one of ${MAP_KEYS.join(', ')}`);
      else {
        const doc = mapDoc(spec.region);
        const names = new Set(doc ? doc.features.map((f) => f.name) : []);
        if (!doc) errs.push(`region ${spec.region} could not be loaded`);
        if (spec.select) (Array.isArray(spec.select) ? spec.select : []).forEach((n) => { if (!names.has(n)) errs.push(`select: unknown area ${n}`); });
        else if (!Array.isArray(spec.select) && spec.select != null) errs.push('select must be an array of area names');
        for (const [n, v] of Object.entries(spec.fills || {})) {
          if (!names.has(n)) errs.push(`fills: unknown area ${n}`);
          if (!FILLS.includes(v) && !/^#[0-9a-fA-F]{3,6}$/.test(String(v))) errs.push(`fills.${n} must be a fill name or a hex grey/colour`);
        }
      }
      (spec.points || []).forEach((p, i) => { if (!isNum(p.lon) || !isNum(p.lat)) errs.push(`points[${i}] needs numeric lon and lat`); });
      (spec.labels || []).forEach((l, i) => { if (!isNum(l.lon) || !isNum(l.lat) || typeof l.text !== 'string') errs.push(`labels[${i}] needs lon, lat and text`); });
    }
    if (spec.kind === 'combo') {
      if (!Array.isArray(spec.categories) || spec.categories.length === 0) errs.push('categories must be a non-empty array');
      if (series.length === 0) errs.push('series must be a non-empty array');
      const usesSecondAxis = series.some((s) => s.axis === 2);
      if (usesSecondAxis && (!spec.y2 || !spec.y2.label)) errs.push('y2 with a label is required when a series uses axis 2');
      series.forEach((s, i) => {
        if (s.type !== 'bar' && s.type !== 'line') errs.push(`series[${i}].type must be bar or line`);
        if (s.axis != null && s.axis !== 1 && s.axis !== 2) errs.push(`series[${i}].axis must be 1 or 2`);
        if (!Array.isArray(s.values) || s.values.length !== (spec.categories || []).length) return errs.push(`series[${i}].values must have one entry per category`);
        s.values.forEach((v, j) => {
          if (v === null && s.type === 'line') return;
          if (!isNum(v)) errs.push(`series[${i}].values[${j}] must be a number`);
          else if (s.type === 'bar' && v < 0) errs.push(`series[${i}].values[${j}] must not be negative`);
        });
      });
      axis('y', spec.y);
      axis('y2', spec.y2);
    }
    if (spec.kind === 'diagram') {
      if (!Array.isArray(spec.shapes) || spec.shapes.length === 0) errs.push('shapes must be a non-empty array');
      else spec.shapes.forEach((s, i) => errs.push(...diagramShapeErrors(s, i)));
      if (spec.view != null && (!Array.isArray(spec.view) || spec.view.length !== 4 || !spec.view.every(isNum) || spec.view[2] <= 0 || spec.view[3] <= 0)) errs.push('view must be [x, y, width, height] with positive size');
    }
    if (spec.inverted != null && typeof spec.inverted !== 'boolean') errs.push('inverted must be true or false');
    if (spec.inverted === true && spec.kind !== 'line' && spec.kind !== 'curve') errs.push('inverted is only for line and curve charts');
    if (spec.kind === 'geometry') {
      const pts = spec.points || {};
      const ok = (v) => (typeof v === 'string' ? pts[v] != null : Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]));
      if (!spec.points || typeof spec.points !== 'object') errs.push('points must be an object of name: [x, y]');
      Object.entries(pts).forEach(([k, v]) => { if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) errs.push(`points.${k} must be [x, y]`); });
      (spec.segments || []).forEach((g, i) => { if (!ok(g.a) || !ok(g.b)) errs.push(`segments[${i}] needs known endpoints a and b`); });
      (spec.polygons || []).forEach((g, i) => {
        if (!Array.isArray(g.vertices) || g.vertices.length < 3 || !g.vertices.every(ok)) errs.push(`polygons[${i}] needs at least three known vertices`);
        if (g.fill != null && !FILLS.includes(g.fill)) errs.push(`polygons[${i}].fill must be one of ${FILLS.join(', ')}`);
      });
      (spec.circles || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.r) || g.r <= 0) errs.push(`circles[${i}] needs a center and a positive r`); });
      (spec.ellipses || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.rx) || !isNum(g.ry)) errs.push(`ellipses[${i}] needs a center, rx and ry`); });
      (spec.arcs || []).forEach((g, i) => { if (!ok(g.center) || !isNum(g.r) || !isNum(g.from) || !isNum(g.to)) errs.push(`arcs[${i}] needs center, r, from and to (degrees)`); });
      (spec.angles || []).forEach((g, i) => { if (!ok(g.vertex) || !ok(g.a) || !ok(g.b)) errs.push(`angles[${i}] needs known vertex, a and b`); });
      (spec.labels || []).forEach((g, i) => { if (!ok(g.at) || typeof g.text !== 'string') errs.push(`labels[${i}] needs at and text`); });
    }
    ['x', 'y'].forEach((k) => {
      if (!spec[k] || spec[k].scale !== 'log') return;
      const vals = series.flatMap((s) => (s.points ? s.points.map((p) => (Array.isArray(p) ? p[k === 'x' ? 0 : 1] : NaN)) : (s.values || [])));
      if (vals.some((v) => v !== null && (!isNum(v) || v <= 0))) errs.push(`${k} is a log axis, so every value must be above 0`);
    });
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

  // Years and other plain numbers are not grouped: 1995 must not read 1.995.
  function tickText(axis, v) {
    const plain = axis && (axis.format === 'plain' || (axis.format == null && /a[ñn]o|year/i.test(axis.label || '')));
    return plain ? String(v).replace('.', ',') : fmt(v);
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
    if (axis && axis.scale === 'log') return logScale(axis, values);
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

  // Log axis: bounds snap to powers of ten and every decade gets a tick.
  function logScale(axis, values) {
    const vals = values.filter((v) => isNum(v) && v > 0);
    const lo0 = isNum(axis.min) ? axis.min : (vals.length ? Math.min(...vals) : 1);
    const hi0 = isNum(axis.max) ? axis.max : (vals.length ? Math.max(...vals) : 10);
    const e0 = Math.floor(Math.log10(lo0));
    const e1 = Math.max(Math.ceil(Math.log10(hi0)), e0 + 1);
    const ticks = [];
    for (let e = e0; e <= e1; e++) ticks.push(Math.pow(10, e));
    return { lo: Math.pow(10, e0), hi: Math.pow(10, e1), step: 1, ticks, log: true };
  }

  // Characters that fit a category band at the axis label size (about 6.6 px a glyph).
  function catChars(band) { return Math.max(5, Math.min(14, Math.floor(band / 6.6))); }

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
      `<pattern id="${id}-vhatch" width="4" height="4" patternUnits="userSpaceOnUse">` +
      `<rect width="4" height="4" fill="#fff"/><line x1="2" y1="0" x2="2" y2="4" stroke="#000" stroke-width="1.2"/></pattern>` +
      `<pattern id="${id}-hhatch" width="4" height="4" patternUnits="userSpaceOnUse">` +
      `<rect width="4" height="4" fill="#fff"/><line x1="0" y1="2" x2="4" y2="2" stroke="#000" stroke-width="1.2"/></pattern>` +
      `<pattern id="${id}-xhatch" width="6" height="6" patternUnits="userSpaceOnUse">` +
      `<rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="6" y2="6" stroke="#000" stroke-width="1"/><line x1="6" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1"/></pattern>` +
      `<pattern id="${id}-sparse" width="9" height="9" patternUnits="userSpaceOnUse">` +
      `<rect width="9" height="9" fill="#fff"/><circle cx="4.5" cy="4.5" r="1.6" fill="#000"/></pattern>` +
      `<pattern id="${id}-dense" width="3.5" height="3.5" patternUnits="userSpaceOnUse">` +
      `<rect width="3.5" height="3.5" fill="#fff"/><circle cx="1.75" cy="1.75" r="1" fill="#000"/></pattern>` +
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
    if (GREYS[p]) return GREYS[p];
    if (['dots', 'vhatch', 'hhatch', 'xhatch', 'sparse', 'dense'].includes(p)) return `url(#${id}-${p})`;
    return `url(#${id}-hatch)`;
  }

  // Shared frame: title, legend, y axis with gridlines, and x axis line. `right` moves the plot edge for a second axis.
  function frame(spec, showLegend, yScale, right, extraBottom) {
    const out = [];
    let top = 14;
    if (spec.title) { out.push(text(W / 2, 18, spec.title, { weight: 'bold' })); top = 30; }
    let legendY = 0;
    if (showLegend) { legendY = top + 12; top += 18 * legendRows(legendSeries(spec), 58); }
    const left = 58;
    const plotRight = right == null ? W - 16 : right;
    const bottom = H - 50 - (extraBottom || 0);
    const tf = yScale.log ? Math.log10 : (v) => v;
    const y = (v) => bottom - (tf(v) - tf(yScale.lo)) / (tf(yScale.hi) - tf(yScale.lo)) * (bottom - top);
    for (const t of yScale.ticks) {
      out.push(`<line x1="${left}" x2="${plotRight}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#e4e4e4" stroke-width="1"/>`);
      out.push(text(left - 6, (y(t) + 4).toFixed(1), tickText(spec.y, t), { anchor: 'end' }));
    }
    out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<line x1="${left}" x2="${plotRight}" y1="${bottom}" y2="${bottom}" stroke="#000"/>`);
    if (spec.y && spec.y.label) out.push(text(14, (top + bottom) / 2, spec.y.label, { rotate: -90 }));
    if (spec.x && spec.x.label) out.push(text((left + plotRight) / 2, H - 6, spec.x.label));
    return { out, left, right: plotRight, top, bottom, y, legendY };
  }

  function legendLabel(s) { return s.name || s.label || ''; }
  // spec.legend = ["text", ...] sets each entry's text (one per series, '' hides an entry); spec.legend = false hides the legend.
  function legendOn(spec) {
    if (spec.legend === false) return false;
    if (Array.isArray(spec.legend)) return spec.legend.some(Boolean);
    return (spec.series || []).some((s) => s.name || s.label);
  }
  function legendSeries(spec) {
    return (spec.series || []).map((s, i) => (Array.isArray(spec.legend) ? { ...s, name: spec.legend[i] || '', label: undefined } : s));
  }
  // Entries flow left to right and wrap onto a new row when they reach the right edge.
  function legendLayout(series, left) {
    let x = left, row = 0;
    return series.map((s) => {
      if (!legendLabel(s)) return null;
      const w = 24 + String(legendLabel(s)).length * 7;
      if (x > left && x + w > W - 16) { x = left; row++; }
      const pos = { x, row };
      x += w;
      return pos;
    });
  }
  function legendRows(series, left) {
    const shown = legendLayout(series, left).filter(Boolean);
    return shown.length ? shown[shown.length - 1].row + 1 : 0;
  }
  // Line charts pass glyph = true: each entry shows its point marker instead of a filled swatch.
  function legend(series, left, top, id, glyph) {
    const out = [];
    legendLayout(series, left).forEach((pos, i) => {
      if (!pos) return;
      const s = series[i];
      const y = top + pos.row * 18;
      // glyph true: every entry shows its marker. glyph 'auto': only entries with a marker do.
      const shownMarker = s.marker !== 'none' && (glyph === true || (glyph === 'auto' && s.marker));
      if (shownMarker) out.push(marker(s.marker || 'circle', pos.x + 5, y - 5));
      else out.push(`<rect x="${pos.x}" y="${y - 10}" width="10" height="10" fill="${fillFor(s, i, id)}" stroke="#000"/>`);
      out.push(text(pos.x + 14, y - 1, legendLabel(s), { anchor: 'start' }));
    });
    return out;
  }

  // Horizontal bars: categories run down the left, values run across. spec.y is the value axis.
  function hbarSvg(spec, id) {
    const series = spec.series;
    const showLegend = legendOn(spec);
    const xScale = scaleFor(spec.y, series.flatMap((s) => s.values), true);
    const labelW = Math.min(170, Math.max(...spec.categories.map((c) => String(c).length)) * 6.5);
    const left = 24 + labelW;
    const right = W - 24;
    const legendY = 14 + (spec.title ? 16 : 0) + 12;
    const top = 14 + (spec.title ? 16 : 0) + (showLegend ? 18 * legendRows(legendSeries(spec), left) : 0);
    const bottom = H - 40;
    const out = [];
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    if (showLegend) out.push(...legend(legendSeries(spec), left, legendY, id));
    const xAt = (v) => left + (v - xScale.lo) / (xScale.hi - xScale.lo) * (right - left);
    for (const t of xScale.ticks) {
      out.push(`<line x1="${xAt(t).toFixed(1)}" x2="${xAt(t).toFixed(1)}" y1="${top}" y2="${bottom}" stroke="#e4e4e4" stroke-width="1"/>`);
      out.push(text(xAt(t).toFixed(1), bottom + 15, fmt(t)));
    }
    out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="#000"/>`);
    out.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="#000"/>`);
    if (spec.y && spec.y.label) out.push(text((left + right) / 2, H - 6, spec.y.label));
    if (spec.x && spec.x.label) out.push(text(12, (top + bottom) / 2, spec.x.label, { rotate: -90 }));
    const band = (bottom - top) / spec.categories.length;
    const barH = Math.min(26, band * 0.7 / series.length);
    spec.categories.forEach((cat, c) => {
      const cy = top + band * (c + 0.5);
      out.push(text(left - 6, (cy + 4).toFixed(1), cat, { anchor: 'end' }));
      series.forEach((s, si) => {
        const v = s.values[c];
        if (!isNum(v)) return;
        const x0 = xAt(Math.min(0, xScale.lo));
        const x1 = xAt(Math.max(v, 0));
        const y = cy - (barH * series.length) / 2 + si * barH;
        out.push(`<rect x="${Math.min(x0, x1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.abs(x1 - x0).toFixed(1)}" height="${barH.toFixed(1)}" fill="${fillFor(s, si, id)}" stroke="#000" stroke-width="0.8"/>`);
      });
    });
    return out;
  }

  function barSvg(spec, id) {
    if (spec.orientation === 'horizontal') return hbarSvg(spec, id);
    const series = spec.series;
    const showLegend = legendOn(spec);
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
    if (showLegend) out.push(...legend(legendSeries(spec), fr.left, fr.legendY, id));
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
      else wrapLabel(cat, catChars(band)).forEach((line, k) => out.push(text(cx.toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    return out;
  }

  function lineSvg(spec, id) {
    const series = spec.series;
    const showLegend = legendOn(spec);
    if (series.some((s) => Array.isArray(s.points))) return numericLine(spec, id, showLegend);
    const yScale = scaleFor(spec.y, series.flatMap((s) => s.values), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(legendSeries(spec), fr.left, fr.legendY, id, true));
    const n = spec.categories.length;
    const xAt = (c) => fr.left + (fr.right - fr.left) * (n === 1 ? 0.5 : c / (n - 1));
    spec.categories.forEach((cat, c) => {
      // Points at the edges put their labels at the edges: clamp each label so it stays inside the view.
      wrapLabel(cat, catChars((fr.right - fr.left) / n)).forEach((line, k) => {
        const half = line.length * 0.55 * 12 / 2;
        const lx = Math.min(W - 4 - half, Math.max(4 + half, xAt(c)));
        out.push(text(lx.toFixed(1), fr.bottom + 15 + k * 13, line));
      });
    });
    series.forEach((s, si) => {
      const pts = s.values.map((v, c) => (isNum(v) ? [xAt(c), fr.y(v)] : null));
      if (s.area) out.push(...areaPolygons(pts, fr.y(Math.max(0, yScale.lo)), fillFor(s, si, id)));
      out.push(...polyline(s, si, pts));
    });
    return out;
  }

  // Area under a line: one filled polygon per run of non-null points, closed on the baseline.
  function areaPolygons(pts, base, fill) {
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const pl = [...run, [run[run.length - 1][0], base], [run[0][0], base]];
        out.push(`<polygon points="${pl.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${fill}" stroke="none"/>`);
      }
      run = [];
    };
    for (const p of pts) { if (p) run.push(p); else flush(); }
    flush();
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
    if (showLegend) out.push(...legend(legendSeries(spec), fr.left, fr.legendY, id, true));
    const xAt = (v) => fr.left + (v - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
    for (const t of xScale.ticks) out.push(text(xAt(t).toFixed(1), fr.bottom + 15, tickText(spec.x, t)));
    series.forEach((s, si) => out.push(...polyline(s, si, s.points.map(([x, y]) => [xAt(x), fr.y(y)]))));
    return out;
  }

  // Solid lines unless style is dashed. Markers: open circle (default), filled square, or open triangle.
  function marker(kind, x, y) {
    const f = (v) => v.toFixed(1);
    if (kind === 'square') return `<rect x="${f(x - 3)}" y="${f(y - 3)}" width="6" height="6" fill="#000"/>`;
    if (kind === 'triangle') return `<polygon points="${f(x)},${f(y - 4)} ${f(x - 4)},${f(y + 3)} ${f(x + 4)},${f(y + 3)}" fill="#fff" stroke="#000" stroke-width="1.2"/>`;
    if (kind === 'dot') return `<circle cx="${f(x)}" cy="${f(y)}" r="3.5" fill="#000"/>`;
    if (kind === 'diamond') return `<polygon points="${f(x)},${f(y - 4.5)} ${f(x + 4.5)},${f(y)} ${f(x)},${f(y + 4.5)} ${f(x - 4.5)},${f(y)}" fill="#fff" stroke="#000" stroke-width="1.2"/>`;
    if (kind === 'cross') return `<path d="M${f(x - 4)},${f(y - 4)} L${f(x + 4)},${f(y + 4)} M${f(x + 4)},${f(y - 4)} L${f(x - 4)},${f(y + 4)}" stroke="#000" stroke-width="1.8" fill="none"/>`;
    if (kind === 'star') {
      const pts = [];
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2 : 5, a = -Math.PI / 2 + k * Math.PI / 5; pts.push(`${f(x + rr * Math.cos(a))},${f(y + rr * Math.sin(a))}`); }
      return `<polygon points="${pts.join(' ')}" fill="#fff" stroke="#000" stroke-width="1.2"/>`;
    }
    return `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
  }
  // Open markers keep grey-scale legibility.
  function polyline(s, si, pts) {
    const out = [];
    const dash = s.style === 'dashed' ? ' stroke-dasharray="5 3"' : s.style === 'dotted' ? ' stroke-dasharray="1 3" stroke-linecap="round"' : s.style === 'dashdot' ? ' stroke-dasharray="6 3 1 3" stroke-linecap="round"' : '';
    const real = pts.filter(Boolean);
    if (real.length > 1) out.push(`<polyline points="${real.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="1.8"${dash}/>`);
    if (s.marker !== 'none') for (const [x, y] of real) out.push(marker(s.marker, x, y));
    out.push(...seriesNote(s, pts));
    return out;
  }

  // A printed note on a line: "note" is the text, "noteAt" the point index (default: the middle point),
  // and "noteSide" is "above" (default), "right" or "left" of that point. Notes stay out of the legend.
  function seriesNote(s, pts) {
    if (!s.note) return [];
    const idx = isNum(s.noteAt) ? s.noteAt : Math.floor((pts.length - 1) / 2);
    const p = pts[idx];
    if (!p) return [];
    if (s.noteSide === 'right') return [text((p[0] + 6).toFixed(1), (p[1] + 4).toFixed(1), s.note, { anchor: 'start' })];
    if (s.noteSide === 'left') return [text((p[0] - 6).toFixed(1), (p[1] + 4).toFixed(1), s.note, { anchor: 'end' })];
    return [text(p[0].toFixed(1), (p[1] - 8).toFixed(1), s.note)];
  }

  function scatterSvg(spec, id) {
    const series = spec.series;
    const showLegend = legendOn(spec);
    const pts = series.flatMap((s) => s.points);
    const xScale = scaleFor(spec.x, pts.map((p) => p[0]), false);
    const yScale = scaleFor(spec.y, pts.map((p) => p[1]), false);
    const fr = frame(spec, showLegend, yScale);
    const out = fr.out;
    if (showLegend) out.push(...legend(legendSeries(spec), fr.left, fr.legendY, id, 'auto'));
    for (const t of xScale.ticks) {
      const x = fr.left + (t - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
      out.push(text(x.toFixed(1), fr.bottom + 15, tickText(spec.x, t)));
    }
    series.forEach((s, si) => {
      s.points.forEach(([px, py]) => {
        const x = fr.left + (px - xScale.lo) / (xScale.hi - xScale.lo) * (fr.right - fr.left);
        const y = fr.y(py);
        // A series with a marker draws that shape; others keep the alternating filled circle and square.
        if (s.marker) out.push(marker(s.marker, x, y));
        else if (si % 2 === 0) out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${fillFor(s, si, id)}" stroke="#000"/>`);
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
    // An axis with "ticks": true gets printed tick values, from its min, max and step, as the other charts do.
    // Without it a curve stays shape-only: no numbers.
    const ticked = (a) => !!(a && a.ticks === true);
    const xScale = ticked(spec.x) ? scaleFor(spec.x, pts.map((p) => p[0]), false) : null;
    const yScale = ticked(spec.y) ? scaleFor(spec.y, pts.map((p) => p[1]), false) : null;
    const xr = xScale ? { lo: xScale.lo, hi: xScale.hi } : range(spec.x, pts.map((p) => p[0]));
    const yr = yScale ? { lo: yScale.lo, hi: yScale.hi } : range(spec.y, pts.map((p) => p[1]));
    const left = 58;
    const right = W - 24;
    // The legend sits in rows above the plot, one line sample per series, so its dash shows.
    const showLegend = legendOn(spec);
    const legendY = spec.title ? 34 : 18;
    const legendRowsN = showLegend ? legendRows(legendSeries(spec), left) : 0;
    const top = showLegend ? legendY + 14 + 18 * legendRowsN + 4 : legendY;
    const bottom = H - 40;
    const sx = (v) => left + (v - xr.lo) / (xr.hi - xr.lo) * (right - left);
    const sy = (v) => bottom - (v - yr.lo) / (yr.hi - yr.lo) * (bottom - top);
    const out = [];
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    if (yScale) {
      for (const t of yScale.ticks) {
        const y = sy(t).toFixed(1);
        out.push(`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#e4e4e4" stroke-width="1"/>`);
        out.push(text(left - 6, (sy(t) + 4).toFixed(1), tickText(spec.y, t), { anchor: 'end' }));
      }
    }
    if (xScale) {
      for (const t of xScale.ticks) {
        out.push(`<line x1="${sx(t).toFixed(1)}" x2="${sx(t).toFixed(1)}" y1="${bottom}" y2="${bottom + 4}" stroke="#000"/>`);
        out.push(text(sx(t).toFixed(1), bottom + 15, tickText(spec.x, t)));
      }
    }
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
      const dash = s.style === 'dashed' ? ' stroke-dasharray="6 4"' : s.style === 'dotted' ? ' stroke-dasharray="1 3" stroke-linecap="round"' : s.style === 'dashdot' ? ' stroke-dasharray="6 3 1 3" stroke-linecap="round"' : '';
      out.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="2"${dash}/>`);
      if (s.label) {
        const at = Math.min(P.length - 1, s.labelAt != null ? s.labelAt : Math.floor(P.length / 2));
        out.push(text(P[at][0].toFixed(1), (P[at][1] - 8).toFixed(1), s.label));
      }
    });
    if (showLegend) out.push(...curveLegend(spec, left, legendY + 14));
    void id;
    return out;
  }

  // Curve legend: one row per entry, a short line sample in the series' style, then its name.
  function curveLegend(spec, left, top) {
    const out = [];
    const ser = legendSeries(spec);
    legendLayout(ser, left).forEach((pos, i) => {
      if (!pos) return;
      const s = ser[i];
      const y = top + pos.row * 18;
      const dash = s.style === 'dashed' ? ' stroke-dasharray="6 4"' : s.style === 'dotted' ? ' stroke-dasharray="1 3" stroke-linecap="round"' : s.style === 'dashdot' ? ' stroke-dasharray="6 3 1 3" stroke-linecap="round"' : '';
      out.push(`<line x1="${pos.x}" x2="${pos.x + 18}" y1="${y - 5}" y2="${y - 5}" stroke="#000" stroke-width="2"${dash}/>`);
      out.push(text(pos.x + 24, y - 1, legendLabel(s), { anchor: 'start' }));
    });
    return out;
  }

  // One slice of a pie or ring: an annular sector from radius r (0 = a wedge from the centre) out to R.
  function sectorPath(cx, cy, R, r, a1, a2, frac, fill) {
    const at = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    if (frac >= 0.9999) {
      return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${fill}" stroke="#000"/>` +
        (r > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#000"/>` : '');
    }
    if (frac <= 0) return '';
    const large = frac > 0.5 ? 1 : 0;
    const [x1, y1] = at(R, a1), [x2, y2] = at(R, a2);
    if (r <= 0) return `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${fill}" stroke="#000"/>`;
    const [x3, y3] = at(r, a2), [x4, y4] = at(r, a1);
    return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} A${r},${r} 0 ${large} 0 ${x4.toFixed(1)},${y4.toFixed(1)} Z" fill="${fill}" stroke="#000"/>`;
  }

  // spec.slices draws one circle. spec.rings draws 1 to 3 concentric rings, outer ring first;
  // each ring has its own slices and percentages, and the legend lists every slice.
  function pieSvg(spec, id) {
    const out = [];
    const rings = spec.rings || [{ slices: spec.slices }];
    const cx = 130;
    const cy = H / 2 + (spec.title ? 8 : 0);
    const r = 100;
    const hole = spec.rings ? 30 : 0;
    const band = (r - hole) / rings.length;
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    const entries = [];
    let idx = 0;
    rings.forEach((ring, k) => {
      const total = ring.slices.reduce((t, s) => t + s.value, 0);
      const outerR = r - k * band, innerR = outerR - band;
      let angle = -Math.PI / 2;
      ring.slices.forEach((s) => {
        const i = idx++;
        const frac = s.value / total;
        const a2 = angle + frac * 2 * Math.PI;
        const fill = fillFor(s, i, id);
        out.push(sectorPath(cx, cy, outerR, innerR, angle, a2, frac, fill));
        angle = a2;
        const pct = Math.round(frac * 1000) / 10;
        const name = spec.rings ? (ring.name ? `${ring.name}, ${s.label}` : `anillo ${k + 1}, ${s.label}`) : s.label;
        const parts = [];
        if (spec.values !== false) parts.push(fmt(s.value));
        if (spec.percent !== false) parts.push(`(${fmt(pct)} %)`);
        entries.push({ fill, text: parts.length ? `${name}: ${parts.join(' ')}` : name });
      });
    });
    const step = Math.min(24, Math.floor((H - 100) / Math.max(1, entries.length - 1)));
    entries.forEach((e, i) => {
      const ly = 80 + i * step;
      out.push(`<rect x="262" y="${ly - 10}" width="10" height="10" fill="${e.fill}" stroke="#000"/>`);
      out.push(text(278, ly - 1, e.text, { anchor: 'start' }));
    });
    return out;
  }

  // Table styling for the page that hosts the HTML. Kept here so the viewer and the app share one look.
  const TABLE_CSS = '.icfes-table{border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#000;background:#fff}' +
    '.icfes-table th,.icfes-table td{border:1px solid #000;padding:4px 10px;text-align:center}' +
    '.icfes-table caption{font-weight:bold;margin-bottom:4px}' +
    '.icfes-table{max-width:100%}.icfes-table th,.icfes-table td{overflow-wrap:anywhere}';

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
        placed[r].push({ text: o.text == null ? '' : String(o.text), colspan: cs, rowspan: rs, col: c, header: !!(o.header || row.header) });
        c += cs;
      });
      const span = (taken[r] || []).filter(Boolean).length;
      if (!width && r === 0) cols = span;
      if (cols && span !== cols) errors.push(`row ${r} covers ${span} columns, expected ${cols}`);
    });
    return { rows: placed, cols, errors };
  }

  // Table width is estimated from the glyph count: each column is as wide as its longest cell (no wrap) or its
  // longest word (wrapped). The font steps down from 14 px to minSize (default 10 px) until the unwrapped table fits maxWidth.
  const TABLE_PAD = 20; // padding per column, 10 px each side
  function tableFit(spec, g) {
    const maxW = isNum(spec.maxWidth) ? spec.maxWidth : 640;
    const minSize = isNum(spec.minSize) ? spec.minSize : 10;
    const full = [], word = [];
    g.rows.forEach((cells) => cells.forEach((c) => {
      if (c.colspan !== 1) return;
      full[c.col] = Math.max(full[c.col] || 0, c.text.length);
      word[c.col] = Math.max(word[c.col] || 0, ...c.text.split(/\s+/).map((w) => w.length));
    }));
    const sum = (arr) => arr.reduce((t, v) => t + (v || 0), 0);
    const widthAt = (size, lens) => sum(lens) * CHAR_EM * size + TABLE_PAD * g.cols;
    for (let size = 14; size > minSize; size--) {
      if (widthAt(size, full) <= maxW) return { size, wraps: false, widthAt: widthAt(size, full) };
    }
    return { size: Math.max(minSize, 1), wraps: widthAt(minSize, full) > maxW, widthAt: widthAt(minSize, word) };
  }

  function tableHtml(spec) {
    const g = layoutTable(spec);
    const fit = tableFit(spec, g);
    const body = g.rows.map((cells) => `<tr>${cells.map((c) => {
      const attrs = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
      return c.header ? `<th${attrs}>${esc(c.text)}</th>` : `<td${attrs}>${esc(c.text)}</td>`;
    }).join('')}</tr>`).join('');
    const cap = spec.title ? `<caption>${esc(spec.title)}</caption>` : '';
    const style = fit.size < 14 ? ` style="font-size:${fit.size}px"` : '';
    return `<table class="icfes-table"${style}>${cap}<tbody>${body}</tbody></table>`;
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
      out.push(`<polygon points="${v.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="${paintFor(g.fill, id)}" stroke="#000" stroke-width="1.6"${dash(g.dashed)}/>`);
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
      // The arc runs counter-clockwise (as the angles increase) from `from` to `to`. In SVG, sweep 0 is counter-clockwise on screen.
      const span = ((to - from) % 360 + 360) % 360;
      const large = span > 180 ? 1 : 0;
      return `M${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 ${large} 0 ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
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

  // Combo: bars and lines over one category axis. Bars group among themselves; lines pass through the category centres.
  // A series with axis 2 is read against y2, so a bar and a line can carry different units.
  function comboSvg(spec, id) {
    const series = spec.series;
    const showLegend = legendOn(spec);
    const primary = series.filter((s) => s.axis !== 2);
    const secondary = series.filter((s) => s.axis === 2);
    const yScale = scaleFor(spec.y, primary.flatMap((s) => s.values), true);
    const y2Scale = spec.y2 ? scaleFor(spec.y2, secondary.flatMap((s) => s.values), true) : null;
    const rotateLabels = spec.categories.some((c) => c.length * 6.5 > (W - 74) / spec.categories.length);
    const fr = frame(spec, showLegend, yScale, y2Scale ? W - 58 : W - 16, rotateLabels ? 36 : 0);
    const out = fr.out;
    if (y2Scale) {
      const yy = (v) => fr.bottom - (v - y2Scale.lo) / (y2Scale.hi - y2Scale.lo) * (fr.bottom - fr.top);
      out.push(`<line x1="${fr.right}" x2="${fr.right}" y1="${fr.top}" y2="${fr.bottom}" stroke="#000"/>`);
      for (const t of y2Scale.ticks) out.push(text(fr.right + 6, (yy(t) + 4).toFixed(1), fmt(t), { anchor: 'start' }));
      out.push(text(W - 12, (fr.top + fr.bottom) / 2, spec.y2.label, { rotate: 90 }));
    }
    if (showLegend) out.push(...legend(legendSeries(spec), fr.left, fr.legendY, id));
    const n = spec.categories.length;
    const band = (fr.right - fr.left) / n;
    const bars = series.map((s, i) => ({ s, i })).filter(({ s }) => s.type === 'bar');
    const barW = Math.min(44, band * 0.7 / Math.max(bars.length, 1));
    const yAt = (s, val) => {
      const sc = s.axis === 2 ? y2Scale : yScale;
      return fr.bottom - (val - sc.lo) / (sc.hi - sc.lo) * (fr.bottom - fr.top);
    };
    spec.categories.forEach((cat, c) => {
      const cx = fr.left + band * (c + 0.5);
      bars.forEach(({ s, i }, bi) => {
        const v = s.values[c];
        if (!isNum(v)) return;
        const yTop = yAt(s, Math.max(v, 0));
        const yBase = yAt(s, Math.min(0, (s.axis === 2 ? y2Scale : yScale).lo));
        const x = cx - (barW * bars.length) / 2 + bi * barW;
        out.push(`<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, yBase - yTop).toFixed(1)}" fill="${fillFor(s, i, id)}" stroke="#000" stroke-width="0.8"/>`);
      });
      if (rotateLabels) out.push(text(cx.toFixed(1), fr.bottom + 12, cat, { anchor: 'end', rotate: -45 }));
      else wrapLabel(cat, catChars(band)).forEach((line, k) => out.push(text(cx.toFixed(1), fr.bottom + 15 + k * 13, line)));
    });
    series.forEach((s, si) => {
      if (s.type !== 'line') return;
      const pts = s.values.map((v, c) => (isNum(v) ? [fr.left + band * (c + 0.5), yAt(s, v)] : null));
      out.push(...polyline(s, si, pts));
    });
    return out;
  }

  // Maps: simplified public-domain outlines (Natural Earth), bundled in maps/. Node loads them from there;
  // a browser build calls registerMap(key, doc) with the same JSON.
  const MAP_KEYS = ['colombia-departamentos', 'colombia-pais', 'sudamerica', 'mundo', 'europa', 'europa-1914'];
  const MAPS = {};
  function registerMap(key, doc) { MAPS[key] = doc; }
  function mapDoc(key) {
    if (!MAPS[key] && typeof require === 'function') {
      try { MAPS[key] = require('./maps/' + key + '.json'); } catch (e) { return null; }
    }
    return MAPS[key] || null;
  }

  // Equirectangular with a cosine correction for latitude; fits the given features into the frame.
  function mapProjector(features, box) {
    const [bx, by, bw, bh] = box;
    const pts = features.flatMap((f) => f.polygons.flatMap((poly) => poly.flatMap((ring) => ring)));
    const lats = pts.map((p) => p[1]);
    const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);
    const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const pad = 10;
    const sc = Math.min((bw - 2 * pad) / ((maxx - minx) || 1), (bh - 2 * pad) / ((maxy - miny) || 1));
    const offx = bx + (bw - (maxx - minx) * sc) / 2, offy = by + (bh - (maxy - miny) * sc) / 2;
    return ([lon, lat]) => [offx + (lon * k - minx) * sc, offy + (maxy - lat) * sc];
  }

  function mapSvg(spec, id) {
    const doc = mapDoc(spec.region);
    const fit = spec.bounds
      // A lon/lat box, given as [minLon, minLat, maxLon, maxLat], sets the view; the map is clipped to it.
      ? [{ polygons: [[[[spec.bounds[0], spec.bounds[1]], [spec.bounds[2], spec.bounds[1]], [spec.bounds[2], spec.bounds[3]], [spec.bounds[0], spec.bounds[3]]]]] }]
      : spec.select ? doc.features.filter((f) => spec.select.includes(f.name)) : doc.features;
    const legendRows = spec.legend ? legendLines(spec.legend).length : 0;
    const P = mapProjector(fit, [0, spec.title ? 26 : 6, W, H - (spec.title ? 26 : 6) - (legendRows ? 16 + 14 * legendRows : 0)]);
    const fills = spec.fills || {};
    const paint = (v) => (String(v).startsWith('#') ? v : paintFor(v, id));
    const out = [];
    if (spec.title) out.push(text(W / 2, 18, spec.title, { weight: 'bold' }));
    // The shapes are clipped to the plot box, so a view that spills past it does not run over the title or legend.
    const top = spec.title ? 26 : 6;
    const plotH = H - top - (legendRows ? 16 + 14 * legendRows : 0);
    out.push(`<clipPath id="${id}-plot"><rect x="0" y="${top}" width="${W}" height="${plotH}"/></clipPath><g clip-path="url(#${id}-plot)">`);
    doc.features.forEach((f) => {
      const d = f.polygons.map((poly) => poly.map((ring) =>
        'M' + ring.map((p) => P(p).map((n) => n.toFixed(1)).join(' ')).join('L') + 'Z').join(' ')).join(' ');
      out.push(`<path d="${d}" fill="${paint(fills[f.name] || 'none')}" fill-rule="evenodd" stroke="#000" stroke-width="0.7"/>`);
    });
    (spec.labels || []).forEach((l) => { const q = P([l.lon, l.lat]); out.push(text(q[0].toFixed(1), q[1].toFixed(1), l.text, { size: 10 })); });
    (spec.points || []).forEach((p) => {
      const q = P([p.lon, p.lat]);
      out.push(marker(p.marker, q[0], q[1]));
      if (p.label) out.push(text((q[0] + 7).toFixed(1), (q[1] - 5).toFixed(1), p.label, { anchor: 'start', size: 10 }));
    });
    out.push('</g>');
    if (spec.legend) {
      // Entries flow left to right and wrap onto the row above when they reach the right edge.
      const lines = legendLines(spec.legend);
      lines.forEach((line, r) => {
        const y = H - 10 - (lines.length - 1 - r) * 14;
        line.forEach((e) => {
          out.push(`<rect x="${e.x}" y="${y - 9}" width="10" height="10" fill="${paint(e.fill)}" stroke="#000"/>`);
          out.push(text(e.x + 14, y, e.label, { anchor: 'start', size: 11 }));
        });
      });
    }
    return out;
  }

  // Map legend entries laid out in rows that fit the view width.
  function legendLines(entries) {
    const rows = [[]];
    let x = 16;
    for (const l of entries) {
      const w = 28 + String(l.label).length * 6.5;
      if (x > 16 && x + w > W - 10) { rows.push([]); x = 16; }
      rows[rows.length - 1].push({ x, fill: l.fill, label: l.label });
      x += w;
    }
    return rows;
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
    if (s.type === 'text' && s.maxWidth != null && !(isNum(s.maxWidth) && s.maxWidth > 0)) e.push(`shapes[${i}].maxWidth must be a positive number`);
    if (s.type === 'text' && s.maxHeight != null && !(isNum(s.maxHeight) && s.maxHeight > 0)) e.push(`shapes[${i}].maxHeight must be a positive number`);
    if (s.type === 'text' && s.minSize != null && !(isNum(s.minSize) && s.minSize > 0)) e.push(`shapes[${i}].minSize must be a positive number`);
    if (s.fill != null && !FILLS.includes(s.fill)) e.push(`shapes[${i}].fill must be one of ${FILLS.join(', ')}`);
    if (s.arrow != null && !['end', 'start', 'both'].includes(s.arrow)) e.push(`shapes[${i}].arrow must be end, start or both`);
    return e;
  }

  // Text in a diagram can be boxed. maxWidth wraps the words; maxHeight shrinks the font, one point at a time,
  // down to minSize (default 7) until the block fits. Text that still does not fit is flagged, never silently cut.
  const CHAR_EM = 0.55; // average glyph width in em
  const LINE_EM = 1.15; // line height in em
  function textLayout(s) {
    const size0 = s.size || 12;
    if (!isNum(s.maxWidth)) return { size: size0, lines: [String(s.text)], overflow: false };
    const minSize = s.minSize || 7;
    const words = String(s.text).split(/\s+/).filter(Boolean);
    const wrapAt = (size) => {
      const max = Math.max(1, Math.floor(s.maxWidth / (CHAR_EM * size)));
      const lines = [];
      let cur = '';
      for (const w of words) {
        if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const widest = (size) => Math.max(0, ...words.map((w) => w.length)) * CHAR_EM * size;
    const fits = (size, lines) => widest(size) <= s.maxWidth && (!isNum(s.maxHeight) || lines.length * LINE_EM * size <= s.maxHeight);
    for (let size = size0; size >= minSize; size--) {
      const lines = wrapAt(size);
      if (fits(size, lines)) return { size, lines, overflow: false };
    }
    return { size: minSize, lines: wrapAt(minSize), overflow: true };
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
      case 'text': {
        if (!isNum(s.maxWidth)) return text(s.x, s.y, s.text, { size: s.size, anchor: s.anchor, weight: s.weight, rotate: s.rotate });
        const L = textLayout(s);
        const lh = LINE_EM * L.size;
        return L.lines.map((ln, k) => text(s.x, (s.y - (L.lines.length - 1) * lh / 2 + k * lh + 0.35 * L.size).toFixed(1), ln,
          { size: L.size, anchor: s.anchor, weight: s.weight, rotate: s.rotate })).join('');
      }
    }
    return '';
  }

  // Bounding box, in view units, of an unboxed text shape: width from the glyph count, turned by its rotate angle about the anchor.
  function textBox(s) {
    const size = s.size || 12;
    const w = String(s.text).length * CHAR_EM * size;
    const a0 = s.anchor === 'end' ? -w : s.anchor === 'start' ? 0 : -w / 2;
    const corners = [[a0, -0.8 * size], [a0 + w, -0.8 * size], [a0 + w, 0.25 * size], [a0, 0.25 * size]];
    const th = (s.rotate || 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    const pts = corners.map(([px, py]) => [s.x + px * c - py * sn, s.y + px * sn + py * c]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  // Text shapes that cannot fit their box even at minSize. Used by the audit.
  function textOverflows(spec) {
    const out = [];
    (spec.shapes || []).forEach((s, i) => {
      if (s.type === 'text' && textLayout(s).overflow) out.push(`shapes[${i}] text does not fit its box: ${s.text}`);
    });
    return out;
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
    if (spec.kind === 'map') return svgOpen(spec.title, id) + mapSvg(spec, id).join('') + '</svg>';
    if (spec.kind === 'geometry') return svgOpen(spec.title, id) + geometrySvg(spec, id).join('') + '</svg>';
    const body = spec.kind === 'combo' ? comboSvg(spec, id)
      : spec.kind === 'bar' ? barSvg(spec, id)
      : spec.kind === 'line' ? lineSvg(spec, id)
      : spec.kind === 'scatter' ? scatterSvg(spec, id)
      : spec.kind === 'curve' ? curveSvg(spec, id)
      : pieSvg(spec, id);
    const svg = svgOpen(spec.title, id) + body.join('') + '</svg>';
    return spec.inverted ? invertPanel(svg) : svg;
  }

  // A dark panel with light strokes and text, as some scans print. Black and white swap everywhere in the chart,
  // and the grid turns from light grey to dark grey so it still reads on the dark background.
  function invertPanel(svg) {
    return svg.replace(/#000(?![0-9a-fA-F])/g, '@@ink')
      .replace(/#fff(?![0-9a-fA-F])/gi, '#000')
      .replace(/@@ink/g, '#fff')
      .replace(/#e4e4e4/g, '#444444');
  }

  return { KINDS, PATTERNS, MAP_KEYS, validate, render, fmt, niceStep, scaleFor, TABLE_CSS, textLayout, textOverflows, textBox, registerMap };
});
