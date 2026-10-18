// The teacher's source document in the question builder: a PDF or photos of pages, read in the browser.
// PDFs are drawn by pdf.js and their text comes from the PDF itself; scanned pages and photos are read with OCR
// (Tesseract, loaded the first time it is needed). Boxes and lines are in page fractions (0..1), so they do not
// depend on the zoom.

let pdfjsPromise = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.min.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

let ocrWorker = null;
// One Spanish OCR worker for the session. Its program and language data are served with the app (no CDN), and
// load the first time a scanned page or photo is read (about 6 MB, then cached by the browser).
async function ocr() {
  if (!ocrWorker) {
    ocrWorker = Promise.all([
      import("tesseract.js"),
      import("tesseract.js/dist/worker.min.js?url"),
      import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
      import("@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz?url"),
    ]).then(([{ createWorker }, worker, core, spa]) => {
      const langPath = new URL(spa.default, window.location.href).href.replace(/\/spa\.traineddata\.gz$/, "");
      return createWorker("spa", 1, { workerPath: worker.default, corePath: core.default, langPath, gzip: true, workerBlobURL: false });
    });
    ocrWorker.catch(() => { ocrWorker = null; });
  }
  return ocrWorker;
}

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

// Opens a PDF, or one or more images as the pages of one document.
export async function openSource(files) {
  const list = [...files];
  if (list.length === 1 && isPdf(list[0])) return openPdf(list[0]);
  const images = list.filter((f) => f.type.startsWith("image/"));
  if (!images.length) throw new Error("Elige un PDF o fotos (JPG, PNG) de las páginas.");
  return openImages(images);
}

async function openPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  const cache = new Map();
  const page = (n) => {
    if (!cache.has(n)) cache.set(n, makePdfPage(lib, doc, n));
    return cache.get(n);
  };
  return { name: file.name, kind: "pdf", count: doc.numPages, page, close: () => doc.destroy() };
}

function makePdfPage(lib, doc, n) {
  const pagePromise = doc.getPage(n);
  let linesPromise = null;
  let hiRes = null;
  const p = {
    number: n,
    async size() {
      const pg = await pagePromise;
      const vp = pg.getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    // Draws the page into `canvas` at `scale` (CSS pixels per PDF point times the device pixel ratio).
    async render(canvas, scale) {
      const pg = await pagePromise;
      const vp = pg.getViewport({ scale });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const task = pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
      await task.promise;
      return canvas;
    },
    // A sharp copy of the page (about 220 dpi) for crops and OCR.
    async hires() {
      if (!hiRes) hiRes = p.render(document.createElement("canvas"), 3);
      return hiRes;
    },
    // Text lines of the page from the PDF's own text; an empty list on a scanned page.
    async textLines() {
      if (!linesPromise) {
        linesPromise = (async () => {
          const pg = await pagePromise;
          const vp = pg.getViewport({ scale: 1 });
          const content = await pg.getTextContent();
          const items = content.items
            .filter((it) => it.str && it.str.trim())
            .map((it) => {
              const t = lib.Util.transform(vp.transform, it.transform);
              const h = Math.hypot(t[2], t[3]) || it.height || 10;
              return { text: it.str, x0: t[4], x1: t[4] + it.width * (vp.scale || 1), base: t[5], h };
            });
          return groupLines(items, vp.width, vp.height);
        })();
      }
      return linesPromise;
    },
    async lines() {
      const own = await p.textLines();
      if (own.length >= 3) return own;
      return ocrLines(await p.hires());
    },
  };
  return p;
}

async function openImages(files) {
  const pages = await Promise.all(files.map(async (f, i) => {
    const bitmap = await createImageBitmap(f);
    let linesPromise = null;
    const full = () => {
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext("2d").drawImage(bitmap, 0, 0);
      return c;
    };
    let hi = null;
    const p = {
      number: i + 1,
      async size() { return { width: bitmap.width, height: bitmap.height }; },
      async render(canvas, scale) {
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas;
      },
      async hires() { if (!hi) hi = full(); return hi; },
      async textLines() { return []; },
      async lines() {
        if (!linesPromise) linesPromise = p.hires().then(ocrLines);
        return linesPromise;
      },
    };
    return p;
  }));
  return {
    name: files.length === 1 ? files[0].name : `${files.length} fotos`,
    kind: "images",
    count: pages.length,
    page: (n) => pages[n - 1],
    close: () => {},
  };
}

// Text items -> lines. A wide gap between items on one baseline splits the line, so two columns stay apart.
export function groupLines(items, width, height) {
  const sorted = [...items].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.base - it.base) < Math.min(r.h, it.h) * 0.5);
    if (row) {
      row.items.push(it);
      row.h = Math.max(row.h, it.h);
    } else rows.push({ base: it.base, h: it.h, items: [it] });
  }
  const lines = [];
  for (const r of rows) {
    const parts = r.items.sort((a, b) => a.x0 - b.x0);
    let cur = null;
    for (const it of parts) {
      if (cur && it.x0 - cur.x1 < r.h * 2.2) {
        const gap = it.x0 - cur.x1 > r.h * 0.18 && !/\s$/.test(cur.text) && !/^\s/.test(it.text) ? " " : "";
        cur.text += gap + it.text;
        cur.x1 = Math.max(cur.x1, it.x1);
      } else {
        cur = { text: it.text, x0: it.x0, x1: it.x1, base: r.base, h: r.h };
        lines.push(cur);
      }
    }
  }
  return lines.map((l) => ({
    text: l.text.replace(/\s+/g, " ").trim(),
    box: { x: l.x0 / width, y: (l.base - l.h) / height, w: (l.x1 - l.x0) / width, h: (l.h * 1.25) / height },
  })).filter((l) => l.text);
}

async function ocrLines(canvas) {
  const worker = await ocr();
  const { data } = await worker.recognize(canvas);
  const W = canvas.width;
  const H = canvas.height;
  return (data.lines ?? [])
    .filter((l) => l.text.trim() && l.confidence > 30)
    .map((l) => ({ text: l.text.replace(/\s+/g, " ").trim(), box: { x: l.bbox.x0 / W, y: l.bbox.y0 / H, w: (l.bbox.x1 - l.bbox.x0) / W, h: (l.bbox.y1 - l.bbox.y0) / H } }));
}

// Lines of a page whose middle falls inside `box`, in reading order, with a blank line where a paragraph breaks.
export function linesInBox(lines, box) {
  const inside = lines.filter((l) => {
    const cx = l.box.x + l.box.w / 2;
    const cy = l.box.y + l.box.h / 2;
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
  return joinLines(orderLines(inside));
}

export function joinLines(lines) {
  let out = "";
  let prev = null;
  for (const l of lines) {
    if (prev) {
      const gap = l.box.y - (prev.box.y + prev.box.h);
      out += gap > prev.box.h * 0.6 || l.box.y < prev.box.y - prev.box.h ? "\n\n" : "\n";
    }
    out += l.text;
    prev = l;
  }
  return out;
}

// Two-column pages are read down the left column, then down the right one.
export function orderLines(lines) {
  if (lines.length < 6) return [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const xs = lines.map((l) => l.box.x);
  const left = Math.min(...xs);
  const right = Math.max(...lines.map((l) => l.box.x + l.box.w));
  const mid = (left + right) / 2;
  const crossing = lines.filter((l) => l.box.x < mid - 0.03 && l.box.x + l.box.w > mid + 0.03).length;
  const rightCol = lines.filter((l) => l.box.x >= mid - 0.02).length;
  const twoCols = crossing <= lines.length * 0.12 && rightCol >= lines.length * 0.2 && rightCol <= lines.length * 0.8;
  const byY = (a, b) => a.box.y - b.box.y || a.box.x - b.box.x;
  if (!twoCols) return [...lines].sort(byY);
  // A full-width title or text above both columns stays first.
  const wide = lines.filter((l) => l.box.x < mid - 0.03 && l.box.x + l.box.w > mid + 0.03);
  const firstCol = Math.min(...lines.filter((l) => !wide.includes(l)).map((l) => l.box.y));
  const top = wide.filter((l) => l.box.y < firstCol);
  const rest = lines.filter((l) => !top.includes(l));
  return [
    ...top.sort(byY),
    ...rest.filter((l) => l.box.x < mid - 0.02).sort(byY),
    ...rest.filter((l) => l.box.x >= mid - 0.02).sort(byY),
  ];
}

const START = /^(\d{1,3})\s*[.)-]\s+\S/;

// Finds the numbered questions of a whole document: "1. …", "2. …" in order, across pages and columns.
// Each comes with its text and where it starts (page and box of its lines on that page).
export async function detectQuestions(doc, { onProgress, useOcr = false } = {}) {
  const found = [];
  let cur = null;
  for (let n = 1; n <= doc.count; n++) {
    onProgress?.(n, doc.count);
    const page = doc.page(n);
    const lines = orderLines(useOcr ? await page.lines() : await page.textLines());
    for (const l of lines) {
      const m = START.exec(l.text);
      const num = m ? Number(m[1]) : null;
      const next = cur ? cur.number + 1 : null;
      if (num != null && (next == null ? num <= 5 : num === next)) {
        cur = { number: num, page: n, lines: [l], box: { ...l.box } };
        found.push(cur);
      } else if (cur) {
        cur.lines.push(l);
        if (cur.page === n) {
          const b = cur.box;
          const x1 = Math.max(b.x + b.w, l.box.x + l.box.w);
          const y1 = Math.max(b.y + b.h, l.box.y + l.box.h);
          b.x = Math.min(b.x, l.box.x);
          b.y = Math.min(b.y, l.box.y);
          b.w = x1 - b.x;
          b.h = y1 - b.y;
        }
      }
    }
  }
  return found.map((q) => ({ number: q.number, page: q.page, box: pad(q.box), text: joinLines(q.lines) }));
}

const pad = (b) => ({ x: Math.max(0, b.x - 0.01), y: Math.max(0, b.y - 0.006), w: Math.min(1, b.w + 0.02), h: Math.min(1, b.h + 0.012) });

// Pixels of `box` from a page canvas.
export function cropCanvas(src, box) {
  const x = Math.max(0, Math.round(box.x * src.width));
  const y = Math.max(0, Math.round(box.y * src.height));
  const w = Math.max(1, Math.min(src.width - x, Math.round(box.w * src.width)));
  const h = Math.max(1, Math.min(src.height - y, Math.round(box.h * src.height)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

// Paper clean-up: every pixel lighter than `level` becomes white (scan grey, yellowed paper, faint show-through).
export function whiten(imageData, level) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.min(d[i], d[i + 1], d[i + 2]) >= level || d[i + 3] === 0) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
    }
  }
  return imageData;
}

// The white margin around the drawing is cut, leaving a few pixels of air.
export function trimWhite(canvas, air = 8) {
  const ctx = canvas.getContext("2d");
  const { width: W, height: H } = canvas;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] > 0 && Math.min(d[i], d[i + 1], d[i + 2]) < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return canvas;
  x0 = Math.max(0, x0 - air);
  y0 = Math.max(0, y0 - air);
  x1 = Math.min(W - 1, x1 + air);
  y1 = Math.min(H - 1, y1 + air);
  return cropCanvas(canvas, { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H });
}

// A crop ready to keep inside the question: at most `maxSide` pixels, WebP where the browser can write it.
export function encodeCrop(canvas, maxSide = 1400) {
  let c = canvas;
  const scale = Math.min(1, maxSide / Math.max(c.width, c.height));
  if (scale < 1) {
    const s = document.createElement("canvas");
    s.width = Math.round(c.width * scale);
    s.height = Math.round(c.height * scale);
    const ctx = s.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  const flat = document.createElement("canvas");
  flat.width = c.width;
  flat.height = c.height;
  const fctx = flat.getContext("2d");
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(c, 0, 0);
  const webp = flat.toDataURL("image/webp", 0.86);
  return webp.startsWith("data:image/webp") ? webp : flat.toDataURL("image/jpeg", 0.88);
}

// An answer key printed in the document ("Clave: 1. B 2. D …", "1-B", "1 B"): number -> letter, for the numbers asked.
// Only read when it covers most of them, so a stray "3 A" in a text is not taken for a key.
export function answerKeyFrom(text, numbers) {
  const at = text.search(/\b(clave|respuestas|hoja de respuestas|solucionario|answer key)\b/i);
  if (at < 0) return {};
  const tail = text.slice(at);
  const key = {};
  for (const m of tail.matchAll(/(?:^|[\s,;|])(\d{1,3})\s*[.):=-]?\s*([A-D])(?![A-Za-zÁÉÍÓÚáéíóú])/g)) {
    const n = Number(m[1]);
    if (numbers.includes(n) && !key[n]) key[n] = m[2];
  }
  return Object.keys(key).length >= Math.max(2, numbers.length * 0.6) ? key : {};
}
