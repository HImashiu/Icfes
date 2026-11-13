// Assembles the public site from the app build:
//   site-dist/            landing page (site/), privacy page, robots.txt, sitemap.xml, brand icons
//   site-dist/app/        the app exactly as `vite build` wrote it to dist/
// Run after `vite build` (npm run build:site does both). The landing page's forms need the same Supabase settings
// as the app: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment or app/.env.local.
// SITE_URL (default https://condoricfes.com/) goes into canonical, Open Graph, robots and sitemap.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const dist = join(appRoot, "dist");
const site = join(appRoot, "site");
const out = join(appRoot, "site-dist");

function envFile(name) {
  const p = join(appRoot, name);
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
}
const env = { ...envFile(".env"), ...envFile(".env.production"), ...envFile(".env.local"), ...envFile(".env.production.local"), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL ?? "";
const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? "";
let siteUrl = env.SITE_URL || "https://condoricfes.com/";
if (!siteUrl.endsWith("/")) siteUrl += "/";

if (!existsSync(join(dist, "index.html"))) {
  console.error("[build-site] dist/index.html not found: run `vite build` first.");
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error("[build-site] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing: the landing forms and the app would not reach the backend.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, join(out, "app"), { recursive: true });
cpSync(join(appRoot, "public", "brand"), join(out, "brand"), { recursive: true });

// Juan's owl (src/components/owlArt.js) inline in the pages, so their CSS can blink and move it: the head peeking over
// the sample question (<!--OWL_PEEK-->) and the whole owl wherever <!--OWL_FULL--> or <!--OWL_FULL:classes--> appears.
const { fillOwls } = await (await import(pathToFileURL(join(here, "owl-svg.mjs")).href)).owlBuilders(appRoot);

// Analytics, only when its id is set at build time (nothing is loaded otherwise):
//   CF_ANALYTICS_TOKEN   Cloudflare Web Analytics site token (no cookies)
//   GA_MEASUREMENT_ID    Google Analytics 4 id, G-XXXXXXX
//   GOOGLE_SITE_VERIFICATION  the content of Search Console's HTML-tag verification
function analytics() {
  const out = [];
  const cf = env.CF_ANALYTICS_TOKEN;
  const ga = env.GA_MEASUREMENT_ID;
  if (cf) {
    if (!/^[A-Za-z0-9]{16,64}$/.test(cf)) { console.error("[build-site] CF_ANALYTICS_TOKEN looks wrong"); process.exit(1); }
    out.push(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${cf}"}'></script>`);
  }
  if (ga) {
    if (!/^G-[A-Z0-9]{4,16}$/.test(ga)) { console.error("[build-site] GA_MEASUREMENT_ID looks wrong"); process.exit(1); }
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>`
      // Analytics storage granted: with it denied GA4 only gets cookieless pings for modelling and its reports stay
      // empty on a small site. Advertising stays off (no ad cookies, ad personalization or Google signals).
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
      + `gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});`
      + `gtag("js",new Date());gtag("config","${ga}",{allow_google_signals:false,allow_ad_personalization_signals:false});</script>`);
  }
  return out.join("\n  ");
}
const verification = env.GOOGLE_SITE_VERIFICATION
  ? `<meta name="google-site-verification" content="${env.GOOGLE_SITE_VERIFICATION.replace(/[^A-Za-z0-9_-]/g, "")}" />`
  : "";

const TEXT = /\.(html|css|js|txt|xml)$/;
const fill = (text) => fillOwls(text)
  .replaceAll("__SUPABASE_URL__", supabaseUrl)
  .replaceAll("__SUPABASE_ANON_KEY__", supabaseKey)
  .replaceAll("__SITE_URL__", siteUrl)
  .replace("<!--ANALYTICS-->", analytics())
  .replace("<!--SITE_VERIFICATION-->", verification);

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) copyDir(src, dst);
    else if (TEXT.test(name)) writeFileSync(dst, fill(readFileSync(src, "utf8")));
    else cpSync(src, dst);
  }
}
copyDir(site, out);

// Public pages for search: simulacro, question hub and one page per area (scripts/build-seo.mjs). The question text goes
// through the app's own renderer (lib/render.js), loaded with Vite's SSR loader and a jsdom window for DOMPurify.
const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { createServer } = await import("vite");
const vite = await createServer({ root: appRoot, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false } });
const { renderRich } = await vite.ssrLoadModule("/src/lib/render.js");
const { buildSeoPages } = await import(pathToFileURL(join(here, "build-seo.mjs")).href);
const dataDir = env.ICFES_DATA_DIR || "/mnt/project-files/icfes/data";
const saber11 = await vite.ssrLoadModule("/src/lib/saber11.js");
const national = JSON.parse(readFileSync(join(appRoot, "src", "lib", "saber11-national-2022.json"), "utf8"));
const seoPages = await buildSeoPages({ appRoot, out, siteUrl, dataDir, renderRich, saber11, national });
await vite.close();
for (const p of seoPages) {
  const f = join(out, p, "index.html");
  writeFileSync(f, fill(readFileSync(f, "utf8")));
}
// Sitemap from the pages that exist, with today's date.
const today = new Date().toISOString().slice(0, 10);
const urls = [["", "1.0"], ...seoPages.map((p) => [p, p.split("/").filter(Boolean).length === 1 ? "0.9" : "0.8"]), ["privacidad.html", "0.3"]];
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr]) => `  <url><loc>${siteUrl}${p}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`);
console.log(`[build-site] ${seoPages.length} search pages: ${seoPages.join(", ")}`);

// The app gets the same analytics as the landing page.
const appIndex = join(out, "app", "index.html");
writeFileSync(appIndex, readFileSync(appIndex, "utf8").replace("</head>", `  ${analytics()}\n  </head>`));

const left = [];
(function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (p !== join(out, "app")) scan(p); }
    else if (TEXT.test(name) && /__(SUPABASE_URL|SUPABASE_ANON_KEY|SITE_URL)__/.test(readFileSync(p, "utf8"))) left.push(p);
  }
})(out);
if (left.length) { console.error("[build-site] placeholders left in:", left); process.exit(1); }

// Grading on the server (worker/index.js): for each booklet, the worker's own file with the key, each question's area
// and number of options, and the key's notes (<slug>.grade.json, never served), and the AI notes without the
// explanations, for students (<slug>.enrich.student.json: tags and hints only).
{
  const dir = join(out, "app", "exams");
  const read = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : null);
  let n = 0;
  for (const f of readdirSync(dir)) {
    const m = /^([A-Za-z0-9_-]+)\.json$/.exec(f);
    if (!m || f === "index.json") continue;
    const slug = m[1];
    const exam = read(f);
    if (exam?.format !== "icfes-golden/1" || !Array.isArray(exam.questions)) continue;
    const key = read(`${slug}.key.json`);
    if (!key?.answers) continue;
    const sidecar = read(`${slug}.sidecar.json`);
    const enrich = read(`${slug}.enrich.json`);
    const grade = { k: {}, s: {}, o: {}, n: {}, e: Boolean(enrich) };
    for (const q of exam.questions) {
      const k = String(q.number);
      grade.s[k] = q.section;
      grade.o[k] = Array.isArray(q.options) ? q.options.length : 4;
    }
    for (const [k, letter] of Object.entries(key.answers)) if (typeof letter === "string" && /^[A-H]$/.test(letter)) grade.k[k] = letter;
    for (const [k, note] of Object.entries(sidecar?.answers ?? {})) {
      if (note && typeof note === "object") grade.n[k] = { confidence: note.confidence ?? null, reason: note.reason ?? null, status: note.status ?? null };
    }
    writeFileSync(join(dir, `${slug}.grade.json`), JSON.stringify(grade));
    if (enrich) {
      const questions = {};
      for (const [k, row] of Object.entries(enrich.questions ?? {})) {
        const { explicacion, distractores, ...rest } = row ?? {};
        questions[k] = rest;
      }
      writeFileSync(join(dir, `${slug}.enrich.student.json`), JSON.stringify({ ...enrich, questions }));
    }
    n++;
  }
  console.log(`[build-site] grading files for ${n} booklets`);
}

// Security headers for every file Cloudflare serves (site-dist/_headers). The content security policy allows only
// this site, Supabase, Google Fonts and the two analytics services; inline scripts are allowed by their exact hash.
const hashes = new Set();
(function scanScripts(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "exams") scanScripts(p); continue; }
    if (!name.endsWith(".html")) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/type=["']application\/(ld\+)?json["']/.test(m[1]) || !m[2].trim()) continue;
      hashes.add(`'sha256-${createHash("sha256").update(m[2]).digest("base64")}'`);
    }
  }
})(out);
const supa = new URL(supabaseUrl);
const csp = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(" ")} https://static.cloudflareinsights.com https://www.googletagmanager.com`.replace(/\s+/g, " "),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  `connect-src 'self' data: blob: ${supa.origin} wss://${supa.host} https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");
writeFileSync(join(out, "_headers"), `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
`);
console.log(`[build-site] site-dist ready: landing + app/ (site URL ${siteUrl})`);
