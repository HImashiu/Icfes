"""Paragraph breaks taken from the booklet itself.

Older goldens often hold a whole stimulus as one paragraph ("... los siguientes pasos: Paso 1. ... Paso 2. ...").
Azure's layout result already knows where each printed paragraph starts, so this pass finds the first words of every
Azure paragraph inside a unit's crop and starts a new paragraph there when the field runs them together.
No model is involved: a break is added only where the exact printed words are found.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

from .fields import fields, set_field

PREFIX_WORDS = 5     # words of a printed paragraph that must match the field text
NUM = re.compile(r"^\s*(\d{1,3}\.)\s+")  # the question number that opens a booklet paragraph


def layout_paragraphs(layout: dict) -> dict[int, list]:
    """Azure paragraphs per page: (x0, y0, x1, y1, text) in inches."""
    out: dict[int, list] = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        off = ch.get("page_offset", 0)
        for p in r.get("paragraphs", []):
            if p.get("role") in ("pageHeader", "pageFooter", "pageNumber"):
                continue
            for br in p.get("boundingRegions", [])[:1]:
                xs, ys = br["polygon"][0::2], br["polygon"][1::2]
                out.setdefault(br["pageNumber"] + off, []).append((min(xs), min(ys), max(xs), max(ys), p.get("content", "")))
    return out


def _fold(c: str) -> str:
    return unicodedata.normalize("NFKD", c)[0].lower()


def plain_map(text: str) -> tuple[str, list[int]]:
    """Text with tags, markdown marks and spacing removed, plus the index in text of every kept character."""
    out, idx, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c == "<":
            j = text.find(">", i)
            if j < 0:
                break
            if re.match(r"</?(p|div|br|li|tr|td|th)\b", text[i:j + 1], re.I):
                out.append(" "); idx.append(i)
            i = j + 1
            continue
        if c in "*_$\\":
            i += 1
            continue
        if text.startswith("[[figura:", i):
            i = text.find("]]", i) + 2 if text.find("]]", i) > 0 else n
            continue
        out.append(" " if c.isspace() else _fold(c)); idx.append(i)
        i += 1
    return "".join(out), idx


def _words(s: str) -> list[str]:
    s = re.sub(r"(\w)- (\w)", r"\1\2", s)  # "ini- cial" printed across a line break
    return re.findall(r"\w+|[^\w\s]", "".join(_fold(c) for c in s))


def _in_table(text: str, at: int) -> bool:
    before = text[:at]
    return before.rfind("<table") > before.rfind("</table>")


def split_at(text: str, at: int) -> str:
    """Start a new paragraph at index at, keeping the opening tag of the paragraph it was in."""
    head, tail = text[:at].rstrip(), text[at:].lstrip()
    open_p = head.rfind("<p")
    if open_p >= 0 and head.rfind("</p>") < open_p:
        tag = head[open_p:head.find(">", open_p) + 1]
        return head + "</p>\n\n" + tag + tail
    if "<" in head[-1:]:
        return text
    return head + "\n\n" + tail


def paragraph_starts(text: str, starts: list[str]) -> list[int]:
    """Indexes in text where a printed paragraph begins mid-paragraph."""
    plain, idx = plain_map(text)
    toks = [(m.group(0), m.start()) for m in re.finditer(r"\w+|[^\w\s]", plain)]
    words = [t for t, _ in toks]
    found = set()
    for s in starts:
        want = _words(NUM.sub("", s))[:PREFIX_WORDS]
        if len(want) < 3:
            continue
        hits = [k for k in range(1, len(words) - len(want) + 1) if words[k:k + len(want)] == want]
        if len(hits) != 1:
            continue  # absent, or ambiguous: leave the text alone
        k = hits[0]
        at = idx[toks[k][1]]
        before = text[:at].rstrip()
        if not before or before.endswith((">", "\n")) or _in_table(text, at):
            continue  # already a paragraph start, or inside a table
        tail = re.sub(r"<[^>]+>$", "", before)
        if not re.search(r"[.:;?!)»”\"]\s*(\*\*|</strong>)?$", tail):
            continue  # the previous printed paragraph must have ended a sentence
        if re.search(r"(^|[\s>(])(\*\*)?(\d{1,2}|[a-zA-Z]|[IVX]{1,4})[.)](\*\*)?$", tail):
            continue  # "1." or "a)" is a list number printed in front of this text, not the end of a paragraph
        found.add(at)
    return sorted(found, reverse=True)


def page_sizes(layout: dict) -> dict[int, tuple[float, float]]:
    out = {}
    for ch in layout.get("chunks", [{"result": layout}]):
        r = ch.get("result", ch)
        r = r.get("analyzeResult", r)
        for p in r.get("pages", []):
            out[p["pageNumber"] + ch.get("page_offset", 0)] = (p["width"], p["height"])
    return out


def block_start(text: str, words: list[str]) -> int | None:
    """Index of the paragraph block of text that opens with these words, if exactly one does."""
    hits = []
    for m in re.finditer(r"(?:^|\n\n)(<p[^>]*>)?", text):
        at = m.end()
        plain, _ = plain_map(text[at:at + 400])
        if _words(plain)[:len(words)] == words:
            hits.append(m.start() + (2 if text[m.start():m.start() + 2] == "\n\n" else 0))
    return hits[0] if len(set(hits)) == 1 else None


def reposition(text: str, fig: dict, unit_paras: list, size: tuple[float, float]) -> str:
    """Move a picture that was added at the end of a field to where it is printed: just before the first paragraph
    printed below it in the same column."""
    tok = f"[[figura:{fig['figure_id']}]]"
    if not text.rstrip().endswith(tok) or text.count(tok) != 1:
        return text
    x0, y0, x1, y1 = (v * size[i % 2] for i, v in enumerate(fig["box_page_fraction"]))
    below = [p for p in unit_paras if p[1] >= y1 - 0.05 and min(p[2], x1) - max(p[0], x0) > 0.3 * min(p[2] - p[0], x1 - x0)]
    if not below:
        return text
    nxt = min(below, key=lambda p: p[1])
    want = _words(NUM.sub("", nxt[4]))[:PREFIX_WORDS]
    body = text.rstrip()[:-len(tok)].rstrip()
    at = block_start(body, want) if len(want) >= 3 else None
    if at is None or at == 0:
        return text
    return body[:at].rstrip() + "\n\n" + tok + "\n\n" + body[at:].lstrip()


def drop_text_in_picture(text: str, fig: dict, page_paras: list, size: tuple[float, float]) -> tuple[str, int]:
    """Remove a typed paragraph whose printed words sit inside the picture's crop (a boxed note or a caption drawn
    in the figure), so it does not show twice. Only whole blocks that match the printed paragraph word for word go."""
    x0, y0, x1, y1 = (v * size[i % 2] for i, v in enumerate(fig["box_page_fraction"]))
    h, w = y1 - y0, x1 - x0
    # a note drawn inside the picture: well inside the box and narrower than it. A full-width paragraph at the edge
    # means the crop is too big, and then the text stays (the crop is flagged instead).
    inside = [p for p in page_paras if x0 <= (p[0] + p[2]) / 2 <= x1 and y0 + 0.15 * h <= (p[1] + p[3]) / 2 <= y1 - 0.15 * h
              and p[2] - p[0] < 0.7 * w]
    gone = 0
    for p in inside:
        want = _words(NUM.sub("", p[4]))
        if len(want) < 5:
            continue  # labels inside a drawing are short; only sentences are worth removing
        blocks = re.split(r"(\n\s*\n)", text)
        for i, b in enumerate(blocks):
            if "[[figura:" in b or "<table" in b:
                continue
            if _words(plain_map(b)[0]) == want:
                blocks[i] = ""
                gone += 1
                break
        text = re.sub(r"\n{3,}", "\n\n", "".join(blocks)).strip()
    return text, gone


def justify(text: str) -> str:
    """Prose paragraphs the model left bare get the booklet's justified paragraph tag, like the hand-finished goldens."""
    out = []
    for b in re.split(r"\n\s*\n", text or ""):
        t = b.strip()
        if t and not t.startswith(("<", "[[", "|", "- ", "* ")) and len(plain_map(t)[0].strip()) > 80:
            t = f'<p style="text-align:justify">{t}</p>'
        out.append(t)
    return "\n\n".join(x for x in out if x)


def run(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    meta = json.load(open(a.meta, encoding="utf-8"))["units"]
    paras = layout_paragraphs(json.load(open(a.layout, encoding="utf-8")))
    layout = json.load(open(a.layout, encoding="utf-8"))
    sizes = page_sizes(layout)
    figs = json.load(open(a.manifest, encoding="utf-8"))["figures"] if a.manifest else []
    f = fields(golden)
    rep = {}
    for uid, u in meta.items():
        starts, unit_paras = [], {}
        for s in u.get("segments") or []:
            x0, y0, x1, y1 = s["box_in"]
            for p in paras.get(s["page"], []):
                cx, cy = (p[0] + p[2]) / 2, (p[1] + p[3]) / 2
                if x0 <= cx <= x1 and y0 <= cy <= y1:
                    starts.append(p[4])
                    unit_paras.setdefault(s["page"], []).append(p)
        keys = [k for k in f if k.split(".")[0] == uid and not k.endswith((".A", ".B", ".C", ".D", ".dir"))]
        for k in keys:
            new = justify(f[k])
            cuts = paragraph_starts(new, starts)
            for at in cuts:
                new = split_at(new, at)
            for fig in figs:
                if fig.get("field") == k and not fig.get("option") and fig.get("page") in sizes:
                    new, gone = drop_text_in_picture(new, fig, paras.get(fig["page"], []), sizes[fig["page"]])
                    if gone:
                        rep.setdefault(uid, []).append({"field": k, "typed_text_inside_picture_removed": gone})
                    moved = reposition(new, fig, unit_paras.get(fig["page"], []), sizes[fig["page"]])
                    if moved != new:
                        new = moved
                        rep.setdefault(uid, []).append({"field": k, "moved": fig["figure_id"]})
            if new != f[k]:
                set_field(golden, k, new)
                rep.setdefault(uid, []).append({"field": k, "breaks": len(cuts)}) if cuts else None
    json.dump(golden, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.report:
        json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"paragraph breaks: {sum(x.get('breaks', 0) for v in rep.values() for x in v)}, pictures moved to their printed place: "
          f"{sum('moved' in x for v in rep.values() for x in v)}, in {len(rep)} units")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_polish.paragraphs")
    ap.add_argument("--golden", required=True)
    ap.add_argument("--meta", required=True, help="the format build's .meta.json (crop segments per unit)")
    ap.add_argument("--layout", required=True)
    ap.add_argument("--manifest", help="figure manifest: pictures added at the end of a field move to their printed place")
    ap.add_argument("--out", required=True)
    ap.add_argument("--report")
    return run(ap.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
