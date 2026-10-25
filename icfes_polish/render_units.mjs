// Renders exam units with the editor's own renderer (render.bundle.js) and screenshots each one.
//   node render_units.mjs <units.json> <renderer dir> <out dir>
// units.json: [{"id": "q22", "blocks": [{"label": "22.", "md": "..."}, ...], "figures": {"<id>": "<png path>"}}]
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

// playwright is installed globally; createRequire resolves it through NODE_PATH like plain require
const { chromium } = createRequire(import.meta.url)("playwright");

const [unitsPath, rendererDir, outDir] = process.argv.slice(2);
const units = JSON.parse(readFileSync(unitsPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const css = `
body { font: 17px/1.45 Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; }\n#root { width: 860px; padding: 18px; } .md { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.blk { display: flex; gap: 8px; margin: 6px 0; } .lab { font-weight: 700; min-width: 2.2em; }
.md p { margin: 0 0 8px; } .md img.fig { max-width: 100%; display: block; margin: 6px auto; border: 1px dashed #999; }
.exam-table { border-collapse: collapse; margin: 10px 0; font-size: 15px; }
.exam-table th, .exam-table td { padding: 5px 9px; border: 1px solid #000; text-align: left; vertical-align: top; }
.exam-table th { font-weight: 600; background: rgba(127,127,127,.16); }
p.fuente { font-size: .78em; text-align: right; margin: 12px 0 8px; opacity: .8; }
.cita { margin: 10px 0 10px 16px; padding: 2px 0 2px 14px; border-left: 3px solid #c9c4b5; }
.poema { white-space: pre-wrap; margin: 10px 0 10px 16px; } .espacio { height: 1.2em; }
.figmiss { border: 2px dashed #c00; color: #c00; padding: 6px; margin: 6px 0; font-size: 13px; }`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
// a real file page next to the bundle, so the KaTeX stylesheet and fonts load from disk
const shell = path.join(path.resolve(rendererDir), "_shell.html");
writeFileSync(shell, `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="katex/katex.min.css"><style>${css}</style>
  <script src="render.bundle.js"></script></head><body><div id="root"></div></body></html>`);
await page.goto(pathToFileURL(shell).href);
await page.waitForFunction(() => typeof window.renderRich === "function");
for (const u of units) {
  await page.evaluate((u) => {
    const figs = u.figures || {};
    const html = u.blocks.map((b) => {
      let md = window.renderRich(b.md || "");
      md = md.replace(/\[\[figura:([^\]]+)\]\]/g, (m, id) =>
        figs[id] ? `<img class="fig" src="${figs[id]}">` : `<div class="figmiss">[figura ${id}]</div>`);
      return `<div class="blk"><div class="lab">${b.label || ""}</div><div class="md">${md}</div></div>`;
    }).join("");
    document.getElementById("root").innerHTML = html;
  }, u);
  await page.waitForTimeout(30);
  const el = await page.$("#root");
  await el.screenshot({ path: path.join(outDir, `${u.id}.png`) });
}
await browser.close();
console.log(`rendered ${units.length} units into ${outDir}`);
