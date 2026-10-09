"""python -m icfes_view --output data/out  ->  questions/<doc>.json + view/<doc>.html (+ view/index.html)"""
from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

from .clean import clean
from .render import make_resolver, prepare, render_html
from .segment import segment


def build_doc(out: Path, doc_id: str, title: str, embed: bool) -> dict:
    md = (out / "markdown" / f"{doc_id}.md").read_text(encoding="utf-8")
    items, figs = clean(md)
    seg = segment(items)
    qdir, vdir = out / "questions", out / "view"
    qdir.mkdir(exist_ok=True)
    vdir.mkdir(exist_ok=True)
    # Clean, model-agnostic data for the later interpretation stage (Markdown, no HTML)
    (qdir / f"{doc_id}.json").write_text(json.dumps(
        {"doc_id": doc_id, "title": title, "questions": seg["questions"], "groups": seg["groups"],
         "missing_numbers": seg["missing"], "figures_kept": figs}, ensure_ascii=False, indent=1), encoding="utf-8")
    images: dict[str, str] = {}
    data = prepare(doc_id, title, seg, make_resolver(out / "figures", doc_id, embed, images), images)
    (vdir / f"{doc_id}.html").write_text(render_html(data), encoding="utf-8")
    qs = seg["questions"]
    return {"doc_id": doc_id, "title": title, "questions": len(qs),
            "clean": sum(not q["flags"] for q in qs), "flagged": sum(bool(q["flags"]) for q in qs),
            "missing": seg["missing"]}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="icfes_view", description=__doc__)
    p.add_argument("--output", required=True, type=Path, help="the ingest output folder (contains manifest.json)")
    p.add_argument("--doc", help="only documents whose doc_id contains this text")
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
        info = build_doc(args.output, rec["doc_id"], title, embed=not args.link_images)
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
