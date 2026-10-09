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
