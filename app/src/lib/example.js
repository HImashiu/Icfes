// The worked example (0) that opens each part of the English section, as its own block in a text:
//
//   [[ejemplo:B|Where can you see this sign?|in a playground|in a street|in a garden]]
//       a prompt, its options (lettered A, B, C… in order) and the right one after "ejemplo:"
//   [[ejemplo:A|This fruit is long, and monkeys like it a lot.]]
//       no options: the answer is a letter of a list shown elsewhere (the matching part)
//
// It is written alone on its line and drawn as a dashed box marked "Ejemplo", with the answer shown.

export const EXAMPLE_PARA = /^\s*\[\[ejemplo:([A-Za-z]?)\|([^\]\n]*)\]\]\s*$/;

const LETTERS = "ABCDEFGH";
const BOX = "border:1.5px dashed currentColor;border-radius:10px;padding:0.55em 0.9em;margin:0.7em 0";
const TAG = "font-size:0.75em;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;opacity:0.7;margin-bottom:0.2em";

export function parseExample(token) {
  const m = EXAMPLE_PARA.exec(token);
  if (!m) return null;
  const [prompt, ...options] = m[2].split("|").map((s) => s.trim());
  return { answer: (m[1] || "").toUpperCase(), prompt, options: options.filter(Boolean) };
}

// Text inside is trusted to the sanitizer that runs after it, like the rest of renderRich.
export function exampleHtml({ answer, prompt, options }) {
  const opts = options
    .map((o, i) => {
      const right = LETTERS[i] === answer;
      return `<div class="ej-opt${right ? " ej-right" : ""}" style="padding-left:1.2em${right ? ";font-weight:700" : ""}">${LETTERS[i]}. ${o}${right ? " ✓" : ""}</div>`;
    })
    .join("");
  const key = answer ? `<div class="ej-key" style="margin-top:0.3em">Respuesta: <b>${answer}</b></div>` : "";
  return `<div class="ejemplo" data-answer="${answer}" style="${BOX}"><div class="ej-tag" style="${TAG}">Ejemplo</div><div class="ej-q">0. ${prompt}</div>${opts}${key}</div>`;
}

export const renderExample = (block) => {
  const ex = parseExample(block);
  return ex ? exampleHtml(ex) : block;
};
