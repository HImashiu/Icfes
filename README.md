# ICFES PDF ingestion (Azure Document Intelligence `prebuilt-layout`)

Stage 1 only: PDF → structured JSON + Markdown + cropped figure images. Question interpretation and
Claude integration are intentionally **not** part of this package; they will read what this stage writes.

## Setup (Windows PowerShell)

```powershell
cd path\to\Icfes
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Azure portal > your Document Intelligence resource > Keys and Endpoint
$env:AZURE_DI_ENDPOINT = "https://<your-resource>.cognitiveservices.azure.com/"
$env:AZURE_DI_KEY      = "<key 1>"
```

Secrets are read only from environment variables (aliases `DOCUMENTINTELLIGENCE_ENDPOINT/KEY` also work).
They are never written to the manifest, logs or output. No `.env` file is read; if you make one, it is git-ignored.

> **Free (F0) tier:** the service accepts only 4 MB files and analyzes 2 pages per request. Use S0 for real
> runs, or pass `--max-request-mb 4` (page limits on F0 will still truncate; this pipeline detects that
> and marks the document failed rather than accepting missing pages).

## Usage

```powershell
$zip = "C:\Users\juand\Downloads\drive-download-20261009T050320Z-1-001.zip"   # or a folder of PDFs

# 1. Dry run: hashes, counts pages, shows duplicates / unreadable files / planned requests. No Azure calls.
python -m icfes_ingest run --input $zip --output data\out --dry-run

# 2. Test on ONE real PDF (pick it from the dry-run list, or just use --limit 1)
python -m icfes_ingest run --input $zip --output data\out --limit 1
#    inspect data\out\markdown\*.md, data\out\figures\<doc>\, data\out\json\*.json

# 3. Full collection (resumes automatically if interrupted: just run the same command again)
python -m icfes_ingest run --input $zip --output data\out

python -m icfes_ingest status --output data\out
```

A `.zip` input is unpacked (PDF members only, zip-slip protected) to `<output>\_input_unpacked\`.
A dry run also unpacks the zip, since it needs the files to count pages; it uploads nothing.

Options: `--workers N` (documents in parallel, default 1, max 8), `--only TEXT`, `--limit N`,
`--retry-failed`, `--max-pages-per-request` (default 100), `--max-request-mb` (default 100),
`--max-retries` (default 6), `--keep-work`, `-v`.

## Viewing the cleaned questions (College Board style)

`icfes_view` is a separate, deterministic stage (no LLM, no Azure calls, free to re-run). It reads
`markdown/` + `figures/` from the ingest output and writes:

```
data/out/questions/<doc_id>.json   cleaned questions as Markdown: stimulus, stem, options A-D, group passages, flags
data/out/view/<doc_id>.html        one self-contained page (images embedded) + view/index.html
```

```powershell
python -m icfes_view --output data\out            # add --link-images to link ../figures/ instead of embedding
start data\out\view\index.html
```

The page has a passage pane (left) and question pane (right), lettered choices, Mark for Review, choice
elimination, a question map grouped by section, keyboard shortcuts (left/right arrows, A-D), dark mode and an
"Original extraction" toggle to compare against the raw text.

What the clean-up does: drops page headers/footers and logos that repeat on every page, repairs hyphenated line
breaks, restores option letters hidden by scan marks (`marked in scan` is a pen mark on the page, **not** an answer
key), keeps numbered sub-lists inside their question, and separates shared passages ("RESPONDA LAS PREGUNTAS X A Y")
from the individual questions. It never drops anything silently: questions with fewer options than expected carry a
**review note**, and question numbers it could not find become red **not detected** placeholders listed in
`missing_numbers`. Known limits: answer choices that are images, scrambled fraction/diagram options, figures that
straddle a page break (attached to the wrong question), and the matching/picture parts of the English test.
Those are what the later interpretation stage (LLM, out of scope here) is meant to resolve.

OCR text is untrusted, so all embedded HTML goes through a whitelist sanitizer before it reaches the page.

## Source crops (what the original page looks like, per question)

`icfes_crop` is a third separate stage (no LLM, no Azure calls). It uses the geometry Azure already returned
(position of every paragraph, table, figure and word) plus the original PDF to cut one image per question and one
per shared passage:

```powershell
python -m icfes_view --output data\out                         # needs questions/<doc>.json
python -m icfes_crop --output data\out --input $zip            # the same zip/folder given to icfes_ingest
python -m icfes_view --output data\out                         # re-run: the viewer now has a "Source crop" button
```

Output (`data/out/crops/<doc>/`): `q051.png`, `g51-53.png`, `bundles.json` (boxes, checks, flags per question) and
`overlays/pNNN.jpg` (each page with every question's box drawn on it, orphan words in red).

How it avoids cutting text: ownership comes from reading order between question anchors, so a crop is the bounding
box of **the question's own words/elements**, split by page and column, deskewed with the tilt Azure reports (the
direction is confirmed against real ink), padded, and grown until the edge strip is clean white without ever entering
another owner's text. Checks that run on every bundle: **words cut** (any word outside its crop: must be 0),
**orphan words** (page text that belongs to no question: listed), **touching neighbor text** (other owners' words inside
the crop), and **ink at the edge** (often the dark scan border or handwriting). Page titles, headers and page
numbers are treated as furniture and excluded. Use `--embed-crops flagged` on `icfes_view` for a smaller shareable HTML.

## Spending cap

`--budget-usd 3` (or `--max-pages 300`) is a **hard cap across all runs**, tracked in `manifest.json`
(`billed_pages`). Pages are reserved before each request and refunded if the request fails; when the next
request would exceed the cap the run stops cleanly, the document stays `in_progress`, and re-running with a
higher cap resumes from the cached chunks. USD is converted with `--usd-per-1000-pages` (default 10.0:
**check your Azure pricing**). `--dry-run` prints the estimated cost and marks documents that would go over
budget; `--smallest-first` processes the shortest PDFs first (useful for a cheap first test).

```powershell
python -m icfes_ingest run --input $zip --output data\out --dry-run --budget-usd 3 --smallest-first
python -m icfes_ingest run --input $zip --output data\out --budget-usd 3 --smallest-first --limit 1
```

## Output layout

```
data/out/
  manifest.json            persistent progress (atomic writes, .bak kept)
  json/<doc_id>.json       source info + raw AnalyzeResult per page-range chunk + figure index
  markdown/<doc_id>.md     Markdown with ![](../figures/...) links inserted after each figure
  figures/<doc_id>/        p0003_fig1.2.png ... and figures.json (page, polygon, caption, source)
  logs/ingest.log
  work/<sha256>/           per-chunk cache while a document is unfinished (deleted on success)
```

`doc_id` = sanitized file name + first 8 hex chars of the content hash. In the JSON, each chunk's page
numbers are relative to the chunk; add `page_offset` for the document page. Figure records already carry
`global_page`.

## How the hard cases are handled

| Concern | Behaviour |
|---|---|
| Resume | Manifest is keyed by SHA-256. `completed` docs are skipped (and redone if their outputs were deleted). Each finished chunk is cached on disk, so an interrupted/failed big PDF resumes at the next chunk. Ctrl+C is safe. |
| Oversized PDFs | Split by page count and by size into page-range requests (pypdf); a chunk still over the byte limit is halved recursively. A single page over the limit fails loudly. Chunks are re-merged in order. |
| No silent page loss | Every response must return exactly the expected number of pages, and the final page coverage must be exactly 1..N, otherwise the document is retried, then marked `failed`. |
| Throttling / transient errors | 408/409/429/5xx and network errors retry with exponential backoff + jitter, honouring `Retry-After`. 4xx such as invalid content fail immediately. |
| Failures | Never swallowed: status `failed` + error text in the manifest, non-zero exit code. Failed/partial docs are not hammered on every run; use `--retry-failed`. |
| Figures | Downloaded from the service's figure endpoint. If that fails, cropped locally from the PDF (`source: local-crop`). If both fail the document is `partial` (not `completed`) with a warning per figure. |
| Duplicates | Identical content (any name/folder) is analyzed once; other paths are listed under `duplicates` and in `manifest.files`. |
| Bad inputs | Non-PDFs with a `.pdf` name, corrupt or password-protected PDFs are reported as unreadable (and exit code 1), never dropped quietly. |
| Spanish text | Requests use `unicodeCodePoint` string indexing so figure spans line up exactly with Python string offsets (accents/ñ). |

## Tests

```powershell
pip install -r requirements-dev.txt
python -m pytest -q
```

The suite uses a programmable fake backend (throttling, failures, page loss, interruptions) and also runs
the real Azure SDK against a fake HTTP layer to verify the request that is sent
(`output=figures`, `outputContentFormat=markdown`, binary body) and how the response is parsed.

## Improving Math and English (what was added and measured)

| Change | What it does | Where |
|---|---|---|
| Exam blueprint + validation | Reads the cover table ("Prueba / Preguntas / Total"), warns when a section or the total is short (e.g. 119 of 134 extracted), labels English parts by item type | `icfes_view/blueprint.py` |
| Geometry option splitter | Uses line positions (letters hang at the margin, wrapped lines are indented) to split options when a hidden letter or merge broke the text split; refuses ambiguous layouts | `icfes_crop/options.py` |
| Row-layout fix | English reading pages put stems in one column and options beside them in the other; options are split per line and given to the stem on their row | `icfes_crop/build.py` |
| Merge guards | Flags options that contain another option's letter, are much longer than the rest, or have a letter but no text | `icfes_view/segment.py` |
| Review mode in the viewer | "Needs review only" navigation, an editor, a "verified" box, **Export corrections** (JSON); `icfes_view --corrections file.json` applies them | `icfes_view/viewer.html`, `corrections.py` |
| LaTeX | Formulas render with KaTeX (CDN; raw LaTeX stays readable offline); digit spacing from the OCR is tidied | `render.py`, `clean.py` |
| Gold scoring | `python -m icfes_view.score --questions questions/<doc>.auto.json --gold gold.json` | `icfes_view/score.py` |
| Azure add-ons + blue-ink removal | `icfes_ingest --features formulas,ocrHighResolution --remove-blue` (paid add-ons; see below) | `icfes_ingest/` |
| Claude vision stage | `python -m icfes_llm` transcribes the questions still flagged, from their source crops | `icfes_llm/` |

**`--remove-blue` keeps the blue answer dots on purpose.** A dot can sit over an option letter; whitening it removes the
only marker that tells the OCR where an option starts, and in an experiment that made 4 Math questions lose options
(Q30, Q38, Q43, Q44). Only other blue ink (typed notes, handwriting) is removed.

### Measured on `S11-O 2da sesión` (one real exam; 26 pages, ~$0.26 per plain pass)

| Run | Clean questions (no review note) of 119 |
|---|---|
| Start of this round | 70 |
| Same OCR, new parsing/geometry (v1) | 79 |
| `--remove-blue --features formulas,ocrHighResolution` (v2) | **91** |

By section (v1 -> v2): Sociales 24 -> 25 of 25, Matemáticas 19 -> 22 of 25, Ciencias 17 -> 18 of 29, Inglés 19 -> 26 of 40.
Against a 20-question gold set (10 Math + 10 English, **drafted by Claude from the source crops: verify it**): pass rate
v1 40% -> v2 90% (Math 4/10 -> 8/10, English 4/10 -> 10/10). The English items 113-119 were also the ones used to develop
the row-layout fix, so they are not an independent test. 14 English numbers (80-84, 90, 98-105) are still "not detected"
(picture items): that is what the Claude stage is for.

### The whole collection (13 PDFs, 14 exams)

All 13 PDFs went through the pipeline with `--remove-blue --features formulas,ocrHighResolution` (429 pages, 485 after
re-reading one PDF). `S11-P` contains two exams (session 1 and 2, numbering restarts), so it was split into
`S11-P_1ra` and `S11-P_2da` (28 pages each) and read again. No exam failed. The first pass exposed layouts the
single-exam work had not seen; these were fixed offline (no Azure cost):

- **Sections** follow the cover table's order and closed-question counts (Math 1-25, Lectura 26-66, ...) instead of the
  headings, which exist only on some sections' pages. The cover parser handles "Preguntas cerradas / abiertas"
  columns (117 total = 113 closed + 4 open), garbled names, and unreadable counts (falls back to the usual form).
- **Second-session English** has other layouts: cloze answer *tables* (97-104, 105-112, 125-134), stems printed first
  with all options after (matching 85-89, conversation 90-96), and picture-only items. All are parsed now.
- Question numbers are no longer lost after a picture-only item or a group start.

| | before fixes | after |
|---|---|---|
| question slots (incl. 69 "not detected" placeholders) vs 1724 expected from the cover tables | 1440 | 1686 |
| clean (no review note) | 1189 (83%) | 1370 (81%) of a larger, more honest set |
| English found | 67 | 232 |

What is left is mostly real: options inside images (Math/Science charts), picture items whose number is only in the
image (English part 1: 78-82), and one poor scan (`S11-G_1ra`, text missing around 36-39). Only `S11-O 2da` has been
verified, so only it passes the golden validation; the rest fail on unreviewed flags by design.

## Claude vision stage (`icfes_llm`)

```powershell
$env:ANTHROPIC_API_KEY = "<key>"        # or `ant auth login`; never commit it
python -m icfes_llm --output data\out --dry-run               # lists what would be sent + estimated cost, no key needed
python -m icfes_llm --output data\out --budget-usd 2          # flagged questions + unnumbered picture items
python -m icfes_llm --output data\out --numbers 34,35 --passes 2   # Math: transcribe twice and compare
python -m icfes_view --output data\out --ai                   # show the transcriptions (marked ai / ai_review)
```

Default model `claude-opus-5-5`; `--model claude-sonnet-5-5` costs about half. Each request sends the question's source
crop plus the OCR text and asks for structured JSON (`output_config.format`). Safeguards: hard USD cap across runs
(checked before every call), results cached by crop+prompt+model, refusals and truncated answers are errors, and every
answer is cross-checked: disagreement with the OCR, disagreement between passes, low confidence, or a wrong option count
marks it `ai_review` (needs a human). Human-verified corrections are never overwritten. **This stage has only been
tested with a fake client** (no Anthropic key was available while building it).

## Status

- 74 offline tests pass (fake Azure and Anthropic backends, the real Azure SDK against a fake HTTP layer, synthetic
  scanned pages for the crop checks).
- **Run live against Azure** on `S11-O 2da sesión` (several variants, ~100 pages billed in total). Not yet run live: the
  Claude stage, chunking of very large PDFs, 429 throttling, resume after a real interruption.
- Fourteen exams have been processed; only one is human/Claude-verified. The gold set is a draft.

## Admin editor (progress, question editing, debugging)

A local web page for the question data. It runs on your laptop, reads one data folder and writes back to it, so no exam content is committed here.

```
python -m icfes_admin --data /path/to/icfes [--sources pdf-sources.json] [--scans "C:/Users/you/Downloads/icfes-hi300-check"] [--port 8765]
```

Open http://127.0.0.1:8765. The data folder is the one that holds `data/`, `answer-keys/` and `figures/`.

- **Progress**: per exam, questions and ready count, hidden count, validator errors and warnings, answer key and disputed items, traced figures.
- **Questions**: filter by hidden, validator errors, warnings or not ready. The hidden reasons match the student app's gate: not ready, `[Texto pendiente`, `[FIGURE`, a traced figure with `pending_spec`, a blank option.
- **Editor**: stem, question passage, options, answer (writes `answer-keys/<exam>.key.json`) and the ready flag. Marking a question ready is refused while it has validator errors or a hidden reason, and the refusal lists them. Shared passages are read-only; literary text is never retyped.
- **Saving**: every save first copies the old file to `data/.backups/`, then replaces the file atomically. Each save adds a line to the question's provenance notes. The page does not mark anything as `human_verified`.
- `--sources` is a JSON map from exam id to its source PDF (for example `{"S11-C16_1ra": "C:/.../S11- C16  1ra sesion.pdf"}`). The editor renders the original page at 300 dpi with PyMuPDF (`python -m pip install pymupdf`), caches it, and shows the page next to the form. The page is the one recorded in the golden, or estimated from the question's place in the exam; step with the arrows.
- `--scans` is optional. Scan pages are looked up by the render names used so far (`o1-10-10.png` = letter + session + page); pages not found are reported as missing.

Tests: `python -m pytest tests/test_admin.py`.

### Round trip with the shared folder

The shared icfes folder (the one the app and other threads read) is not on the laptop. The laptop uses a copy at `C:\Icfes\icfes`:

1. Copy the shared `data/`, `answer-keys/` and `figures/traced/` into `C:\Icfes\icfes` (the Claude thread does this).
2. Run the editor on the copy: `python -m icfes_admin --data C:\Icfes\icfes`.
3. When you are done, ask for a sync. It copies changed files back to the shared folder, but only goldens that do not add validator errors. Each replaced file is backed up in `data/.backups/`.

To preview or apply the sync by hand: `python -m icfes_admin.sync --from C:\Icfes\icfes --to <shared folder> [--write]`.
