// Draws questions of the bank as a student sees them (the #revision-preguntas screen), one screenshot per question and
// width, runs the mechanical checks, and writes a report a reviewer can walk through.
//
//   node scripts/review/review-questions.mjs --exam S11-B_1ra --from 1 --to 30 --out ../../review-out
//   node scripts/review/review-questions.mjs --all --widths 390,1280
//   node scripts/review/review-questions.mjs --exam S11-B_1ra --scans "C:/Users/juand/Downloads/icfes-azure-input"
//
// Options: --exam SLUG (repeatable) | --all, --from N --to N, --only 3,7,21, --widths 390,1280 (default 390,1280),
// --key (show the correct option), --out DIR (default ./review-out), --scans DIR (folder with the source PDFs: each
// shot gets a q###-scan.png of the printed page, for side-by-side), --base URL (an already served build),
// --issues-only (screenshots only for questions with a mechanical issue), --list (print the question numbers and exit).
// Needs: npm run sync-exams once (public/exams), playwright (preinstalled in the cloud container), pdftoppm for --scans.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const many = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const examDir = join(appDir, "public", "exams");
if (!existsSync(join(examDir, "index.json"))) { console.error("public/exams is empty: run `npm run sync-exams` first."); process.exit(1); }
const index = JSON.parse(readFileSync(join(examDir, "index.json"), "utf8")).exams.filter((e) => e.status !== "proximamente");
const slugs = flag("all") ? index.map((e) => e.slug) : many("exam");
if (!slugs.length) { console.error("Give --exam SLUG (repeatable) or --all. Booklets:\n" + index.map((e) => "  " + e.slug).join("\n")); process.exit(1); }

const widths = (opt("widths", "390,1280")).split(",").map(Number);
const out = opt("out", join(appDir, "review-out"));
const scans = opt("scans");
const only = opt("only") ? new Set(opt("only").split(",").map(Number)) : null;
const from = Number(opt("from", 0)); const to = Number(opt("to", 1e9));

function numbersOf(slug) {
  const raw = JSON.parse(readFileSync(join(examDir, `${slug}.json`), "utf8"));
  return { raw, numbers: raw.questions.map((q) => q.number).sort((a, b) => a - b).filter((n) => n >= from && n <= to && (!only || only.has(n))) };
}
if (flag("list")) { for (const s of slugs) console.log(s, numbersOf(s).numbers.join(",")); process.exit(0); }

// The review screen needs a build (the figure engine is CommonJS and the dev server cannot load it): a build with
// VITE_QUESTION_REVIEW=1 goes to a temp folder, served by a small static server that reads exam files straight from
// public/exams (nothing is copied, nothing touches the site worker or its booklet quotas).
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
async function startServer() {
  const base = opt("base");
  if (base) return { base, stop() {} };
  const dist = join(tmpdir(), `icfes-review-dist-${process.pid}`);
  console.log("Building the review screen…");
  {
    execFileSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "error"], { cwd: appDir, env: { ...process.env, VITE_QUESTION_REVIEW: "1" }, stdio: "inherit" });
  }
  const roots = [dist, join(appDir, "public")];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const rel = path === "/" ? "/index.html" : path;
    for (const root of rel.startsWith("/exams/") ? [roots[1]] : roots) {
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) continue;
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => { server.close(); rmSync(dist, { recursive: true, force: true }); } };
}

// The printed page of a question, from the source PDF (pdftoppm), when the folder with the PDFs is given.
function scanPage(raw, q, file) {
  if (!scans || !raw.exam?.source_file) return null;
  const pdf = join(scans, raw.exam.source_file);
  const page = q?.source?.pages?.[0];
  if (!existsSync(pdf) || !page) return null;
  try {
    const prefix = file.replace(/\.png$/, "");
    execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-r", "110", "-png", "-singlefile", pdf, prefix]);
    return file;
  } catch { return null; }
}

const server = await startServer();
const browser = await chromium.launch();
const report = [];
try {
  for (const slug of slugs) {
    const { raw, numbers } = numbersOf(slug);
    const dir = join(out, slug); mkdirSync(dir, { recursive: true });
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.error(`  [pageerror] ${slug} ${e.message}`));
      for (const n of numbers) {
        const url = `${server.base}/#revision-preguntas?exam=${slug}&n=${n}&bare=1${flag("key") ? "&key=1" : ""}`;
        await page.goto("about:blank");
        await page.goto(url);
        await page.waitForFunction(() => ["ready", "missing"].includes(document.body.dataset.reviewState), null, { timeout: 30000 }).catch(() => {});
        // Entrance animations would leave options half faded in the shot: the review wants the settled state.
        await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
        const issues = await page.evaluate(() => (window.__reviewIssues ? window.__reviewIssues() : null));
        const state = await page.evaluate(() => document.body.dataset.reviewState);
        const name = `q${String(n).padStart(3, "0")}-${width}.png`;
        const entry = { exam: slug, n, width, state, issues: issues ?? [{ level: "error", code: "no-render", message: "La pantalla no dibujó la pregunta" }], shot: null, scan: null };
        if (!flag("issues-only") || entry.issues.length) {
          await page.screenshot({ path: join(dir, name), fullPage: true });
          entry.shot = `${slug}/${name}`;
          // On a phone a long text lives on its own tab: the question tab was just drawn, now the text tab.
          if (await page.$(".text-toggle")) {
            await page.click(".text-toggle button:first-child");
            await page.screenshot({ path: join(dir, name.replace(".png", "-texto.png")), fullPage: true });
            entry.shotText = `${slug}/${name.replace(".png", "-texto.png")}`;
          }
          if (width === widths[0]) {
            const q = raw.questions.find((x) => x.number === n);
            const scan = scanPage(raw, q, join(dir, `q${String(n).padStart(3, "0")}-scan.png`));
            if (scan) entry.scan = `${slug}/q${String(n).padStart(3, "0")}-scan.png`;
          }
        }
        report.push(entry);
      }
      await ctx.close();
    }
    console.log(`${slug}: ${numbers.length} preguntas`);
  }
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.issues.length);
const md = [
  `# Revisión mecánica de preguntas`, ``,
  `${report.length} dibujos (${new Set(report.map((r) => `${r.exam}#${r.n}`)).size} preguntas), ${bad.length} con problemas.`, ``,
  ...bad.map((r) => `- **${r.exam} · P${r.n} · ${r.width}px** — ${r.issues.map((i) => `[${i.level}] ${i.message}`).join("; ")}${r.shot ? ` (${r.shot})` : ""}`),
].join("\n");
writeFileSync(join(out, "report.md"), md + "\n");
console.log(`${bad.length} dibujos con problemas. Informe: ${join(out, "report.md")}`);
