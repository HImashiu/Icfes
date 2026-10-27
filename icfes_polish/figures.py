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
    if owner.startswith("g") and owner[1:].split("-")[0].isdigit():
        n = int(owner[1:].split("-")[0])  # the editor files group figures under the group's first question
    option = short if len(short) == 1 else None
    r = pdf[page - 1].rect
    clip = fitz.Rect(fb[0] * r.width, fb[1] * r.height, fb[2] * r.width, fb[3] * r.height)
    pix = pdf[page - 1].get_pixmap(dpi=300, clip=clip)
    if pix.width < 2 or pix.height < 2:
        return None
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if not option:
        img = erase_captions(img, a, page, fb, owner)
    clean, level = clean_figure(img)
    tb = drop_slivers(clean, trim_box(clean))
    clean = clean.crop(tb)
    fw, fh = fb[2] - fb[0], fb[3] - fb[1]
    fb = (fb[0] + fw * tb[0] / pix.width, fb[1] + fh * tb[1] / pix.height, fb[0] + fw * tb[2] / pix.width, fb[1] + fh * tb[3] / pix.height)
    h = hashlib.sha1(f"{a.exam}{page}{fb}".encode()).hexdigest()[:6]
    fid = f"{code.lower()}{session[0]}-{owner}-" + (f"opt-{option.lower()}-" if option else "") + f"auto-{h}"
    (out / f"{fid}.png").write_bytes(png_bytes(clean))
    return {"question": n, "group": owner if owner.startswith("g") else None, "page": page, "kind": "image",
            "figure_id": fid, "spec_id": fid, "method": "eyeballed_box", "auto": True, "svg": f"traced/{a.exam}/{fid}.png",
            "box_page_fraction": [round(v, 4) for v in fb], "option": option, "field": field,
            "what": fig.get("what"), "box_source": how, "paper_level": level, "pending_spec": False}


def drop_slivers(img, tb, max_frac: float = 0.06, gap: int = 6):
    """A thin strip of ink cut off at the top or bottom edge (the descenders of a text line above the picture) is
    left out of the box when blank rows separate it from the picture."""
    import numpy as np
    x0, y0, x1, y1 = tb
    rows = (np.array(img.convert("L").crop(tb)) < 160).sum(1) > 0
    h = len(rows)
    if h < 40:
        return tb
    runs, i = [], 0
    while i < h:
        if rows[i]:
            j = i
            while j < h and rows[j]:
                j += 1
            runs.append([i, j])
            i = j
        else:
            i += 1
    if len(runs) < 2:
        return tb
    top, bot = 0, h
    if runs[0][1] - runs[0][0] < max_frac * h and runs[1][0] - runs[0][1] >= gap:
        top = runs[1][0] - 2
    if runs[-1][1] - runs[-1][0] < max_frac * h and runs[-1][0] - runs[-2][1] >= gap and len(runs) > 2:
        bot = runs[-2][1] + 2
    return (x0, y0 + max(0, top), x1, y0 + min(h, bot))


CAPTION = re.compile(r"^(Figura|Tabla|Gr[aá]fica|Gr[aá]fico|Diagrama|Esquema|Mapa|Imagen)$", re.I)


def erase_captions(img, a, page, fb, owner):
    """The booklet's caption ("Figura", "Tabla 2") printed inside the crop is typed under the picture as text, as in
    the hand-finished goldens, so it is painted out of the picture instead of showing twice."""
    words, sizes, typed = getattr(a, "_words", None), getattr(a, "_sizes", None), getattr(a, "_typed", {})
    if not words or page not in sizes:
        return img
    W, H = sizes[page]
    X0, Y0, X1, Y1 = fb[0] * W, fb[1] * H, fb[2] * W, fb[3] * H
    ws = [w for w in words.get(page, []) if w[0] >= X0 - 0.02 and w[2] <= X1 + 0.02 and w[1] >= Y0 - 0.02 and w[3] <= Y1 + 0.02]
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    sx, sy = img.width / (X1 - X0), img.height / (Y1 - Y0)
    for i, w in enumerate(ws):
        if not CAPTION.match(str(w[4]).strip()):
            continue
        cap = [w] + [v for v in ws if v is not w and re.fullmatch(r"\d{1,2}\.?", str(v[4]).strip()) and abs(v[1] - w[1]) < 0.05
                     and 0 < v[0] - w[2] < 0.15]
        label = " ".join(str(v[4]).strip() for v in cap).rstrip(".")
        if label.lower() not in typed.get(owner, ""):
            continue  # not typed in the text: it stays in the picture
        for v in cap:
            d.rectangle([(v[0] - X0) * sx - 4, (v[1] - Y0) * sy - 4, (v[2] - X0) * sx + 4, (v[3] - Y0) * sy + 4], fill="white")
    return img


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
        elif words and "below the question number" not in (f.get("box_source") or "") and \
                word_cover(f, words, sizes) > (0.7 if f.get("option") else max_cover):  # a sign is text in a frame
            # option pictures carry labels ("Empuje (4 newtons)", axis names), so they read as text more often
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
    a._words, a._sizes, a._typed = words, sizes, {}
    if a.golden:
        from .fields import fields as _fields
        for k, v in _fields(json.load(open(a.golden, encoding="utf-8"))).items():
            a._typed[k.split(".")[0]] = a._typed.get(k.split(".")[0], "") + " " + re.sub(r"<[^>]+>|\*\*", " ", v or "").lower()
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
        for fig in pool_option_figures(ur.get("figures") or [], pic_opts):
            regs = [r for r in (fig.get("regions") or []) if isinstance(r, int) and 1 <= r <= len(m.get("regions") or [])]
            box = fig.get("box")
            if m.get("source") == "page":
                if not (isinstance(box, list) and len(box) == 4):
                    continue
                page, pb = m["page"], tuple(v / 1000 for v in box)
                fb, how = snap(pb, lay.get(page, []))
                band = number_band(uid, page, words, sizes) if words is not None else None
                if band and how == "model box" and band[0] <= (fb[1] + fb[3]) / 2 <= band[1]:
                    ib = band_ink(pdf, page, band, words, sizes)  # the model's box is loose: the ink of the band
                    if ib:
                        fb, how = ib, "ink below the question number"
                elif band and not (band[0] <= (fb[1] + fb[3]) / 2 <= band[1]):
                    # a whole page holds several questions and the model's boxes drift: take the layout picture
                    # printed between this question's number and the next one
                    inb = [c for c in lay.get(page, []) if band[0] <= (c[1] + c[3]) / 2 <= band[1] and c[2] > band[2]]
                    if inb:
                        fb, how = max(inb, key=lambda c: (c[2] - c[0]) * (c[3] - c[1])), "layout, below the question number"
                    else:
                        ib = band_ink(pdf, page, band, words, sizes)
                        if ib:
                            fb, how = ib, "ink below the question number"
            else:
                if not m.get("segments"):
                    continue
                cw = words_in_crop(m["segments"], words, dpi) if words is not None else []
                if regs:
                    rb = [m["regions"][r - 1] for r in regs]
                    cb = (min(b[0] for b in rb), min(b[1] for b in rb), max(b[2] for b in rb), max(b[3] for b in rb))
                    if cw:
                        cb = shave_text_rows(grow_over_labels(cb, cw), cb, cw, typed=re.sub(r"[^\w\s]", "", a._typed.get(uid, "")))
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
                if cw and owner in pic_opts and (len(short) != 1 or letters_inside(cb, cw) >= 2):  # one box over several options is split too
                    cells, rest = option_cells(cb, cw, m.get("regions") or [], img=crop_image(a, m))
                    if fig.get("orig"):
                        model = {}
                        for f0 in fig["orig"]:
                            rb0 = [m["regions"][r - 1] for r in f0["regions"] if isinstance(r, int) and 1 <= r <= len(m["regions"])]
                            if rb0:
                                b0 = (min(b[0] for b in rb0), min(b[1] for b in rb0), max(b[2] for b in rb0), max(b[3] for b in rb0))
                                model[f0["field"].split(".")[1]] = shave_text_rows(grow_over_labels(b0, cw), b0, cw)
                        if spread(model) <= spread(cells) or len(cells) < len(model):
                            cells, rest, how = model, None, how + " (model's option picks)"
                    if cells:
                        pieces = [(c, f"{owner}.{L}") for L, c in sorted(cells.items())] + ([(rest, field if short != "opts" else f"{owner}.stem")] if rest else [])
                        how += " split at option letters"
                    elif fig.get("orig_boxes"):  # no letters to cut at: the model's own boxes, one per option
                        W, H = crop_size(m)
                        pieces = [((b[0] * W / 1000, b[1] * H / 1000, b[2] * W / 1000, b[3] * H / 1000), f0["field"])
                                  for f0 in fig["orig_boxes"] for b in [f0["box"]]]
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
    entries, twice = one_per_option(entries)
    dropped += twice
    kept = {e["figure_id"] for e in entries}
    for d in dropped:
        if d["figure_id"] not in kept:  # a dropped duplicate can share its id with the crop that stays
            (out / f"{d['figure_id']}.png").unlink(missing_ok=True)
    json.dump({"exam": a.exam, "figures": entries, "dropped": dropped}, open(out / "manifest.candidate.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(entries)} figure crops -> {out} ({len(dropped)} dropped: text, tiny or duplicate)")
    return 0


def number_band(uid: str, page: int, words: dict, sizes: dict):
    """(top, bottom, left) as page fractions of the space between a question's printed number and the next one in
    the same column, or None when the number is not found."""
    if not re.fullmatch(r"q\d+", uid) or page not in sizes:
        return None
    n = int(uid[1:])
    W, H = sizes[page]
    ws = words.get(page, [])
    at = [w for w in ws if str(w[4]).strip() == f"{n}."]
    if len(at) != 1:
        return None
    w = at[0]
    nxt = [v for v in ws if str(v[4]).strip() == f"{n + 1}." and v[1] > w[1] and abs(v[0] - w[0]) < 0.5]
    bottom = min(v[1] for v in nxt) / H if nxt else 1.0
    return (w[1] / H, bottom, w[0] / W)


def band_ink(pdf, page: int, band, words: dict, sizes: dict, dpi: int = 100):
    """The ink in the left half of a question's band (the picture beside its number; the options sit to the right),
    leaving out printed words that are not inside the picture's frame. Page fractions, or None."""
    from .regions import ink_box
    top, bottom, left = band
    pg = pdf[page - 1]
    pix = pg.get_pixmap(dpi=dpi)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    W, H = sizes[page]
    sx, sy = img.width / W, img.height / H
    skip = [(w[0] * sx, w[1] * sy, w[2] * sx, w[3] * sy) for w in words.get(page, []) if re.fullmatch(r"\d{1,3}\.", str(w[4]).strip())]
    cell = (left * img.width + 4, top * img.height + 6, 0.5 * img.width, bottom * img.height - 6)
    b = ink_box(img, cell, skip)
    if not b or (b[2] - b[0]) < 0.08 * img.width or (b[3] - b[1]) < 0.02 * img.height:
        return None
    p = 0.004
    return (max(0, b[0] / img.width - p), max(0, b[1] / img.height - p), min(1, b[2] / img.width + p), min(1, b[3] / img.height + p))


def crop_image(a, m: dict):
    """The crop image a unit's request was built from, when it is still in the crop folder at the same size."""
    f = m.get("bundle")
    if not f:
        return None
    name = f"q{int(f[1:]):03d}.png" if f.startswith("q") and f[1:].isdigit() else f"{f}.png"
    p = Path(a.crops) / name
    if not p.exists():
        return None
    img = Image.open(p)
    return img if list(img.size) == list(m.get("image_size") or img.size) else None


def spread(cells: dict) -> float:
    """How badly a set of option pictures hangs together: a set where one option takes its neighbours' pictures has
    one box far larger than the rest, and two options sharing a picture overlap. Lower is better."""
    if len(cells) < 2:
        return 1e9
    ar = [max(1.0, (c[2] - c[0]) * (c[3] - c[1])) for c in cells.values()]
    ov = sum(iou(a, b) for i, a in enumerate(cells.values()) for b in list(cells.values())[i + 1:])
    return max(ar) / min(ar) + 10 * ov + (4 - min(4, len(cells)))


def pool_option_figures(figs: list[dict], pic_opts: set) -> list[dict]:
    """The model names a picture per option but often shifts them by one (A gets the row, B gets A's picture...).
    Its option pictures of one question are pooled and handed out again by where the printed letters are."""
    out, pooled = [], {}
    for f in figs:
        owner, _, short = (f.get("field") or "").partition(".")
        if owner in pic_opts and len(short) == 1 and (f.get("regions") or isinstance(f.get("box"), list)):
            pooled.setdefault(owner, []).append(f)
        else:
            out.append(f)
    for owner, fs in pooled.items():
        if len(fs) == 1:
            out.append(fs[0])
            continue
        what = "; ".join(f.get("what") or "" for f in fs)
        if all(f.get("regions") for f in fs):
            regs = sorted({r for f in fs for r in f["regions"]})
            out.append({"field": f"{owner}.opts", "regions": regs, "what": what, "orig": fs})
        elif all(isinstance(f.get("box"), list) and len(f["box"]) == 4 for f in fs) and not any(f.get("regions") for f in fs):
            bs = [f["box"] for f in fs]
            out.append({"field": f"{owner}.opts", "box": [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs),
                                                          max(b[3] for b in bs)], "what": what, "orig_boxes": fs})
        else:
            out += fs
    return out


def letters_inside(box, word_boxes) -> int:
    from .regions import _LETTER
    return sum(1 for w in word_boxes if _LETTER.match(str(w[4] if len(w) > 4 else "").strip())
               and box[0] <= (w[0] + w[2]) / 2 <= box[2] and box[1] <= (w[1] + w[3]) / 2 <= box[3])


def one_per_option(entries: list[dict]) -> tuple[list[dict], list[dict]]:
    """An option shows one picture. When two crops land on the same option, keep the one cut at the option letters
    (or the smaller one, when it sits inside the other); two different options with the same picture are both flagged."""
    keep, drop = [], []
    by = {}
    for e in entries:
        if e.get("option"):
            by.setdefault((e["question"], e["option"]), []).append(e)
    gone = set()
    for (q, L), es in by.items():
        if len(es) < 2:
            continue
        es.sort(key=lambda e: ("split" not in (e.get("box_source") or ""), _area(e["box_page_fraction"])))
        for e in es[1:]:
            gone.add(id(e)); drop.append(dict(e, dropped="second picture for the same option"))
    for e in entries:
        if id(e) not in gone:
            keep.append(e)
    opts = [e for e in keep if e.get("option")]
    for i, a in enumerate(opts):
        for b in opts[i + 1:]:
            if a["question"] == b["question"] and iou(tuple(a["box_page_fraction"]), tuple(b["box_page_fraction"])) > 0.5:
                for e in (a, b):
                    e["review"] = "two options show the same picture"
    byq = {}
    for e in opts:
        byq.setdefault(e["question"], []).append(e)
    for es in byq.values():
        ar = [_area(e["box_page_fraction"]) for e in es]
        if len(es) < 3 or max(ar) > 2.5 * min(ar):
            for e in es:
                e.setdefault("review", "option pictures missing or of very different sizes: check each option has its own")
    return keep, drop


def _area(b) -> float:
    return (b[2] - b[0]) * (b[3] - b[1])


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


CHART_KINDS = {"bar", "line", "curve", "pie", "scatter", "histogram"}
CHART_WORDS = re.compile(r"gr[aá]fic|barras|ejes|curva|histograma|diagrama circular|chart|graph|plot", re.I)
TABLE_WORDS = re.compile(r"\s*(tabla|table)\b", re.I)  # a crop described as a table, not a picture inside one


def tidy(a) -> int:
    """One picture shown once. Old goldens come with native figure specs (charts, tables, draft drawings) and the
    format pass adds inline tables and scan crops, so the same picture can show two or three times. Rules, in the
    project's figure policy (charts and tables native, drawings traced from the scan):
      - a native table spec goes when the text already holds that table inline (one spec per inline table);
      - a scan crop of a chart goes when the question has a native chart spec, and a crop of a table when the text
        holds the table inline;
      - a draft drawing spec goes when the question keeps a scan crop (the crop is the booklet's own picture)."""
    from .fields import fields, set_field
    g = json.load(open(a.golden, encoding="utf-8"))
    man = json.load(open(a.manifest, encoding="utf-8"))
    specs = json.load(open(a.specs, encoding="utf-8")) if a.specs and Path(a.specs).exists() else {"figures": []}
    f = fields(g)
    by_q: dict[int, list] = {}
    for sp in specs.get("figures", []):
        q = (sp.get("location") or {}).get("question")
        if str(q).isdigit():
            by_q.setdefault(int(q), []).append(sp)
    drop_specs, drop_crops, rep = set(), set(), []
    for q in g["questions"]:
        n = q["number"]
        texts = [v for k, v in f.items() if k.split(".")[0] == f"q{n}" and len(k.split(".")[1]) > 1]
        if q.get("group_id"):
            texts += [v for k, v in f.items() if k.split(".")[0] == q["group_id"]]
        inline = sum(t.count("<table") for t in texts)
        sp = by_q.get(n, [])
        crops = [c for c in man["figures"] if c.get("auto") and c.get("question") == n and not c.get("option")]
        tables = [s for s in sp if s.get("kind") == "table"]
        for s in tables[:inline]:
            drop_specs.add(s["id"]); rep.append(f"q{n}: native table {s['id']} dropped, the table is in the text")
        charts = [s for s in sp if s.get("kind") in CHART_KINDS]
        for c in crops:
            what = c.get("what") or ""
            if charts and CHART_WORDS.search(what) or inline and TABLE_WORDS.match(what) and not CHART_WORDS.search(what):
                drop_crops.add(c["figure_id"]); rep.append(f"q{n}: scan crop {c['figure_id']} ({what}) dropped, shown natively")
        if any(c["figure_id"] not in drop_crops for c in crops):
            for s in sp:
                if s.get("kind") not in CHART_KINDS and s.get("kind") != "table":
                    drop_specs.add(s["id"]); rep.append(f"q{n}: draft drawing {s['id']} dropped, the scan crop shows it")
    for k, v in f.items():
        nv = v
        for cid in drop_crops:
            nv = re.sub(r"\n*\[\[figura:" + re.escape(cid) + r"\]\]\n*", "\n\n", nv)
        if nv != v:
            set_field(g, k, nv.strip())
    for q in g["questions"]:
        fl = q.get("figure")
        if isinstance(fl, list):
            q["figure"] = [x for x in fl if x not in drop_specs] or None
        elif isinstance(fl, str) and fl in drop_specs:
            q["figure"] = None
    man["figures"] = [c for c in man["figures"] if c["figure_id"] not in drop_crops]
    specs["figures"] = [s for s in specs.get("figures", []) if s.get("id") not in drop_specs]
    json.dump(g, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(man, open(a.manifest_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.specs_out:
        json.dump(specs, open(a.specs_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.report:
        json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"tidy: {len(drop_specs)} native specs and {len(drop_crops)} scan crops dropped as duplicates")
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
    t = sub.add_parser("tidy")
    for k in ("golden", "manifest", "out", "manifest-out"):
        t.add_argument(f"--{k}", required=True)
    t.add_argument("--specs")
    t.add_argument("--specs-out")
    t.add_argument("--report")
    a = ap.parse_args(argv)
    return {"build": build, "score": score, "place": place, "tidy": tidy}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
