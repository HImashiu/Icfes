"""Figure crops: the model says which pictures a unit has and roughly where; Azure layout gives tight boxes;
a local clean-up (same rule as the editor's ✨ Limpiar) whitens the paper and removes the blue answer marks.

  python -m icfes_polish.figures build --exam S11-A_2da --report fmt-report.json --meta fmt.meta.json --crops <dir>
         --layout <azure layout json> --pdf exam.pdf --out <dir>        (writes PNGs + manifest.candidate.json)
  python -m icfes_polish.figures score --candidate manifest.candidate.json --reference figures/traced/EXAM/manifest.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

from .images import clean_figure, png_bytes, trim_box
from .regions import grow_over_labels, layout_words, option_cells, shave_text_rows, words_in_crop

Box = tuple[float, float, float, float]


def iou(a: Box, b: Box) -> float:
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def layout_figures(layout: dict, inches: bool = False) -> dict[int, list[Box]]:
    """Azure layout figure regions per page, as page fractions (or inches)."""
    out: dict[int, list[Box]] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        dims = {p["pageNumber"]: (p["width"], p["height"]) for p in r.get("pages", [])}
        off = ch.get("page_offset", 0)
        for f in r.get("figures", []):
            for br in f.get("boundingRegions", []):
                w, h = (1, 1) if inches else dims.get(br["pageNumber"], (8.5, 11))
                xs, ys = br["polygon"][0::2], br["polygon"][1::2]
                out.setdefault(br["pageNumber"] + off, []).append((min(xs) / w, min(ys) / h, max(xs) / w, max(ys) / h))
    return out


def crop_size(meta: dict) -> tuple[float, float]:
    segs = meta["segments"]
    return (max(s["box_px"][2] - s["box_px"][0] for s in segs),
            max(s["y_in_image"] + (s["box_px"][3] - s["box_px"][1]) for s in segs))


def crop_to_page(cb: Box, meta: dict, page_sizes: dict[int, tuple[float, float]], dpi: int) -> tuple[int, Box]:
    """A box in crop pixels -> (page, page-fraction box), through the segment its centre falls in."""
    segs = meta["segments"]
    cy = (cb[1] + cb[3]) / 2
    seg = next((s for s in segs if s["y_in_image"] <= cy < s["y_in_image"] + s["box_px"][3] - s["box_px"][1]), segs[0])
    px0, py0 = seg["box_px"][0], seg["box_px"][1] - seg["y_in_image"]
    W, H = page_sizes[seg["page"]]
    return seg["page"], ((cb[0] + px0) / (W * dpi), (cb[1] + py0) / (H * dpi), (cb[2] + px0) / (W * dpi), (cb[3] + py0) / (H * dpi))


def snap(page_box: Box, candidates: list[Box]) -> tuple[Box, str]:
    """Prefer the Azure layout box that matches the model's box; otherwise pad the model's box a little."""
    best, score = None, 0.0
    for c in candidates:
        s = iou(page_box, c)
        ca = (c[2] - c[0]) * (c[3] - c[1])
        ma = (page_box[2] - page_box[0]) * (page_box[3] - page_box[1])
        if s > score and ca < 3.5 * ma:
            best, score = c, s
    if best is not None and score >= 0.3:
        u = (min(best[0], page_box[0]), min(best[1], page_box[1]), max(best[2], page_box[2]), max(best[3], page_box[3]))
        # the layout box is tight; take the union only when the model's box adds little (labels just outside)
        ua = (u[2] - u[0]) * (u[3] - u[1])
        ba = (best[2] - best[0]) * (best[3] - best[1])
        return (u if ua < 1.25 * ba else best), f"layout (iou {score:.2f})"
    p = 0.012
    return (max(0, page_box[0] - p), max(0, page_box[1] - p), min(1, page_box[2] + p), min(1, page_box[3] + p)), "model box"


def emit(a, pdf, out, code, session, page, fb, field, fig, how) -> dict:
    import fitz
    owner, _, short = field.partition(".")
    n = int(owner[1:]) if owner.startswith("q") and owner[1:].isdigit() else None
    option = short if len(short) == 1 else None
    r = pdf[page - 1].rect
    clip = fitz.Rect(fb[0] * r.width, fb[1] * r.height, fb[2] * r.width, fb[3] * r.height)
    pix = pdf[page - 1].get_pixmap(dpi=300, clip=clip)
    if pix.width < 2 or pix.height < 2:
        return None
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    clean, level = clean_figure(img)
    tb = trim_box(clean)
    clean = clean.crop(tb)
    fw, fh = fb[2] - fb[0], fb[3] - fb[1]
    fb = (fb[0] + fw * tb[0] / pix.width, fb[1] + fh * tb[1] / pix.height, fb[0] + fw * tb[2] / pix.width, fb[1] + fh * tb[3] / pix.height)
    h = hashlib.sha1(f"{a.exam}{page}{fb}".encode()).hexdigest()[:6]
    fid = f"{code.lower()}{session[0]}-{owner}-" + (f"opt-{option.lower()}-" if option else "") + f"auto-{h}"
    (out / f"{fid}.png").write_bytes(png_bytes(clean))
    return {"question": n, "group": owner if owner.startswith("g") else None, "page": page, "kind": "image",
            "figure_id": fid, "spec_id": fid, "method": "auto_crop", "svg": f"traced/{a.exam}/{fid}.png",
            "box_page_fraction": [round(v, 4) for v in fb], "option": option, "field": field,
            "what": fig.get("what"), "box_source": how, "paper_level": level, "pending_spec": False}


def word_cover(f: dict, words: dict, sizes: dict) -> float:
    """Share of the box covered by OCR words: pictures stay low (labels only), text boxes and typed tables run high."""
    pw, ph = sizes[f["page"]]
    b = f["box_page_fraction"]
    X0, Y0, X1, Y1 = b[0] * pw, b[1] * ph, b[2] * pw, b[3] * ph
    area = max(1e-6, (X1 - X0) * (Y1 - Y0))
    s = sum(max(0, min(X1, w[2]) - max(X0, w[0])) * max(0, min(Y1, w[3]) - max(Y0, w[1])) for w in words.get(f["page"], []))
    return s / area


def keep_pictures(entries: list, words: dict, sizes: dict, max_cover: float = 0.34, min_area: float = 0.003):
    keep, dropped = [], []
    for f in entries:
        b = f["box_page_fraction"]
        why = None
        if (b[2] - b[0]) * (b[3] - b[1]) < min_area:
            why = "tiny"
        elif words and word_cover(f, words, sizes) > max_cover:
            why = "mostly text"
        else:
            dup = next((k for k in keep if k["page"] == f["page"] and iou(tuple(k["box_page_fraction"]), tuple(b)) > 0.8), None)
            if dup:
                why = f"same picture as {dup['figure_id']}"
        if why:
            dropped.append({**f, "dropped": why})
        else:
            keep.append(f)
    return keep, dropped


def build(a) -> int:
    import fitz
    rep = json.load(open(a.report, encoding="utf-8"))
    mfile = json.load(open(a.meta, encoding="utf-8"))
    meta = mfile["units"]
    # the crops the requests were built from (the crop folder may have been cut again at another resolution since)
    dpi = a.dpi or mfile.get("dpi") or json.load(open(Path(a.crops) / "bundles.json", encoding="utf-8")).get("dpi", 250)
    pdf = fitz.open(a.pdf)
    sizes = {i + 1: (p.rect.width / 72, p.rect.height / 72) for i, p in enumerate(pdf)}
    layout = json.load(open(a.layout, encoding="utf-8")) if a.layout else None
    lay = layout_figures(layout) if layout else {}
    words = layout_words(layout, text=True) if layout else None
    pic_opts = set()  # questions whose options are pictures (empty option text)
    if a.golden:
        for q in json.load(open(a.golden, encoding="utf-8"))["questions"]:
            if sum(not (o.get("text_md") or "").strip() for o in q.get("options", [])) >= 2:
                pic_opts.add(f"q{q['number']}")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    code, session = a.exam[len("S11-"):].split("_")
    entries = []
    for uid, ur in rep["units"].items():
        m = meta.get(uid)
        if not m or "image_size" not in m:
            continue
        for fig in ur.get("figures") or []:
            regs = [r for r in (fig.get("regions") or []) if isinstance(r, int) and 1 <= r <= len(m.get("regions") or [])]
            box = fig.get("box")
            if m.get("source") == "page":
                if not (isinstance(box, list) and len(box) == 4):
                    continue
                page, pb = m["page"], tuple(v / 1000 for v in box)
                fb, how = snap(pb, lay.get(page, []))
            else:
                if not m.get("segments"):
                    continue
                cw = words_in_crop(m["segments"], words, dpi) if words is not None else []
                if regs:
                    rb = [m["regions"][r - 1] for r in regs]
                    cb = (min(b[0] for b in rb), min(b[1] for b in rb), max(b[2] for b in rb), max(b[3] for b in rb))
                    if cw:
                        cb = shave_text_rows(grow_over_labels(cb, cw), cb, cw)
                    how = f"regions {regs}"
                elif isinstance(box, list) and len(box) == 4 and box[2] > box[0] and box[3] > box[1]:
                    W, H = crop_size(m)
                    cb = (box[0] * W / 1000, box[1] * H / 1000, box[2] * W / 1000, box[3] * H / 1000)
                    how = "model box"
                else:
                    continue
                field = fig.get("field") or ""
                owner, _, short = field.partition(".")
                pieces = [(cb, field)]
                if cw and owner in pic_opts and len(short) != 1:
                    cells, rest = option_cells(cb, cw, m.get("regions") or [])
                    if cells:
                        pieces = [(grow_over_labels(c, cw), f"{owner}.{L}") for L, c in sorted(cells.items())] + ([(rest, field)] if rest else [])
                        how += " split at option letters"
                for pcb, pfield in pieces:
                    page, fb = crop_to_page(pcb, m, sizes, dpi)
                    if how == "model box":
                        fb, how = snap(fb, lay.get(page, []))
                    else:
                        p = 0.004
                        fb = (max(0, fb[0] - p), max(0, fb[1] - p), min(1, fb[2] + p), min(1, fb[3] + p))
                    e = emit(a, pdf, out, code, session, page, fb, pfield, fig, how)
                    if e:
                        entries.append(e)
                continue
            field = fig.get("field") or ""
            e = emit(a, pdf, out, code, session, page, fb, field, fig, how)
            if e:
                entries.append(e)
    entries, dropped = keep_pictures(entries, layout_words(layout) if layout else {}, sizes)
    for d in dropped:
        (out / f"{d['figure_id']}.png").unlink(missing_ok=True)
    json.dump({"exam": a.exam, "figures": entries, "dropped": dropped}, open(out / "manifest.candidate.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(entries)} figure crops -> {out} ({len(dropped)} dropped: text, tiny or duplicate)")
    return 0


def ref_box(f: dict, sizes: dict | None = None) -> Box | None:
    if f.get("box_page_fraction"):
        return tuple(f["box_page_fraction"])
    if f.get("box_300dpi") and sizes and f.get("page") in sizes:
        w, h = sizes[f["page"]]
        b = f["box_300dpi"]
        return (b[0] / (w * 300), b[1] / (h * 300), b[2] / (w * 300), b[3] / (h * 300))
    return None


def score(a) -> int:
    cand = json.load(open(a.candidate, encoding="utf-8"))["figures"]
    ref = json.load(open(a.reference, encoding="utf-8"))["figures"]
    sizes = None
    if a.pdf:
        import fitz
        sizes = {i + 1: (p.rect.width / 72, p.rect.height / 72) for i, p in enumerate(fitz.open(a.pdf))}
    rows = []
    used = set()
    for r in ref:
        rb = ref_box(r, sizes)
        if rb is None:
            continue
        best, bi = 0.0, None
        for i, c in enumerate(cand):
            if c.get("page") != r.get("page"):
                continue
            s = iou(rb, tuple(c["box_page_fraction"]))
            if s > best:
                best, bi = s, i
        if bi is not None:
            used.add(bi)
        rows.append({"ref": r.get("figure_id"), "question": r.get("question"), "option": r.get("option"), "iou": round(best, 3),
                     "cand": cand[bi]["figure_id"] if bi is not None else None})
    n = len(rows) or 1
    print(f"reference figures {len(rows)}: found (IoU>=0.5) {sum(r['iou'] >= 0.5 for r in rows)}, tight (IoU>=0.75) "
          f"{sum(r['iou'] >= 0.75 for r in rows)}, mean IoU {sum(r['iou'] for r in rows) / n:.2f}; extra candidates {len(cand) - len(used)}")
    if a.json:
        json.dump(rows, open(a.json, "w", encoding="utf-8"), indent=1)
    return 0


def place(a) -> int:
    """Put each crop's id where its picture sits: the field's [[figura:?]] markers in order, else the end of the field.
    Option pictures need no marker (the manifest links them by option). Markers left without a crop are removed."""
    from .fields import fields, set_field
    g = json.load(open(a.golden, encoding="utf-8"))
    f = fields(g)
    figs = json.load(open(a.manifest, encoding="utf-8"))["figures"]
    placed = appended = 0
    for fig in figs:
        if fig.get("option"):
            continue
        key = fig.get("field") or ""
        if key not in f:
            continue
        owner = key.split(".")[0]
        if "[[figura:?]]" not in f[key]:  # the model named the stem, the marker sits in the stimulus (or the reverse)
            key = next((k for k in f if k.split(".")[0] == owner and "[[figura:?]]" in f[k] and len(k.split(".")[1]) > 1), key)
        tok = f"[[figura:{fig['figure_id']}]]"
        if "[[figura:?]]" in f[key]:
            f[key] = f[key].replace("[[figura:?]]", tok, 1)
            placed += 1
        else:
            f[key] = (f[key].rstrip() + "\n\n" + tok).strip()
            appended += 1
    left = 0
    for k, v in f.items():
        if "[[figura:?]]" in v:
            left += v.count("[[figura:?]]")
            v = re.sub(r"\n*\[\[figura:\?\]\]\n*", "\n\n", v).strip()
        f[k] = v
    for k, v in f.items():
        set_field(g, k, v)
    json.dump(g, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"figures placed at their marker {placed}, added at the end of the field {appended}, markers without a crop removed {left}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    for k in ("exam", "report", "meta", "crops", "pdf", "out"):
        b.add_argument(f"--{k}", required=True)
    b.add_argument("--layout")
    b.add_argument("--dpi", type=int, help="resolution of the crops the format requests were built from (older meta files)")
    b.add_argument("--golden", help="formatted golden; questions with empty options get their picture split per option")
    s = sub.add_parser("score")
    s.add_argument("--candidate", required=True)
    s.add_argument("--reference", required=True)
    s.add_argument("--pdf")
    s.add_argument("--json")
    pl = sub.add_parser("place")
    pl.add_argument("--golden", required=True)
    pl.add_argument("--manifest", required=True)
    pl.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    return {"build": build, "score": score, "place": place}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
