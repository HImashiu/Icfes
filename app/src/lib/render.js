// Turns the stem, option and passage text from the exam file into safe markup.
// Math written as $...$ goes through KaTeX only when it really is math; money such as $200.000
// stays literal text. Pictures are never shown from the exam text: figures come from their native
// specs (FigureBlock), so <img> tags and markdown image references are removed here.
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { isMathSpan, normalizeField, outsideMath } from "./text-normalize.js";

const MATH = /(?<!\\)\$([^$\n]+?)\$/g;
const IMG = /<img\b[^>]*>/gi;
const MD_IMG = /!\[[^\]]*\]\([^)]*\)/g;

// Plain text from the exam file keeps its blank lines as paragraphs (HTML would collapse them).
// A block that already starts with block markup (a table, a paragraph, a list) is left as written.
const BLOCK_START = /^\s*<(p|div|ul|ol|table|h\d)\b/i;
function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (BLOCK_START.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`))
    .join("");
}

export function renderRich(source) {
  if (!source) return "";
  const withoutPictures = source.replace(IMG, "").replace(MD_IMG, "");
  const cleaned = normalizeField(withoutPictures);
  // **bold** in the exam text (for example a bold NO in a stem) becomes <strong>.
  const bold = outsideMath(paragraphs(cleaned), (part) => part.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>"));
  const withMath = bold.replace(MATH, (whole, tex) =>
    isMathSpan(tex) ? katex.renderToString(tex.trim(), { throwOnError: false, output: "htmlAndMathml" }) : whole,
  );
  return DOMPurify.sanitize(withMath);
}

// Plain-text version for places that cannot hold markup, such as titles.
export function plainText(source) {
  return (source ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
