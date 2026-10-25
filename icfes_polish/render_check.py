"""Stage 3: draw each unit with the editor's renderer and let a second model compare it with the scan.

  python -m icfes_polish.render_check render --golden cand.json --figures <figures/traced/EXAM> --renderer <dir> --out <png dir> [--only q1,q2]
  python -m icfes_polish.render_check build --golden cand.json --crops <icfes_crop dir> --renders <png dir> --deployment solve --out req.jsonl
The answers have the same shape as the formatting stage, so `format_stage apply` applies them.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

from .fields import fields
from .format_stage import LONG, crop_for, page_image, units, write_split
from .images import jpeg_b64, remove_blue
from .spec import EDITOR_SPEC

VERIFY_TASK = r"""
TASK. Image 1 is the scan of the printed booklet. Image 2 is how the app currently draws the same unit from the markup
below (pictures appear as dashed boxes or crops; question numbers and option letters are drawn by the app).
Compare them carefully, line by line: missing or extra words, misread characters or symbols, wrong numbers, missing
bold/italic/underline/sub/superscript, math or chemistry drawn wrong, a table or quote or source line not laid out like
the booklet, text that belongs to a picture typed as text, a picture missing. Ignore fonts, colors, line breaks inside
paragraphs, justification and the size of pictures. Ignore the answer mark and the question number.
Return JSON {"ok": true|false, "fields": {...same edit format as before...}, "figures": [...], "uncertain": [...]}
with an edit for every real difference. If they match, return {"ok": true, "fields": {}, "figures": [], "uncertain": []}.
Field keys and the edit format: fields marked long use {"ops": [{"find": exact current substring, "replace": new}]},
others {"text": whole new field}. Boxes in "figures" are thousandths (0-1000) of image 1.
""".strip()


def unit_blocks(golden: dict, u: dict, manifest: list[dict], fig_dir: Path) -> dict:
    f = fields(golden)
    figs = {}
    for m in manifest:
        fid = m.get("figure_id") or m.get("spec_id")
        p = fig_dir / f"{fid}.png"
        if p.exists():
            figs[fid] = p.resolve().as_uri()
    blocks = []
    if u["kind"] == "group":
        for k in u["keys"]:
            if f[k]:
                blocks.append({"label": "", "md": f[k]})
    else:
        n = int(u["id"][1:])
        q_figs = [m for m in manifest if m.get("question") == n]
        used = set()
        for k in u["keys"]:
            short = k.split(".")[1]
            md = f[k]
            if len(short) == 1:
                opt_figs = [m for m in q_figs if (m.get("option") or "").upper() == short]
                md += "".join(f"\n\n[[figura:{m.get('figure_id') or m.get('spec_id')}]]" for m in opt_figs)
                used |= {id(m) for m in opt_figs}
                blocks.append({"label": f"{short}.", "md": md})
            elif md:
                blocks.append({"label": f"{n}." if short == "stim" or not f.get(f"q{n}.stim") else "", "md": md})
        loose = [m for m in q_figs if id(m) not in used and not m.get("option")
                 and f"[[figura:{m.get('figure_id') or m.get('spec_id')}]]" not in " ".join(f[k] for k in u["keys"])]
        if loose:
            blocks.insert(1 if len(blocks) > 1 else 0, {"label": "", "md": "\n\n".join(f"[[figura:{m.get('figure_id') or m.get('spec_id')}]]" for m in loose)})
    return {"id": u["id"], "blocks": blocks, "figures": figs}


def render(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    fig_dir = Path(a.figures)
    mp = fig_dir / "manifest.json"
    manifest = json.load(open(mp, encoding="utf-8")).get("figures", []) if mp.exists() else []
    only = set(a.only.split(",")) if a.only else None
    us = [unit_blocks(golden, u, manifest, fig_dir) for u in units(golden) if (not only or u["id"] in only)]
    us = [u for u in us if u["blocks"]]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    spec = out / "_units.json"
    spec.write_text(json.dumps(us, ensure_ascii=False), encoding="utf-8")
    script = Path(__file__).with_name("render_units.mjs")
    import os
    env = dict(os.environ)
    if "NODE_PATH" not in env:  # the global playwright install
        env["NODE_PATH"] = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
    subprocess.run(["node", str(script), str(spec), a.renderer, str(out)], check=True, env=env)
    return 0


def build(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    crops = Path(a.crops)
    bundles = json.load(open(crops / "bundles.json", encoding="utf-8"))
    f = fields(golden)
    only = set(a.only.split(",")) if a.only else None
    sysmsg = EDITOR_SPEC + "\n\n" + VERIFY_TASK
    lines = []
    meta = json.load(open(a.meta, encoding="utf-8"))["units"] if a.meta else {}
    pdf = None
    if a.pdf:
        import fitz
        pdf = fitz.open(a.pdf)
    qpages = {f"q{q['number']}": (q.get("source") or {}).get("pages") or [] for q in golden["questions"]}
    for u in units(golden):
        if only and u["id"] not in only:
            continue
        rp = Path(a.renders) / f"{u['id']}.png"
        img, _ = crop_for(u, bundles, crops)
        if img is None and pdf is not None and qpages.get(u["id"]):
            img = page_image(pdf, qpages[u["id"]][0])
        if img is None or not rp.exists():
            continue
        scan, _ = jpeg_b64(remove_blue(img))
        rend, _ = jpeg_b64(Image.open(rp))
        info = {"unit": u["id"], "section": u["section"], "long_fields": [k for k in u["keys"] if len(f[k]) > LONG],
                "fields": {k: f[k] for k in u["keys"]}}
        if (meta.get(u["id"]) or {}).get("ocr"):
            info["ocr"] = meta[u["id"]]["ocr"][:8000]
        msgs = [{"role": "system", "content": sysmsg},
                {"role": "user", "content": [{"type": "text", "text": json.dumps(info, ensure_ascii=False)},
                                             {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + scan, "detail": "high"}},
                                             {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + rend, "detail": "high"}}]}]
        req = {"id": f"verify:{u['id']}", "deployment": a.deployment, "messages": msgs, "max_completion_tokens": 16000,
               "response_format": {"type": "json_object"}}
        if a.effort:
            req["reasoning_effort"] = a.effort
        lines.append(json.dumps(req, ensure_ascii=False))
    names = write_split(a.out, lines)
    print(f"{len(lines)} verify requests -> {', '.join(names)}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("--golden", required=True)
    r.add_argument("--figures", required=True)
    r.add_argument("--renderer", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--only")
    b = sub.add_parser("build")
    b.add_argument("--golden", required=True)
    b.add_argument("--crops", required=True)
    b.add_argument("--renders", required=True)
    b.add_argument("--deployment", default="solve")
    b.add_argument("--effort", default="low")
    b.add_argument("--only")
    b.add_argument("--meta", help="format build meta (unit OCR)")
    b.add_argument("--pdf", help="exam PDF, for units without a crop")
    b.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    return render(a) if a.cmd == "render" else build(a)


if __name__ == "__main__":
    sys.exit(main())
