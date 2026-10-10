// Copies exam JSON from a data folder into public/exams so the app can load it.
// The catalog has one entry per exam: a golden file makes it "ready"; a figure spec alone makes it
// "proximamente" (listed, not openable). figures-review.json holds every spec for the internal #revision-figuras page.
// Exam content never goes into git: public/exams is gitignored and is rebuilt on every dev/build run.
//
// Source folder: $ICFES_DATA_DIR, or /mnt/project-files/icfes/data when that exists.
// Files:  <name>.golden.json  (exam, icfes-golden/1)
//         <name>.key.json     (optional answer key, icfes-key/1)
// Optional, from the icfes root (the parent of the data folder):
//         figures/specs/<name>.json  (figure specs, icfes-figures-specs/1)
//         answer-keys/<name>.key.json          (preliminary key: solved, not official)
//         answer-keys/<name>.key.sidecar.json  (per-question confidence and reasons)
// A key in the data folder counts as official; one from answer-keys is labelled preliminary.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { normalizeField } from "../src/lib/text-normalize.js";
// The figure engine validates specs; a spec it cannot draw hides its question (the app never shows an error box).
const figureEngine = createRequire(import.meta.url)("../../icfes_figures/render.js");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "exams");
const src = process.env.ICFES_DATA_DIR || "/mnt/project-files/icfes/data";
const root = dirname(src);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

if (!existsSync(src)) {
  console.warn(`[sync-exams] ${src} not found; the app will show no exams.`);
  writeFileSync(join(out, "index.json"), JSON.stringify({ exams: [] }, null, 2));
  process.exit(0);
}

const files = readdirSync(src);
const specDir = join(root, "figures", "specs");
// One spec per exam: "<exam>.json" or "<exam>.full.json". When both exist, the .full file wins.
const specFiles = new Map();
if (existsSync(specDir)) {
  for (const f of readdirSync(specDir).filter((n) => n.endsWith(".json"))) {
    const slug = f.replace(/\.full\.json$/, "").replace(/\.json$/, "");
    if (!specFiles.has(slug) || f.endsWith(".full.json")) specFiles.set(slug, f);
  }
}
// One spec file covers both sessions of the M booklet, so its 1ra golden uses the combined file.
const SPEC_ALIAS = { "S11-M_1ra": "S11-M_1ra-2da", "S11-M_2da": "S11-M_1ra-2da" };
for (const [golden, spec] of Object.entries(SPEC_ALIAS)) {
  if (!specFiles.has(golden) && specFiles.has(spec)) specFiles.set(golden, specFiles.get(spec));
}

// "S11-A 1ra" becomes "S11-A · Primera sesión", the same name the app shows (see formatBooklet in src/lib/exam.js).
const ORDINAL = { 1: "Primera", 2: "Segunda" };
const booklet = (t) =>
  t
    .replace(/\s+/g, " ")
    .replace(/^(S11-)\s+/i, "$1")
    .replace(/\s+(\d)(?:da|ra|a)?\s+sesi[oó]n\b/i, (m, n) => ` · ${ORDINAL[n] ?? n} sesión`)
    .replace(/\s+(\d)(?:da|ra)$/i, (m, n) => ` · ${ORDINAL[n] ?? n} sesión`);
// Cleans one exam's text for the app and decides which questions are shown.
// A question is hidden when something it needs is missing (a passage, a picture, a figure
// without a spec); a note standing in for a picture that is drawn is stripped instead.
// Every fix is counted in report[slug] so the sync log shows what is left in the data.
const PENDING_TEXT = /\[Texto pendiente/;
const FIGURE_NOTE = /\[(?:Figura pendiente|FIGURE)[^\]]*\]|(?:^|\n)[ \t]*Figura pendiente:[^\n]*/g;
const FIGURE_NOTE_ANY = /\[(?:Figura pendiente|FIGURE)|(?:^|\n)[ \t]*Figura pendiente:/;
const PICTURE = /!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi;
const PICTURE_ANY = /!\[|<img\b/i;
const FLAT_TABLE = /\[Tabla:[^\]]*\]/g;

// Questions the owners removed until their text is fixed.
const DROPPED = { "S11-L_1ra": [104] };

// Questions whose native figures the editor's validator cannot draw: { exam slug -> question numbers }.
// Read from the shared quality list; a missing file hides nothing extra.
const INVALID_FIGURES_PATH = "/mnt/project-files/icfes/quality/invalid-figures.json";
const invalidFigureQuestions = new Map();
if (existsSync(INVALID_FIGURES_PATH)) {
  for (const row of JSON.parse(readFileSync(INVALID_FIGURES_PATH, "utf8")).invalid ?? []) {
    if (!invalidFigureQuestions.has(row.exam)) invalidFigureQuestions.set(row.exam, new Set());
    invalidFigureQuestions.get(row.exam).add(row.question);
  }
}

// Traced figures: figures/traced/<exam>/manifest.json maps a question to a scan trace (an SVG).
// Only "azure" entries with an SVG count; each SVG is copied next to the exam files, and the
// question gets { url, figure_id, spec_id } so the app shows the trace in place of the spec.
function loadTraced(slug) {
  const traced = new Map();
  const manifest = join(root, "figures", "traced", slug, "manifest.json");
  if (!existsSync(manifest)) return traced;
  for (const e of JSON.parse(readFileSync(manifest, "utf8")).figures ?? []) {
    // "azure" traces come from Azure regions; "eyeballed_box" traces come from a box drawn by eye on the scan.
    if (!["azure", "eyeballed_box"].includes(e.method) || !e.svg) continue;
    const from = join(root, "figures", e.svg);
    if (!existsSync(from)) continue;
    const file = basename(e.svg);
    mkdirSync(join(out, "traced", slug), { recursive: true });
    writeFileSync(join(out, "traced", slug, file), readFileSync(from));
    // A figure named for one option (for example "...-opt-A-" or "...-opcion-b-") belongs to that option.
    const option = /[-_](?:opt|opcion|opción)[-_]([a-d])(?=[-_]|$)/i.exec(e.figure_id ?? "")?.[1]?.toUpperCase() ?? null;
    const list = traced.get(e.question) ?? [];
    list.push({ url: `exams/traced/${slug}/${file}`, figure_id: e.figure_id, spec_id: e.spec_id, option });
    traced.set(e.question, list);
  }
  return traced;
}

// Pictures pasted into goldens: <img src="IMG:<exam>/<file>"> points at data/images/<exam>/<file>.
// The file is copied into public/exams/images/<exam>/ and the src is rewritten to that relative path.
const IMG_TAG = /(<img\b[^>]*?\bsrc=")IMG:([^"\/]+)\/([^"]+)(")/g;
function resolveImages(exam, slug) {
  const copied = new Set();
  let missing = 0;
  const fix = (html) => {
    if (typeof html !== "string" || !html.includes("IMG:")) return html;
    return html.replace(IMG_TAG, (m, pre, dir, file, post) => {
      const name = file.replace(/[^\w.-]/g, "_");
      const from = [join(src, "images", dir, file), join(src, "images", slug.replace(/^S11-/, ""), file)].find((p) => existsSync(p));
      if (!from) { missing++; return m; }
      const rel = `exams/images/${slug}/${name}`;
      if (!copied.has(name)) {
        mkdirSync(join(out, "images", slug), { recursive: true });
        copyFileSync(from, join(out, "images", slug, name));
        copied.add(name);
      }
      return `${pre}${rel}${post}`;
    });
  };
  for (const g of exam.groups ?? []) for (const k of ["passage_md", "stimulus_md", "directions"]) g[k] = fix(g[k]);
  for (const q of exam.questions ?? []) {
    q.stem_md = fix(q.stem_md);
    q.stimulus_md = fix(q.stimulus_md);
    for (const o of q.options ?? []) o.text_md = fix(o.text_md);
  }
  return missing;
}

function prepareExam(exam, specPath, slug, report) {
  const specFigures = specPath && existsSync(specPath) ? JSON.parse(readFileSync(specPath, "utf8")).figures ?? [] : [];
  const specIds = new Set(specFigures.map((f) => f.id));
  const traced = loadTraced(slug);
  const dropped = new Set(DROPPED[slug] ?? []);
  // A traced question keeps no spec link: the trace replaces the spec figure it was drawn from.
  for (const q of exam.questions ?? []) {
    const list = traced.get(q.number);
    if (!list) continue;
    const replaced = new Set(list.flatMap((t) => [t.spec_id, t.figure_id]));
    q.figure = [].concat(q.figure ?? []).filter((id) => !replaced.has(id));
    if (!q.figure.length) delete q.figure;
    for (const o of q.options ?? []) {
      if (o.figure && replaced.has(o.figure)) delete o.figure;
      const mine = list.find((t) => t.option === o.letter);
      if (mine) o.traced = { url: mine.url, figure_id: mine.figure_id };
    }
    const stem = list.filter((t) => !t.option);
    if (stem.length) q.traced = stem.map((t) => ({ url: t.url, figure_id: t.figure_id }));
  }
  const badSpecIds = new Set(specFigures.filter((f) => f.spec && f.kind !== "image" && figureEngine.validate(f.spec).length).map((f) => f.id));
  const badStemQuestions = new Set(specFigures.filter((f) => badSpecIds.has(f.id) && f.location?.question != null).map((f) => f.location.question));
  // The editor's validator list: questions whose native figures it cannot draw (see quality/invalid-figures.json).
  const invalidQuestions = invalidFigureQuestions.get(slug) ?? new Set();
  const groups = new Map((exam.groups ?? []).map((g) => [g.id, g]));
  const fixes = {};
  const left = {};
  const hiddenBy = {};
  const bump = (bag, key, n = 1) => {
    if (n) bag[key] = (bag[key] ?? 0) + n;
  };
  const textOf = (q) => {
    const g = groups.get(q.group_id);
    return [q.stem_md, q.stimulus_md, g?.stimulus_md, g?.directions, ...(q.options ?? []).map((o) => o.text_md)]
      .filter((t) => typeof t === "string");
  };
  const hasFigure = (q) =>
    traced.has(q.number) ||
    [].concat(q.figure ?? []).length > 0 ||
    (q.options ?? []).some((o) => [].concat(o.figure ?? []).length > 0);

  // Decide each question first: a question with any gap is hidden and does not count as shown.
  const decisions = (exam.questions ?? []).map((q) => {
    const texts = textOf(q).join("\n");
    const figure = hasFigure(q);
    const reasons = [];
    if (dropped.has(q.number)) reasons.push("dropped_by_owner");
    if (PENDING_TEXT.test(texts)) reasons.push("texto_pendiente");
    if (FIGURE_NOTE_ANY.test(texts) && !figure) reasons.push("figura_pendiente");
    if (PICTURE_ANY.test(texts) && !figure) reasons.push("picture_without_figure");
    // A table flattened into text stands in for a drawn table; without its link it is a gap.
    if (/\[Tabla:/.test(texts) && !figure) reasons.push("flattened_table_unlinked");
    if (q.pending_spec || (q.options ?? []).some((o) => o.pending_spec)) reasons.push("pending_spec");
    const missingSpec = [].concat(q.figure ?? []).concat((q.options ?? []).flatMap((o) => [].concat(o.figure ?? [])));
    if (missingSpec.some((id) => !specIds.has(id))) reasons.push("figure_without_spec");
    const linked = [].concat(q.figure ?? []).concat((q.options ?? []).flatMap((o) => [].concat(o.figure ?? [])));
    if (linked.some((id) => badSpecIds.has(id)) || badStemQuestions.has(q.number)) reasons.push("figure_render_error");
    if (invalidQuestions.has(q.number)) reasons.push("figure_render_error");
    return { q, figure, reasons };
  });

  const shownQuestions = [];
  const shownByGroup = new Map();
  for (const { q, figure, reasons } of decisions) {
    if (reasons.length) {
      bump(hiddenBy, reasons[0]);
      continue;
    }
    shownQuestions.push({ q, figure });
    if (q.group_id) shownByGroup.set(q.group_id, (shownByGroup.get(q.group_id) ?? true) && figure);
  }

  // Groups: text fixes once; notes and pictures go only when every shown question of the group has its figure.
  for (const g of exam.groups ?? []) {
    const allFigures = shownByGroup.get(g.id) === true;
    for (const key of ["stimulus_md", "directions", "passage_md"]) {
      if (typeof g[key] !== "string") continue;
      let t = normalizeField(g[key], { counts: fixes });
      if (allFigures) t = stripFigureMarks(t, fixes);
      else if (key === "stimulus_md" && FIGURE_NOTE_ANY.test(t)) bump(left, "figure_note_in_group");
      g[key] = t;
    }
    // The golden's passage_md is the group passage; the app reads stimulus_md, so it takes passage_md when set.
    if (typeof g.passage_md === "string" && g.passage_md.trim()) g.stimulus_md = g.passage_md;
    // A passage that repeats the group's directions (the "RESPONDA LAS PREGUNTAS…" line) drops the repeat.
    const head = (s) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/[#*\s]+/g, " ").trim().toLowerCase();
    if (g.directions && g.stimulus_md && head(g.directions).length > 20 && head(g.stimulus_md).startsWith(head(g.directions).slice(0, 40))) {
      g.stimulus_md = g.stimulus_md.replace(/^[^\n]*\n*/, "");
      bump(fixes, "directions_repeat_removed");
    }
  }

  for (const { q, figure } of shownQuestions) {
    const n = q.number;
    for (const key of ["stem_md", "stimulus_md"]) {
      if (typeof q[key] !== "string") continue;
      let t = normalizeField(q[key], { number: n, leadingNumber: key === "stem_md", counts: fixes });
      if (figure) t = stripFigureMarks(t, fixes);
      else if (FIGURE_NOTE_ANY.test(t)) bump(left, "figure_note_left");
      if (figure && FLAT_TABLE.test(t)) {
        t = t.replace(FLAT_TABLE, "").trim();
        bump(fixes, "flattened_table_removed");
      }
      q[key] = t;
    }
    for (const o of q.options ?? []) {
      if (typeof o.text_md === "string") o.text_md = normalizeField(o.text_md, { counts: fixes });
    }
    if (!(q.stem_md ?? "").trim() && !figure && !(q.stimulus_md ?? "").trim()) bump(left, "empty_stem");
    if ((q.options ?? []).some((o) => !(o.text_md ?? "").trim() && !o.figure)) bump(left, "empty_option_no_figure");
    if (q.expected_options && q.options?.length !== q.expected_options) bump(left, "option_count_differs");
  }

  const hidden = Object.values(hiddenBy).reduce((a, b) => a + b, 0);
  report[slug] = { total: (exam.questions ?? []).length, shown: shownQuestions.length, hidden: hiddenBy, fixes, left };
  const fixText = Object.entries(fixes).map(([k, v]) => `${k} ${v}`).join(", ");
  const hideText = Object.entries(hiddenBy).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`[normalize] ${slug}: shown ${shownQuestions.length}/${(exam.questions ?? []).length}${fixText ? `; ${fixText}` : ""}${hidden ? `; hidden ${hideText}` : ""}`);
  return { ...exam, questions: shownQuestions.map((x) => x.q) };
}

// Figure notes and picture references are removed once a native figure stands in for them.
function stripFigureMarks(text, fixes) {
  let t = text;
  t = t.replace(FIGURE_NOTE, () => {
    fixes.placeholders_stripped = (fixes.placeholders_stripped ?? 0) + 1;
    return "";
  });
  t = t.replace(PICTURE, () => {
    fixes.pictures_stripped = (fixes.pictures_stripped ?? 0) + 1;
    return "";
  });
  return t.trim();
}

const exams = [];
const report = {};
for (const file of files.filter((f) => f.endsWith(".golden.json"))) {
  const slug = file.replace(/\.golden\.json$/, "");
  const exam = JSON.parse(readFileSync(join(src, file), "utf8"));
  if (exam.format !== "icfes-golden/1") {
    console.warn(`[sync-exams] skipped ${file}: format ${exam.format}`);
    continue;
  }
  const specPath = specFiles.has(slug) ? join(specDir, specFiles.get(slug)) : null;
  const shown = prepareExam(exam, specPath, slug, report);
  const imagesMissing = resolveImages(shown, slug);
  if (imagesMissing) console.warn(`[images] ${slug}: ${imagesMissing} picture(s) not found in data/images`);
  writeFileSync(join(out, `${slug}.json`), JSON.stringify(shown));
  // The same spec the catalog uses: the .full file when there is one.
  const figFile = specFiles.has(slug) ? join(specDir, specFiles.get(slug)) : null;
  let hasFigures = false;
  if (figFile && existsSync(figFile)) {
    writeFileSync(join(out, `${slug}.figures.json`), readFileSync(figFile));
    hasFigures = true;
  }
  const keyFile = `${slug}.key.json`;
  let hasKey = false;
  let keyStatus = null;
  const prelimKey = join(root, "answer-keys", keyFile);
  // Sidecars are named either <slug>.key.sidecar.json or <slug>.sidecar.json on disk.
  const sidecarNamed = join(root, "answer-keys", `${slug}.key.sidecar.json`);
  const sidecarFile = existsSync(sidecarNamed) ? sidecarNamed : join(root, "answer-keys", `${slug}.sidecar.json`);
  if (files.includes(keyFile)) {
    writeFileSync(join(out, `${slug}.key.json`), readFileSync(join(src, keyFile)));
    hasKey = true;
    keyStatus = "official";
  } else if (existsSync(prelimKey)) {
    writeFileSync(join(out, `${slug}.key.json`), readFileSync(prelimKey));
    hasKey = true;
    keyStatus = "preliminary";
  }
  let hasSidecar = false;
  if (hasKey && existsSync(sidecarFile)) {
    // Only student-facing fields are copied. Internal notes, blue-mark details and scan bookkeeping stay out of the app.
    const sidecar = JSON.parse(readFileSync(sidecarFile, "utf8"));
    const answers = Object.fromEntries(
      Object.entries(sidecar.answers ?? {}).map(([num, a]) => [
        num,
        { confidence: a.confidence ?? null, reason: a.reason ?? null, status: a.status ?? null },
      ]),
    );
    writeFileSync(join(out, `${slug}.sidecar.json`), JSON.stringify({ exam: sidecar.exam ?? null, source: sidecar.source ?? null, answers }, null, 2));
    hasSidecar = true;
  }
  exams.push({
    slug,
    title: booklet(exam.exam?.title ?? slug),
    questions: shown.questions.length,
    sections: (exam.sections ?? []).map((s) => s.name),
    hasKey,
    keyStatus,
    hasSidecar,
    hasFigures,
    // Ready needs golden text, a figure spec and a key; otherwise the exam is listed as coming soon.
    status: hasKey && hasFigures ? "ready" : "proximamente",
  });
}
// Check of golden figure links: every "figure" id must exist in the exam's spec, and each pending option is counted.
for (const exam of exams.filter((e) => e.status === "ready" || e.questions > 0)) {
  const golden = JSON.parse(readFileSync(join(src, `${exam.slug}.golden.json`), "utf8"));
  const specFile = specFiles.get(exam.slug);
  const ids = new Set(specFile ? JSON.parse(readFileSync(join(specDir, specFile), "utf8")).figures.map((f) => f.id) : []);
  let refs = 0, missing = 0, pending = 0;
  for (const q of golden.questions) {
    for (const id of [].concat(q.figure ?? [])) { refs++; if (!ids.has(id)) missing++; }
    for (const o of q.options ?? []) {
      for (const id of [].concat(o.figure ?? [])) { refs++; if (!ids.has(id)) missing++; }
      if (o.pending_spec) pending++;
    }
  }
  if (refs || pending) console.log(`[figures] ${exam.slug}: ${refs} references, ${missing} unresolved, ${pending} pending options`);
}

// A slug such as S11-G_2da names its booklet when the spec file has no exam title.
const slugBooklet = (slug) => {
  const m = slug.match(/^(S11-[A-Z0-9]+)_(1ra|2da)$/);
  return m ? `${m[1]} · ${m[2] === "1ra" ? "Primera" : "Segunda"} sesión` : slug;
};

// Specs without question text yet: listed as "Próximamente" so the catalog shows the whole plan.
const goldenSlugs = new Set(exams.map((e) => e.slug));
for (const [slug, file] of specFiles) {
  if (goldenSlugs.has(slug)) continue;
  // A shared spec file (it covers two booklets) is not an exam of its own.
  if (Object.values(SPEC_ALIAS).some((target) => file === `${target}.json` || file === `${target}.full.json`)) continue;
  const spec = JSON.parse(readFileSync(join(specDir, file), "utf8"));
  exams.push({
    slug,
    title: /sesi[oó]n/i.test(booklet(spec.exam ?? "")) ? booklet(spec.exam) : slugBooklet(slug),
    questions: 0,
    sections: [],
    hasKey: false,
    keyStatus: null,
    hasSidecar: false,
    hasFigures: true,
    status: "proximamente",
  });
}
exams.sort((a, b) => (a.status === b.status ? a.slug.localeCompare(b.slug) : a.status === "ready" ? -1 : 1));

// Every figure spec, grouped by exam and question, for the internal review page (#revision-figuras).
const review = [...specFiles].map(([slug, file]) => {
  const spec = JSON.parse(readFileSync(join(specDir, file), "utf8"));
  return {
    slug,
    title: booklet(spec.exam ?? slug),
    note: spec.note ?? null,
    pending: spec.pending ?? [],
    figures: (spec.figures ?? []).map((f) => ({
      id: f.id,
      question: f.location?.question ?? null,
      page: f.location?.page ?? null,
      target: f.location?.stem_or_option ?? null,
      kind: f.kind,
      fidelity: f.fidelity ?? null,
      note: f.note ?? null,
      spec: f.spec ?? null,
    })),
  };
});
writeFileSync(join(out, "figures-review.json"), JSON.stringify({ exams: review }));
// Scan crops are not copied: figures are drawn natively from their specs (no crops in the app).
writeFileSync(join(out, "index.json"), JSON.stringify({ exams }, null, 2));
writeFileSync(join(out, "normalize-report.json"), JSON.stringify(report, null, 2));

// Dev check page (#figuras): one real figure per engine kind, taken from the batch specs.
const CHECKS = [
  ["S11-J_2da", "q41-remesas-migracion-combo", "Combo: barras y líneas"],
  ["S11-H_2da", "q58-grafica-2-luz-altura", "Escala logarítmica"],
  ["S11-J_2da", "q46-opcion-a-barras", "Barras horizontales"],
  ["S11-J_2da", "q56-opcion-a-area", "Área"],
  ["S11-C16_2da", "c2-q63-eclosion-huevos", "Línea punteada"],
  ["S11-N_2da", "n2-p11-q44-venn", "Texto en caja"],
];
const checkFigures = [];
for (const [slug, id, label] of CHECKS) {
  const file = join(root, "figures", "specs", `${slug}.json`);
  if (!existsSync(file)) continue;
  const entry = JSON.parse(readFileSync(file, "utf8")).figures?.find((f) => f.id === id);
  if (entry?.spec) checkFigures.push({ id, label, from: slug, spec: entry.spec });
}
if (checkFigures.length) writeFileSync(join(out, "figure-check.json"), JSON.stringify({ figures: checkFigures }, null, 2));
console.log(`[sync-exams] ${exams.length} exam(s) from ${src}`);
