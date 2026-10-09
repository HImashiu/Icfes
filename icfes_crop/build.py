"""Per-question source crops from Azure geometry.

Pipeline: load Azure JSON -> elements/words (deskewed inches) -> find each question's anchor paragraph ->
assign every element to an owner (question / shared-passage zone / front matter / furniture) by reading order ->
one bounding box per (owner, page, column) built from the owner's own text -> pad + grow to a clean white
margin without entering other owners' text -> verify -> write crops, bundles.json and per-page overlays.
"""
from __future__ import annotations

import bisect
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from . import geometry as G

log = logging.getLogger("icfes_crop")

FURNITURE = {"pageHeader", "pageFooter", "pageNumber"}
HEADINGS = {"title", "sectionHeading"}
PAD_IN = 0.08          # margin added around the text of a crop
GROW_MAX_IN = 0.15     # extra growth allowed while ink touches the crop edge
INK_THRESHOLD = 140    # gray level below which a pixel counts as ink
INK_FRACTION = 0.004   # share of dark pixels in the 2px edge strip that counts as "ink at the edge"
TOL_PX = 2


def norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalnum())


@dataclass
class El:
    kind: str                 # p = paragraph, t = table, f = figure
    key: tuple[int, int]      # (chunk, span offset): reading order
    page: int                 # global page (1-based)
    box: G.Box                # deskewed inches
    text: str
    role: str | None
    start: int
    end: int
    chunk: int
    owner: str | None = None


@dataclass
class Word:
    page: int
    box: G.Box
    chunk: int
    offset: int
    text: str
    el: int | None = None     # index into elements (owner lookup)


@dataclass
class PageInfo:
    num: int
    angle: float
    w: float
    h: float


def load(json_path: Path) -> dict:
    return json.loads(json_path.read_text(encoding="utf-8"))


def collect(doc: dict, sign: int) -> tuple[dict[int, PageInfo], list[El], list[Word]]:
    pages: dict[int, PageInfo] = {}
    els: list[El] = []
    words: list[Word] = []
    for ci, ch in enumerate(doc["chunks"]):
        r, off = ch["result"], ch.get("page_offset", 0)
        for p in r["pages"]:
            if p.get("unit") != "inch":
                raise ValueError(f"Unsupported page unit {p.get('unit')!r}; expected 'inch' for PDFs")
            gp = p["pageNumber"] + off
            pages[gp] = PageInfo(gp, p.get("angle", 0.0), p["width"], p["height"])
        def bx(poly: list[float], gp: int) -> G.Box:
            pg = pages[gp]
            return G.poly_box(poly, sign * pg.angle, pg.w / 2, pg.h / 2)
        for kind, items in (("p", r.get("paragraphs", [])), ("t", r.get("tables", [])), ("f", r.get("figures", []))):
            for it in items:
                brs = it.get("boundingRegions") or []
                if not brs or not it.get("spans"):
                    continue
                gp = brs[0]["pageNumber"] + off
                sp = it["spans"][0]
                text = it.get("content", "") if kind == "p" else ""
                els.append(El(kind, (ci, sp["offset"]), gp, bx(brs[0]["polygon"], gp), text, it.get("role"),
                              sp["offset"], sp["offset"] + sp["length"], ci))
        for p in r["pages"]:
            gp = p["pageNumber"] + off
            for w in p.get("words", []):
                words.append(Word(gp, bx(w["polygon"], gp), ci, w["span"]["offset"], w.get("content", "")))
            for m in p.get("selectionMarks", []):
                words.append(Word(gp, bx(m["polygon"], gp), ci, m["span"]["offset"], f"[{m.get('state', 'mark')}]"))
    els.sort(key=lambda e: e.key)
    return pages, els, words


# ------------------------------------------------------------------ anchors & ownership
def find_anchor(els: list[El], start: int, text: str) -> int | None:
    """First paragraph at/after `start` whose normalized text begins like `text`."""
    full = norm(text.lstrip("#").strip())
    for n in (min(24, len(full)), min(12, len(full))):
        if n < 6:
            continue
        probe = full[:n]
        for i in range(start, len(els)):
            e = els[i]
            if e.kind == "p" and e.role not in FURNITURE and norm(e.text).startswith(probe):
                return i
    return None


def assign_owners(els: list[El], questions: list[dict], groups: list[dict]) -> dict[str, Any]:
    events: dict[int, str] = {}
    anchors: dict[int, int] = {}
    missing: list[int] = []
    cursor = 0
    for q in sorted(questions, key=lambda q: q["number"]):
        if q.get("placeholder") or not q.get("anchor"):
            continue
        i = find_anchor(els, cursor, q["anchor"])
        if i is None:
            missing.append(q["number"])
            continue
        events[i] = f"q{q['number']}"
        anchors[q["number"]] = i
        cursor = i + 1
    zones: dict[str, int] = {}
    for g in groups:
        prev = max((idx for n, idx in anchors.items() if n < g["from"]), default=0)
        i = find_anchor(els, prev, g["directions"])
        if i is not None and i not in events:
            events[i] = f"g{g['from']}-{g['to']}"
            zones[events[i]] = i
    owner, pending = "front", []
    for i, e in enumerate(els):
        if e.role in FURNITURE or (e.role == "title" and i not in events):  # running page titles are not content
            e.owner = "furniture"
            continue
        if i in events:
            owner = events[i]
            for h in pending:
                h.owner = owner
            pending = []
            e.owner = owner
            continue
        if e.kind == "p" and e.role in HEADINGS:
            pending.append(e)
            continue
        for h in pending:
            h.owner = owner
        pending = []
        e.owner = owner
    for h in pending:
        h.owner = owner
    return {"anchors": anchors, "zones": zones, "missing_anchor": missing}


def assign_words(els: list[El], words: list[Word]) -> None:
    text_els = sorted(((e.key[0], e.start, e.end, i) for i, e in enumerate(els) if e.kind in ("p", "t")))
    starts = [(c, s) for c, s, _, _ in text_els]
    figs: dict[int, list[int]] = {}
    for i, e in enumerate(els):
        if e.kind == "f":
            figs.setdefault(e.page, []).append(i)
    for w in words:
        k = bisect.bisect_right(starts, (w.chunk, w.offset)) - 1
        if k >= 0:
            c, s, e_, i = text_els[k]
            if c == w.chunk and s <= w.offset < e_:
                w.el = i
                continue
        cx, cy = (w.box[0] + w.box[2]) / 2, (w.box[1] + w.box[3]) / 2
        for i in figs.get(w.page, []):
            b = els[i].box
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                w.el = i
                break


# ------------------------------------------------------------------ images
def render_page(pdf, gp: int, dpi: int, phi: float) -> Image.Image:
    img = pdf[gp - 1].render(scale=dpi / 72).to_pil().convert("RGB")
    if abs(phi) > 0.01:
        img = img.rotate(phi, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    return img


def darkness_in(img: Image.Image, boxes: list[G.Box], k: float) -> float:
    g = img.convert("L")
    tot = n = 0
    for b in boxes:
        crop = g.crop(tuple(int(v * k) for v in b))
        if crop.width < 2 or crop.height < 2:
            continue
        h = crop.histogram()
        tot += sum(h[:INK_THRESHOLD]) / (crop.width * crop.height)
        n += 1
    return tot / n if n else 0.0


# ------------------------------------------------------------------ crop construction
def limit_box(box: G.Box, blockers: list[G.Box], page: G.Box) -> G.Box:
    """Largest box around `box` that does not enter any blocker (blockers already overlapping stop growth there)."""
    x0, y0, x1, y1 = page
    for b in blockers:
        if b[2] > box[0] and b[0] < box[2]:  # horizontal overlap -> constrains up/down
            if b[1] < box[1]:
                y0 = max(y0, min(b[3], box[1]))
            if b[3] > box[3]:
                y1 = min(y1, max(b[1], box[3]))
        if b[3] > box[1] and b[1] < box[3]:  # vertical overlap -> constrains left/right
            if b[0] < box[0]:
                x0 = max(x0, min(b[2], box[0]))
            if b[2] > box[2]:
                x1 = min(x1, max(b[0], box[2]))
    return (x0, y0, x1, y1)


def edge_has_ink(g: Image.Image, box_px: tuple[int, int, int, int], side: str) -> bool:
    x0, y0, x1, y1 = box_px
    t = 2
    strip = {"left": (x0, y0, x0 + t, y1), "right": (x1 - t, y0, x1, y1),
             "top": (x0, y0, x1, y0 + t), "bottom": (x0, y1 - t, x1, y1)}[side]
    c = g.crop(strip)
    if c.width < 1 or c.height < 1:
        return False
    return sum(c.histogram()[:INK_THRESHOLD]) / (c.width * c.height) > INK_FRACTION


def grow_to_clean_margin(box: G.Box, lim: G.Box, g: Image.Image, k: float) -> tuple[G.Box, list[str]]:
    flags = []
    step = 3 / k
    for side in ("left", "right", "top", "bottom"):
        grown = 0.0
        while True:
            px = tuple(int(round(v * k)) for v in box)
            if not edge_has_ink(g, px, side):
                break
            room = {"left": box[0] - lim[0], "right": lim[2] - box[2], "top": box[1] - lim[1], "bottom": lim[3] - box[3]}[side]
            if room < step * 0.5:
                break  # neighbouring text (or the page edge) is right there: nothing more to include
            if grown >= GROW_MAX_IN:
                flags.append(f"ink continues past the {side} edge (often the scan border or handwriting)")
                break
            d = min(step, room)
            box = {"left": (box[0] - d, box[1], box[2], box[3]), "right": (box[0], box[1], box[2] + d, box[3]),
                   "top": (box[0], box[1] - d, box[2], box[3]), "bottom": (box[0], box[1], box[2], box[3] + d)}[side]
            grown += d
    return box, flags


def build_bundles(doc: dict, qdata: dict, pdf, out_dir: Path, dpi: int = 200) -> dict:
    # tilt direction: decided once per document from real ink
    sign = _sign_from_ink(pdf, doc, dpi)
    pages, els, words = collect(doc, sign)
    own = assign_owners(els, qdata["questions"], qdata["groups"])
    assign_words(els, words)

    # segments: one per (owner, page, column)
    segs: dict[tuple[str, int, str], dict] = {}
    for i, e in enumerate(els):
        if e.owner in (None, "furniture"):
            continue
        pg = pages[e.page]
        col = G.column_of(e.box, pg.w)
        s = segs.setdefault((e.owner, e.page, col), {"owner": e.owner, "page": e.page, "col": col, "els": [], "boxes": []})
        s["els"].append(i)
        s["boxes"].append(e.box)
    for w in words:
        if w.el is None or els[w.el].owner in (None, "furniture"):
            continue
        e = els[w.el]
        segs[(e.owner, e.page, G.column_of(e.box, pages[e.page].w))]["boxes"].append(w.box)

    by_page: dict[int, list[dict]] = {}
    for s in segs.values():
        s["box"] = G.union(s["boxes"])
        by_page.setdefault(s["page"], []).append(s)
    for gp, lst in by_page.items():  # pieces of one owner that overlap are really one region
        merged = True
        while merged:
            merged = False
            for a in range(len(lst)):
                for b in range(a + 1, len(lst)):
                    if lst[a]["owner"] == lst[b]["owner"] and G.intersect(lst[a]["box"], lst[b]["box"]):
                        lst[a]["els"] += lst[b]["els"]
                        lst[a]["box"] = G.union([lst[a]["box"], lst[b]["box"]])
                        lst[a]["col"] = "span" if lst[a]["col"] != lst[b]["col"] else lst[a]["col"]
                        del lst[b]
                        merged = True
                        break
                if merged:
                    break

    words_by_page: dict[int, list[Word]] = {}
    for w in words:
        words_by_page.setdefault(w.page, []).append(w)
    els_by_page: dict[int, list[El]] = {}
    for e in els:
        els_by_page.setdefault(e.page, []).append(e)
    els_index = {id(e): i for i, e in enumerate(els)}
    crops: dict[str, list[tuple[Image.Image, dict]]] = {}
    overlays_dir = out_dir / "overlays"
    overlays_dir.mkdir(parents=True, exist_ok=True)
    orphans: list[dict] = []
    palette = [(220, 50, 47), (38, 139, 210), (133, 153, 0), (181, 137, 0), (108, 113, 196), (42, 161, 152), (203, 75, 22)]
    colors: dict[str, tuple[int, int, int]] = {}

    for gp in sorted(pages):
        pg = pages[gp]
        phi = sign * pg.angle
        img = render_page(pdf, gp, dpi, phi)
        gray = img.convert("L")
        k = img.width / pg.w
        page_box = (0.0, 0.0, pg.w, pg.h)
        overlay = img.copy()
        od = ImageDraw.Draw(overlay)
        for s in by_page.get(gp, []):
            seg_els = set(s["els"])
            blockers = [e.box for e in els_by_page.get(gp, []) if els_index[id(e)] not in seg_els]
            lim = limit_box(s["box"], blockers, page_box)
            padded = G.pad(s["box"], PAD_IN, lim)
            final, flags = grow_to_clean_margin(padded, lim, gray, k)
            px = tuple(int(round(v * k)) for v in final)
            px = (max(0, px[0]), max(0, px[1]), min(img.width, px[2]), min(img.height, px[3]))
            # checks ---------------------------------------------------------
            page_words = words_by_page.get(gp, [])
            mine = [w for w in page_words if w.el is not None and w.el in seg_els]
            def on_page(b):
                c = G.intersect(b, page_box)
                return tuple(v * k for v in c) if c else None
            cut = [w for w in mine if (wb := on_page(w.box)) and not G.contains(tuple(float(v) for v in px), wb, TOL_PX)]
            fbox = (px[0] / k, px[1] / k, px[2] / k, px[3] / k)
            bleed = [w for w in page_words if w.el is not None and els[w.el].owner not in (s["owner"], "furniture")
                     and G.overlap_fraction(w.box, fbox) >= 0.5]
            rec = {"page": gp, "column": s["col"], "box_in": [round(v, 3) for v in fbox], "box_px": list(px),
                   "words": len(mine), "words_cut": len(cut), "bleed_words": len(bleed),
                   "bleed_from": sorted({els[w.el].owner for w in bleed}), "edge_flags": flags}
            crops.setdefault(s["owner"], []).append((img.crop(px), rec))
            col = colors.setdefault(s["owner"], palette[len(colors) % len(palette)])
            od.rectangle(px, outline=col, width=5)
            od.text((px[0] + 6, px[1] + 4), s["owner"], fill=col)
        for w in words_by_page.get(gp, []):
            if w.el is None and not w.text.startswith("["):
                orphans.append({"page": gp, "text": w.text, "box_in": [round(v, 2) for v in w.box]})
                od.rectangle(tuple(int(v * k) for v in w.box), outline=(255, 0, 0), width=2)
        overlay.resize((overlay.width // 2, overlay.height // 2)).convert("RGB").save(
            overlays_dir / f"p{gp:03d}.jpg", quality=80)

    # stitch segments per owner
    crops_dir = out_dir
    crops_dir.mkdir(parents=True, exist_ok=True)
    bundles: dict[str, dict] = {}
    for owner, parts in crops.items():
        parts.sort(key=lambda t: (t[1]["page"], {"span": 0, "left": 1, "right": 2}[t[1]["column"]], t[1]["box_in"][1]))
        w = max(p.width for p, _ in parts)
        gap = 14
        canvas = Image.new("RGB", (w, sum(p.height for p, _ in parts) + gap * (len(parts) - 1)), (255, 255, 255))
        y = 0
        for p, rec in parts:
            canvas.paste(p, (0, y))
            rec["y_in_image"] = y
            y += p.height + gap
            if y - gap < canvas.height:
                ImageDraw.Draw(canvas).line([(0, y - gap // 2), (w, y - gap // 2)], fill=(200, 60, 60), width=2)
        name = (f"q{int(owner[1:]):03d}" if owner[0] == "q" else owner) + ".png"
        if owner != "front":
            canvas.save(crops_dir / name)
        flags = []
        if any(r["words_cut"] for _, r in parts):
            flags.append("text may be cut: some words fall outside the crop")
        if any(r["edge_flags"] for _, r in parts):
            flags.append("ink touches the crop edge (possible handwriting or text the OCR missed)")
        bundles[owner] = {"id": owner, "file": name if owner != "front" else None,
                          "kind": "question" if owner[0] == "q" else ("group" if owner[0] == "g" else "front"),
                          "segments": [r for _, r in parts], "flags": flags}
    return {"sign": sign, "dpi": dpi, "bundles": bundles, "orphans": orphans, **own}


def _sign_from_ink(pdf, doc: dict, dpi: int) -> int:
    """Azure's `angle` is clockwise-positive; confirm the rotation direction against real ink on the most tilted page."""
    best = None
    for ci, ch in enumerate(doc["chunks"]):
        for p in ch["result"]["pages"]:
            if best is None or abs(p.get("angle", 0)) > abs(best[1].get("angle", 0)):
                best = (ch, p)
    if best is None or abs(best[1].get("angle", 0)) < 0.3:
        return 1
    ch, p = best
    gp = p["pageNumber"] + ch.get("page_offset", 0)
    raw = pdf[gp - 1].render(scale=dpi / 72).to_pil().convert("RGB")
    k = raw.width / p["width"]
    words = p.get("words", [])[:600:4]
    scores = {}
    for s in (1, -1):
        phi = s * p["angle"]
        img = raw.rotate(phi, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
        boxes = [G.poly_box(w["polygon"], phi, p["width"] / 2, p["height"] / 2) for w in words]
        scores[s] = darkness_in(img, boxes, k)
    sign = max(scores, key=scores.get)
    log.info("tilt direction: sign=%+d (ink in word boxes: %s)", sign, {s: round(v, 3) for s, v in scores.items()})
    return sign
