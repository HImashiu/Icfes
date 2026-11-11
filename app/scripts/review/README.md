# Revisión de preguntas tal como las ve el estudiante

Goal: a Claude Code chat (or a person) goes through the bank **one question at a time, looking at the question exactly
as the student page draws it**, compares it with the printed booklet, and records what is wrong until the formatting
is 100 % right.

## What is here

| Piece | What it does |
|---|---|
| `src/screens/QuestionReview.jsx` | Dev-only screen `#revision-preguntas`. Draws one question with the real `QuestionView`, `RichText`, figures and the same text-pane layout as `Test.jsx` (side column on wide screens, Texto/Pregunta tabs on phone). |
| `src/lib/reviewChecks.js` | Mechanical checks on what was drawn: leftover `**`, `[[figura:…]]`, `\(`…, HTML tags or entities, KaTeX errors, broken/tiny images, wrong or empty options, repeated text, sideways overflow. |
| `scripts/review/review-questions.mjs` | Opens the screen in Chromium for each question and width, saves `q###-390.png` (plus `q###-390-texto.png`, the text tab, when the text lives on its own tab) / `q###-1280.png`, runs the checks, writes `report.json` and `report.md`. With `--scans` it also saves the printed page (`q###-scan.png`). |

The screen reads the exam files straight from `public/exams` (what `npm run sync-exams` writes). It does **not** go
through the site worker, so it never uses up a student's or school's daily booklet quota (migration 0036) and needs no
sign-in. It is only mounted under `vite dev` (or a build with `VITE_QUESTION_REVIEW=1`, which must never be deployed).

## Setup (once per session)

```bash
cd app
npm ci
npm run sync-exams          # fills public/exams from /mnt/project-files/icfes/data (or $ICFES_DATA_DIR)
```

`sync-exams` over the project-files mount can take 10+ minutes; run it in the background. `public/exams` and
`review-out/` are git-ignored — never commit exam content or screenshots.

## Running

```bash
# which questions does a booklet show the student?
node scripts/review/review-questions.mjs --exam S11-B_1ra --list

# draw questions 1-30 on phone and desktop, with the printed page next to each one
node scripts/review/review-questions.mjs --exam S11-B_1ra --from 1 --to 30 --out ../review-out \
  --scans "C:/Users/juand/Downloads/icfes-azure-input"

# whole bank, only keep screenshots of questions the checks flagged
node scripts/review/review-questions.mjs --all --widths 390,1280 --issues-only
```

You can also open the screen by hand: `npm run dev`, then
`http://127.0.0.1:5173/#revision-preguntas?exam=S11-B_1ra&n=21` (`&bare=1` student view only, `&key=1` show the
correct option, `&view=text` on a phone to see the text tab).

The source PDFs are on Juan's laptop (`C:\Users\juand\Downloads\icfes-azure-input`), not in the cloud, so the
side-by-side scan needs a Claude Code chat running on the laptop. A cloud chat can still do the mechanical pass and
review the render against the question's own `source.crop`/figures.

## How to review (the prompt for the reviewing chat)

See `REVIEW-PROMPT.md`.
