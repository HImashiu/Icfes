// The print format of a cuadernillo: paper, binding, sides, margins, type, columns, running heads, cover and extra pages.
// Pure: BookletStudio edits it, BookletPages and geometry() read it. Saved per browser and, for coordinators, as the
// school's format (school_settings.settings.print_style).

export const FONTS = {
  newsreader: { label: "Newsreader (clásica)", css: 'Newsreader, Georgia, "Times New Roman", serif' },
  times: { label: "Times New Roman", css: '"Times New Roman", Times, Georgia, serif' },
  figtree: { label: "Figtree (moderna)", css: "Figtree, Arial, sans-serif" },
  arial: { label: "Arial", css: "Arial, Helvetica, sans-serif" },
};
export const FONT_SIZES = [9, 9.5, 10, 10.5, 11, 11.5, 12, 13];
export const LEADING = { compacto: 1.22, normal: 1.36, amplio: 1.52 };
export const SPACING = { compacto: 1.4, normal: 2.6, amplio: 5 };
export const WORK_SPACE = [0, 15, 30, 50];

export const DEFAULT_STYLE = {
  size: "Carta", // Carta | A4 | Oficio
  binding: "sueltas", // sueltas | plegado | pequeno
  sides: "duplex", // duplex | simplex (only for sueltas; folded booklets are always duplex)
  margins: "normal", // estrecho | normal | amplio | custom
  custom: { top: 19, bottom: 17, inner: 18, outer: 14 },
  cols: "auto", // auto | 1 | 2
  colRule: true,
  font: "newsreader",
  fontSize: 10.5,
  leading: "normal",
  spacing: "normal",
  workSpace: 0, // mm of blank space after every Matemáticas question
  optionGrid: false, // short options in two columns
  areaBreak: "page", // page | flow
  areaRecto: false, // every area starts on a right-hand page (duplex only)
  color: false, // area colours on the cover, banners and boxes
  cover: "full", // full | header | none
  kicker: "",
  subtitle: "",
  instructions: true,
  extraInstruction: "",
  backCover: true,
  answerSheet: false, // a bubble sheet at the end (loose pages only)
  head: true,
  headText: "",
  headArea: true,
  pageNumber: "outer", // outer | center | none
  pageTotal: false, // "3 de 24"
  footText: "",
};

export const PRESETS = [
  { id: "icfes", label: "Como el ICFES", note: "Plegado, dos columnas, blanco y negro", style: { binding: "plegado", sides: "duplex", margins: "normal", cols: "auto", font: "newsreader", fontSize: 10.5, leading: "normal", spacing: "normal", optionGrid: false, areaBreak: "page", areaRecto: false, color: false, cover: "full", instructions: true, backCover: true, workSpace: 0 } },
  { id: "editorial", label: "Editorial a color", note: "Portada y áreas a color, cada área en página derecha", style: { binding: "plegado", sides: "duplex", margins: "amplio", cols: "auto", font: "newsreader", fontSize: 10.5, leading: "normal", spacing: "normal", optionGrid: false, areaBreak: "page", areaRecto: true, color: true, cover: "full", instructions: true, backCover: true, pageTotal: false } },
  { id: "ahorro", label: "Ahorro de papel", note: "Doble cara, márgenes estrechos, sin portada aparte", style: { binding: "sueltas", sides: "duplex", margins: "estrecho", cols: "auto", font: "newsreader", fontSize: 9.5, leading: "compacto", spacing: "compacto", optionGrid: true, areaBreak: "flow", areaRecto: false, color: false, cover: "header", instructions: false, backCover: false, workSpace: 0 } },
  { id: "comodo", label: "Lectura cómoda", note: "Letra grande, una columna, espacio para operaciones", style: { binding: "sueltas", sides: "duplex", margins: "normal", cols: 1, font: "arial", fontSize: 12, leading: "amplio", spacing: "amplio", optionGrid: false, areaBreak: "page", areaRecto: false, color: false, cover: "full", instructions: true, backCover: false, workSpace: 30 } },
];

const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const text = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

// Any saved or half-typed value becomes a valid style. Unknown keys are dropped.
export function cleanStyle(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_STYLE;
  const size = pick(r.size, ["Carta", "A4", "Oficio"], d.size);
  let binding = pick(r.binding, ["sueltas", "plegado", "pequeno"], d.binding);
  if (binding === "plegado" && !canFold(size)) binding = "sueltas";
  const c = r.custom && typeof r.custom === "object" ? r.custom : {};
  return {
    size,
    binding,
    sides: binding === "sueltas" ? pick(r.sides, ["duplex", "simplex"], d.sides) : "duplex",
    margins: pick(r.margins, ["estrecho", "normal", "amplio", "custom"], d.margins),
    custom: { top: num(c.top, 6, 40, d.custom.top), bottom: num(c.bottom, 8, 40, d.custom.bottom), inner: num(c.inner, 6, 40, d.custom.inner), outer: num(c.outer, 6, 40, d.custom.outer) },
    cols: r.cols === 1 || r.cols === 2 || r.cols === "1" || r.cols === "2" ? Number(r.cols) : "auto",
    colRule: r.colRule !== false,
    font: pick(r.font, Object.keys(FONTS), d.font),
    fontSize: pick(Number(r.fontSize), FONT_SIZES, d.fontSize),
    leading: pick(r.leading, Object.keys(LEADING), d.leading),
    spacing: pick(r.spacing, Object.keys(SPACING), d.spacing),
    workSpace: pick(Number(r.workSpace), WORK_SPACE, d.workSpace),
    optionGrid: r.optionGrid === true,
    areaBreak: pick(r.areaBreak, ["page", "flow"], d.areaBreak),
    areaRecto: r.areaRecto === true,
    color: r.color === true,
    cover: pick(r.cover, ["full", "header", "none"], d.cover),
    kicker: text(r.kicker, 60),
    subtitle: text(r.subtitle, 120),
    instructions: r.instructions !== false,
    extraInstruction: text(r.extraInstruction, 400),
    backCover: r.backCover !== false,
    answerSheet: r.answerSheet === true,
    head: r.head !== false,
    headText: text(r.headText, 90),
    headArea: r.headArea !== false,
    pageNumber: pick(r.pageNumber, ["outer", "center", "none"], d.pageNumber),
    pageTotal: r.pageTotal === true,
    footText: text(r.footText, 120),
  };
}

export const canFold = (size) => size === "A4" || size === "Carta";

// The keys that change where things fall on the page; a change to any of them lays the booklet out again.
export const LAYOUT_KEYS = ["size", "binding", "margins", "custom", "cols", "font", "fontSize", "leading", "spacing", "workSpace", "optionGrid", "areaBreak", "cover", "kicker", "subtitle", "color"];
export const layoutKeyOf = (s) => JSON.stringify(LAYOUT_KEYS.map((k) => s[k]));

// Which preset a style matches, if any (so the chip shows as chosen).
export function presetOf(style) {
  return PRESETS.find((p) => Object.entries(p.style).every(([k, v]) => style[k] === v))?.id ?? null;
}

// Is a side of the printed stack the front? Sheets alternate front, back when printing on both sides.
// part: "all" | "front" | "back". Returns the indexes of the printed sheet sides to keep.
export function sidesFor(count, part, duplex) {
  const all = [...Array(count).keys()];
  if (!duplex || part === "all") return all;
  return all.filter((i) => (part === "front" ? i % 2 === 0 : i % 2 === 1));
}
