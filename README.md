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

## Status

- 27 offline tests pass (fake backend + real SDK against a fake HTTP layer).
- **Live check done:** `S11-O 2da sesión.pdf` (26 scanned pages, 10 MB) ran against a real S0 resource in about
  35 s: 26/26 pages, 45 figures (all downloaded from the service, none needed the local-crop fallback), Spanish
  accents intact, tables emitted as HTML, 26 pages billed (~$0.26 at $10/1000 pages).
- Not yet exercised live: chunking of very large PDFs (>100 pages), 429 throttling, resume after a real
  interruption. These paths are covered by the offline tests only.
