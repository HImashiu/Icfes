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

export function renderRich(source) {
  if (!source) return "";
  const withoutPictures = source.replace(IMG, "").replace(MD_IMG, "");
  const withMath = withoutPictures.replace(MATH, (_, tex) =>
    katex.renderToString(tex.trim(), { throwOnError: false, output: "htmlAndMathml" }),
  );
  return DOMPurify.sanitize(withMath);
}

// Plain-text version for places that cannot hold markup, such as titles.
export function plainText(source) {
  return (source ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
