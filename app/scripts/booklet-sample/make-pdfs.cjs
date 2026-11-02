// Makes sample PDFs of the printed cuadernillo with headless Chromium.
// Start the dev server first (npx vite --port 5199), then: node scripts/booklet-sample/make-pdfs.cjs <out-dir> [name=query ...]
const { chromium } = require("playwright");
const path = require("path");

const out = process.argv[2] ?? ".";
const jobs = process.argv.slice(3).map((a) => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; });
const base = process.env.BASE ?? "http://localhost:5199/scripts/booklet-sample/index.html";

(async () => {
  const browser = await chromium.launch();
  for (const [name, query] of jobs) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error(name, "pageerror", e.message));
    await page.goto(`${base}?${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    await page.waitForTimeout(800);
    const laid = await page.evaluate(() => window.__laid);
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: path.join(out, `${name}.pdf`), preferCSSPageSize: true, printBackground: true });
    console.log(name, JSON.stringify(laid));
    await page.close();
  }
  await browser.close();
})();
