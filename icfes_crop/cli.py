"""python -m icfes_crop --output data/out --input <pdf folder|zip>  ->  crops/ overlays/ bundles.json"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import pypdfium2 as pdfium

from icfes_ingest.inputs import unpack_zip

from .build import build_bundles, load


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_crop", description=__doc__)
    ap.add_argument("--output", required=True, type=Path, help="ingest output folder (manifest.json, json/, questions/)")
    ap.add_argument("--input", required=True, type=Path, help="the same PDF folder or .zip given to icfes_ingest")
    ap.add_argument("--doc", help="only documents whose doc_id contains this text")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(levelname)-7s %(message)s")
    src = a.input
    if src.is_file() and src.suffix.lower() == ".zip":
        src = unpack_zip(src, a.output / "_input_unpacked")
    mf = a.output / "manifest.json"
    if not mf.exists():
        print(f"No manifest at {mf}", file=sys.stderr)
        return 2
    rc = 0
    for rec in json.loads(mf.read_text(encoding="utf-8"))["documents"].values():
        if rec["status"] not in ("completed", "partial") or not rec.get("outputs"):
            continue
        if a.doc and a.doc not in rec["doc_id"]:
            continue
        qpath = a.output / "questions" / f"{rec['doc_id']}.json"
        if not qpath.exists():
            print(f"{rec['doc_id']}: run `python -m icfes_view` first (needs questions/{qpath.name})", file=sys.stderr)
            rc = 1
            continue
        pdf_path = src / rec["primary_path"]
        out_dir = a.output / "crops" / rec["doc_id"]
        pdf = pdfium.PdfDocument(str(pdf_path))
        res = build_bundles(load(a.output / rec["outputs"]["json"]), json.loads(qpath.read_text(encoding="utf-8")),
                            pdf, out_dir, a.dpi)
        pdf.close()
        (out_dir / "bundles.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
        b = res["bundles"]
        cut = [k for k, v in b.items() if any(s["words_cut"] for s in v["segments"])]
        edge = [k for k, v in b.items() if any(s["edge_flags"] for s in v["segments"])]
        bleed = sum(1 for v in b.values() if any(s["bleed_words"] for s in v["segments"]))
        print(f"{rec['doc_id']}: {sum(v['kind']=='question' for v in b.values())} question crops, "
              f"{sum(v['kind']=='group' for v in b.values())} shared-passage crops | "
              f"words cut: {len(cut)} bundle(s) {cut} | ink at edge: {len(edge)} | touching neighbor text: {bleed} | "
              f"orphan words: {len(res['orphans'])} | no anchor: {res['missing_anchor']}")
        if cut:
            rc = 1
    return rc
