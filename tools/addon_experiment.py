"""Cheap, capped experiment: does an Azure add-on or blue-ink removal improve extraction on a few pages?

Runs the chosen variant on a page range of ONE pdf, saves the Markdown/JSON, and refuses to exceed --max-pages.
Credentials come from AZURE_DI_ENDPOINT / AZURE_DI_KEY (same as icfes_ingest).

  python tools/addon_experiment.py --pdf exam.pdf --pages 8-12 --variant formulas --out runs/ --max-pages 8
  variants: baseline | formulas (formulas + ocrHighResolution) | noblue (blue ink removed) | noblue_formulas
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from icfes_ingest.backend import AzureLayoutBackend
from icfes_ingest.config import load_credentials
from icfes_ingest.preprocess import remove_blue_ink


def page_list(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out += list(range(int(a), int(b or a) + 1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, type=Path)
    ap.add_argument("--pages", required=True, help='e.g. "8-12"')
    ap.add_argument("--variant", required=True, choices=["baseline", "formulas", "noblue", "noblue_formulas"])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--max-pages", type=int, default=8, help="hard cap on pages sent in this run")
    a = ap.parse_args()
    pages = page_list(a.pages)
    if len(pages) > a.max_pages:
        print(f"Refusing: {len(pages)} pages > --max-pages {a.max_pages}", file=sys.stderr)
        return 2
    feats = ["formulas", "ocrHighResolution"] if "formulas" in a.variant else None
    data = a.pdf.read_bytes()
    if a.variant.startswith("noblue"):
        sub = io.BytesIO()
        from pypdf import PdfReader, PdfWriter
        w = PdfWriter()
        for pn in pages:
            w.add_page(PdfReader(io.BytesIO(data)).pages[pn - 1])
        w.write(sub)
        data, page_arg = remove_blue_ink(sub.getvalue()), None      # new PDF contains only the selected pages
    else:
        page_arg = a.pages
    be = AzureLayoutBackend(load_credentials(), features=feats)
    print(f"variant={a.variant} pages={pages} features={feats}")
    out = be.analyze(data, pages=page_arg)
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / f"{a.variant}.md").write_text(out.content, encoding="utf-8")
    (a.out / f"{a.variant}.json").write_text(json.dumps(out.result, ensure_ascii=False), encoding="utf-8")
    print(f"ok: {out.page_count} pages billed -> {a.out / (a.variant + '.md')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
