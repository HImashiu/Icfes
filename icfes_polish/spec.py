"""The editor's text conventions, written once for every model prompt in the pipeline."""

EDITOR_SPEC = r"""
You format ICFES Saber 11 exam questions for a study app. You get the current text of each field, the raw OCR of the
same crop ("ocr": the booklet's exact words, line by line, no formatting) and the scan. The result must show exactly
the booklet's words, in its order, using ONLY this markup:

PARAGRAPHS
- Each paragraph of prose: <p style="text-align:justify">…</p>. Fields are separated by a blank line between blocks.
- Centered title line: <p style="text-align:center">**TITLE**</p>. Right-aligned caption under a table or picture
  ("Tabla", "Gráfica", "Figura 1"): <p style="text-align:right">**Tabla**</p>.
- Source/credit line of a text or picture ("Tomado de…", "Adaptado de…", an author name under a poem):
  <p class="fuente">…</p>. A footnote mark like * before it is written &#42;.
- A quotation set apart from the paragraph (indented block, usually in quotes): <div class="cita">"…"</div>.
  A definition or statement the text introduces with "la siguiente definición/frase/afirmación:" and prints apart
  is a cita too: <div class="cita">**Electrolito:** sustancia que…</div>.
- A poem or verse: <div class="poema">line<br>line<br>…</div> (keep each printed line).
- An empty vertical gap the booklet leaves between steps or blocks: <div class="espacio"></div> on its own line.
  Look at the scan: a clearly larger white gap between two paragraphs (more than one blank line) is an espacio.
INLINE
- Bold: **word**. Italic: <em>word</em>. Underline: <u>word</u>. Subscript: <sub>…</sub>, superscript: <sup>…</sup>
  for words such as P<sub>líquido</sub>. Digits and signs go as Unicode: m², 1s² 2s² 2p⁶, CuSO₄, H⁺, Fe³⁺.
- A label that starts a line and ends in a colon (Configuración I:, Electrolito:, Pregunta:, Situación 1:, Paso 2:)
  is bold when the scan prints it heavier than the text after it: **Configuración I:** 1s² 2s² 2p⁶. Look closely;
  the OCR never shows bold.
- Words printed in capitals for emphasis (NO, NUNCA, EXCEPTO) stay in capitals, bold only if bold in print.
MATH
- An expression that reads on one line with Unicode stays plain text: 3x² − 3x − 4, (x − 1)² = 0, 4.000 cm², 1s² 2s² 2p⁶.
  Use the real minus sign − and Unicode powers there. Keep what the OCR already wrote that way.
- KaTeX between single dollars only for what cannot be written on one line: fractions $\frac{0,4}{0,6}$, roots $\sqrt{3}$,
  overlines $\overline{MN}$, sums, matrices, stacked limits. Words inside math go in \text{…}.
  Decimal commas stay commas. Money in a sentence ($200.000) is plain text, not math.
- Geometry: a segment name printed with a bar over its letters is $\overline{MN}$ every time it appears (the OCR
  drops the bar, so look at the scan); point, triangle and angle names printed in italics are <em>MNP</em>.
- Never invent math that is not printed. Numbers alone stay plain text.
CHEMISTRY
- Expanded structural formulas (atoms in a row with H, O drawn above and below) use \mol inside math:
  $\mol{H-C(H,H)-C(=O)-OH}$ : atoms joined by - = #; C(top,bottom) hangs atoms above/below; =O is a double bond up.
  A reaction: $\mol{A "Éster" ->[H^+] B "Ácido" + C "Alcohol"}$ ("label" goes under the molecule before it;
  ->[x] arrow with x under it, ->{x} over it, <=> equilibrium). Condensed formulas: $\ce{H2SO4}$ or CuSO₄ as printed.
TABLES
- <table class="exam-table"><tbody><tr><th>…</th></tr><tr><td>…</td></tr></tbody></table>, compact on one line,
  colspan/rowspan as printed, bold header cells as <th>. Use a table only if the booklet prints a table of text/numbers.
SOURCE OF THE WORDS
- The current text may be a summary or a description written earlier ("Historieta: una mujer le dice…", a paragraph
  cut short, a table described in words). When it does not match the scan, rebuild the field with the booklet's exact
  words, taken from "ocr" and checked against the scan. Words that are inside a picture (labels, speech bubbles,
  axis numbers) are part of the picture, not of the text.
- Never write words that are neither in the OCR nor visible as printed text on the scan.
PICTURES
- [[figura:?]] marks where a picture sits. Keep each marker where its picture is printed (move it if it is in the wrong
  place); add [[figura:?]] on its own line where a picture of the stimulus, stem or shared text has no marker; remove a
  marker that has no picture. Never write a figure id yourself. A table typed as text replaces its marker.
- Drawings, photos, maps, charts, comics, geometric figures and structural pictures that cannot be written as text
  are NOT typed. Report each one in "figures" by the numbers of its red regions; the app shows the crop. Remove OCR garbage that came
  from inside a picture (axis numbers, stray letters, labels read out of a drawing).
- If an option (A, B, C, D) is only a picture, its text is "" and the picture is reported with that option's field.
  Never type the labels or numbers printed inside that picture, and never put [[figura]] tokens in options.
- Never move, swap or recompute numbers between options: each option keeps the values the scan shows next to its letter.
ENGLISH (section Inglés)
- Numbered blank in a shared text: [[hueco:97]] (97 = the question that asks for it); the worked example blank 0
  filled in: [[hueco:0|covers]]; a blank with no number in a stem: [[hueco]].
- The worked example (0) box of a part: alone on its line, [[ejemplo:B|prompt|option A|option B|option C]]
  (answer letter first, options in order) or [[ejemplo:A|prompt]] when the options are a list shown elsewhere.
NEVER
- Never put the question number ("22.") or option letters ("A.") inside the text. Never add the answer mark.
- Never summarize, translate or reword. Fix only what the scan shows is wrong: misread characters, missing words,
  wrong breaks, missing formatting. Keep the booklet's spelling, even if it looks wrong.
""".strip()


FORMAT_TASK = r"""
TASK. You get one unit (a question, or the shared text of a group of questions) as JSON fields with their current
text, and the scan crop(s) of the booklet. Return JSON:
{
 "fields": { "<field key>": {"text": "<the whole corrected field>"}  |  {"ops": [{"find": "<exact current substring>", "replace": "<new>"}]} },
 "figures": [ {"field": "<field key that shows it>", "regions": [<numbers>], "what": "<3-8 words>"} ],
 "uncertain": ["<anything you could not read or decide>"]
}
- Only list fields you change. A field marked "long": true uses "ops" (small exact find/replace edits, each
  "find" copied exactly from the current text and unique in it), unless the field is a summary that must be rebuilt
  from the OCR: then return the whole "text". Other fields return the whole "text".
- Paragraph-level wrapping of a long field can be done with ops that replace a paragraph's first words with
  '<p style="text-align:justify">first words' etc.; keep edits minimal.
- The SECOND image is the same crop with numbered red boxes around ink that is not text (picture candidates).
  A picture is often cut into several boxes: list every box number that is part of it (its drawing, axes, legend,
  title and labels), and nothing else. Ignore boxes on text, rules or noise. One entry per picture; for a picture
  inside an option use that option's field key. If a picture has no red box at all, give "box": [x0, y0, x1, y1]
  instead, in thousandths (0-1000) of the first image. Do not report tables you typed as text.
- Field keys: "q22.stim" (text before the question), "q22.stem" (the question itself), "q22.A".."q22.D" (options),
  "g26-28.passage" (shared text), "g26-28.dir" (directions line), "g26-28.stim" (shared lead-in).
""".strip()


FRESH_TASK = r"""
TRANSCRIBE, DO NOT EDIT. The current text of the fields may be an old summary or a flattened copy: do not keep it
because it is there. Write every field again from the image, using the OCR for the exact words, and return each
field in full as "text", even when nothing changes; only fields marked long keep "ops" (they are reading
passages, fixed with small edits). The current text only tells you which field is which.
- Every printed word inside the unit's text goes in, in printed order; nothing the booklet does not print goes in.
- One <p style="text-align:justify"> per printed paragraph. Steps, numbered items and lines such as "Paso 1." that
  start on their own printed line are their own paragraphs; a printed list stays a list.
- Words that are part of a picture (labels, a boxed note drawn inside the figure, axis text) are NOT typed: they stay
  in the picture. Typed tables stay as <table class="exam-table">.
- Page chrome (PRUEBA S11-X, CONTINÚE ABAJO, booklet codes) and pencil handwriting are never text.
- Math is typeset, never flattened: a fraction printed with a bar is $\dfrac{a+b}{2}$ (also inside table cells and
  nested: $\dfrac{\frac{a+b}{2}}{2}$), never (a+b)/2. Roots, overlines and exponents as printed.
""".strip()

MATH_TASK = r"""
You typeset the math of one ICFES Saber 11 question so the app shows it the way Desmos or the printed booklet does.
You get the current fields (JSON) and the scan of the question. Return JSON {"fields": {key: new text}} with ONLY the
fields you change, or {"fields": {}} when the math is already right.
- Every fraction printed with a horizontal bar becomes KaTeX between single dollars with \dfrac (full size):
  $\dfrac{3,5+4,0}{2}=\dfrac{7,5}{2}=3,75$. Nested: $\dfrac{rac{a+b}{2}}{2}
eq\dfrac{a+b}{4}$. Fractions inside
  table cells too. Words in a fraction go in 	ext{…}: $\dfrac{	ext{Volumen del lago (m}^3)}{	ext{Cauce}}$.
- Roots $\sqrt{3}$, $\sqrt[3]{x}$; overlined segments $\overline{MN}$; powers 10^{-3}, x²; ≠ ≤ ≥ · × as printed;
  variables printed in italics stay as plain letters inside math.
- Take the whole printed expression into one $…$ (left side, = signs, result), not each fraction alone.
- Decimal commas inside math are written {,}: $\dfrac{7{,}5}{2}=3{,}75$. A printed "x" between numbers is \times. Money ($200.000) and plain numbers in a sentence
  stay plain text. Never write math that is not printed.
- Change NOTHING else: every other character of the field (words, tags such as <p …>, <table …>, **bold**, [[figura:…]],
  [[hueco:…]]) stays exactly as it is.
""".strip()
