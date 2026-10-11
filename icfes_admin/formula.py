"""Turning a box around a printed formula into LaTeX.

ICFES booklets print many formulas in words, for example

        Tiempo de           Volumen del lago (m³)
    retención (años) =  ─────────────────────────
                             Cauce (m³/años)

OCR reads those as separate lines and loses the fraction. Here the fraction bars are found in the pixels of the box
(a long, thin, dark horizontal run), the OCR lines above and below each bar become its numerator and denominator,
and everything else on the main line is read left to right. Words go in \\text{...}, units such as m3 become m^{3}.
"""
from __future__ import annotations

import re
from typing import NamedTuple


class Bar(NamedTuple):
    x0: float  # fractions of the box
    x1: float
    y: float


# ----- fraction bars in the pixels -------------------------------------------------------------

def find_bars(samples, width, height, channels, dark=140, min_frac=0.08, max_thick=0.025):
    """Horizontal rules in the picture: runs of dark pixels at least min_frac of the width long and at most max_thick
    of the height thick. A line of text never has a run that long; underlines and table borders can, so callers keep
    only bars with text both above and below."""
    stride = width * channels
    table = bytes(49 if v < dark else 48 for v in range(256))  # dark -> "1"
    min_run = max(12, int(min_frac * width))
    rows = []  # (y, x0, x1) of the longest run in each row that has one
    for y in range(height):
        row = bytes(samples[y * stride:(y + 1) * stride:channels]).translate(table)
        best = max((m.span() for m in re.finditer(rb"1+", row)), key=lambda s: s[1] - s[0], default=None)
        if best and best[1] - best[0] >= min_run:
            rows.append((y, best[0], best[1]))
    bars, cur = [], []
    for r in rows:
        # neighbouring rows with an overlapping run are the same (thick) bar
        if cur and r[0] == cur[-1][0] + 1 and r[1] < cur[-1][2] and r[2] > cur[-1][1]:
            cur.append(r)
            continue
        if cur:
            bars.append(cur)
        cur = [r]
    if cur:
        bars.append(cur)
    out = []
    for b in bars:
        if len(b) > max(2, max_thick * height):
            continue  # a filled block, not a rule
        x0 = min(r[1] for r in b) / width
        x1 = max(r[2] for r in b) / width
        y = (b[0][0] + b[-1][0]) / 2 / height
        out.append(Bar(x0, x1, y))
    return out


# ----- lines to LaTeX ----------------------------------------------------------------------------

UNIT = re.compile(r"(?<![A-Za-zÀ-ÿ])(m|cm|mm|km|dm|s|g|kg|L)(?:([²³])|([23])(?![0-9]))")
SUPER = {"²": "2", "³": "3"}
OPERATORS = {"=": "=", "+": "+", "-": "-", "−": "-", "×": r"\times", "x": r"\times", "·": r"\cdot", "÷": r"\div"}
TEX_SPECIAL = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "%": r"\%", "$": r"\$", "#": r"\#", "&": r"\&", "_": r"\_"}


def words(text):
    """A phrase as LaTeX: words in \\text{...}, units with exponents outside it so they read m³."""
    text = " ".join(text.split())
    if not text:
        return ""
    out, pos = [], 0
    for m in UNIT.finditer(text):
        exp = SUPER.get(m.group(2)) if m.group(2) else m.group(3)
        out.append(_text(text[pos:m.start()] + m.group(1)) + "^{" + exp + "}")
        pos = m.end()
    out.append(_text(text[pos:]))
    return "".join(p for p in out if p)


def _text(s):
    if not s:
        return ""
    if re.fullmatch(r"[0-9.,]+", s.strip()):
        return s.strip()
    return r"\text{" + "".join(TEX_SPECIAL.get(c, c) for c in s) + "}"


def _phrase(lines):
    return " ".join(ln.text.strip() for ln in sorted(lines, key=lambda ln: (ln.cy, ln.cx)) if ln.text.strip())


def _piece(text):
    """One piece on the main line: an operator alone, or a phrase that may end or start with one."""
    text = text.strip()
    if text in OPERATORS:
        return OPERATORS[text]
    lead = trail = ""
    m = re.match(r"^([=+×÷·−])\s*(.*)$", text)
    if m:
        lead, text = OPERATORS[m.group(1)] + " ", m.group(2)
    m = re.match(r"^(.*?)\s*([=+×÷·−])$", text)
    if m:
        text, trail = m.group(1), " " + OPERATORS[m.group(2)]
    return lead + words(text) + trail


def to_latex(lines, bars):
    """LaTeX for the lines inside a box (Line tuples in box fractions) given the fraction bars found there."""
    lines = [ln for ln in lines if ln.text.strip()]
    if not lines:
        return ""
    used = set()
    fracs = []
    for bar in sorted(bars, key=lambda b: b.x0):
        inside = [i for i, ln in enumerate(lines) if i not in used and bar.x0 - 0.02 <= ln.cx <= bar.x1 + 0.02]
        num = [i for i in inside if lines[i].cy < bar.y]
        den = [i for i in inside if lines[i].cy > bar.y]
        if not num or not den:
            continue
        used.update(num + den)
        fracs.append((bar.x0, r"\frac{" + words(_phrase([lines[i] for i in num])) + "}{"
                      + words(_phrase([lines[i] for i in den])) + "}"))
    rest = [ln for i, ln in enumerate(lines) if i not in used]
    if not fracs:
        return " ".join(_piece(t) for t in _rows(rest))
    # The other lines sit between, before or after the fractions; lines in the same gap are one phrase even when
    # they are stacked ("Tiempo de" over "retención (años) =").
    edges = sorted(f[0] for f in fracs)
    groups = {}
    for ln in rest:
        slot = sum(1 for e in edges if ln.cx > e)
        groups.setdefault(slot, []).append(ln)
    parts = []
    for slot in range(len(fracs) + 1):
        if slot in groups:
            parts.append((slot - 0.5, _piece(_phrase(groups[slot]))))
    parts += [(i, tex) for i, (_, tex) in enumerate(sorted(fracs))]
    parts.sort(key=lambda p: p[0])
    # "Tiempo de retención  ───" with the = sign lost by the OCR: a definition still reads as one.
    if "=" not in " ".join(t for _, t in parts) and len(parts) > 1 and parts[0][0] < 0 and not parts[0][1].endswith(("+", "-", r"\times", r"\cdot", r"\div")):
        parts[0] = (parts[0][0], parts[0][1] + " =")
    # Full size; on a narrow screen the line can still break after the = sign.
    return r"\displaystyle " + " ".join(tex for _, tex in parts)


def _rows(lines):
    """Lines with no fraction: one phrase per row, top to bottom."""
    rows, cur = [], []
    for ln in sorted(lines, key=lambda ln: (ln.cy, ln.cx)):
        if cur and abs(ln.cy - cur[-1].cy) > 0.5 * max(ln.height, cur[-1].height):
            rows.append(cur)
            cur = []
        cur.append(ln)
    if cur:
        rows.append(cur)
    return [" ".join(ln.text.strip() for ln in sorted(r, key=lambda ln: ln.cx)) for r in rows]


# ----- formulas on a whole page ---------------------------------------------------------------------

class Found(NamedTuple):
    box: tuple  # x0, y0, x1, y1 in fractions of the page
    tex: str


def _right(ln):
    return 2 * ln.cx - ln.left


def _is_table_rule(samples, width, height, channels, bar, line_h):
    """A table border meets vertical borders (at its ends or across it); a fraction bar touches nothing. A vertical
    border shows as a dark run that starts at the bar and goes up or down at least most of a line height."""
    stride = width * channels
    need = max(6, int(line_h * height * 0.9))
    y = int(round(bar.y * height))

    def run(x, step):
        n, yy = 0, y
        while 0 <= yy < height and samples[yy * stride + x * channels] < 140:
            n, yy = n + 1, yy + step
        return n

    for x in range(max(0, int(bar.x0 * width) - 2), min(width, int(bar.x1 * width) + 2)):
        if run(x, -1) >= need or run(x, 1) >= need:
            return True
    return False


def find_formulas(samples, width, height, channels, lines):
    """Printed fractions on a page: each bar with short text right above and right below it, plus the words that
    sit on the same line to its left and right ("Tiempo de retención (años) ="). lines are OCR Line tuples in
    fractions of the page. Returns Found(box, tex) for each, top to bottom."""
    lines = [ln for ln in lines if ln.text.strip()]
    if not lines:
        return []
    med_h = sorted(ln.height for ln in lines)[len(lines) // 2]
    bars = find_bars(samples, width, height, channels, min_frac=0.03)
    out = []
    for bar in bars:
        if bar.x1 - bar.x0 > 0.45:
            continue  # rules across a column or the page
        near = 2.2 * med_h
        over = [ln for ln in lines if bar.x0 - 0.01 <= ln.cx <= bar.x1 + 0.01 and 0 < bar.y - ln.cy < near]
        under = [ln for ln in lines if bar.x0 - 0.01 <= ln.cx <= bar.x1 + 0.01 and 0 < ln.cy - bar.y < near]
        if not over or not under:
            continue
        # numerator and denominator are one or two short lines of ordinary print, centred on the bar
        if len(over) > 2 or len(under) > 2:
            continue
        mid, half = (bar.x0 + bar.x1) / 2, (bar.x1 - bar.x0) / 2
        if any(ln.left < bar.x0 - 0.03 or _right(ln) > bar.x1 + 0.03 or abs(ln.cx - mid) > 0.35 * half + 0.01
               or ln.height > 1.6 * med_h for ln in over + under):
            continue
        if _is_table_rule(samples, width, height, channels, bar, med_h):
            continue
        # a table without vertical borders: its row rule breaks into touching pieces at the same height
        if any(o is not bar and abs(o.y - bar.y) < 0.4 * med_h and (0 <= o.x0 - bar.x1 < 0.015 or 0 <= bar.x0 - o.x1 < 0.015)
               for o in bars):
            continue
        if any(len(ln.text.strip()) > 45 for ln in over + under):
            continue
        y0 = min(ln.cy - ln.height / 2 for ln in over)
        y1 = max(ln.cy + ln.height / 2 for ln in under)
        x0, x1 = bar.x0, bar.x1
        # words on the same line before and after the fraction, as long as they are close
        grew = True
        while grew:
            grew = False
            for ln in lines:
                if not (y0 - 0.2 * med_h <= ln.cy <= y1 + 0.2 * med_h) or _right(ln) - ln.left > 0.3:
                    continue
                if ln.left < x0 and x0 - _right(ln) < 0.06 and _right(ln) <= x0 + 0.01:
                    x0, grew = ln.left, True
                elif _right(ln) > x1 and ln.left - x1 < 0.06 and ln.left >= x1 - 0.01:
                    x1, grew = _right(ln), True
        box = (max(0.0, x0 - 0.005), max(0.0, y0 - 0.004), min(1.0, x1 + 0.005), min(1.0, y1 + 0.004))
        if any(f.box[0] <= (box[0] + box[2]) / 2 <= f.box[2] and f.box[1] <= (box[1] + box[3]) / 2 <= f.box[3] for f in out):
            continue  # a second bar of a formula already found
        bw, bh = box[2] - box[0], box[3] - box[1]
        inside = [ln for ln in lines if box[0] <= ln.cx <= box[2] and box[1] <= ln.cy <= box[3]]
        local = [type(ln)(ln.text, (ln.cx - box[0]) / bw, (ln.cy - box[1]) / bh, (ln.left - box[0]) / bw, ln.height / bh)
                 for ln in inside]
        in_bars = [Bar((b.x0 - box[0]) / bw, (b.x1 - box[0]) / bw, (b.y - box[1]) / bh) for b in bars
                   if box[0] <= (b.x0 + b.x1) / 2 <= box[2] and box[1] <= b.y <= box[3] and b.x1 - b.x0 <= 0.45]
        tex = to_latex(local, in_bars)
        if tex:
            out.append(Found(tuple(round(v, 4) for v in box), tex))
    return sorted(out, key=lambda f: (f.box[1], f.box[0]))
