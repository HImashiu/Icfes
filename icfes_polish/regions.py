"""Picture candidates on a unit crop: ink that is not text, grouped into boxes and numbered on the image.
The model then names regions by number instead of guessing coordinates (models place boxes poorly)."""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .images import blue_mask


def layout_words(layout: dict) -> dict[int, list[tuple[float, float, float, float]]]:
    """Word boxes per page in inches, from the saved Azure layout result."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        for p in r.get("pages", []):
            for w in p.get("words", []):
                xs, ys = w["polygon"][0::2], w["polygon"][1::2]
                out.setdefault(p["pageNumber"] + off, []).append((min(xs), min(ys), max(xs), max(ys)))
    return out


def words_in_crop(segments: list[dict], words: dict, dpi: int) -> list[tuple[int, int, int, int]]:
    """Word boxes moved into the crop image's pixel frame (segments stacked vertically)."""
    out = []
    for s in segments:
        x0, y0, x1, y1 = s["box_px"]
        for w in words.get(s["page"], []):
            wx0, wy0, wx1, wy1 = (v * dpi for v in w)
            if wx1 < x0 or wx0 > x1 or wy1 < y0 or wy0 > y1:
                continue
            out.append((int(wx0 - x0), int(wy0 - y0 + s["y_in_image"]), int(wx1 - x0), int(wy1 - y0 + s["y_in_image"])))
    return out


def propose(img: Image.Image, word_boxes: list, min_frac: float = 0.004) -> list[tuple[int, int, int, int]]:
    a = np.array(img.convert("RGB"))
    h, w = a.shape[:2]
    gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    ink = (gray < 170) & ~blue_mask(a)
    for x0, y0, x1, y1 in word_boxes:  # text is not a picture
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
        for wx0, wy0, wx1, wy1 in word_boxes:
            if wx0 <= x1 + 4 and wx1 >= x0 - 4 and wy0 <= y1 + 4 and wy1 >= y0 - 4:
                x0, y0, x1, y1 = min(x0, wx0), min(y0, wy0), max(x1, wx1), max(y1, wy1)
    return x0, y0, x1, y1
