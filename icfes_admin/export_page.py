"""Builds the single-file admin page for a published Artifact.

    python -m icfes_admin.export_page --data /path/to/icfes --out admin-artifact.html

The page is index.html with the renderer, the figure engine and the data inlined. Data is read
once at export time: goldens, keys, native figure specs, validator messages and traced-figure counts.
Edits made in the page are saved to the Artifact's `db`, not to these files; see apply_edits.py.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from .store import Store

STATIC = Path(__file__).resolve().parent / "static"


def _inline(text: str) -> str:
    # A literal "</script" inside inline code or JSON would end the script element early.
    return re.sub(r"</(script)", r"<\\/\1", text, flags=re.IGNORECASE)


def collect(store: Store) -> dict:
    exams = store.exam_ids()
    data = {"exams": exams, "golden": {}, "keys": {}, "disputed": {}, "validation": {},
            "pending": {}, "traced": {}, "natives": {}}
    for e in exams:
        g = store.golden(e)
        data["golden"][e] = g
        data["keys"][e] = store.answers(e)
        side = store.sidecar(e)
        disputed = side.get("disputed") if side else None
        data["disputed"][e] = len(disputed) if isinstance(disputed, (list, dict)) else disputed
        report, per_q = store.validation(g)
        data["validation"][e] = {
            "summary": report["summary"], "ok": report["ok"],
            "errors": {str(n): v["errors"] for n, v in per_q.items() if v["errors"]},
            "warnings": {str(n): v["warnings"] for n, v in per_q.items() if v["warnings"]},
        }
        traced = store.manifest_figures(e)
        data["traced"][e] = {"count": len(traced), "pending": sum(1 for f in traced if f.get("pending_spec")),
                             "eyeballed": sum(1 for f in traced if "eyeball" in str(f.get("method", "")))}
        pending = sorted({f.get("question") for f in traced if f.get("pending_spec")}, key=lambda x: x or 0)
        data["pending"][e] = pending
        natives = {}
        for q in g["questions"]:
            found = store.native_figures(e, q["number"])
            if found:
                natives[str(q["number"])] = found
        data["natives"][e] = natives
    return data


def build(data_root: str, out: str) -> Path:
    store = Store(data_root)
    payload = json.dumps(collect(store), ensure_ascii=False, separators=(",", ":"))
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    katex = (STATIC / "katex" / "katex.min.css").read_text(encoding="utf-8")
    figures = (STATIC / "figures-render.js").read_text(encoding="utf-8")
    render = (STATIC / "render.bundle.js").read_text(encoding="utf-8")
    shim = (STATIC / "static-api.js").read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="katex/katex.min.css">', f"<style>{_inline(katex)}</style>", 1)
    html = html.replace('<script src="figures-render.js"></script>', f"<script>{_inline(figures)}</script>", 1)
    html = html.replace('<script src="render.bundle.js"></script>', f"<script>{_inline(render)}</script>", 1)
    marker = "<script>\nconst $ ="
    assert html.count(marker) == 1, "index.html changed; update export_page.py"
    data_tag = f'<script id="icfes-data" type="application/json">{_inline(payload)}</script>\n'
    html = html.replace(marker, data_tag + f"<script>{_inline(shim)}</script>\n" + marker, 1)
    out_path = Path(out)
    out_path.write_text(html, encoding="utf-8")
    return out_path


def main(argv=None):
    ap = argparse.ArgumentParser(prog="icfes_admin.export_page", description=__doc__.split("\n")[0])
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    path = build(args.data, args.out)
    print(f"wrote {path} ({path.stat().st_size / 1_000_000:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
