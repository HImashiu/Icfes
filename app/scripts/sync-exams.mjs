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
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// "S11-A 1ra" becomes "S11-A · Primera sesión", the same name the app shows (see formatBooklet in src/lib/exam.js).
const ORDINAL = { 1: "Primera", 2: "Segunda" };
const booklet = (t) =>
  t
    .replace(/\s+/g, " ")
    .replace(/^(S11-)\s+/i, "$1")
    .replace(/\s+(\d)(?:da|ra|a)?\s+sesi[oó]n\b/i, (m, n) => ` · ${ORDINAL[n] ?? n} sesión`)
    .replace(/\s+(\d)(?:da|ra)$/i, (m, n) => ` · ${ORDINAL[n] ?? n} sesión`);
const exams = [];
for (const file of files.filter((f) => f.endsWith(".golden.json"))) {
  const slug = file.replace(/\.golden\.json$/, "");
  const exam = JSON.parse(readFileSync(join(src, file), "utf8"));
  if (exam.format !== "icfes-golden/1") {
    console.warn(`[sync-exams] skipped ${file}: format ${exam.format}`);
    continue;
  }
  writeFileSync(join(out, `${slug}.json`), readFileSync(join(src, file)));
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
  const sidecarFile = join(root, "answer-keys", `${slug}.key.sidecar.json`);
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
    questions: exam.questions?.length ?? 0,
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
