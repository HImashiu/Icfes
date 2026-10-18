// The Word-style text fields of the question builder, ported from the admin editor (icfes_admin toVisual/toSource).
// The stored text is the exam format the app already draws (renderRich): paragraphs split by blank lines,
// **bold**, <em>, <u>, <sub>, <sup>, lists, <table class="exam-table">, $math$, [[hueco]], [[figura:ID]] and the
// cita / poema / fuente / espacio blocks. The field shows it as editable HTML with formulas, blanks and figures as chips.
import DOMPurify from "dompurify";
import { renderRich } from "../render.js";
import { gapHtml } from "../gaps.js";

export const RICH_BLOCK = /^(DIV|P|UL|OL|TABLE|H[1-6]|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION)$/;
const MATH_SPLIT = /(\$[^$\n]+?\$)/;
const FIG_PARA = /^\s*\[\[figura:([^\]\s]+)\]\]\s*$/;
const GAP_TOKEN = /\[\[hueco(?::(\d{1,3}))?(?:\|([^\]\n]*))?\]\]/g;

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Prices like "$200.000, ... $" pair up as dollars too; only real formulas become chips, the rest stays text.
const isTex = (part) => !/\n/.test(part) && (!part.includes("<") || /^\$\\(ce|mol)\{/.test(part)) && !/^\$\s|\s\$$/.test(part) && !/^\$\d{1,3}(\.\d{3})+([,;:]|\s|\$)/.test(part);

export const gapToken = (n, w) => `[[hueco${n !== "" && n != null ? ":" + n : ""}${w ? "|" + w.replace(/[\]|\n]/g, " ").trim() : ""}]]`;

export function mathChip(tex) {
  const drawn = renderRich(`$${tex}$`).replace(/^\s*<p>|<\/p>\s*$/g, "");
  return `<span class="mathchip" contenteditable="false" data-tex="${esc(tex)}" title="Clic para editar la fórmula">${drawn}</span>`;
}
export function gapChip(n, w = "") {
  return `<span class="gapchip" contenteditable="false" data-gap="${esc(String(n ?? ""))}" data-word="${esc(w || "")}" title="Clic para quitar el hueco">${gapHtml(n === "" ? null : n, w)}</span>`;
}
// A figure placed in the text. `figs` maps figure ids to image URLs (data URIs of the crops).
export function figBlock(id, figs) {
  const url = figs?.[id];
  const pic = url ? `<img src="${esc(url)}" alt="">` : `<span class="figmissing">Figura ${esc(id)} (ya no existe)</span>`;
  return `<div class="figblock" contenteditable="false" data-fig="${esc(id)}">${pic}<button type="button" class="figx" title="Sacar la figura del texto">✕</button></div>`;
}

function pipeTables(text) {
  const lines = text.split("\n");
  const out = [];
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const row = (l) => /^\s*\|.*\|\s*$/.test(l);
  const sep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes("-");
  for (let i = 0; i < lines.length;) {
    if (row(lines[i]) && i + 1 < lines.length && sep(lines[i + 1])) {
      const head = cells(lines[i]);
      i += 2;
      const body = [];
      while (i < lines.length && row(lines[i])) body.push(cells(lines[i++]));
      out.push("", `<table class="exam-table"><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`, "");
    } else out.push(lines[i++]);
  }
  return out.join("\n");
}

// Exam text -> the HTML the field edits.
export function toVisual(src, figs = {}) {
  if (!src) return "";
  const figIds = [];
  const blocks = pipeTables(src).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (FIG_PARA.test(b) ? `⁤${figIds.push(FIG_PARA.exec(b)[1]) - 1}⁤` : /^<(p|div|ul|ol|table|h\d)\b/i.test(b) ? b : `<div>${b.replace(/\n/g, "<br>")}</div>`));
  const maths = [];
  const gaps = [];
  const html = blocks.join("").split(MATH_SPLIT).map((part, i) => (i % 2 ? (isTex(part) ? `⁣${maths.push(part.slice(1, -1)) - 1}⁣` : part)
    : part.replace(GAP_TOKEN, (m, n, w) => `⁢${gaps.push([n ?? "", w ?? ""]) - 1}⁢`).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>"))).join("");
  // Chips are swapped in after sanitizing: each is drawn by the app's own renderer.
  return DOMPurify.sanitize(html)
    .replace(/⁣(\d+)⁣/g, (m, k) => mathChip(maths[+k]))
    .replace(/⁤(\d+)⁤/g, (m, k) => figBlock(figIds[+k], figs))
    .replace(/⁢(\d+)⁢/g, (m, k) => gapChip(...gaps[+k]))
    .replace(/<div class="espacio"><\/div>/g, '<div class="espacio" contenteditable="false"></div>');
}

// Editable HTML back to exam text. Unknown markup (from Word or a web page) keeps only its text.
export function toSource(root) {
  const blocks = [];
  let inline = "";
  const flush = () => {
    const t = inline.replace(/[ \t]+\n/g, "\n").replace(/\n+$/, "").trim();
    if (t) blocks.push(t);
    inline = "";
  };
  root.childNodes.forEach((n) => {
    if (n.nodeType === 1 && RICH_BLOCK.test(n.tagName)) {
      flush();
      const b = blockSource(n);
      if (b) blocks.push(b);
    } else inline += inlineSource(n);
  });
  flush();
  return blocks.join("\n\n");
}

const inlineHtml = (el) => [...el.childNodes].map(inlineSource).join("").replace(/\n+$/, "").trim().replace(/\n/g, "<br>");

function blockSource(el) {
  const tag = el.tagName;
  if (el.classList.contains("figblock")) return `[[figura:${el.dataset.fig}]]`;
  if (el.classList.contains("espacio")) return `<div class="espacio"></div>`;
  for (const cls of ["cita", "poema"]) {
    if (!el.classList.contains(cls)) continue;
    // one line in the exam text: verses and paragraphs as <br>, an empty line as <br><br>
    const inner = [...el.childNodes].map((n) => (n.nodeType === 1 && RICH_BLOCK.test(n.tagName) ? "\n" + inlineHtml(n) + "\n" : inlineSource(n))).join("")
      .replace(/^\n+|\n+$/g, "").replace(/\n/g, "<br>");
    return inner.replace(/<br>/g, "").trim() ? `<div class="${cls}">${cls === "poema" ? inner : inner.trim()}</div>` : "";
  }
  if (tag === "UL" || tag === "OL") {
    const items = [...el.children].filter((li) => li.tagName === "LI").map((li) => `<li>${inlineHtml(li)}</li>`).join("");
    return items ? `<${tag.toLowerCase()}>${items}</${tag.toLowerCase()}>` : "";
  }
  if (tag === "TABLE") {
    const rows = [...el.querySelectorAll("tr")].map((tr) => `<tr>${[...tr.children].map((c) => {
      const t = c.tagName === "TH" ? "th" : "td";
      const span = (c.colSpan > 1 ? ` colspan="${c.colSpan}"` : "") + (c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : "");
      return `<${t}${span}>${inlineHtml(c)}</${t}>`;
    }).join("")}</tr>`).join("");
    return rows ? `<table class="exam-table"><tbody>${rows}</tbody></table>` : "";
  }
  if ([...el.children].some((c) => RICH_BLOCK.test(c.tagName) && !c.classList.contains("figblock"))) return toSource(el);
  if ([...el.children].some((c) => c.classList.contains("figblock"))) return toSource(el);
  const align = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
  const inner = [...el.childNodes].map(inlineSource).join("").replace(/\n+$/, "");
  if (tag === "P" && el.classList.contains("fuente") && inner.trim()) return `<p class="fuente">${inner.trim().replace(/\n/g, "<br>")}</p>`;
  if (["center", "right", "justify"].includes(align) && inner.trim()) return `<p style="text-align:${align}">${inner.trim().replace(/\n/g, "<br>")}</p>`;
  return inner.trim();
}

function inlineSource(n) {
  // A typed asterisk stays an asterisk: written as &#42; so the app never reads it as bold.
  if (n.nodeType === 3) {
    return n.nodeValue.replace(/ /g, " ").replace(/<(?=[A-Za-z/!])/g, "&lt;")
      .split(MATH_SPLIT).map((part, i) => (i % 2 ? part : part.replace(/\*/g, "&#42;"))).join("");
  }
  if (n.nodeType !== 1) return "";
  if (n.classList.contains("mathchip")) return `$${n.dataset.tex}$`;
  if (n.classList.contains("gapchip")) return gapToken(n.dataset.gap, n.dataset.word);
  if (n.classList.contains("figblock")) return `\n\n[[figura:${n.dataset.fig}]]\n\n`;
  const tag = n.tagName;
  if (tag === "BR") return "\n";
  if (tag === "BUTTON" || tag === "IMG") return "";
  if (RICH_BLOCK.test(tag)) return "\n" + blockSource(n) + "\n";
  let inner = [...n.childNodes].map(inlineSource).join("");
  const st = n.style || {};
  const bold = tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(st.fontWeight || "");
  const italic = tag === "I" || tag === "EM" || st.fontStyle === "italic";
  const under = tag === "U" || /underline/.test(st.textDecoration || st.textDecorationLine || "");
  const strike = tag === "S" || tag === "STRIKE" || /line-through/.test(st.textDecoration || st.textDecorationLine || "");
  const sub = tag === "SUB" || st.verticalAlign === "sub";
  const sup = tag === "SUP" || st.verticalAlign === "super";
  if (!inner.trim()) return inner;
  if (tag === "SMALL") inner = `<small>${inner}</small>`;
  if (sub) inner = `<sub>${inner}</sub>`;
  if (sup) inner = `<sup>${inner}</sup>`;
  if (strike) inner = `<s>${inner}</s>`;
  if (under) inner = `<u>${inner}</u>`;
  if (italic) inner = `<em>${inner}</em>`;
  if (bold) {
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    inner = /[*\n]/.test(core) ? `${lead}<strong>${core}</strong>${trail}` : `${lead}**${core}**${trail}`;
  }
  return inner;
}

// Exam text from pasted Word or web HTML: bold, italics, lists and tables survive, the rest becomes text.
export function sourceFromHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = DOMPurify.sanitize(html);
  return toSource(tmp);
}

// Joins lines cut by a scan or a PDF: hyphenated word breaks, single line breaks inside a paragraph, doubled spaces.
export function cleanText(t) {
  return t.replace(/\r/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/([^\n])\n(?!\n|\s*[A-E][.)]\s|\s*[-•*|]|\s*\d+[.)]\s)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:?!)])/g, "$1")
    .replace(/([¿¡(]) +/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// "A. uno B. dos C. tres D. cuatro" -> { A: "uno", B: "dos", … }, or null when there are not at least two options in order.
export function splitOptions(text) {
  // OCR often reads a capital option letter as lowercase ("c.15"), so both are accepted.
  const rx = /(^|\n|\s)(?:([A-D])[.)]\s*(?=\S)|([a-d])[.)](?:\s+|(?=\d)))/g;
  const marks = [];
  let m;
  while ((m = rx.exec(text))) marks.push({ letter: (m[2] ?? m[3]).toUpperCase(), at: m.index + m[1].length, start: rx.lastIndex });
  const seq = [];
  for (const mk of marks) {
    const want = seq.length ? String.fromCharCode(seq[seq.length - 1].letter.charCodeAt(0) + 1) : "A";
    if (mk.letter === want) seq.push(mk);
  }
  if (seq.length < 2) return null;
  const out = { head: text.slice(0, seq[0].at).trim() };
  seq.forEach((mk, i) => { out[mk.letter] = text.slice(mk.start, i + 1 < seq.length ? seq[i + 1].at : undefined).replace(/\s+/g, " ").trim(); });
  return out;
}

// A whole question read from the page: "12. Texto… ¿Pregunta? A. … B. … C. … D. …".
// The leading number goes; a long head is split into its text (stimulus) and the last sentence (stem).
export function parseQuestionText(raw) {
  const text = cleanText(raw).replace(/^\s*(?:pregunta\s*)?\d{1,3}\s*[.)-]\s*/i, "");
  const opts = splitOptions(text);
  const head = (opts ? opts.head : text).trim();
  let stimulus = "";
  let stem = head;
  const paras = head.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 1) {
    stem = paras.pop();
    stimulus = paras.join("\n\n");
  } else if (head.length > 320) {
    // the question is the last sentence (it usually ends in "?" or ":")
    const cut = head.slice(0, -1).search(/[.?!:]\s+[^.?!:]*[?:.]?$/);
    if (cut > 0) {
      stimulus = head.slice(0, cut + 1).trim();
      stem = head.slice(cut + 1).trim();
    }
  }
  stem = stem.replace(/^\s*\d{1,3}\s*[.)-]\s+/, "");
  return { stimulus, stem, options: opts ? ["A", "B", "C", "D"].map((l) => opts[l] ?? "") : null };
}
