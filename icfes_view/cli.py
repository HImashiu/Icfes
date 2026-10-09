"""python -m icfes_view --output data/out  ->  questions/<doc>.json + view/<doc>.html (+ view/index.html)"""
from __future__ import annotations

import argparse
import base64
import html
import io
import json
import sys
from pathlib import Path

from PIL import Image

from .blueprint import parse_cover_table, validate
from .clean import clean, tidy_math
from .ai import apply_ai
from .corrections import apply_corrections
from .score import sim
from .render import make_resolver, prepare, render_html
from .segment import segment


crop_flags: dict[str, list[str]] = {}


def load_crops(out: Path, doc_id: str, embed: bool, images: dict[str, str], only: set[str] | None = None) -> dict[str, str]:
    """Map owner id (q51, g51-53) -> image reference. Embedded crops are JPEGs stored once in `images`."""
    mf = out / "crops" / doc_id / "bundles.json"
    if not mf.exists():
        return {}
    refs: dict[str, str] = {}
    for oid, b in json.loads(mf.read_text(encoding="utf-8"))["bundles"].items():
        if b.get("flags"):
            crop_flags[oid] = b["flags"]
        if not b.get("file"):
            continue
        f = out / "crops" / doc_id / b["file"]
        if embed and f.exists() and (only is None or oid in only):
            im = Image.open(f).convert("RGB")
            if im.width > 820:
                im = im.resize((820, round(im.height * 820 / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=50, optimize=True)
            images[f"crop:{oid}"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
            refs[oid] = f"crop:{oid}"
        else:
            refs[oid] = f"../crops/{doc_id}/{b['file']}"
    return refs


def apply_geometry(seg: dict, bundles_path: Path) -> int:
    """Prefer the page-geometry option split when the text-based split is incomplete OR genuinely disagrees with it
    (e.g. reading order attached another question's options). Near-identical splits are left alone."""
    if not bundles_path.exists():
        return 0
    bundles = json.loads(bundles_path.read_text(encoding="utf-8"))["bundles"]
    n = 0
    for q in seg["questions"]:
        geo = (bundles.get(f"q{q['number']}") or {}).get("options_geo")
        want = q.get("expected_options")
        if not geo or not want or len(geo) != want or (q.get("status") or "") in ("human_verified", "human_edited", "claude_verified", "claude_edited"):
            continue
        same = len(q["options"]) == len(geo) and all(sim(a["text_md"], b["text"]) >= 0.85 for a, b in zip(q["options"], geo))
        if same:
            continue
        old = {o["letter"]: o for o in q["options"]}
        q["options"] = [{"letter": o["letter"], "text_md": tidy_math(o["text"]),
                         "marked_in_scan": bool(o.get("marked")) or old.get(o["letter"], {}).get("marked_in_scan", False)} for o in geo]
        q["options_source"] = "geometry"
        q["flags"] = [f for f in q["flags"] if not f.startswith(("Expected", "Unclassified", "Option"))]
        q.setdefault("notes", []).append("Options were re-split from the page geometry (letters or line breaks were damaged in the OCR text); worth a glance at the source crop")
        n += 1
    return n


def build_doc(out: Path, doc_id: str, title: str, embed: bool, embed_crops: str = "all",
              corrections: Path | None = None, use_ai: bool = False) -> dict:
    md = (out / "markdown" / f"{doc_id}.md").read_text(encoding="utf-8")
    furniture: set[str] = set()
    items, figs = clean(md, furniture)
    seg = segment(items)
    qs0 = seg["questions"]
    regeo = apply_geometry(seg, out / "crops" / doc_id / "bundles.json")
    validation = validate(seg["questions"], parse_cover_table(md))
    validation["options_resplit_by_geometry"] = regeo
    qdir, vdir = out / "questions", out / "view"
    qdir.mkdir(exist_ok=True)
    # untouched automatic result (what a scorer should compare to the gold file)
    (qdir / f"{doc_id}.auto.json").write_text(json.dumps({"doc_id": doc_id, "questions": seg["questions"]},
                                                         ensure_ascii=False, indent=1), encoding="utf-8")
    ai_n = apply_ai(seg, qdir / f"{doc_id}.ai.json") if use_ai else 0
    if ai_n:
        print(f"  applied {ai_n} Claude transcription(s)")
    fixed = apply_corrections(seg, corrections) if corrections else 0
    qdir.mkdir(exist_ok=True)
    vdir.mkdir(exist_ok=True)
    # Clean, model-agnostic data for the later interpretation stage (Markdown, no HTML)
    (qdir / f"{doc_id}.json").write_text(json.dumps(
        {"doc_id": doc_id, "title": title, "questions": seg["questions"], "groups": seg["groups"],
         "missing_numbers": seg["missing"], "validation": validation, "furniture": sorted(furniture), "figures_kept": figs}, ensure_ascii=False, indent=1), encoding="utf-8")
    images: dict[str, str] = {}
    only = None
    if embed_crops == "flagged":  # smaller file for sharing: shared passages + questions with review notes
        only = {f"q{q['number']}" for q in qs0 if q["flags"]} | {f"g{g['from']}-{g['to']}" for g in seg["groups"]}
    crops = load_crops(out, doc_id, embed, images, only)
    data = prepare(doc_id, title, seg, make_resolver(out / "figures", doc_id, embed, images), images, crops, validation)
    (vdir / f"{doc_id}.html").write_text(render_html(data), encoding="utf-8")
    qs = seg["questions"]
    for w in validation["warnings"]:
        print(f"  WARNING {doc_id}: {w}")
    if fixed:
        print(f"  applied {fixed} correction(s) from {corrections}")
    return {"doc_id": doc_id, "title": title, "questions": len(qs),
            "clean": sum(not q["flags"] for q in qs), "flagged": sum(bool(q["flags"]) for q in qs),
            "missing": seg["missing"]}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="icfes_view", description=__doc__)
    p.add_argument("--output", required=True, type=Path, help="the ingest output folder (contains manifest.json)")
    p.add_argument("--doc", help="only documents whose doc_id contains this text")
    p.add_argument("--embed-crops", choices=["all", "flagged"], default="all",
                   help="'flagged' embeds source crops only for questions with review notes (smaller file)")
    p.add_argument("--ai", action="store_true", help="apply Claude transcriptions from questions/<doc>.ai.json (see icfes_llm)")
    p.add_argument("--corrections", type=Path, help="corrections JSON exported from the viewer (applied on top)")
    p.add_argument("--link-images", action="store_true", help="link ../figures/ instead of embedding images")
    args = p.parse_args(argv)
    mf = args.output / "manifest.json"
    if not mf.exists():
        print(f"No manifest at {mf}. Run icfes_ingest first.", file=sys.stderr)
        return 2
    docs = json.loads(mf.read_text(encoding="utf-8"))["documents"].values()
    rows = []
    for rec in sorted(docs, key=lambda r: r.get("primary_path", "")):
        if rec["status"] not in ("completed", "partial") or not rec.get("outputs"):
            continue
        if args.doc and args.doc not in rec["doc_id"]:
            continue
        title = Path(rec["primary_path"]).stem.replace("_", " ")
        info = build_doc(args.output, rec["doc_id"], title, embed=not args.link_images, embed_crops=args.embed_crops, corrections=args.corrections, use_ai=args.ai)
        rows.append(info)
        print(f"{info['doc_id']}: {info['questions']} questions, {info['clean']} clean, {info['flagged']} flagged"
              + (f", numbers not detected: {info['missing']}" if info["missing"] else ""))
    if not rows:
        print("Nothing to render.", file=sys.stderr)
        return 1
    li = "".join(f'<li><a href="{html.escape(r["doc_id"])}.html">{html.escape(r["title"])}</a> '
                 f'<small>{r["questions"]} questions, {r["flagged"]} with review notes</small></li>' for r in rows)
    (args.output / "view" / "index.html").write_text(
        f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Exam viewer</title><body style="font:16px system-ui;max-width:720px;margin:40px auto;padding:0 16px">'
        f'<h1>Exam viewer</h1><ul>{li}</ul></body>', encoding="utf-8")
    print(f"Open {args.output / 'view'}/<doc>.html in a browser.")
    return 0
