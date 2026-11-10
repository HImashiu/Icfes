// Mechanical checks on one question as the student page drew it. Used by the question review screen
// (#revision-preguntas) and by scripts/review/review-questions.mjs. They find what is cheap to find
// (leftover markup, broken pictures, empty options); whether the text matches the printed booklet is
// still a human (or Claude) look at the screenshot.

const LEFTOVERS = [
  [/\*\*[^*\s][^*]*\*\*/, "negritas «**» sin convertir"],
  [/\[\[figura:[^\]]*\]\]/, "marca [[figura:…]] sin resolver"],
  [/\\\(|\\\)|\\\[|\\\]/, "fórmula \\( \\) sin dibujar"],
  [/\$[^$\n]*(?:\\[a-zA-Z]+|[\^_{}])[^$\n]*\$/, "fórmula $…$ sin dibujar"],
  [/&(?:lt|gt|amp|nbsp|quot);/i, "entidad HTML visible"],
  [/<\/?(?:p|div|span|br|table|tr|td|th|u|b|i|em|strong|sub|sup)\b[^>]*>/i, "etiqueta HTML visible"],
  [/�/, "carácter de reemplazo «�»"],
  [/(^|\s)\\(?:frac|sqrt|times|cdot|text|mathrm|left|right)\b/, "comando LaTeX visible"],
  [/\[\[[^\]]*\]\]/, "marca [[…]] visible"],
  [/\s{3,}\S/, "espacios de más (¿falta una fórmula o una palabra?)"],
];

export function leftoverIssues(text) {
  const out = [];
  for (const [re, label] of LEFTOVERS) if (re.test(text)) out.push(label);
  return out;
}

// `root` is the element that holds the drawn question block(s); `question` the parsed question.
// Returns [{ level: "error" | "warn", code, message }].
export function checkRendered(root, question) {
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });
  if (!root) return [{ level: "error", code: "no-root", message: "No se dibujó la pregunta" }];

  // 1. Visible text with markup that should have been converted. Formula sources are skipped (KaTeX keeps the TeX
  // in an annotation node that is not visible).
  const clone = root.cloneNode(true);
  clone.querySelectorAll(".katex-mathml, script, style, .option-tag, .card-label, .sr-only, [aria-hidden='true'] .katex-html").forEach((n) => n.remove());
  const visible = (clone.textContent ?? "").replace(/ /g, " ");
  for (const label of leftoverIssues(visible)) add("error", "leftover", label);

  // 2. Formulas KaTeX could not draw.
  const katexErrors = root.querySelectorAll(".katex-error");
  if (katexErrors.length) add("error", "katex", `${katexErrors.length} fórmula(s) con error`);

  // 3. Pictures that did not load or have no size.
  for (const img of root.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth === 0) add("error", "img-broken", `Imagen rota: ${(img.getAttribute("src") ?? "").slice(0, 60)}`);
    else if (img.complete && img.naturalWidth > 0 && img.naturalWidth < 24) add("warn", "img-tiny", `Imagen diminuta (${img.naturalWidth}px)`);
  }
  for (const svg of root.querySelectorAll("svg")) {
    if (svg.closest("[hidden]")) continue; // the other tab of a phone's text/question pair
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) add("warn", "svg-empty", "Gráfica sin tamaño");
  }

  // 4. Options: how many, and none empty.
  // On a wide screen the questions of one text are drawn together; the checks are about the one asked for.
  const own = root.querySelector(".block-q.current") ?? root;
  const options = [...own.querySelectorAll(".options li .option")];
  const expected = question.expected_options ?? question.options?.length ?? null;
  if (expected && options.length !== expected) add("error", "options-count", `Se dibujan ${options.length} opciones y se esperaban ${expected}`);
  const lettersOnly = Boolean(own.querySelector(".options.match-letters")); // matching: the words sit in the context column
  for (const o of lettersOnly ? [] : options) {
    const letter = o.querySelector(".letter-tile")?.textContent?.trim();
    const body = o.cloneNode(true);
    body.querySelectorAll(".letter-tile, .option-tag").forEach((n) => n.remove());
    const hasMedia = o.querySelector("img, svg, table, .katex");
    if (!body.textContent.trim() && !hasMedia) add("error", "option-empty", `La opción ${letter ?? "?"} está vacía`);
  }
  if (options.length) {
    const letters = options.map((o) => o.querySelector(".letter-tile")?.textContent?.trim());
    if (letters.join("") !== "ABCDEFGH".slice(0, letters.length)) add("warn", "option-letters", `Letras de opciones: ${letters.join(", ")}`);
  }

  // 5. Question body.
  const stem = own.querySelector(".stem");
  if (!stem && !own.querySelector(".gap-line") && !(question.stem_md ?? "").trim()) add("warn", "no-stem", "La pregunta no tiene enunciado");
  if (question.pending_spec || [...root.querySelectorAll(".pending-fig")].length) add("warn", "pending-fig", "Figura pendiente de dibujar");

  // 6. Same sentence drawn twice (a passage copied into the stem and shown again).
  const blocks = [...root.querySelectorAll(".stimulus, .stem")].map((n) => n.textContent.replace(/\s+/g, " ").trim()).filter((t) => t.length > 60);
  if (new Set(blocks).size < blocks.length) add("warn", "duplicate", "Un mismo texto se dibuja dos veces");

  // 7. Layout: nothing may push the page sideways.
  const doc = root.ownerDocument.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) add("error", "overflow-x", `La página se desborda a los lados (${doc.scrollWidth}px en ${doc.clientWidth}px)`);
  for (const el of root.querySelectorAll("table, svg, img, .katex-display")) {
    const r = el.getBoundingClientRect();
    if (r.right > doc.clientWidth + 1 && !el.closest(".table-scroll, [style*='overflow']")) {
      add("warn", "clipped", `<${el.tagName.toLowerCase()}> pasa del borde derecho (${Math.round(r.right)}px)`);
      break;
    }
  }
  return issues;
}
