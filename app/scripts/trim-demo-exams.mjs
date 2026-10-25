// Shrinks the booklets in a built folder so the clickable demo preview stays small enough to publish:
// keeps the first booklets that have an answer key and drops questions whose data is heavy (inlined scans).
// Usage: node scripts/trim-demo-exams.mjs <dist-folder> [max-question-bytes] [booklets]
import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [dir, maxArg = "50000", countArg = "2"] = process.argv.slice(2);
if (!dir) { console.error("usage: trim-demo-exams.mjs <dist-folder> [max-bytes] [booklets]"); process.exit(1); }
const max = Number(maxArg);
const exams = join(dir, "exams");
const index = JSON.parse(readFileSync(join(exams, "index.json"), "utf8"));
const keep = index.exams.filter((e) => e.status === "ready" && e.hasKey).slice(0, Number(countArg));
const keepSlugs = new Set(keep.map((e) => e.slug));
for (const f of readdirSync(exams)) {
  if (f === "index.json") continue;
  if (![...keepSlugs].some((s) => f.startsWith(`${s}.`))) rmSync(join(exams, f), { recursive: true, force: true });
}
for (const e of keep) {
  const path = join(exams, `${e.slug}.json`);
  const exam = JSON.parse(readFileSync(path, "utf8"));
  const before = exam.questions.length;
  exam.questions = exam.questions.filter((q) => JSON.stringify(q).length <= max);
  writeFileSync(path, JSON.stringify(exam));
  e.questions = exam.questions.length;
  console.log(`${e.slug}: ${exam.questions.length}/${before} questions`);
}
writeFileSync(join(exams, "index.json"), JSON.stringify({ ...index, exams: keep }));
