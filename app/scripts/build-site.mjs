// Assembles the public site from the app build:
//   site-dist/            landing page (site/), privacy page, robots.txt, sitemap.xml, brand icons
//   site-dist/app/        the app exactly as `vite build` wrote it to dist/
// Run after `vite build` (npm run build:site does both). The landing page's forms need the same Supabase settings
// as the app: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment or app/.env.local.
// SITE_URL (default https://condoricfes.com/) goes into canonical, Open Graph, robots and sitemap.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

// The owl peeking over the sample question on the landing page: Juan's owl (src/components/owlArt.js), head only,
// cut just under the eyes so it sits on the card's top edge. Inline, so the landing's CSS can blink and move it.
const owl = await import(pathToFileURL(join(appRoot, "src", "components", "owlArt.js")).href);
function owlPeek() {
  const { OWL_PATHS: P, OWL_ELLIPSES: E, OWL_COLORS: C } = owl;
  const ell = (e, fill) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${fill}"/>`;
  const arc = (e) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx + 6}" ry="${e.ry + 6}" fill="${C.face}"/><path d="M${e.cx - 66} ${e.cy + 24}Q${e.cx} ${e.cy - 74} ${e.cx + 66} ${e.cy + 24}" fill="none" stroke="${C.pupil}" stroke-width="30" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 -14 900 704" focusable="false">`
    + `<path d="${P.board}" fill="${C.board}"/><path d="${P.hood}" fill="${C.hood}"/><path d="${P.face}" fill="${C.face}"/>`
    + E.blush.map((e) => ell(e, C.blush)).join("")
    + `<g class="pk-eyes"><g class="pk-open">${E.eyes.map((e) => ell(e, C.eye)).join("")}<g class="pk-pupils"><path d="${P.pupilL}" fill="${C.pupil}"/><path d="${P.pupilR}" fill="${C.pupil}"/></g></g>`
    + `<g class="pk-happy">${E.eyes.map(arc).join("")}</g></g>`
    + `<path d="${P.beak}" fill="${C.beak}"/><path d="${P.crown}" fill="${C.crown}"/>`
    + `<g class="pk-tassel"><path d="${P.cord}" fill="${C.tassel}"/><path d="${P.bell}" fill="${C.tassel}"/></g></svg>`;
}

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
      // Consent mode with storage denied: Google gets cookieless pings, so no cookie banner is needed (many visitors
      // are minors). Visits are modelled, a little less exact than with cookies.
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
      + `gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});`
      + `gtag("js",new Date());gtag("config","${ga}");</script>`);
  }
  return out.join("\n  ");
}
const verification = env.GOOGLE_SITE_VERIFICATION
  ? `<meta name="google-site-verification" content="${env.GOOGLE_SITE_VERIFICATION.replace(/[^A-Za-z0-9_-]/g, "")}" />`
  : "";

const TEXT = /\.(html|css|js|txt|xml)$/;
const fill = (text) => text
  .replaceAll("__SUPABASE_URL__", supabaseUrl)
  .replaceAll("__SUPABASE_ANON_KEY__", supabaseKey)
  .replaceAll("__SITE_URL__", siteUrl)
  .replace("<!--OWL_PEEK-->", owlPeek())
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
console.log(`[build-site] site-dist ready: landing + app/ (site URL ${siteUrl})`);
