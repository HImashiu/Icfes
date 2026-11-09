// Share images (1200×630) for the public search pages, one per page, saved in site/img/og/ and committed.
// Run after `npm run build:site`, whenever a page title changes:  npm run og
// Each image shows the page's tag and title in the landing style. build-seo.mjs uses the image when it exists
// and falls back to img/og.png otherwise, so a missing image never breaks a page.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ogName } from "./build-seo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const dist = join(appRoot, "site-dist");
const outDir = join(appRoot, "site", "img", "og");
if (!existsSync(dist)) throw new Error("Run npm run build:site first.");
mkdirSync(outDir, { recursive: true });

// Every page folder in site-dist except the app and the landing itself.
const pages = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || (rel === "" && ["app", "img", "katex", "assets"].includes(name))) continue;
    const r = `${rel}${name}/`;
    if (existsSync(join(full, "index.html"))) pages.push(r);
    walk(full, r);
  }
})(dist, "");

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const mark = readFileSync(join(appRoot, "site", "img", "condor-mark.svg"), "utf8");

function card({ tag, color, title }) {
  const size = title.length > 70 ? 58 : title.length > 46 ? 66 : 76;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: #0D110F; color: #F2F5EF; font-family: Figtree, sans-serif; overflow: hidden; }
  .glow { position: absolute; right: -180px; bottom: -260px; width: 760px; height: 760px; border-radius: 50%; background: radial-gradient(circle, ${color}33, transparent 65%); }
  .frame { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 18px; font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 40px; }
  .brand svg { width: 64px; height: 64px; }
  .tag { align-self: flex-start; margin-top: 54px; padding: 8px 18px; border-radius: 999px; background: ${color}; color: #0D110F; font-weight: 800; font-size: 24px; }
  h1 { margin: 22px 0 0; font-family: "Bricolage Grotesque"; font-weight: 800; font-size: ${size}px; line-height: 1.04; letter-spacing: -0.02em; max-width: 1000px; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 26px; font-weight: 700; color: #A7B1AA; }
  .pill { background: #C8F04A; color: #0D110F; padding: 12px 26px; border-radius: 999px; font-weight: 800; box-shadow: 0 4px 0 #8DB01E; }
</style></head><body><div class="glow"></div><div class="frame">
  <div class="brand">${mark}<span>Cóndor</span></div>
  <span class="tag">${esc(tag)}</span>
  <h1>${esc(title)}</h1>
  <div class="foot"><span>condoricfes.com</span><span class="pill">Practica gratis</span></div>
</div></body></html>`;
}

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const path of pages) {
  const html = readFileSync(join(dist, path, "index.html"), "utf8");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) continue;
  const tagM = html.match(/<span class="tag"(?: style="background:([^"]+)")?>([\s\S]*?)<\/span>/);
  const crumb = [...html.matchAll(/<span aria-current="page">([\s\S]*?)<\/span>/g)][0];
  const tag = strip(tagM?.[2] ?? "") || (path.startsWith("blog/") ? "Blog" : strip(crumb?.[1] ?? "Saber 11"));
  await tab.setContent(card({ tag, color: tagM?.[1] ?? "#C8F04A", title: strip(h1[1]) }), { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(outDir, `${ogName(path)}.png`) });
  console.log("og", path);
}
await browser.close();
