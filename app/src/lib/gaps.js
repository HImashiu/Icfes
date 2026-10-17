// Fill-in-the-blank gaps, as in the English section: a passage with numbered blanks, one question per blank.
//
//   [[hueco:97]]          blank number 97 (question 97 asks for the word that goes there)
//   [[hueco:0|covers]]    the worked example: blank 0 shown already filled in
//   [[hueco]]             a blank with no number, for a single sentence in a stem
//
// Each blank is drawn as <span class="gap" data-gap="97">; the app marks the one the student is answering
// (class "gap-now") and can show the chosen option inside it (a child <span class="gap-fill">).

export const GAP = /\[\[hueco(?::(\d{1,3}))?(?:\|([^\]\n]*))?\]\]/g;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const BOX =
  "display:inline-block;min-width:4.2em;padding:0 0.35em;margin:0 0.1em;border-bottom:1.5px solid currentColor;" +
  "text-align:center;line-height:1.25;white-space:nowrap";
const NUM = "font-size:0.78em;font-weight:700;opacity:0.8";

export function gapHtml(number, word) {
  const n = number ?? "";
  const fill = word ? `<span class="gap-fill" style="font-style:italic">${esc(word.trim())}</span>` : "";
  const num = n !== "" ? `<span class="gap-n" style="${NUM}">(${n})</span>` : "";
  // an empty blank keeps a space inside so it sits on the text line
  return `<span class="gap" data-gap="${n}" style="${BOX}">${num}${num && fill ? " " : ""}${fill || (num ? "" : "&nbsp;")}</span>`;
}

export const renderGaps = (text) => text.replace(GAP, (m, n, word) => gapHtml(n, word));

// The sentence around blank `number` in a passage, as plain text that still carries its blank tokens, or "" when the
// passage has no such blank. Shown with the question on a phone, where the passage sits behind its own tab.
export function gapSentence(html, number) {
  const text = (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const at = [...text.matchAll(GAP)].find((m) => m[1] === String(number));
  if (!at) return "";
  // Sentence ends outside the tokens: tokens are blanked to the same length so their offsets stay put.
  const plain = text.replace(GAP, (m) => "_".repeat(m.length));
  const before = plain.slice(0, at.index);
  const start = Math.max(...[".", "!", "?"].map((c) => before.lastIndexOf(c))) + 1;
  const after = plain.slice(at.index + at[0].length).search(/[.!?]/);
  const end = after < 0 ? text.length : at.index + at[0].length + after + 1;
  return text.slice(start, end).trim();
}
