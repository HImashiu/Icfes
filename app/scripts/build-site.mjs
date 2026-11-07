// Assembles the public site from the app build:
//   site-dist/            landing page (site/), privacy page, robots.txt, sitemap.xml, brand icons
//   site-dist/app/        the app exactly as `vite build` wrote it to dist/
// Run after `vite build` (npm run build:site does both). The landing page's forms need the same Supabase settings
// as the app: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment or app/.env.local.
// SITE_URL (default https://condor.juandabarrios12.workers.dev/) goes into canonical, Open Graph, robots and sitemap.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
let siteUrl = env.SITE_URL || "https://condor.juandabarrios12.workers.dev/";
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

const TEXT = /\.(html|css|js|txt|xml)$/;
const fill = (text) => text
  .replaceAll("__SUPABASE_URL__", supabaseUrl)
  .replaceAll("__SUPABASE_ANON_KEY__", supabaseKey)
  .replaceAll("__SITE_URL__", siteUrl);

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
