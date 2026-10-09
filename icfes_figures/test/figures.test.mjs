import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../render.js');

const bar = { kind: 'bar', categories: ['2019', '2020', '2021'], series: [{ name: 'Matrícula', values: [12, 30, 21] }] };
const line = { kind: 'line', categories: ['Ene', 'Feb', 'Mar', 'Abr'], series: [{ values: [1, 4, null, 2] }] };
const scatter = { kind: 'scatter', x: { label: 'x', min: 0, max: 10, step: 2 }, series: [{ points: [[1, 2], [4, 6.5]] }] };
const pie = { kind: 'pie', slices: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] };
const table = { kind: 'table', headers: ['Año', 'Total'], rows: [['2019', '12'], ['2020', '30']] };

test('valid specs of every kind validate', () => {
  for (const s of [bar, line, scatter, pie, table]) assert.deepEqual(F.validate(s), [], s.kind);
});

test('invalid specs are reported, not drawn', () => {
  assert.ok(F.validate({ kind: 'donut' }).length > 0);
  assert.ok(F.validate({ kind: 'bar', categories: ['a', 'b'], series: [{ values: [1] }] }).length > 0);
  assert.ok(F.validate({ kind: 'bar', categories: ['a'], series: [{ values: [-1] }] }).length > 0);
  assert.ok(F.validate({ kind: 'table', headers: ['a', 'b'], rows: [['1']] }).length > 0);
  assert.ok(F.validate({ kind: 'pie', slices: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] }).length > 0);
  assert.throws(() => F.render({ kind: 'bar' }), /invalid figure spec/);
});

test('bar chart draws one rect per value and labels each category', () => {
  const svg = F.render(bar);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/stroke-width="0.8"/g) || []).length, 3);
  for (const c of ['2019', '2020', '2021']) assert.ok(svg.includes(`>${c}<`), c);
});

test('line chart breaks the polyline at a gap', () => {
  const svg = F.render(line);
  assert.equal((svg.match(/<polyline /g) || []).length, 1);
  assert.equal((svg.match(/<circle /g) || []).length, 3);
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
});

test('decimal comma on axis labels', () => {
  assert.equal(F.fmt(2.5), '2,5');
  assert.equal(F.fmt(4), '4');
  assert.equal(F.fmt(10000), '10.000');
  assert.equal(F.fmt(1234.5), '1.234,5');
});
