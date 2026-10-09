// Turns the stem, option and passage HTML from the exam file into safe markup.
// Math written as $...$ goes through KaTeX. Figures are not embedded yet, so each
// <img> becomes a labelled slot that the figure renderer can later replace.
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

const MATH = /\$([^$\n]+?)\$/g;
const IMG = /<img\b[^>]*>/gi;

function altOf(tag) {
  const m = /\balt="([^"]*)"/i.exec(tag);
  return m ? m[1] : "";
}

export function renderRich(source) {
  if (!source) return "";
  const withFigures = source.replace(IMG, (tag) => {
    const alt = altOf(tag).replace(/"/g, "&quot;");
    return `<span class="figure-slot" data-alt="${alt}">Figura</span>`;
  });
  const withMath = withFigures.replace(MATH, (_, tex) =>
    katex.renderToString(tex.trim(), { throwOnError: false, output: "htmlAndMathml" }),
  );
  return DOMPurify.sanitize(withMath, { ADD_ATTR: ["data-alt"] });
}

// Plain-text version for places that cannot hold markup, such as titles.
export function plainText(source) {
  return (source ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
