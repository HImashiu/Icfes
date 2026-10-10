import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const boxes = { kind: 'diagram', view: [0, 0, 200, 100], shapes: [{ type: 'rect', x: 10, y: 10, width: 60, height: 40 }, { type: 'text', x: 40, y: 35, text: 'A' }] };

// Runs audit.js over one spec folder and returns its report.
function audit(figures) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-'));
  writeFileSync(join(dir, 'T-1ra.json'), JSON.stringify({ figures }));
  const out = join(dir, 'report.md');
  execFileSync(process.execPath, [join(here, '..', 'audit.js'), dir, out], { stdio: 'ignore' });
  return readFileSync(out, 'utf8');
}
const option = (letter, extra = {}) => ({ id: `t-q1-opt-${letter}`, location: { question: 1, stem_or_option: 'option', option: letter }, kind: 'diagram', spec: boxes, ...extra });

test('a boxes-and-text option is a stand-in unless it was checked against the scan', () => {
  const plain = audit([option('A'), option('B', { spec: { ...boxes, shapes: [{ type: 'rect', x: 5, y: 5, width: 50, height: 20 }, { type: 'text', x: 30, y: 18, text: 'B' }] } })]);
  assert.ok(plain.includes('only boxes and text'), 'flagged when not verified');
  const verified = audit([option('A', { options_verified: true }), option('B', { options_verified: true, spec: { ...boxes, shapes: [{ type: 'rect', x: 5, y: 5, width: 50, height: 20 }, { type: 'text', x: 30, y: 18, text: 'B' }] } })]);
  assert.ok(!verified.includes('only boxes and text'), 'not flagged once verified');
});
