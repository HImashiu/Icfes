"""The editor's text conventions, written once for every model prompt in the pipeline."""

EDITOR_SPEC = r"""
You format ICFES Saber 11 exam questions for a study app. The text was already read by OCR; you see the scan of the
printed booklet and fix the text so it shows exactly like the booklet, using ONLY this markup:

PARAGRAPHS
- Each paragraph of prose: <p style="text-align:justify">…</p>. Fields are separated by a blank line between blocks.
- Centered title line: <p style="text-align:center">**TITLE**</p>. Right-aligned caption under a table or picture
  ("Tabla", "Gráfica", "Figura 1"): <p style="text-align:right">**Tabla**</p>.
- Source/credit line of a text or picture ("Tomado de…", "Adaptado de…", an author name under a poem):
  <p class="fuente">…</p>. A footnote mark like * before it is written &#42;.
- A quotation set apart from the paragraph (indented block, usually in quotes): <div class="cita">"…"</div>.
- A poem or verse: <div class="poema">line<br>line<br>…</div> (keep each printed line).
- An empty vertical gap the booklet leaves between steps or blocks: <div class="espacio"></div> on its own line.
INLINE
- Bold: **word**. Italic: <em>word</em>. Underline: <u>word</u>. Subscript: <sub>…</sub>, superscript: <sup>…</sup>
  for plain text such as P<sub>líquido</sub>, m<sup>2</sup>. Keep Unicode like CuSO₄ or H⁺ when the OCR already has it.
- Words printed in capitals for emphasis (NO, NUNCA, EXCEPTO) stay in capitals, bold only if bold in print.
MATH
- Any formula, fraction, power, root, inequality or expression with variables: KaTeX between single dollars,
  e.g. $\frac{0,4}{0,6}$, $x^{2}+1$, $\sqrt{3}$, $480.000\times0,8$. Words inside math go in \text{…}.
  Decimal commas stay commas. Money in a sentence ($200.000) is plain text, not math.
- Never invent math that is not printed. Numbers alone stay plain text.
CHEMISTRY
- Expanded structural formulas (atoms in a row with H, O drawn above and below) use \mol inside math:
  $\mol{H-C(H,H)-C(=O)-OH}$ : atoms joined by - = #; C(top,bottom) hangs atoms above/below; =O is a double bond up.
  A reaction: $\mol{A "Éster" ->[H^+] B "Ácido" + C "Alcohol"}$ ("label" goes under the molecule before it;
  ->[x] arrow with x under it, ->{x} over it, <=> equilibrium). Condensed formulas: $\ce{H2SO4}$ or CuSO₄ as printed.
TABLES
- <table class="exam-table"><tbody><tr><th>…</th></tr><tr><td>…</td></tr></tbody></table>, compact on one line,
  colspan/rowspan as printed, bold header cells as <th>. Use a table only if the booklet prints a table of text/numbers.
PICTURES
- Drawings, photos, maps, charts, comics, geometric figures and structural pictures that cannot be written as text
  are NOT typed. Report each one in "figures" with its box; the app shows the crop. Remove OCR garbage that came
  from inside a picture (axis numbers, stray letters, labels read out of a drawing).
- If an option (A, B, C, D) is only a picture, its text is "" and the picture is reported with that option's field.
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
 "figures": [ {"field": "<field key that shows it>", "box": [x0, y0, x1, y1], "what": "<3-8 words>"} ],
 "uncertain": ["<anything you could not read or decide>"]
}
- Only list fields you change. A field marked "long": true must use "ops" (small exact find/replace edits, each
  "find" copied exactly from the current text and unique in it); other fields return the whole "text".
- Paragraph-level wrapping of a long field can be done with ops that replace a paragraph's first words with
  '<p style="text-align:justify">first words' etc.; keep edits minimal.
- "box" is in the coordinates of the FIRST image, as thousandths of its width and height (0-1000), tight around
  the picture including its own labels and title, excluding the question text, option letters and other pictures.
  For a picture inside an option, use that option's field key. Do not report tables you typed as text.
- Field keys: "q22.stim" (text before the question), "q22.stem" (the question itself), "q22.A".."q22.D" (options),
  "g26-28.passage" (shared text), "g26-28.dir" (directions line), "g26-28.stim" (shared lead-in).
""".strip()
