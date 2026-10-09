"""Remove OCR/layout noise from the Markdown produced by Document Intelligence."""
from __future__ import annotations

import re
from collections import Counter

COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
FIGURE_RE = re.compile(r"<figure>(.*?)</figure>\s*(!\[[^\]]*\]\([^)]+\))?", re.S)
IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
MARKS_ON = "☒☑⊠✓✔✘✗"
MARKS = MARKS_ON + "☐"
LIST_START = re.compile(rf"^(\d{{1,3}}\\?\.(?!\d)|\(?[A-Da-d]\)?\\?[\.\)](\s|$)|[{MARKS}])")


def _norm(s: str) -> str:
    return re.sub(r"[#\s]+", " ", s).strip().lower()


def strip_comments(md: str) -> str:
    return COMMENT_RE.sub("", md)


def split_figures(md: str) -> tuple[str, list[dict]]:
    """Replace <figure>OCR</figure>![alt](path) with just the image; return the OCR text separately."""
    figs: list[dict] = []

    def sub(m: re.Match) -> str:
        ocr = re.sub(r"\s+", " ", m.group(1)).strip()
        img = m.group(2)
        if not img:  # figure whose image could not be saved: keep its text so nothing is lost
            return f"\n\n{ocr}\n\n" if ocr else ""
        alt, path = IMG_RE.match(img).groups()
        figs.append({"path": path, "alt": alt, "ocr_text": ocr})
        return f"\n\n![{alt}]({path})\n\n"

    return FIGURE_RE.sub(sub, md), figs


def drop_running_furniture(md: str, figs: list[dict], min_repeats: int = 3, found: set | None = None) -> tuple[str, list[dict]]:
    """Drop short headings / ALL-CAPS lines / figure labels that repeat on many pages (running headers, logos)."""
    counts: Counter[str] = Counter()
    for line in md.split("\n"):
        t = line.strip()
        if t and len(t) <= 30 and not LIST_START.match(t) and (t.startswith("#") or t == t.upper()) \
                and not t.startswith(("<", "!", "|")):
            counts[_norm(t)] += 1
    for f in figs:
        if f["ocr_text"] and len(f["ocr_text"]) <= 30:
            counts[_norm(f["ocr_text"])] += 1
    furniture = {k for k, v in counts.items() if v >= min_repeats and len(k) >= 3 and not k.isdigit()}
    if found is not None:
        found |= furniture
    out_lines = []
    for line in md.split("\n"):
        t = line.strip()
        if t and _norm(t) in furniture and not t.startswith(("<", "!", "|")) and not LIST_START.match(t):
            continue
        out_lines.append(line)
    md = "\n".join(out_lines)
    kept = []
    for f in figs:
        if f["ocr_text"] and _norm(f["ocr_text"]) in furniture:
            md = md.replace(f"![{f['alt']}]({f['path']})", "")
        else:
            kept.append(f)
    return md, kept


def reflow(md: str) -> list[str]:
    """Join soft-wrapped lines and undo end-of-line hyphenation. Returns one string per paragraph/list item."""
    items: list[str] = []
    carry_mark = ""
    for block in re.split(r"\n\s*\n", md):
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        if any(l.startswith(("<", "|", "!", "#")) for l in lines):
            # structural block (table, image, heading): keep line structure; headings become their own items
            buf: list[str] = []
            for l in lines:
                if l.startswith(("#", "!")) or l.startswith("<table"):
                    if buf:
                        items.append("\n".join(buf)); buf = []
                    items.append(l) if l.startswith(("#", "!")) else buf.append(l)
                else:
                    buf.append(l)
            if buf:
                items.append("\n".join(buf))
            continue
        # Selection marks (☒) replace a lost option letter. Position decides what the mark belongs to:
        #  - right after a lettered option line ("A. ...") it BEGINS the next option (that option's letter was hidden);
        #  - otherwise (block start, or inside a letterless option's wrapped text) it belongs to the start of the block.
        block_mark, kept = "", []
        for l in lines:
            if l in tuple(MARKS):
                if kept and kept[-1] not in tuple(MARKS) and re.match(r"^\(?[A-D]\)?[\.\)](\s|$)", kept[-1]):
                    kept.append(l)          # boundary mark: handled in the loop below
                elif not block_mark:
                    block_mark = l
            else:
                kept.append(l)
        lines = kept
        mark = block_mark or carry_mark
        carry_mark = ""
        if not lines:  # a block that is only a mark belongs to the next block
            carry_mark = mark
            continue
        if mark:
            lines[0] = f"{mark} {lines[0]}"
        cur = ""
        boundary = ""
        for l in lines:
            if l in tuple(MARKS):                 # boundary mark: the next line starts a new option
                if cur:
                    items.append(cur); cur = ""
                boundary = l
                continue
            if boundary:
                l, boundary = f"{boundary} {l}", ""
            starts_item = bool(LIST_START.match(l))
            if cur and starts_item:
                items.append(cur); cur = l
            elif not cur:
                cur = l
            elif cur.endswith("-") and l[:1].islower() and cur[-2:-1].isalpha():
                cur = cur[:-1] + l
            else:
                cur += " " + l
        if cur:
            items.append(cur)
    return items


MATH = re.compile(r"\$[^$\n]{1,300}\$")


def tidy_math(md: str) -> str:
    """Azure's formula OCR spaces digits out ("1 0 0", "0 , 5"); inside $...$ those spaces are meaningless."""
    def fix(m: re.Match) -> str:
        t = m.group(0)
        for _ in range(3):
            t = re.sub(r"(?<=\d) (?=\d)", "", t)
        return re.sub(r"(?<=\d) ?, ?(?=\d)", ",", t)
    return MATH.sub(fix, md)


def clean(md: str, furniture_out: set | None = None) -> tuple[list[str], list[dict]]:
    md = tidy_math(strip_comments(md))
    md, figs = split_figures(md)
    md, figs = drop_running_furniture(md, figs, found=furniture_out)
    return reflow(md), figs
