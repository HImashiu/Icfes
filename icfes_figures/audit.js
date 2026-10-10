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

// Two option figures in one question that look alike: same kind and nearly the same numbers and labels.
// Compared without the title, token by token in order.
function tokens(spec) {
  const { title, ...rest } = spec || {};
  return (JSON.stringify(rest).match(/"[^"]*"|-?\d+(\.\d+)?/g) || []);
}
// Position by position: the same values in a different order (a swapped table row) count as different.
function similarity(a, b) {
  const n = Math.max(a.length, b.length);
  if (n === 0) return 1;
  let same = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
  return same / n;
}

// Text boxes inside one diagram that overlap each other. Width is estimated from the glyph count.
function overlappingText(spec) {
  const boxes = [];
  (spec.shapes || []).forEach((t, i) => {
    if (t.type !== 'text') return;
    if (t.maxWidth == null) {
      // Unboxed text: its rotated bounding box, so a vertical axis title is measured on its own direction.
      const b = F.textBox(t);
      boxes.push({ i, text: String(t.text), x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
      return;
    }
    const sz = F.textLayout(t).size;
    const lines = F.textLayout(t).lines;
    const w = Math.max(...lines.map((l) => l.length)) * 0.55 * sz;
    const h = lines.length * 1.15 * sz;
    const left = t.anchor === 'end' ? t.x - w : t.anchor === 'start' ? t.x : t.x - w / 2;
    const top = t.y - sz * 0.8;
    boxes.push({ i, text: String(t.text), x0: left, y0: top, x1: left + w, y1: top + h });
  });
  const out = [];
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      if (ox <= 0 || oy <= 0) continue;
      const smaller = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
      if (smaller > 0 && (ox * oy) / smaller > 0.2) out.push(`shapes[${A.i}] "${A.text}" overlaps shapes[${B.i}] "${B.text}"`);
    }
  }
  return out;
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
  // A figure marked text_only is a sign, ad or poster that is really text in a frame: not a stand-in, but listed for spot checks.
  // Options checked against the scan (options_verified) may be boxes and text on purpose, so they are not stand-ins.
  if (kind === 'diagram' && spec.shapes && onlyBoxesAndText(spec) && f.text_only !== true && f.options_verified !== true) issues.push('diagram is only boxes and text (check for a photo drawn as an empty box)');
  if (kind === 'diagram' && spec.shapes) {
    for (const o of F.textOverflows(spec)) issues.push('text overflow: ' + o);
    for (const o of overlappingText(spec)) issues.push('text overlap: ' + o);
    // Unboxed text that would run past the view: its rotated bounding box, from the glyph count.
    if (Array.isArray(spec.view)) {
      const [vx, vy, vw, vh] = spec.view;
      spec.shapes.forEach((t, i) => {
        if (t.type !== 'text' || t.maxWidth != null) return;
        const b = F.textBox(t);
        if (b.x0 < vx - 1 || b.x1 > vx + vw + 1 || b.y0 < vy - 1 || b.y1 > vy + vh + 1) issues.push(`text runs outside the view: shapes[${i}] ${t.text}`);
      });
    }
  }
  return { kind, issues };
}

// One exam can have several spec files (for example S11-A_2da.json plus S11-A_2da.batch4.json).
// The exam key is the file name up to the first dot; the files for one key are merged before auditing.
const examKey = (name) => name.split('.')[0];
const rows = [];
const notRep = [];
const textOnly = [];
const similar = [];
const verifiedSimilar = [];
const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
const groups = new Map();
for (const name of files) {
  const key = examKey(name);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(name);
}
for (const [exam, names] of groups) {
  const figures = [];
  const pendingList = [];
  let broken = null;
  for (const name of names) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
    catch (e) { broken = `${name}: not valid JSON: ${e.message}`; continue; }
    for (const f of data.figures || []) figures.push({ ...f, _file: name });
    for (const x of data.not_representable || []) pendingList.push({ ...x, _file: name });
  }
  if (broken) { rows.push({ exam, error: broken }); continue; }
  // Two files must not give the same figure id: the merged exam would show one of them silently.
  const seen = new Map();
  const problems = [];
  const counts = {};
  for (const f of figures) {
    if (seen.has(f.id)) problems.push(`${f.id}: duplicate id in ${seen.get(f.id)} and ${f._file}`);
    else seen.set(f.id, f._file);
    const r = auditFigure(f);
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    for (const i of r.issues) problems.push(`${f.id}: ${i}`);
    if (f.text_only === true) textOnly.push(`${exam} ${f.id}`);
  }
  // Option figures in one question that are the same or nearly so.
  const byQuestion = new Map();
  for (const f of figures) {
    const loc = f.location || {};
    if (loc.stem_or_option !== 'option' || !f.spec) continue;
    const key = String(loc.question);
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(f);
  }
  for (const [q, opts] of byQuestion) {
    for (let a = 0; a < opts.length; a++) {
      for (let b = a + 1; b < opts.length; b++) {
        const sim = similarity(tokens(opts[a].spec), tokens(opts[b].spec));
        if (sim >= 0.95 && opts[a].options_verified === true && opts[b].options_verified === true) {
          verifiedSimilar.push(`${exam} Q${q} ${opts[a].location.option}/${opts[b].location.option} ${Math.round(sim * 100)}%`);
        } else if (sim >= 0.95) {
          problems.push(`Q${q}: options ${opts[a].location.option} and ${opts[b].location.option} look the same (${Math.round(sim * 100)}% alike)`);
          similar.push(`${exam} Q${q} ${opts[a].location.option}/${opts[b].location.option} ${Math.round(sim * 100)}%`);
        }
      }
    }
  }
  for (const x of pendingList) notRep.push({ exam, ...x });
  rows.push({ exam, files: names, counts, pending: pendingList.length, problems, figures: figures.length });
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
  lines.push(`| ${r.exam} | ${r.figures} | ${cells.join(' | ')} | ${r.pending} | ${(r.problems || []).length} |`);
}
lines.push('');
lines.push('## Problems');
lines.push('');
const withProblems = rows.filter((r) => (r.problems || []).length || r.error);
if (!withProblems.length) lines.push('None.');
for (const r of withProblems) {
  lines.push(`### ${r.exam}`);
  if (r.error) lines.push('- ' + r.error);
  for (const p of r.problems || []) lines.push('- ' + p);
  lines.push('');
}
lines.push(`## Text-only figures (${textOnly.length}, spot-check that the label is not misused)`);
lines.push('');
if (!textOnly.length) lines.push('None.');
for (const t of textOnly) lines.push('- ' + t);
lines.push('');
lines.push(`## Similar option figures (${similar.length})`);
lines.push('');
if (!similar.length) lines.push('None.');
for (const t of similar) lines.push('- ' + t);
lines.push('');
lines.push(`## Verified similar options (${verifiedSimilar.length}, confirmed against a 300 dpi scan)`);
lines.push('');
if (!verifiedSimilar.length) lines.push('None.');
for (const t of verifiedSimilar) lines.push('- ' + t);
lines.push('');
lines.push('## Not representable');
lines.push('');
if (!notRep.length) lines.push('None.');
for (const x of notRep) {
  lines.push(`- ${x.exam} Q${x.question}${x.stem_or_option ? ' (' + x.stem_or_option + ')' : ''}: ${x.reason}`);
}
const text = lines.join('\n') + '\n';
if (outFile) fs.writeFileSync(outFile, text, 'utf8');
process.stdout.write(text);
