// Turns the stem, option and passage HTML from the exam file into safe markup.
// Math written as $...$ goes through KaTeX. Pictures are never shown from the exam text:
// figures come from their native specs (FigureBlock), so <img> tags and markdown image
// references are removed here.
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

const MATH = /\$([^$\n]+?)\$/g;
const IMG = /<img\b[^>]*>/gi;
const MD_IMG = /!\[[^\]]*\]\([^)]*\)/g;

// Plain text from the exam file keeps its blank lines as paragraphs (HTML would collapse them);
// text that already carries block markup is left as written.
const BLOCK = /<\/?(p|div|ul|ol|table|br|h\d)\b/i;
function paragraphs(text) {
  if (BLOCK.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderRich(source) {
  if (!source) return "";
  const withoutPictures = source.replace(IMG, "").replace(MD_IMG, "");
  const withMath = paragraphs(withoutPictures).replace(MATH, (_, tex) =>
    katex.renderToString(tex.trim(), { throwOnError: false, output: "htmlAndMathml" }),
  );
  return DOMPurify.sanitize(withMath);
}

// Plain-text version for places that cannot hold markup, such as titles.
export function plainText(source) {
  return (source ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
