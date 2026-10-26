"""Word check: every printed word of a question should be in its formatted text, and nothing else.

The OCR words inside a unit's crop (minus the pictures, which keep their own labels) are compared with the words of
all the unit's fields. Words the booklet prints but the text lacks were dropped; words the text has but the booklet
does not print were invented (or come from an old summary). Either way the unit goes to the review list.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter

from .fields import fields
from .regions import CHROME, layout_words

MIN_LEN = 3  # short words (de, la, y, numbers) are too common to tell anything


def norm(w: str) -> str:
    w = unicodedata.normalize("NFKD", w)
    return "".join(c for c in w if c.isalnum()).lower()


def text_words(t: str) -> list[str]:
    t = re.sub(r"\[\[[^\]]*\]\]", " ", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\\[a-zA-Z]+", " ", t)
    t = re.sub(r"(\w)- (\w)", r"\1\2", t)
    t = re.sub(r"^\s*\d{1,3}(?=[^\W\d])", " ", t)  # the question number OCR glued to the first word ("117la")
    return [n for n in (norm(w) for w in re.split(r"[\s/]+", t)) if len(n) >= MIN_LEN and not n.isdigit()]


def unit_words(unit: dict, words: dict, figs: list[dict], sizes: dict) -> list[str]:
    out = []
    for s in unit.get("segments") or []:
        x0, y0, x1, y1 = s["box_in"]
        pics = []
        for f in figs:
            if f.get("page") == s["page"] and s["page"] in sizes:
                W, H = sizes[s["page"]]
                b = f["box_page_fraction"]
                pics.append((b[0] * W, b[1] * H, b[2] * W, b[3] * H))
        held = ""
        for w in words.get(s["page"], []):
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if not (x0 <= cx <= x1 and y0 <= cy <= y1) or CHROME.match(w[4]):
                continue
            if any(p[0] <= cx <= p[2] and p[1] <= cy <= p[3] for p in pics):
                continue
            t = held + w[4]
            if t.endswith("-") and len(t) > 2:
                held = t[:-1]  # a word broken across a line: "con-" + "ceptos"
                continue
            held = ""
            out += text_words(t)
    return out


def check(golden: dict, meta: dict, layout: dict, manifest: dict | None) -> dict:
    from .paragraphs import page_sizes
    words, sizes = layout_words(layout, text=True), page_sizes(layout)
    f = fields(golden)
    figs = (manifest or {}).get("figures", [])
    rep = {}
    for uid, u in meta.items():
        printed = Counter(unit_words(u, words, [x for x in figs if x.get("field", "").split(".")[0] == uid], sizes))
        if not printed:
            continue
        typed = Counter(w for k, v in f.items() if k.split(".")[0] == uid for w in text_words(v))
        shared = Counter()
        # a question's crop often holds its group's shared text and the other questions of a cloze page, and a
        # group's crop holds its questions: those words are typed in the other units
        for g in golden.get("groups", []):
            span = range(g.get("from", 0), g.get("to", -1) + 1)
            if uid == g["id"] or (uid.startswith("q") and uid[1:].isdigit() and int(uid[1:]) in span):
                ids = {g["id"]} | {f"q{n}" for n in span}
                shared = Counter(w for k, v in f.items() if k.split(".")[0] in ids - {uid} for w in text_words(v))
        missing = printed - typed - shared
        extra = typed - printed
        n = sum(printed.values())
        if sum(missing.values()) > max(3, 0.05 * n) or sum(extra.values()) > max(3, 0.05 * n):
            rep[uid] = {"printed_words": n, "missing": sorted(missing.elements())[:25], "extra": sorted(extra.elements())[:25]}
    return rep


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_polish.coverage")
    ap.add_argument("--golden", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--layout", required=True)
    ap.add_argument("--manifest")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    rep = check(json.load(open(a.golden, encoding="utf-8")), json.load(open(a.meta, encoding="utf-8"))["units"],
                json.load(open(a.layout, encoding="utf-8")), json.load(open(a.manifest, encoding="utf-8")) if a.manifest else None)
    json.dump(rep, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"word check: {len(rep)} units with dropped or invented words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
