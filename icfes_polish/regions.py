"""Picture candidates on a unit crop: ink that is not text, grouped into boxes and numbered on the image.
The model then names regions by number instead of guessing coordinates (models place boxes poorly)."""
from __future__ import annotations

import re

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .images import blue_mask


def layout_words(layout: dict, text: bool = False) -> dict[int, list]:
    """Word boxes per page in inches, from the saved Azure layout result (with the word as a fifth item if text)."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        for p in r.get("pages", []):
            for w in p.get("words", []):
                xs, ys = w["polygon"][0::2], w["polygon"][1::2]
                b = (min(xs), min(ys), max(xs), max(ys))
                out.setdefault(p["pageNumber"] + off, []).append(b + (w.get("content", ""),) if text else b)
    return out


def layout_lines(layout: dict) -> dict[int, list]:
    """OCR lines per page: (x0, y0, x1, y1, text) in inches."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        for p in r.get("pages", []):
            for ln in p.get("lines", []):
                xs, ys = ln["polygon"][0::2], ln["polygon"][1::2]
                out.setdefault(p["pageNumber"] + off, []).append((min(xs), min(ys), max(xs), max(ys), ln.get("content", "")))
    return out


def unit_ocr(segments: list[dict], lines: dict, dpi: int) -> str:
    """The raw OCR text inside a unit's crop, segment by segment, top to bottom."""
    out = []
    for s in segments:
        x0, y0, x1, y1 = s["box_px"]
        sel = []
        for lx0, ly0, lx1, ly1, t in lines.get(s["page"], []):
            cx, cy = (lx0 + lx1) / 2 * dpi, (ly0 + ly1) / 2 * dpi
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                sel.append((ly0, lx0, t))
        out += [t for _, _, t in sorted(sel)]
    return "\n".join(out)


def words_in_crop(segments: list[dict], words: dict, dpi: int) -> list[tuple[int, int, int, int]]:
    """Word boxes moved into the crop image's pixel frame (segments stacked vertically)."""
    out = []
    for s in segments:
        x0, y0, x1, y1 = s["box_px"]
        for w in words.get(s["page"], []):
            wx0, wy0, wx1, wy1 = (v * dpi for v in w[:4])
            if wx1 < x0 or wx0 > x1 or wy1 < y0 or wy0 > y1:
                continue
            out.append((int(wx0 - x0), int(wy0 - y0 + s["y_in_image"]), int(wx1 - x0), int(wy1 - y0 + s["y_in_image"])) + tuple(w[4:]))
    return out


def propose(img: Image.Image, word_boxes: list, min_frac: float = 0.004) -> list[tuple[int, int, int, int]]:
    a = np.array(img.convert("RGB"))
    h, w = a.shape[:2]
    gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    ink = (gray < 170) & ~blue_mask(a)
    for x0, y0, x1, y1, *_ in word_boxes:  # text is not a picture
        ink[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2] = False
    k = 21
    m = cv2.morphologyEx(ink.astype("uint8") * 255, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m)
    boxes = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if bw * bh < min_frac * w * h or min(bw, bh) < 24:
            continue
        if max(bw, bh) > 10 * min(bw, bh) and min(bw, bh) < 60:
            continue  # rules, hatched bars and column lines are page furniture
        if area < 0.12 * bw * bh and min(bw, bh) < 80:
            continue
        boxes.append([x, y, x + bw, y + bh])
    # merge boxes that overlap or nearly touch
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a1, b1 = boxes[i], boxes[j]
                if a1[0] < b1[2] and b1[0] < a1[2] and a1[1] < b1[3] and b1[1] < a1[3]:
                    boxes[i] = [min(a1[0], b1[0]), min(a1[1], b1[1]), max(a1[2], b1[2]), max(a1[3], b1[3])]
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break
    # small pieces are fine: the model names every piece of a picture and the pieces are joined afterwards
    boxes.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    out = [(max(0, b[0] - 3), max(0, b[1] - 3), min(w, b[2] + 3), min(h, b[3] + 3)) for b in boxes[:30]]
    return sorted(out, key=lambda b: (b[1], b[0]))


def marked(img: Image.Image, boxes: list) -> Image.Image:
    """The crop with each candidate drawn and numbered, for the model to refer to."""
    im = img.convert("RGB").copy()
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", max(18, im.width // 45))
    except OSError:
        font = ImageFont.load_default()
    for i, (x0, y0, x1, y1) in enumerate(boxes, 1):
        d.rectangle([x0, y0, x1, y1], outline=(230, 0, 0), width=4)
        tw = d.textlength(str(i), font=font)
        d.rectangle([x0, y0, x0 + tw + 10, y0 + font.size + 8], fill=(230, 0, 0))
        d.text((x0 + 5, y0 + 3), str(i), fill=(255, 255, 255), font=font)
    return im


def grow_over_labels(box, word_boxes, rounds: int = 2):
    """A picture keeps its own labels: take in words that touch or overlap the joined box."""
    x0, y0, x1, y1 = box
    for _ in range(rounds):
        for wx0, wy0, wx1, wy1, *_ in word_boxes:
            if wx0 <= x1 + 4 and wx1 >= x0 - 4 and wy0 <= y1 + 4 and wy1 >= y0 - 4:
                x0, y0, x1, y1 = min(x0, wx0), min(y0, wy0), max(x1, wx1), max(y1, wy1)
    return x0, y0, x1, y1


def _infer_letter(letters: dict, lh: float) -> dict:
    order = "ABCD"
    miss = next(L for L in order if L not in letters)
    pts = {L: (b[0], b[1]) for L, b in letters.items()}
    xs, ys = [p[0] for p in pts.values()], [p[1] for p in pts.values()]
    w, h = letters[next(iter(letters))][2] - letters[next(iter(letters))][0], lh
    if max(ys) - min(ys) < 2 * lh or max(xs) - min(xs) < 2 * lh:  # one row or one column
        axis = 0 if max(ys) - min(ys) < 2 * lh else 1
        i = order.index(miss)
        known = sorted((order.index(L), p) for L, p in pts.items())
        prev = [k for k in known if k[0] < i]
        nxt = [k for k in known if k[0] > i]
        if prev and nxt:
            v = (prev[-1][1][axis] + nxt[0][1][axis]) / 2
        elif prev:
            v = prev[-1][1][axis] + (prev[-1][1][axis] - prev[-2][1][axis])
        else:
            v = nxt[0][1][axis] - (nxt[1][1][axis] - nxt[0][1][axis])
        other = sum(p[1 - axis] for p in pts.values()) / 3
        x, y = (v, other) if axis == 0 else (other, v)
    else:  # 2 x 2: A B / C D
        x = pts[{"A": "C", "B": "D", "C": "A", "D": "B"}[miss]][0]
        y = pts[{"A": "B", "B": "A", "C": "D", "D": "C"}[miss]][1]
    out = dict(letters)
    out[miss] = (int(x), int(y), int(x + w), int(y + h))
    return out


_LETTER = re.compile(r"^\(?([A-D])[.)]?$")


def option_cells(box, word_boxes, regions, pad: int = 60):
    """Split a picture that holds picture options at the printed option letters (A. B. C. D.): each picture piece
    (ink region) goes to the nearest letter at or above it. Returns ({letter: cell}, rest) where rest is the part
    above the options (a table or drawing of the stem), or None."""
    x0, y0, x1, y1 = box
    letters = {}
    for wx0, wy0, wx1, wy1, *t in word_boxes:
        m = _LETTER.match((t[0] if t else "").strip())
        if m and wx1 >= x0 - pad and wx0 <= x1 + pad and wy1 >= y0 - pad and wy0 <= y1 + pad:
            letters.setdefault(m.group(1), (wx0, wy0, wx1, wy1))
    if len(letters) < 2:
        return {}, box
    lh = max(b[3] - b[1] for b in letters.values())
    if len(letters) == 3:  # the answer mark often hides one letter from OCR: put it where the layout says
        letters = _infer_letter(letters, lh)
    top = min(b[1] for b in letters.values()) - lh
    cells, rest = {}, None
    for r in regions:
        if r[2] < x0 or r[0] > x1 or r[3] < y0 or r[1] > y1:
            continue
        inside = sum(r[0] <= (b[0] + b[2]) / 2 <= r[2] and r[1] <= (b[1] + b[3]) / 2 <= r[3] for b in letters.values())
        if inside >= 2:
            continue  # a box around several options (a layout figure box) says nothing about any one of them
        if r[3] <= top + lh:
            rest = r if rest is None else (min(rest[0], r[0]), min(rest[1], r[1]), max(rest[2], r[2]), max(rest[3], r[3]))
            continue
        best, bd = None, 1e18
        for L, (lx0, ly0, lx1, ly1) in letters.items():
            dx = max(0, r[0] - lx1, lx0 - r[2])
            dy = max(0, r[1] - ly1, ly0 - r[3])
            d = (dx * dx + dy * dy) ** 0.5 + (1e6 if r[3] < ly0 else 0)
            if d < bd:
                best, bd = L, d
        c = cells.get(best)
        cells[best] = r if c is None else (min(c[0], r[0]), min(c[1], r[1]), max(c[2], r[2]), max(c[3], r[3]))
    if len(cells) < 2:
        return {}, box
    return cells, rest
