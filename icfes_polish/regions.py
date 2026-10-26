"""Picture candidates on a unit crop: ink that is not text, grouped into boxes and numbered on the image.
The model then names regions by number instead of guessing coordinates (models place boxes poorly)."""
from __future__ import annotations

import re

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .images import blue_mask


# Print that is not part of any question: the booklet's code, the PRUEBA badge, "CONTINÚE ABAJO" and the like.
CHROME = re.compile(r"^(\s*(PRUEBA(\s+S11-\w+)?|S11-[A-Z]\d*|CONT[IÍ]N[UÚ]E(\s+(ABAJO|ATR[AÁ]S|EN LA SIGUIENTE P[AÁ]GINA))?|S\dPS11\w*)\s*)+$", re.I)
HAND_CONF = 0.7  # Azure's handwriting score from which a span counts as a student's pencil work


def handwritten(r: dict) -> list[tuple[int, int]]:
    """Character spans Azure marks as handwriting (students' pencil work on the scans)."""
    return [(sp["offset"], sp["offset"] + sp["length"]) for st in r.get("styles", [])
            if st.get("isHandwritten") and st.get("confidence", 1) >= HAND_CONF for sp in st.get("spans", [])]


def _in_spans(sp: dict | None, spans: list) -> bool:
    if not sp:
        return False
    o = sp.get("offset", -1)
    return any(a <= o < b for a, b in spans)


def layout_words(layout: dict, text: bool = False) -> dict[int, list]:
    """Word boxes per page in inches, from the saved Azure layout result (with the word as a fifth item if text).
    Handwritten words are left out."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        hand = handwritten(r)
        for p in r.get("pages", []):
            for w in p.get("words", []):
                if hand and _in_spans(w.get("span"), hand):
                    continue
                xs, ys = w["polygon"][0::2], w["polygon"][1::2]
                b = (min(xs), min(ys), max(xs), max(ys))
                out.setdefault(p["pageNumber"] + off, []).append(b + (w.get("content", ""),) if text else b)
    return out


def layout_lines(layout: dict) -> dict[int, list]:
    """OCR lines per page: (x0, y0, x1, y1, text) in inches. Handwritten lines and the booklet's page chrome
    (PRUEBA S11-X, CONTINÚE ABAJO, the booklet code, page numbers) are left out."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        hand = handwritten(r)
        for p in r.get("pages", []):
            for ln in p.get("lines", []):
                spans = ln.get("spans") or []
                if hand and spans and all(_in_spans(sp, hand) for sp in spans):
                    continue
                if CHROME.match(ln.get("content", "").strip()):
                    continue
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


def clip(b, c):
    return (max(b[0], c[0]), max(b[1], c[1]), min(b[2], c[2]), min(b[3], c[3]))


def option_partitions(letters: dict, box, lh: float) -> dict:
    """The page area of each option: rows of letters top to bottom, and in a row each letter owns the space from just
    before it to just before the next letter. A list gives one full-width cell per option, a 2x2 grid four cells."""
    x0, y0, x1, y1 = box
    rows: list[list] = []
    for L, b in sorted(letters.items(), key=lambda kv: kv[1][1]):
        if rows and abs(b[1] - rows[-1][0]) < 2 * lh:
            rows[-1][1].append((L, b))
        else:
            rows.append([b[1], [(L, b)]])
    out = {}
    for i, (ry, items) in enumerate(rows):
        top = ry - 0.6 * lh if i else min(y0, ry - 0.6 * lh)
        bottom = rows[i + 1][0] - 0.6 * lh if i + 1 < len(rows) else max(y1, ry + lh)
        items.sort(key=lambda it: it[1][0])
        for j, (L, b) in enumerate(items):
            left = b[0] - 0.5 * lh if j else min(x0, b[0] - 0.5 * lh)
            right = items[j + 1][1][0] - 0.5 * lh if j + 1 < len(items) else max(x1, b[2])
            out[L] = (left, top, right, bottom)
    return out


def _inter(a, b) -> float:
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def anchor_letter(r, letters: dict, lh: float):
    """The option a picture piece belongs to: the printed letter that comes last before it in reading order, that is
    the nearest letter starting left of the piece's centre on the closest row at or above it. This holds both for
    letters printed at the left of their picture and for letters centred above it."""
    cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    cand = {L: b for L, b in letters.items() if b[0] <= cx + lh and b[1] <= cy + lh}
    if not cand:
        return None
    row = max(b[1] for b in cand.values())
    same = {L: b for L, b in cand.items() if row - b[1] < 2 * lh}
    return max(same, key=lambda L: same[L][0])


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
    parts = option_partitions(letters, box, lh)
    cells, rest, owned = {}, None, []
    for r in regions:
        if r[2] < x0 or r[0] > x1 or r[3] < y0 or r[1] > y1:
            continue
        inside = sum(r[0] <= (b[0] + b[2]) / 2 <= r[2] and r[1] <= (b[1] + b[3]) / 2 <= r[3] for b in letters.values())
        if inside >= 2:
            continue  # a box around several options (a layout figure box) says nothing about any one of them
        if r[3] <= top + lh:
            rest = r if rest is None else (min(rest[0], r[0]), min(rest[1], r[1]), max(rest[2], r[2]), max(rest[3], r[3]))
            continue
        L = anchor_letter(r, letters, lh)
        if L:
            owned.append((r, L))
    # a region that holds pieces owned by other options is a frame around several of them, not a picture of one
    for r, L in owned:
        area = max(1, (r[2] - r[0]) * (r[3] - r[1]))
        holds = {L2 for r2, L2 in owned if r2 is not r and L2 != L and _inter(r, r2) > 0.6 * max(1, (r2[2] - r2[0]) * (r2[3] - r2[1]))}
        if holds:
            continue
        c = cells.get(L)
        cells[L] = r if c is None else (min(c[0], r[0]), min(c[1], r[1]), max(c[2], r[2]), max(c[3], r[3]))
    plain = [w for w in word_boxes if not _LETTER.match(str(w[4] if len(w) > 4 else "").strip())]
    grown = {}
    for L, c in cells.items():
        g = grow_over_labels(c, plain)
        # labels are taken in only while the box stays out of the other options' pictures
        grown[L] = c if any(_inter(g, c2) > 0.1 * max(1, (c2[2] - c2[0]) * (c2[3] - c2[1])) for L2, c2 in cells.items() if L2 != L) else g
    cells = grown
    if len(cells) < 2:
        return {}, box
    return cells, rest


def shave_text_rows(box, core, word_boxes, min_words: int = 5, min_cover: float = 0.5):
    """Cut sentence lines that taking in labels pulled above or below the picture (outside its ink, `core`): a row of
    many words spanning most of the width is the question's text, not a label."""
    x0, y0, x1, y1 = box
    # words cut by the top or bottom edge count too: a half-visible sentence line is still the question's text
    inside = [w for w in word_boxes if w[0] >= x0 - 4 and w[2] <= x1 + 4 and w[3] > y0 and w[1] < y1]
    rows: list[list] = []
    for w in sorted(inside, key=lambda w: (w[1] + w[3]) / 2):
        cy = (w[1] + w[3]) / 2
        if rows and abs(cy - rows[-1][0]) < 0.6 * (w[3] - w[1]):
            rows[-1][1].append(w)
        else:
            rows.append([cy, [w]])
    def texty(r):
        ws = r[1]
        return len(ws) >= min_words and (max(w[2] for w in ws) - min(w[0] for w in ws)) >= min_cover * (x1 - x0)
    def sentence_end(r):  # the short last line of a sentence cut above: starts at the left, ends in . or :
        ws = sorted(r[1], key=lambda w: w[0])
        return len(ws) <= 5 and ws[0][0] - x0 < 0.15 * (x1 - x0) and str(ws[-1][4] if len(ws[-1]) > 4 else "").endswith((".", ":"))
    top_cut = False
    while rows and (rows[0][0] < core[1] or rows[0][1][0][1] < y0 or top_cut) and (texty(rows[0]) or top_cut and sentence_end(rows[0])):
        was_texty = texty(rows[0])
        y0 = max(w[3] for w in rows.pop(0)[1]) + 2
        top_cut = was_texty
    while rows and rows[-1][0] > core[3] and texty(rows[-1]):
        y1 = min(w[1] for w in rows.pop()[1]) - 2
    return (x0, y0, x1, y1) if y1 - y0 > 20 else box
