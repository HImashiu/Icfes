// Audit of figure specs: counts per exam, validation and render failures, and diagrams that are only boxes and text.
// Usage: node audit.js <specs-dir> [out.md]
// Reads every *.json spec in the folder and prints a Markdown report (to out.md when given).
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('./render.js');

const dir = process.argv[2] || '/mnt/project-files/icfes/figures/specs';
const outFile = process.argv[3];

const LINE_WORK = new Set(['circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
// One or two boxes and labels, with no line work: a photo stand-in. Text-only and flowchart diagrams are not flagged.
function onlyBoxesAndText(spec) {
  const shapes = spec.shapes || [];
  const types = new Set(shapes.map((s) => s.type));
  const rects = shapes.filter((s) => s.type === 'rect').length;
  return [...types].every((t) => t === 'rect' || t === 'text') && ![...types].some((t) => LINE_WORK.has(t)) && rects >= 1 && rects <= 2;
}

function auditFigure(f) {
  const issues = [];
  if (f.kind === 'image') return { kind: 'image', issues };
  const spec = f.spec;
  if (!spec) return { kind: f.kind || 'missing', issues: ['no spec'] };
  const kind = spec.kind || f.kind;
  const errs = F.validate(spec);
  if (errs.length) issues.push('invalid: ' + errs.slice(0, 2).join('; '));
  else if (kind !== 'table') {
    try { F.render(spec); } catch (e) { issues.push('render: ' + e.message.slice(0, 120)); }
  }
  if (kind === 'diagram' && spec.shapes && onlyBoxesAndText(spec)) issues.push('diagram is only boxes and text (check for a photo drawn as an empty box)');
  if (kind === 'diagram' && spec.shapes) {
    for (const o of F.textOverflows(spec)) issues.push('text overflow: ' + o);
    // Unboxed text that would run past the view: estimate its width from the glyph count.
    if (Array.isArray(spec.view)) {
      const [vx, vy, vw, vh] = spec.view;
      spec.shapes.forEach((t, i) => {
        if (t.type !== 'text' || t.maxWidth != null) return;
        const size = t.size || 12;
        const w = String(t.text).length * 0.55 * size;
        const left = t.anchor === 'end' ? t.x - w : t.anchor === 'start' ? t.x : t.x - w / 2;
        const right = left + w;
        if (left < vx - 1 || right > vx + vw + 1 || t.y < vy - 1 || t.y > vy + vh + 1) issues.push(`text runs outside the view: shapes[${i}] ${t.text}`);
      });
    }
  }
  return { kind, issues };
}

const rows = [];
const notRep = [];
const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
for (const name of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
  catch (e) { rows.push({ exam: name, error: 'not valid JSON: ' + e.message }); continue; }
  const counts = {};
  const problems = [];
  for (const f of data.figures || []) {
    const r = auditFigure(f);
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    for (const i of r.issues) problems.push(`${f.id}: ${i}`);
  }
  const pending = (data.not_representable || []).length;
  if (pending) notRep.push(...(data.not_representable || []).map((x) => ({ exam: name, ...x })));
  rows.push({ exam: name, counts, pending, problems, figures: (data.figures || []).length });
}

const kinds = [...new Set(rows.flatMap((r) => Object.keys(r.counts || {})))].sort();
const lines = [];
lines.push('# Figure audit');
lines.push('');
lines.push(`Specs read: ${files.length}. Figures: ${rows.reduce((a, r) => a + (r.figures || 0), 0)}. ` +
  `Images left: ${rows.reduce((a, r) => a + ((r.counts || {}).image || 0), 0)}. ` +
  `Not-representable entries: ${rows.reduce((a, r) => a + (r.pending || 0), 0)}. ` +
  `Problems: ${rows.reduce((a, r) => a + ((r.problems || []).length), 0)}.`);
lines.push('');
lines.push('## Per exam');
lines.push('');
lines.push(`| Exam | Figures | ${kinds.join(' | ')} | Not representable | Problems |`);
lines.push(`|---|---|${kinds.map(() => '---').join('|')}|---|---|`);
for (const r of rows) {
  if (r.error) { lines.push(`| ${r.exam} | error | ${r.error} |`); continue; }
  const cells = kinds.map((k) => (r.counts[k] || 0));
  lines.push(`| ${r.exam.replace('.json', '')} | ${r.figures} | ${cells.join(' | ')} | ${r.pending} | ${(r.problems || []).length} |`);
}
lines.push('');
lines.push('## Problems');
lines.push('');
const withProblems = rows.filter((r) => (r.problems || []).length || r.error);
if (!withProblems.length) lines.push('None.');
for (const r of withProblems) {
  lines.push(`### ${r.exam.replace('.json', '')}`);
  if (r.error) lines.push('- ' + r.error);
  for (const p of r.problems || []) lines.push('- ' + p);
  lines.push('');
}
lines.push('## Not representable');
lines.push('');
if (!notRep.length) lines.push('None.');
for (const x of notRep) {
  lines.push(`- ${x.exam.replace('.json', '')} Q${x.question}${x.stem_or_option ? ' (' + x.stem_or_option + ')' : ''}: ${x.reason}`);
}
const text = lines.join('\n') + '\n';
if (outFile) fs.writeFileSync(outFile, text, 'utf8');
process.stdout.write(text);
