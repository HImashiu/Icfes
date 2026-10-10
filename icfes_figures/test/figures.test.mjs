import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../render.js');

const bar = { kind: 'bar', x: { label: 'Año' }, y: { label: 'Matrícula' }, categories: ['2019', '2020', '2021'], series: [{ name: 'Matrícula', values: [12, 30, 21] }] };
const line = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos' }, categories: ['Ene', 'Feb', 'Mar', 'Abr'], series: [{ values: [1, 4, null, 2] }] };
const numericLine = { kind: 'line', x: { label: 'Horas', min: 0, max: 10, step: 2 }, y: { label: 'Temperatura', min: 0, max: 40, step: 10 }, series: [{ name: 'A', points: [[0, 5], [4, 20], [10, 35]] }, { name: 'B', points: [[0, 30], [10, 10]] }] };
const dualBar = { kind: 'bar', x: { label: 'Mes' }, y: { label: 'Ventas' }, y2: { label: 'Precio', min: 0, max: 20, step: 5 }, categories: ['Ene', 'Feb'], series: [{ name: 'Ventas', values: [8, 12] }, { name: 'Precio', values: [10, 15], axis: 2 }] };
const scatter = { kind: 'scatter', x: { label: 'x', min: 0, max: 10, step: 2 }, y: { label: 'y' }, series: [{ points: [[1, 2], [4, 6.5]] }] };
const curve = { kind: 'curve', x: { label: 'Tiempo' }, y: { label: 'Posición' }, series: [{ name: 'Línea 1', label: 'Línea 1', style: 'solid', points: [[0, 0], [1, 2], [2, 3]] }, { name: 'Línea 2', label: 'Línea 2', style: 'dashed', points: [[0, 1], [1, 1.5], [2, 1.2]] }] };
const pie = { kind: 'pie', slices: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] };
const table = { kind: 'table', headers: ['Año', 'Total'], rows: [['2019', '12'], ['2020', '30']] };

test('valid specs of every kind validate', () => {
  for (const s of [bar, line, numericLine, dualBar, scatter, curve, pie, table]) assert.deepEqual(F.validate(s), [], s.kind);
});

test('invalid specs are reported, not drawn', () => {
  assert.ok(F.validate({ kind: 'donut' }).length > 0);
  assert.ok(F.validate({ kind: 'bar', categories: ['a', 'b'], series: [{ values: [1] }] }).length > 0);
  assert.ok(F.validate({ kind: 'bar', x: { label: 'a' }, y: { label: 'b' }, categories: ['a'], series: [{ values: [-1] }] }).length > 0);
  assert.ok(F.validate({ kind: 'table', headers: ['a', 'b'], rows: [['1']] }).length > 0);
  assert.ok(F.validate({ kind: 'pie', slices: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] }).length > 0);
  assert.throws(() => F.render({ kind: 'bar' }), /invalid figure spec/);
});

test('axis titles are required on charts', () => {
  const noTitles = { ...bar, x: undefined, y: undefined };
  const errs = F.validate(noTitles);
  assert.ok(errs.some((e) => /x\.label/.test(e)));
  assert.ok(errs.some((e) => /y\.label/.test(e)));
  assert.ok(F.validate({ ...dualBar, y2: { min: 0, max: 20 } }).some((e) => /y2\.label/.test(e)));
});

test('bar chart draws one rect per value and labels each category', () => {
  const svg = F.render(bar);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/stroke-width="0.8"/g) || []).length, 3);
  for (const c of ['2019', '2020', '2021']) assert.ok(svg.includes(`>${c}<`), c);
  assert.ok(svg.includes('<defs>'), 'pattern defs present for grey-scale fills');
});

test('dual-axis bar prints a second y scale with its title', () => {
  const svg = F.render(dualBar);
  assert.ok(svg.includes('Precio'));
  assert.ok(svg.includes('>20<'), 'secondary axis tick');
});

test('line chart breaks the polyline at a gap', () => {
  const svg = F.render(line);
  assert.equal((svg.match(/<polyline /g) || []).length, 1);
  assert.equal((svg.match(/<circle [^>]*r="3"/g) || []).length, 3);
});

test('numeric-x line draws one polyline per series', () => {
  const svg = F.render(numericLine);
  assert.equal((svg.match(/<polyline /g) || []).length, 2);
  assert.ok(svg.includes('>10<'), 'numeric x tick');
});

test('curve kind draws smooth dashed and solid paths with no tick values', () => {
  const svg = F.render(curve);
  assert.equal((svg.match(/<path /g) || []).length >= 2, true);
  assert.ok(svg.includes('stroke-dasharray'), 'dashed style');
  assert.ok(svg.includes('Línea 1') && svg.includes('Línea 2'));
});

test('scatter and pie render without throwing', () => {
  assert.match(F.render(scatter), /<circle /);
  const pieSvg = F.render(pie);
  assert.match(pieSvg, /<path /);
  assert.ok(pieSvg.includes('75 %'));
});

test('table renders as an HTML table and escapes cell text', () => {
  const html = F.render({ kind: 'table', headers: ['<b>'], rows: [['<i>x</i>']] });
  assert.match(html, /<table class="icfes-table">/);
  assert.ok(html.includes('&lt;i&gt;x&lt;/i&gt;'));
  assert.ok(F.TABLE_CSS.includes('.icfes-table'));
});

test('decimal comma on axis labels', () => {
  assert.equal(F.fmt(2.5), '2,5');
  assert.equal(F.fmt(4), '4');
  assert.equal(F.fmt(10000), '10.000');
  assert.equal(F.fmt(1234.5), '1.234,5');
});

test('domain widens the drawn scale without ticks outside min..max', () => {
  const spec = { kind: 'line', x: { label: 'Tiempo', min: 0, max: 10, step: 1, domain: [-1, 10] }, y: { label: 'Y', min: 0, max: 100, step: 10 },
    series: [{ name: 'A', points: [[-0.5, 2], [9.5, 70]] }] };
  assert.deepEqual(F.validate(spec), []);
  const svg = F.render(spec);
  assert.ok(!svg.includes('>-1<'), 'no tick label for -1');
  assert.ok(svg.includes('>10<'));
  assert.ok(F.validate({ ...spec, x: { ...spec.x, domain: [5, 1] } }).length > 0);
});

test('rotated category labels get extra bottom margin', () => {
  const long = { kind: 'bar', x: { label: 'Mes' }, y: { label: 'Ventas' }, categories: ['Septiembre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Octubre'], series: [{ values: [1,2,3,4,5,6,7,8,9,10,11,12] }] };
  const svg = F.render(long);
  assert.ok(svg.includes('rotate(-45'), 'labels rotate');
  const short = { ...long, categories: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] };
  assert.ok(!F.render(short).includes('rotate(-45'));
});

test('table spans: rowspan and colspan cells render and must cover the width', () => {
  const spec = { kind: 'table', rows: [['a', 'b', 'c'], ['1', '2']] };
  assert.ok(F.validate(spec).length > 0, 'rows of different width are rejected');
  const ok = { kind: 'table', rows: [[{ text: 'A', rowspan: 2 }, { text: 'B', colspan: 2 }], ['c', 'd']] };
  assert.deepEqual(F.validate(ok), []);
  const html = F.render(ok);
  assert.ok(html.includes('rowspan="2"') && html.includes('colspan="2"'));
});

test('geometry kind draws segments, ticks and angle marks; hidden points get no label', () => {
  const g = { kind: 'geometry', points: { A: [0, 0], B: [4, 0], C: [1, 3], _h: [2, 2] },
    segments: [{ a: 'A', b: 'B', ticks: 2 }, { a: 'B', b: 'C', dashed: true }],
    angles: [{ vertex: 'A', a: 'B', b: 'C', label: '45°' }] };
  assert.deepEqual(F.validate(g), []);
  const svg = F.render(g);
  assert.ok(svg.includes('stroke-dasharray'));
  assert.ok(svg.includes('45°'));
  assert.ok(!svg.includes('>_h<'));
  assert.ok(F.validate({ kind: 'geometry', points: { A: [0, 0] }, segments: [{ a: 'A', b: 'Z' }] }).length > 0);
});

const diagram = { kind: 'diagram', title: 'Circuito', shapes: [
  { type: 'rect', x: 0, y: 0, w: 60, h: 30, fill: 'hatch' },
  { type: 'circle', cx: 30, cy: 15, r: 8, fill: 'white' },
  { type: 'ellipse', cx: 90, cy: 15, rx: 10, ry: 6 },
  { type: 'line', x1: 0, y1: 40, x2: 60, y2: 40, arrow: 'end', dash: true },
  { type: 'polyline', points: [[0, 50], [20, 50], [20, 60]], arrow: 'both' },
  { type: 'polygon', points: [[70, 50], [80, 60], [60, 60]], fill: 'dots' },
  { type: 'path', d: 'M 0 70 Q 20 90 40 70', extent: [[0, 70], [40, 80]] },
  { type: 'text', x: 30, y: 25, text: 'R<1>' },
] };

test('diagram validates and renders every shape type', () => {
  assert.deepEqual(F.validate(diagram), []);
  const svg = F.render(diagram);
  for (const tag of ['<rect ', '<circle ', '<ellipse ', '<line ', '<polyline ', '<polygon ', '<path ']) assert.ok(svg.includes(tag), tag);
  assert.ok(svg.includes('R&lt;1&gt;'), 'text is escaped');
  assert.ok(svg.includes('stroke-dasharray'), 'dashed style applied');
  assert.ok(svg.includes('url(#icf'), 'pattern fill applied');
});

test('diagram arrows add arrowheads at the requested ends', () => {
  const one = (arrow) => F.render({ kind: 'diagram', shapes: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, arrow }] });
  const heads = (svg) => (svg.match(/<polygon points=/g) || []).length;
  assert.equal(heads(one(undefined)), 0);
  assert.equal(heads(one('end')), 1);
  assert.equal(heads(one('both')), 2);
});

test('diagram fits the view to its shapes unless view is given', () => {
  const fitted = F.render({ kind: 'diagram', shapes: [{ type: 'circle', cx: 0, cy: 0, r: 10 }] });
  assert.match(fitted, /viewBox="-22 -22 44 44"/);
  const fixed = F.render({ kind: 'diagram', view: [0, 0, 100, 50], shapes: [{ type: 'circle', cx: 5, cy: 5, r: 1 }] });
  assert.match(fixed, /viewBox="0 0 100 50"/);
});

test('invalid diagrams are reported', () => {
  assert.ok(F.validate({ kind: 'diagram', shapes: [] }).length > 0);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ type: 'star' }] }).length > 0);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ type: 'rect', x: 0, y: 0, w: 5 }] }).length > 0);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ type: 'path', d: '<script>', extent: [[0, 0], [1, 1]] }] }).length > 0);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, arrow: 'up' }] }).length > 0);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ type: 'rect', x: 0, y: 0, w: 5, h: 5, fill: 'red' }] }).length > 0);
});

const combo = { kind: 'combo', title: 'Gasto e ingreso', x: { label: 'Mes' }, y: { label: 'Gasto' }, y2: { label: 'Ingreso', min: 0, max: 100, step: 20 },
  categories: ['Ene', 'Feb', 'Mar'], series: [{ name: 'Gasto', type: 'bar', values: [40, 55, 30] }, { name: 'Ingreso', type: 'line', values: [60, 70, null], axis: 2 }] };

test('combo validates bars and lines, and needs y2 when a line uses axis 2', () => {
  assert.deepEqual(F.validate(combo), []);
  const noY2 = { ...combo, y2: undefined };
  assert.ok(F.validate(noY2).some((e) => /y2/.test(e)));
  assert.ok(F.validate({ ...combo, series: [{ type: 'area', values: [1, 2, 3] }] }).length > 0);
});

test('combo draws one rect per bar value and one polyline per line series', () => {
  const svg = F.render(combo);
  // Bars are the only rects with a 0.8 stroke; the pattern tiles and the legend are not bars.
  assert.equal((svg.match(/<rect [^>]*stroke-width="0.8"/g) || []).length, 3);
  assert.equal((svg.match(/<polyline /g) || []).length, 1);
});

test('horizontal bars draw one bar per value, and orientation is checked', () => {
  const h = { kind: 'bar', orientation: 'horizontal', title: 'Ventas', x: { label: 'Tienda' }, y: { label: 'Ventas', min: 0, max: 40, step: 10 },
    categories: ['Norte', 'Centro', 'Sur'], series: [{ name: '2019', values: [12, 30, 8] }, { name: '2020', values: [20, 25, 0] }] };
  assert.deepEqual(F.validate(h), []);
  assert.equal((F.render(h).match(/stroke-width="0.8"/g) || []).length, 6);
  assert.ok(F.validate({ ...h, orientation: 'diagonal' }).length > 0);
});

test('area fills under a line and skips gaps', () => {
  const a = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos', min: 0, max: 10, step: 2 }, categories: ['A', 'B', 'C', 'D'],
    series: [{ name: 'x', values: [1, 4, null, 2], area: true }] };
  assert.deepEqual(F.validate(a), []);
  // Two runs: [1, 4] has two points so it fills; the single point after the gap does not.
  assert.equal((F.render(a).match(/<polygon /g) || []).length, 1);
});

test('year axes are not grouped: 1995 stays 1995, not 1.995', () => {
  const yr = { kind: 'line', x: { label: 'Año', min: 1990, max: 2000, step: 5 }, y: { label: 'Tasa' }, series: [{ name: 'a', points: [[1990, 1], [2000, 3]] }] };
  const svg = F.render(yr);
  assert.ok(svg.includes('>1990<') && svg.includes('>2000<'));
  assert.ok(!svg.includes('1.990'));
  // An explicit format wins, and a non-year label keeps the grouped default.
  const grouped = { ...yr, x: { label: 'Año', min: 1990, max: 2000, step: 5, format: 'grouped' } };
  assert.ok(F.render(grouped).includes('1.990'));
  const money = { kind: 'line', x: { label: 'Pesos', min: 1000, max: 2000, step: 500 }, y: { label: 'Tasa' }, series: [{ name: 'a', points: [[1000, 1], [2000, 3]] }] };
  assert.ok(F.render(money).includes('1.000'));
});

test('log y axis places decades evenly and rejects zero or negative values', () => {
  const log = { kind: 'scatter', x: { label: 'Profundidad', min: 0, max: 10, step: 2 }, y: { label: 'Intensidad', scale: 'log' }, series: [{ points: [[1, 2], [4, 300], [8, 50000]] }] };
  assert.deepEqual(F.validate(log), []);
  const svg = F.render(log);
  // Decades 1, 10, 100, 1.000, 10.000, 100.000 each get a tick label.
  for (const t of ['>1<', '>10<', '>100<', '>1.000<', '>10.000<', '>100.000<']) assert.ok(svg.includes(t), t);
  assert.ok(F.validate({ ...log, series: [{ points: [[1, 0], [4, 3]] }] }).length > 0);
  assert.ok(F.validate({ ...log, y: { label: 'I', scale: 'log', min: 0 } }).length > 0);
  assert.ok(F.validate({ ...log, y: { label: 'I', scale: 'sqrt' } }).length > 0);
});

test('dotted style draws dotted lines on line and curve series', () => {
  const dotted = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos' }, categories: ['A', 'B', 'C'], series: [{ values: [1, 2, 3], style: 'dotted' }] };
  assert.deepEqual(F.validate(dotted), []);
  assert.ok(F.render(dotted).includes('stroke-dasharray="1 3"'));
  const curveDotted = { kind: 'curve', x: { label: 'T' }, y: { label: 'P' }, series: [{ points: [[0, 0], [1, 2]], style: 'dotted' }] };
  assert.deepEqual(F.validate(curveDotted), []);
  assert.ok(F.render(curveDotted).includes('stroke-dasharray="1 3"'));
  assert.ok(F.validate({ ...dotted, series: [{ values: [1, 2, 3], style: 'wavy' }] }).length > 0);
});

test('boxed text wraps to maxWidth and shrinks to fit maxHeight', () => {
  const t = { type: 'text', x: 50, y: 40, text: 'Recaptación del neurotransmisor en la neurona emisora', size: 12, maxWidth: 90, maxHeight: 40 };
  const L = F.textLayout(t);
  assert.ok(L.lines.length >= 2, 'wraps onto several lines');
  assert.ok(L.size < 12 && L.size >= 7, 'font shrinks but not below minSize');
  assert.ok(L.lines.length * 1.15 * L.size <= 40 + 1e-9, 'block fits the height');
  assert.equal(L.overflow, false);
  const svg = F.render({ kind: 'diagram', shapes: [t] });
  assert.equal((svg.match(/<text /g) || []).length, L.lines.length);
});

test('boxed text that cannot fit even at minSize is flagged, and short text is left alone', () => {
  const tight = { type: 'text', x: 0, y: 0, text: 'palabraextremadamentelarga', size: 12, maxWidth: 30, minSize: 7 };
  assert.equal(F.textLayout(tight).overflow, true);
  assert.deepEqual(F.textOverflows({ kind: 'diagram', shapes: [tight] }).length, 1);
  const ok = { type: 'text', x: 0, y: 0, text: 'ok', size: 12, maxWidth: 100 };
  assert.equal(F.textLayout(ok).overflow, false);
  assert.equal(F.textLayout(ok).size, 12);
  assert.ok(F.validate({ kind: 'diagram', shapes: [{ ...ok, maxWidth: -3 }] }).length > 0);
});

test('map draws bundled outlines, fills, points and labels, and validates its names', () => {
  const m = { kind: 'map', region: 'colombia-departamentos', fills: { Antioquia: 'hatch', Bolívar: '#bbbbbb' },
    points: [{ lon: -75.5, lat: 6.2, label: 'Medellín', marker: 'square' }], labels: [{ lon: -74.1, lat: 4.6, text: 'Bogotá' }] };
  assert.deepEqual(F.validate(m), []);
  const svg = F.render(m);
  assert.equal((svg.match(/<path /g) || []).length, 33);
  assert.ok(svg.includes('fill="#bbbbbb"'));
  assert.ok(svg.includes('>Bogotá<'));
  assert.ok(F.validate({ ...m, fills: { Narnia: 'solid' } }).length > 0);
  assert.ok(F.validate({ ...m, region: 'marte' }).length > 0);
  assert.deepEqual(F.validate({ kind: 'map', region: 'colombia-pais' }), []);
});

// Long category and legend labels must stay inside the 480 x 300 view (no clipping at the edges).
function textOutside(svg, W = 480, H = 300) {
  const out = [];
  const re = /<text ([^>]*)>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const a = m[1];
    const x = +a.match(/(?:^| )x="([-\d.]+)"/)[1], y = +a.match(/(?:^| )y="([-\d.]+)"/)[1];
    const size = +((a.match(/font-size="(\d+)"/) || [0, 12])[1]);
    const anchor = (a.match(/text-anchor="(\w+)"/) || [0, 'middle'])[1];
    const w = m[2].length * 0.55 * size;
    let l = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2, r = l + w, t = y - size * 0.8, b = y + size * 0.25;
    if (/rotate\(/.test(a)) { const hw = size * 0.8; l = x - hw; r = x + hw; t = y - w; b = y; }
    if (l < 0 || r > W || t < 0 || b > H) out.push(m[2]);
  }
  return out;
}

test('long category and legend labels stay inside the view', () => {
  const long = ['Hogares con ingresos muy altos', 'Hogares de clase media alta', 'Hogares con ingresos bajos', 'Otros hogares del país'];
  const specs = [
    { kind: 'combo', title: 'Gasto', x: { label: 'Mes' }, y: { label: 'Gasto (miles)' }, y2: { label: 'Ingreso (miles)', min: 0, max: 100, step: 20 }, categories: long, series: [{ name: 'Gasto mensual de los hogares', type: 'bar', values: [40, 55, 30, 20] }, { name: 'Ingreso anual promedio de la región', type: 'line', values: [60, 70, 50, 80], axis: 2 }] },
    { kind: 'line', title: 'Casos', x: { label: 'Mes' }, y: { label: 'Casos', min: 0, max: 10, step: 2 }, categories: long, series: [{ name: 'Casos confirmados en la semana', values: [1, 4, 3, 2], area: true }, { name: 'Otra serie con nombre largo', values: [2, 3, 2, 1] }] },
    { kind: 'line', x: { label: 'Año' }, y: { label: 'Tasa de desempleo' }, categories: long, series: [{ name: 'Serie uno con nombre largo', values: [1, 4, 3, 2] }, { name: 'Serie dos con nombre largo', values: [2, 3, 2, 1] }, { name: 'Serie tres con nombre largo', values: [2, 2, 2, 2] }] },
    { kind: 'bar', title: 'Ventas por región', x: { label: 'Región' }, y: { label: 'Ventas' }, categories: long, series: [{ name: 'Ventas del primer trimestre', values: [40, 55, 30, 20] }, { name: 'Ventas del segundo trimestre', values: [30, 45, 20, 10] }] },
  ];
  for (const s of specs) {
    assert.deepEqual(F.validate(s), [], s.kind);
    assert.deepEqual(textOutside(F.render(s)), [], s.kind);
  }
});

test('legend: false hides the legend for several series', () => {
  const two = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos' }, categories: ['Ene', 'Feb'], series: [{ name: 'Zeta leyenda', values: [1, 2] }, { name: 'Omega leyenda', values: [2, 1] }] };
  assert.ok(F.render(two).includes('>Zeta leyenda<'));
  assert.ok(!F.render({ ...two, legend: false }).includes('>Zeta leyenda<'));
});

test('pie rings: nested rings draw one annulus per slice and list every slice', () => {
  const rings = { kind: 'pie', title: 'Dos anillos', rings: [
    { name: 'Interno', slices: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] },
    { name: 'Externo', slices: [{ label: 'C', value: 2 }, { label: 'D', value: 2 }, { label: 'E', value: 4 }] },
  ] };
  assert.deepEqual(F.validate(rings), []);
  const svg = F.render(rings);
  assert.equal((svg.match(/<path /g) || []).length, 5);
  assert.ok(svg.includes('Interno, A: 1 (25 %)'));
  assert.ok(svg.includes('Externo, E: 4 (50 %)'));
  assert.ok(F.validate({ kind: 'pie', rings: [] }).length > 0);
  assert.ok(F.validate({ kind: 'pie', rings: [{ slices: [{ label: 'x', value: 0 }] }] }).length > 0);
  assert.ok(F.validate({ kind: 'pie', rings: [{ slices: [] }] }).length > 0);
});

test('pie without rings is unchanged: one circle, wedges from the centre', () => {
  const svg = F.render(pie);
  assert.ok(!svg.includes('anillo'));
  assert.equal((svg.match(/<path /g) || []).length, 2);
});

test('line markers: every named marker validates, unknown ones are rejected', () => {
  for (const m of ['circle', 'square', 'triangle', 'dot', 'star', 'diamond', 'cross']) {
    assert.deepEqual(F.validate({ ...line, series: [{ values: [1, 2, 3, 4], marker: m }, { values: [2, 1, 2, 1] }] }), [], m);
  }
  assert.ok(F.validate({ ...line, series: [{ values: [1, 2, 3, 4], marker: 'hexagon' }] }).length > 0);
});

test('line legend shows each series marker; a star is a ten-point polygon', () => {
  const s = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos' }, categories: ['Ene', 'Feb'], series: [{ name: 'Con estrella', values: [1, 2], marker: 'star' }, { name: 'Con punto', values: [2, 1], marker: 'dot' }] };
  const svg = F.render(s);
  const polys = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(polys.some((p) => p.split(' ').length === 10), 'star polygon present');
  assert.ok(svg.includes('>Con estrella<') && svg.includes('>Con punto<'));
  assert.ok(svg.includes('<circle') && svg.includes('fill="#000"'), 'filled dot present');
});

test('textBox: a rotated label is measured along its rotated direction', () => {
  // A vertical axis label, centred at y = 150 and placed near the left edge.
  const v = F.textBox({ type: 'text', text: 'Gráfica 1', x: 12, y: 150, size: 12, anchor: 'middle', rotate: -90 });
  const h = F.textBox({ type: 'text', text: 'Gráfica 1', x: 12, y: 150, size: 12, anchor: 'middle' });
  assert.ok(v.y1 - v.y0 > v.x1 - v.x0, 'taller than wide when rotated');
  assert.ok(h.x1 - h.x0 > h.y1 - h.y0, 'wider than tall when horizontal');
  assert.ok(v.x0 >= 0, 'stays inside a view that starts at 0');
  const far = F.textBox({ type: 'text', text: 'Gráfica 1', x: 2, y: 150, size: 12, anchor: 'middle', rotate: -90 });
  assert.ok(far.x0 < 0, 'a label placed at x = 2 runs past the left edge');
});

test('wide tables shrink their font to fit maxWidth and wrap long cells', () => {
  const wide = { kind: 'table', headers: ['Muestra', 'Color', 'Prueba de solubilidad en agua', 'Prueba de Lucas', 'Prueba de Jones', 'Tipo de alcohol', 'Sustancia'],
    rows: [['1', 'Incoloro', '(+)', '(-)', '(+)', 'Primario', 'Etanol'], ['2', 'Incoloro', '(+)', '(+)', '(+)', 'Secundario', '2-propanol'], ['3', 'Blanco', '(-)', '(+)', '(-)', 'Terciario', '2-metil-2-propanol'], ['4', 'Incoloro', '(+)', '(-)', '(+)', 'Primario', 'Metanol']] };
  assert.deepEqual(F.validate(wide), []);
  const html = F.render(wide);
  const size = +html.match(/font-size:(\d+)px/)[1];
  assert.ok(size < 14 && size >= 10, `font size ${size}`);
  const narrow = { kind: 'table', headers: ['Año', 'Total'], rows: [['2019', '12'], ['2020', '30']] };
  assert.ok(!/font-size/.test(F.render(narrow)), 'a small table keeps the default size');
  const forced = F.render({ ...wide, minSize: 8, maxWidth: 200 });
  assert.ok(/font-size:8px/.test(forced), 'stops at minSize');
  assert.ok(F.validate({ ...wide, maxWidth: -1 }).length > 0);
});

test('pies keep up to ten slices distinguishable in print', () => {
  const slices = Array.from({ length: 10 }, (_, i) => ({ label: `S${i + 1}`, value: 1 }));
  const svg = F.render({ kind: 'pie', slices });
  const fills = [...svg.matchAll(/<rect x="262" y="[-\d.]+" width="10" height="10" fill="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(fills.length, 10);
  assert.equal(new Set(fills).size, 10, 'each slice has its own fill');
});

test('pie hides printed-free labels: percent and values can be turned off', () => {
  const base = { kind: 'pie', slices: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] };
  assert.ok(F.render(base).includes('(25 %)'));
  const noPct = F.render({ ...base, percent: false });
  assert.ok(!noPct.includes(' %') && noPct.includes('>A: 1<'));
  const bare = F.render({ ...base, percent: false, values: false });
  assert.ok(bare.includes('>A<') && !bare.includes(': 1'));
});

test('legend: a list gives the printed entries; unnamed series get no invented entry', () => {
  const two = { kind: 'line', x: { label: 'Mes' }, y: { label: 'Casos' }, categories: ['Ene', 'Feb'], series: [{ values: [1, 2] }, { values: [2, 1] }] };
  assert.ok(!F.render(two).includes('serie'), 'no default serie N');
  const listed = F.render({ ...two, legend: ['Solo esta', ''] });
  assert.ok(listed.includes('>Solo esta<'));
  assert.ok(!listed.includes('>serie'), 'the empty entry is hidden');
  assert.deepEqual(F.validate({ ...two, legend: ['Solo esta', ''] }), []);
});

test('arcs run counter-clockwise from `from` to `to`, on the side the angles give', () => {
  const arcFlags = (svg) => {
    const m = svg.match(/<path d="M[^"]*A[\d.]+,[\d.]+ 0 (\d) (\d) /);
    return m ? { large: +m[1], sweep: +m[2] } : null;
  };
  const geo = (arc) => ({ kind: 'geometry', points: { O: [0, 0], A: [1, 0], B: [0, 1], C: [-1, 0] }, arcs: [{ center: 'O', r: 1, ...arc }] });
  assert.deepEqual(arcFlags(F.render(geo({ from: 0, to: 90 }))), { large: 0, sweep: 0 }, 'quarter arc');
  assert.deepEqual(arcFlags(F.render(geo({ from: 0, to: 180 }))), { large: 0, sweep: 0 }, 'half arc');
  assert.deepEqual(arcFlags(F.render(geo({ from: 0, to: 270 }))), { large: 1, sweep: 0 }, 'three-quarter arc');
  assert.deepEqual(arcFlags(F.render(geo({ from: 90, to: 0 }))), { large: 1, sweep: 0 }, 'from above to 0 runs the long way round');
});

test('the semicircle in S11-G1 2da Q46 is drawn above its diameter', () => {
  const spec = {
    kind: 'geometry',
    points: { A: [0, 0], B: [5, 0], C: [3.2, 2.4], _O: [2.5, 0] },
    arcs: [{ center: [2.5, 0], r: 2.5, from: 0, to: 180 }],
  };
  const svg = F.render(spec);
  const d = svg.match(/<path d="(M[^"]+)"/)[1];
  const [, x0, y0] = d.match(/^M([-\d.]+),([-\d.]+)/);
  const [, x1, y1] = d.match(/ ([-\d.]+),([-\d.]+)$/);
  // Both ends sit on the diameter; the arc's top is the smaller screen y.
  assert.ok(Math.abs(+y0 - +y1) < 0.5, 'ends on the same line');
  assert.ok(/ 0 0 0 /.test(svg), 'counter-clockwise half turn');
});

test('polygons take a fill; the default stays unfilled', () => {
  const base = { kind: 'geometry', points: { A: [0, 0], B: [4, 0], C: [2, 3] }, polygons: [{ vertices: ['A', 'B', 'C'] }] };
  assert.ok(F.render(base).includes('fill="none"'));
  assert.ok(F.render({ ...base, polygons: [{ vertices: ['A', 'B', 'C'], fill: 'solid' }] }).includes('fill="#000"'));
  assert.ok(F.validate({ ...base, polygons: [{ vertices: ['A', 'B', 'C'], fill: 'neon' }] }).length > 0);
});
