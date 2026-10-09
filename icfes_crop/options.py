"""Split a question's answer options using LINE geometry instead of text.

Option letters hang at the column's left margin and wrapped lines are indented, so the margin tells us where each
option starts even when the OCR dropped the letter (blue answer dot) or glued two options together.
"""
from __future__ import annotations

import bisect
import re
import statistics
from dataclasses import dataclass

from . import geometry as G

LETTER = re.compile(r"^\(?([A-D])\)?[\.\)](?:\s|$)")
STRIP = re.compile(r"^\(?[A-D]\)?[\.\)]?\s*|^[\.•●·]\s*")
LEFT_TOL = 0.20      # inches left of the margin (a dot/bubble before the letter)
RIGHT_TOL = 0.12     # inches right of the margin still counted as "at the margin"
MAX_GAP = 0.22       # vertical gap (inches) that ends the options block


@dataclass
class Line:
    page: int
    box: G.Box
    text: str
    chunk: int
    offset: int
    length: int = 0
    el: int | None = None


def collect_lines(doc: dict, sign: int, pages: dict) -> list[Line]:
    out: list[Line] = []
    for ci, ch in enumerate(doc["chunks"]):
        r, off = ch["result"], ch.get("page_offset", 0)
        for p in r["pages"]:
            gp = p["pageNumber"] + off
            pg = pages[gp]
            content = r.get("content", "")
            for ln in p.get("lines", []):
                sp = (ln.get("spans") or [None])[0]
                if not sp:
                    continue
                text = ln.get("content", "")
                if ":formula:" in text:  # line records hold a placeholder; the real LaTeX is in the content at the span
                    seg = content[sp["offset"]: sp["offset"] + sp.get("length", 0)].replace("\n", " ").strip()
                    text = seg or text
                out.append(Line(gp, G.poly_box(ln["polygon"], sign * pg.angle, pg.w / 2, pg.h / 2),
                                text, ci, sp["offset"], sp.get("length", len(text))))
    return out


def assign_lines(els: list, lines: list[Line]) -> None:
    """Attach each line to the paragraph/table that contains it (index into `els`)."""
    text_els = sorted((e.key[0], e.start, e.end, i) for i, e in enumerate(els) if e.kind in ("p", "t"))
    starts = [(c, s) for c, s, _, _ in text_els]
    for ln in lines:
        k = bisect.bisect_right(starts, (ln.chunk, ln.offset)) - 1
        if k >= 0:
            c, s, e_, i = text_els[k]
            if c == ln.chunk and s <= ln.offset < e_:
                ln.el = i


def split_options(lines: list[Line], expected: int | None, page_w: float | None = None,
                  page_lines: list[Line] | None = None) -> list[dict] | None:
    """`lines` = one question's lines in reading order. Returns [{'letter','text','restored'}] or None."""
    if not expected or len(lines) < expected:
        return None
    letter_idx = [i for i, l in enumerate(lines) if LETTER.match(l.text.strip())]
    if len(letter_idx) < 2:
        return None
    xs = [lines[i].box[0] for i in letter_idx]
    if max(xs) - min(xs) > 0.3:
        return None
    margin = statistics.median(xs)
    first = letter_idx[0]
    if LETTER.match(lines[first].text.strip()).group(1) == "B" and first > 0 \
            and abs(lines[first - 1].box[0] - margin) <= max(LEFT_TOL, RIGHT_TOL):
        first -= 1  # option A lost its letter (hidden by a dot)
    zone: list[Line] = []
    for l in lines[first:]:
        if zone and (l.box[1] - zone[-1].box[3]) > MAX_GAP:
            break
        zone.append(l)
    # width of this column's text, from ALL the question's lines in the same column (stem lines are long)
    if page_w:
        left_col = margin < page_w / 2
        pool = [l for l in (page_lines or lines) if l.page == zone[0].page]   # every line of the page, any owner
        same_col = [l for l in pool if ((l.box[2] <= page_w / 2 + 0.3) if left_col else (l.box[0] >= page_w / 2 - 0.3))]
    else:
        same_col = lines
    col_right = max([l.box[2] for l in same_col] + [l.box[2] for l in zone])
    full = 0.7 * (col_right - margin)  # a line shorter than this did not wrap onto the next one

    def is_start(i: int) -> bool:
        dx = zone[i].box[0] - margin
        if -LEFT_TOL <= dx <= RIGHT_TOL:
            return True
        # indented, but the previous line was short, so this cannot be a wrapped continuation: the letter was hidden
        return i > 0 and dx > RIGHT_TOL and (zone[i - 1].box[2] - zone[i - 1].box[0]) < full \
            and zone[i].box[1] >= zone[i - 1].box[3] - 0.05

    starts = [i for i in range(len(zone)) if is_start(i)]
    if len(starts) < expected:
        return None
    # Lettered lines are trusted anchors. Letterless starts are only inferred for the letters that are missing;
    # if their number does not match, the layout is ambiguous (e.g. "Paso 1 / Paso 2" lines inside one option).
    lettered = [i for i in starts if LETTER.match(zone[i].text.strip())]
    if len(lettered) < expected and (len(starts) - len(lettered)) != (expected - len(lettered)):
        return None
    starts = starts[:expected] + [len(zone) if len(starts) == expected else starts[expected]]
    options = []
    for k in range(expected):
        chunk = zone[starts[k]:starts[k + 1]]
        head = chunk[0].text.strip()
        head_clean = re.sub(r"^:(?:un)?selected:\s*", "", head)
        text = " ".join([STRIP.sub("", head_clean, count=1)] + [c.text.strip() for c in chunk[1:]]).strip()
        m = LETTER.match(head)
        marked = any(":selected:" in c.text for c in chunk)
        text = re.sub(r"\s*:(?:un)?selected:\s*", " ", text).strip()
        options.append({"letter": "ABCD"[k], "text": text, "marked": marked,
                        "restored": not (m and m.group(1) == "ABCD"[k])})
    return options if all(o["text"] for o in options) else None
