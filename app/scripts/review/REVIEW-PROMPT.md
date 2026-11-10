# Prompt: review the question bank as rendered

You are reviewing the Cóndor ICFES question bank. Your job is to look at each question **as a student sees it** and make
sure it is formatted correctly and says exactly what the printed booklet says. Work through the booklet you are given
one question at a time; do not skim and do not batch-approve.

Rules: use Opus or Sonnet to edit anything under `app/` (project rule). Never edit a `*.golden.json` in place; write
fixes as candidates (below). Never run the harness against production or deploy a build with `VITE_QUESTION_REVIEW=1`.
Do not touch answer keys: if the key looks wrong, flag it in the log.

## Loop

1. Setup as in `scripts/review/README.md` (`npm ci`, `npm run sync-exams`).
2. `node scripts/review/review-questions.mjs --exam <SLUG> --from A --to B --out ../review-out [--scans <PDF folder>]`,
   in chunks of about 20 questions.
3. Read `review-out/report.md` first (mechanical issues), then for **every** question in the chunk open
   `qNNN-390.png` (phone; `qNNN-390-texto.png` is the phone's text tab when the passage has its own tab), `qNNN-1280.png` (desktop) and `qNNN-scan.png` (printed page, if available) and check:
   - Text: every word, number, accent and unit of the passage, stem and options equals the printed one; nothing missing,
     summarised, merged or repeated; paragraphs and line breaks as printed (poems, dialogues, lists).
   - Math and chemistry: formulas typeset, sub/superscripts right, fractions and roots not flattened to plain text.
   - Tables and charts: same rows/columns/values, headers bold, nothing cut off on the phone width.
   - Figures: the right picture for the question, whole (not cropped), legible, not shown twice, not a neighbouring
     question's picture; option pictures under the right letter.
   - Options: A–D (or as printed) in order, each with its own content; the key dot in the scan is not rendered.
   - Layout: shared passage shows once, beside/above the questions of its group; nothing overflows sideways; the source line is present.
4. Log every question in `review-log/<SLUG>.jsonl`, one line each:
   `{"n": 21, "ok": true}` or `{"n": 21, "ok": false, "issues": ["option C missing '%'"], "fix": "..."}`.
   A fix is a candidate edit: `{"exam": "S11-B_1ra", "n": 21, "field": "options[2].text_md", "old": "...", "new": "...", "reason": "..."}`
   appended to `data/candidates/review-<SLUG>.json`. The owner merges candidates through the editor sync; do not write
   to the shared `data/*.golden.json`.
5. If a defect comes from the page itself (a component draws something wrong that the data has right — for example
   `**` shown literally, a table that overflows on a phone), fix it in `app/src` on a branch, add a test, and note it
   in the log as `"fix": "app: <what>"`.
6. After fixes, re-run the script for the affected questions and look at the new screenshots before marking them ok.
7. Finish a booklet with a summary: questions checked, ok, flagged, fixed, open (needs Juan: unreadable scan, key doubt).

Be honest about what you could not verify (no scan available, figure only roughly matches). "Looks fine" without
having opened the image is not a review.
