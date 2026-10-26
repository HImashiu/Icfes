"""Print details the OCR never reports, measured on the scan itself.

Bold: a bold word's strokes are about 1.4 times as thick as the regular text on the same page (measured as the
median length of the dark runs across each word box), which separates cleanly from regular words (1.0).
The pass adds **…** around bold phrases the formatted text has without bold.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

import numpy as np

from .fields import fields, set_field
from .regions import layout_words

BOLD = 1.35          # stroke ratio from which a word counts as bold (regular text ~1.0, short words up to ~1.3)
SKIP = re.compile(r"^(\d+\.?|[A-D]\.?|PRUEBA|S11-[A-Z]\d?|RESPONDA|PREGUNTAS?)$")  # numbers, option letters, headers


def _runs(a: np.ndarray) -> list[int]:
    out = []
    for row in a:
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        s, e = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        out += list(e - s)
    return out


class Pages:
    """Stroke ratio of every OCR word, per page, computed once."""

    def __init__(self, pdf: str, layout: dict, dpi: int = 400):
        import pymupdf
        self.doc, self.words, self.dpi, self.cache = pymupdf.open(pdf), layout_words(layout, text=True), dpi, {}

    def page(self, pn: int) -> list[tuple]:
        if pn in self.cache:
            return self.cache[pn]
        import pymupdf
        pix = self.doc[pn - 1].get_pixmap(dpi=self.dpi, colorspace=pymupdf.csGRAY)
        g = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w)
        sw = []
        for w in self.words.get(pn, []):
            x0, y0, x1, y1 = (int(v * self.dpi) for v in w[:4])
            r = _runs(g[y0:y1 + 1, x0:x1 + 1] < 110)
            if len(r) >= 8:
                r = np.sort(r)
                sw.append(float(r[len(r) // 4: 3 * len(r) // 4 + 1].mean()))  # mid half: no serifs, no long bars
            else:
                sw.append(0.0)
        med = float(np.median([s for s in sw if s])) if any(sw) else 1.0
        self.cache[pn] = [w + (s / med,) for w, s in zip(self.words.get(pn, []), sw)]
        return self.cache[pn]


def bold_phrases(unit: dict, pages: Pages) -> list[str]:
    """Bold lead labels inside the unit's crop segments ("Configuración I:", "Electrolito:"): runs of up to five
    bold words that end in a colon. Other bold (titles, captions, table headers) is left to the format model,
    because single short words measure too noisily to trust alone."""
    out = []
    for s in unit.get("segments") or []:
        x0, y0, x1, y1 = s["box_in"]
        run = []
        for w in pages.page(s["page"]):
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if not (x0 <= cx <= x1 and y0 <= cy <= y1):
                continue
            if w[5] >= BOLD and (not SKIP.match(w[4]) or (run and re.match(r"^\d+\.?$", w[4]))):  # "Paso" "1."
                run.append(w[4])
                if (w[4].endswith(":") and len(run) <= 5) or (len(run) == 2 and re.match(r"^\w+ (\d+|[IVX]+)\.$", " ".join(run))):  # "Paso 1."
                    out.append(" ".join(run))
                    run = []
            else:
                run = []
    return out


def add_bold(text: str, phrase: str) -> tuple[str, bool]:
    """Wrap the first plain-text occurrence of phrase in **…** unless it is already bold or a table header."""
    pat = r"\s+".join(re.escape(p) for p in phrase.split())
    for m in re.finditer(pat, text):
        before, after = text[:m.start()], text[m.end():]
        if before.endswith("**") or after.startswith("**"):
            return text, False
        if before.count("**") % 2 or before.rfind("<th") > before.rfind("</th>") or before.rfind("<") > before.rfind(">"):
            continue  # inside bold, a header cell or a tag
        if re.search(r"[\w$]$", before) or re.match(r"\w", after):
            continue  # part of a longer word
        return before + "**" + m.group(0) + "**" + after, True
    return text, False


def bold(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    meta = json.load(open(a.meta, encoding="utf-8"))["units"]
    pages = Pages(a.pdf, json.load(open(a.layout, encoding="utf-8")))
    f = fields(golden)
    only = set(a.only.split(",")) if a.only else None
    rep = {}
    for uid, u in meta.items():
        if only and uid not in only:
            continue
        keys = [k for k in f if k.split(".")[0] == uid or (uid.startswith("g") and k.startswith(uid + "."))]
        for ph in bold_phrases(u, pages):
            for k in keys:
                if k.endswith((".A", ".B", ".C", ".D")):
                    continue  # option text is never bold in the booklet; heavy marks there are answer dots
                new, ok = add_bold(f[k], ph)
                if ok:
                    f[k] = new
                    set_field(golden, k, new)
                    rep.setdefault(uid, []).append({"field": k, "bold": ph})
                    break
    # a series of numbered labels is printed alike: when some "Paso N." are bold, the paragraph-opening ones that the
    # stroke measure missed are made bold too
    for uid, items in rep.items():
        for it in list(items):
            m = re.match(r"^(\w+) (\d+|[IVX]+)\.$", it["bold"])
            if not m:
                continue
            k = it["field"]
            pat = re.compile(r"(^|<p[^>]*>|\n)(" + re.escape(m.group(1)) + r" (?:\d+|[IVX]+)\.)(?!\*\*)")
            new = pat.sub(lambda x: x.group(1) + "**" + x.group(2) + "**", f[k])
            if new != f[k]:
                f[k] = new
                set_field(golden, k, new)
    json.dump(golden, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.report:
        json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"bold added: {sum(len(v) for v in rep.values())} phrases in {len(rep)} units")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_polish.visual")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("bold")
    b.add_argument("--golden", required=True)
    b.add_argument("--meta", required=True, help="the format build's .meta.json (crop segments per unit)")
    b.add_argument("--pdf", required=True)
    b.add_argument("--layout", required=True)
    b.add_argument("--only")
    b.add_argument("--out", required=True)
    b.add_argument("--report")
    a = ap.parse_args(argv)
    return {"bold": bold}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
