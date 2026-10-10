// Copies exam JSON from a data folder into public/exams so the app can load it.
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
const exams = [];
for (const file of files.filter((f) => f.endsWith(".golden.json"))) {
  const slug = file.replace(/\.golden\.json$/, "");
  const exam = JSON.parse(readFileSync(join(src, file), "utf8"));
  if (exam.format !== "icfes-golden/1") {
    console.warn(`[sync-exams] skipped ${file}: format ${exam.format}`);
    continue;
  }
  writeFileSync(join(out, `${slug}.json`), readFileSync(join(src, file)));
  const figFile = join(root, "figures", "specs", `${slug}.json`);
  let hasFigures = false;
  if (existsSync(figFile)) {
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
    title: exam.exam?.title ?? slug,
    questions: exam.questions?.length ?? 0,
    sections: (exam.sections ?? []).map((s) => s.name),
    hasKey,
    keyStatus,
    hasSidecar,
    hasFigures,
  });
}
// Scan crops are not copied: figures are drawn natively from their specs (no crops in the app).
writeFileSync(join(out, "index.json"), JSON.stringify({ exams }, null, 2));
console.log(`[sync-exams] ${exams.length} exam(s) from ${src}`);
