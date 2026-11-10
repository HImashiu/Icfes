// Page geometry and pagination for the printed cuadernillo (components/print/BookletPages.jsx).
// Everything here is pure: the component measures each piece in the browser and this file decides where it goes.

import { cleanStyle } from "./bookletStyle.js";

// Paper sizes in millimetres, portrait. Oficio is the Colombian 21,6 × 33 cm.
export const PAPER = {
  A4: { w: 210, h: 297, label: "A4" },
  Carta: { w: 215.9, h: 279.4, label: "Carta" },
  Oficio: { w: 215.9, h: 330.2, label: "Oficio" },
  A5: { w: 148, h: 210, label: "A5" },
  MediaCarta: { w: 139.7, h: 215.9, label: "Media carta" },
  MediaOficio: { w: 165.1, h: 215.9, label: "Media oficio" },
  A3: { w: 297, h: 420, label: "A3" },
  DobleCarta: { w: 279.4, h: 431.8, label: "Doble carta" },
};

// How the school binds the booklet.
//  sueltas:  one page per sheet side, printed on one or both sides and stapled at the corner (any printer).
//  plegado:  saddle-stitched like the real ICFES cuadernillo: two pages per sheet side on paper twice as big
//            (A3 for A4, doble carta for carta), folded in half and stapled on the fold.
//  pequeno:  the same fold on ordinary paper: half-size pages (A5 / media carta / media oficio), two per sheet side.
export const BINDINGS = {
  sueltas: { label: "Grapado en la esquina", hint: "Cualquier impresora." },
  plegado: { label: "Plegado, como el ICFES", hint: "Hoja A3 o doble carta, doblada y grapada en el lomo." },
  pequeno: { label: "Pequeño (media hoja)", hint: "Páginas de media hoja, dos por cara de la hoja, dobladas y grapadas en el lomo." },
};

const HALF = { A4: "A5", Carta: "MediaCarta", Oficio: "MediaOficio" };
const DOUBLE = { A4: "A3", Carta: "DobleCarta" };
export const MARGIN_PRESETS = {
  estrecho: { full: { top: 14, bottom: 14, inner: 13, outer: 10 }, small: { top: 12, bottom: 12, inner: 11, outer: 8 } },
  normal: { full: { top: 19, bottom: 17, inner: 18, outer: 14 }, small: { top: 15, bottom: 14, inner: 14, outer: 11 } },
  amplio: { full: { top: 24, bottom: 21, inner: 24, outer: 19 }, small: { top: 18, bottom: 17, inner: 17, outer: 14 } },
};

// The page the questions are typeset on and the sheet that goes through the printer.
// Takes a print style (lib/bookletStyle.js) or, as before, a paper size and a binding.
export function geometry(sizeOrStyle = "Carta", bindingArg = "sueltas") {
  const s = cleanStyle(typeof sizeOrStyle === "object" ? sizeOrStyle : { size: sizeOrStyle, binding: bindingArg });
  const { size, binding } = s;
  const small = binding === "pequeno";
  const page = PAPER[small ? HALF[size] : size];
  const sheetPortrait = binding === "plegado" ? PAPER[DOUBLE[size]] : PAPER[size];
  const imposed = binding !== "sueltas";
  const duplex = imposed || s.sides !== "simplex";
  // Folded booklets print two pages side by side on a landscape sheet.
  const sheet = imposed ? { w: sheetPortrait.h, h: sheetPortrait.w } : page;
  const m = s.margins === "custom" ? { ...s.custom } : { ...MARGIN_PRESETS[s.margins][small ? "small" : "full"] };
  // The running head and the folio need room of their own.
  if (s.head) m.top = Math.max(m.top, 12);
  if (s.pageNumber !== "none" || s.footText) m.bottom = Math.max(m.bottom, 12);
  const cols = s.cols === "auto" ? (small ? 1 : 2) : s.cols;
  const gap = cols === 1 ? 0 : small ? 5 : 7;
  const bodyW = page.w - m.inner - m.outer;
  const colW = cols === 1 ? bodyW : (bodyW - gap) / 2;
  return { size, binding, page, sheet, imposed, duplex, margins: m, cols, gap, colW, bodyW, bodyH: page.h - m.top - m.bottom, small, sheetLabel: sheetLabel(size, binding) };
}

function sheetLabel(size, binding) {
  if (binding === "plegado") return size === "A4" ? "A3" : "doble carta";
  return PAPER[size].label.toLowerCase() === "a4" ? "A4" : PAPER[size].label.toLowerCase();
}

const EPS = 0.5;

// Lays measured pieces into columns and pages.
//  flow:    [{ type: "section", name } | { type: "block", chains: [[atom, ...], ...] }]
//           A block is kept in one column when it fits there (a passage with its first question, one question),
//           unless that would leave more than `moveBelow` of the column empty.
//           A chain is never split (the range line with the first paragraph, a stem with its options).
//  height:  atom -> height in the same unit as colH.
//  colH:    usable column height on an ordinary page; bannerH is what a section banner takes from it.
//  areaBreak: "page" starts every area on a new page with a full-width banner; "flow" lets an area start in the
//           column where the last one ended, under its own heading atom (item.head), kept with its first block.
//  firstH:  room the first page gives to a header (name, course, date) when the booklet has no cover page.
// Returns [{ section, banner, columns: [[atom...], ...], over: bool }]. `over` marks a page with a piece taller than a column.
export function paginate(flow, height, { colH, cols = 2, bannerH = 0, moveBelow = 0.35, areaBreak = "page", firstH = 0 }) {
  const pages = [];
  let page = null;
  let col = 0;
  let used = 0;
  let area = null;
  let head = null; // an area heading waiting for the first block of its area
  const room = () => colH - (page.banner ? bannerH : 0) - (page === pages[0] ? firstH : 0);
  const newPage = (banner = false) => {
    page = { section: area, banner, columns: Array.from({ length: cols }, () => []), over: false };
    pages.push(page);
    col = 0;
    used = 0;
  };
  const nextCol = () => {
    col += 1;
    used = 0;
    if (col >= cols) newPage();
  };
  const fits = (h) => used + h <= room() + EPS;
  const sum = (atoms) => atoms.reduce((s, a) => s + height(a), 0);
  const put = (atoms) => {
    for (const a of atoms) {
      page.columns[col].push(a);
      used += height(a);
    }
    if (used > room() + EPS) page.over = true;
  };

  for (const item of flow) {
    if (item.type === "section") {
      area = item.name;
      if (areaBreak === "page" || !page || item.head == null) newPage(true);
      else head = item.head;
      continue;
    }
    if (!page) newPage();
    const chains = item.chains.filter((c) => c.length).map((c) => c.slice());
    if (head != null && chains.length) { chains[0].unshift(head); head = null; }
    const total = chains.reduce((s, c) => s + sum(c), 0);
    if (fits(total)) { chains.forEach(put); continue; }
    // A block that fits a fresh column moves there only when little room is left here; otherwise its chains flow,
    // so a long own text starts here and the question follows in the next column (no half-empty columns).
    if (total <= room() + EPS && used > 0 && (chains.length === 1 || room() - used < room() * moveBelow)) { nextCol(); chains.forEach(put); continue; }
    for (const chain of chains) {
      const h = sum(chain);
      if (h > room() + EPS) {
        // Taller than a whole column: the chain has to break, so its pieces go one by one.
        for (const a of chain) {
          if (!fits(height(a)) && used > 0) nextCol();
          put([a]);
        }
        continue;
      }
      if (!fits(h) && used > 0) nextCol();
      put(chain);
    }
  }
  return pages.filter((p) => p.columns.some((c) => c.length));
}

// Adds blank pages before the back cover so the count is a multiple of `of` (4 for a folded booklet, 2 for duplex).
// pages: any array; blank: the value to insert. The last page (back cover) stays last unless keepLast is false.
export function padPages(pages, of, blank, keepLast = true) {
  const missing = (of - (pages.length % of)) % of;
  if (!missing) return pages.slice();
  const fill = Array.from({ length: missing }, () => blank);
  return keepLast ? [...pages.slice(0, -1), ...fill, pages.at(-1)] : [...pages, ...fill];
}

// Saddle-stitch order: page indexes (0-based) on each sheet side, [left, right].
// For 8 pages: [7,0] [1,6] [5,2] [3,4]. Each pair of entries is the front and back of one sheet.
export function saddleOrder(n) {
  if (n % 4) throw new Error("A folded booklet needs a multiple of 4 pages.");
  const sides = [];
  for (let i = 0; i < n / 4; i++) {
    sides.push([n - 1 - 2 * i, 2 * i]);
    sides.push([2 * i + 1, n - 2 - 2 * i]);
  }
  return sides;
}

// Splits exam HTML into its top-level blocks (paragraphs, tables, figure tokens) so a long passage can continue in the
// next column. Without a DOM (tests) it splits on blank lines, which is how the goldens separate blocks.
export function splitBlocks(html) {
  const source = String(html ?? "").trim();
  if (!source) return [];
  if (typeof DOMParser === "undefined") return source.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
  const out = [];
  let loose = "";
  for (const node of doc.body.childNodes) {
    if (node.nodeType === 1 && !/^(B|I|EM|STRONG|SPAN|SUB|SUP|A|U|BR)$/.test(node.tagName)) {
      if (loose.trim()) out.push(loose.trim());
      loose = "";
      out.push(node.outerHTML);
    } else {
      loose += node.nodeType === 1 ? node.outerHTML : node.textContent;
    }
  }
  if (loose.trim()) out.push(loose.trim());
  return out;
}

// A paragraph too long for one column is cut at sentence ends into pieces of about `max` characters.
export function splitLongParagraph(html, max = 900) {
  const m = String(html).match(/^<p([^>]*)>([\s\S]*)<\/p>$/);
  if (!m || m[2].length <= max || /<(table|img|svg)/i.test(m[2])) return [html];
  const sentences = m[2].match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [m[2]];
  const parts = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) { parts.push(cur); cur = ""; }
    cur += s;
  }
  if (cur) parts.push(cur);
  return parts.map((p, i) => `<p${m[1]}${i ? ' data-cont="1"' : ""}>${p.trim()}</p>`);
}
