// Share images for shared results (F15): one per diagnostic score bucket (150..450 in steps of 25) and one for the
// challenges, in site/img/og/growth/ (committed). worker/growth.js swaps them into the preview of a link shared with
// ?p=<score> or ?s=<right>. Run when the design changes:  node scripts/build-og-growth.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const outDir = join(appRoot, "site", "img", "og", "growth");
mkdirSync(outDir, { recursive: true });
const mark = readFileSync(join(appRoot, "site", "img", "condor-mark.svg"), "utf8");

const card = ({ big, small, line, tag }) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: #0D110F; color: #F2F5EF; font-family: Figtree, sans-serif; overflow: hidden; }
  .glow { position: absolute; right: -160px; bottom: -260px; width: 760px; height: 760px; border-radius: 50%; background: radial-gradient(circle, #C8F04A33, transparent 65%); }
  .frame { position: absolute; inset: 60px 72px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 18px; font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 40px; }
  .brand svg { width: 64px; height: 64px; }
  .tag { align-self: flex-start; margin-top: 40px; padding: 8px 18px; border-radius: 999px; background: #C8F04A; color: #0D110F; font-weight: 800; font-size: 26px; }
  .score { display: flex; align-items: baseline; gap: 22px; margin-top: 10px; font-family: "Bricolage Grotesque"; font-weight: 800; }
  .score b { font-size: 200px; line-height: 1; letter-spacing: -0.04em; color: #C8F04A; }
  .score span { font-size: 54px; color: #A7B1AA; }
  h1 { margin: 6px 0 0; font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 56px; line-height: 1.05; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 26px; font-weight: 700; color: #A7B1AA; }
  .pill { background: #C8F04A; color: #0D110F; padding: 12px 26px; border-radius: 999px; font-weight: 800; box-shadow: 0 4px 0 #8DB01E; }
</style></head><body><div class="glow"></div><div class="frame">
  <div class="brand">${mark}<span>Cóndor</span></div>
  <span class="tag">${tag}</span>
  <div class="score"><b>${big}</b><span>${small}</span></div>
  <h1>${line}</h1>
  <div class="foot"><span>condoricfes.com</span><span class="pill">Hazlo tú también</span></div>
</div></body></html>`;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const shots = [];
for (let b = 150; b <= 450; b += 25) shots.push([`diagnostico-${b}`, { tag: "Diagnóstico ICFES", big: b, small: "de 500", line: "¿Cuánto sacarías tú? 20 preguntas reales." }]);
shots.push(["reto", { tag: "Reto ICFES", big: "5", small: "preguntas reales", line: "Te retaron. ¿Puedes ganar?" }]);
for (const [name, c] of shots) {
  await tab.setContent(card(c), { waitUntil: "networkidle" }).catch(() => tab.setContent(card(c)));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(outDir, `${name}.png`) });
  console.log("og", name);
}
await browser.close();
