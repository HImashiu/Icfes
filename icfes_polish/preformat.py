"""Stage 1: scripted formatting rules, no model. Brings an OCR golden closer to the editor's conventions.

python -m icfes_polish.preformat <in.golden.json> <out.golden.json>

What it does (each rule is counted in the report):
- markdown pictures and figure placeholders are taken out of the text (the figure stage links real crops);
- raw <table> markup is compacted to <table class="exam-table"><tbody>…</tbody></table>;
- a caption line alone ("Tabla", "Gráfica", "Figura 2") becomes <p style="text-align:right">**Tabla**</p>;
- a source line ("Tomado de…", "Adaptado de…", "Fuente:…") becomes <p class="fuente">…</p>;
- prose paragraphs are wrapped in <p style="text-align:justify">, the way the booklet prints them;
- answer-dot leftovers (☒, leading ·), escaped punctuation and broken hyphenation are cleaned.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter

from .fields import fields, set_field

MD_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
PLACEHOLDER = re.compile(r"\[[^\]\n]{0,120}?(?:figura|imagen|gráfica|estructura química)[^\]\n]{0,80}?pendiente[^\]\n]*\]|\[(?:Figura|Imagen|Gráfica|Tabla) pendiente[^\]\n]*\]", re.I)
CAPTION = re.compile(r"^\s*(?:\*\*)?(Tabla|Gráfica|Grafica|Figura|Imagen|Esquema|Mapa|Diagrama)(\s+\d+)?\.?(?:\*\*)?\s*$", re.I)
SOURCE = re.compile(r"^\s*(?:\*)?\s*(Tomado|Adaptado|Tomada|Adaptada|Fuente\s*:|Texto tomado|Imagen tomada|Recuperado)", re.I)
BLOCK = re.compile(r"^\s*<(p|div|ul|ol|table|h\d)\b", re.I)
JUSTIFY = '<p style="text-align:justify">'


def compact_table(m: re.Match) -> str:
    t = m.group(0)
    t = re.sub(r">\s+<", "><", t.strip())
    t = re.sub(r"<table[^>]*>", '<table class="exam-table">', t, count=1)
    if "<tbody" not in t and "<thead" not in t:
        t = t.replace('<table class="exam-table">', '<table class="exam-table"><tbody>', 1).replace("</table>", "</tbody></table>")
    return t


def clean_text(t: str, c: Counter) -> str:
    n0 = len(t)
    t = MD_IMG.sub("", t)
    if len(t) != n0:
        c["pictures_removed"] += 1
    t, k = PLACEHOLDER.subn("", t)
    c["placeholders_removed"] += k
    t, k = re.subn(r"[☒☐]\s*", "", t)
    c["key_marks_removed"] += k
    t, k = re.subn(r"(?m)^[ \t]*[·•][ \t]*", "", t)
    c["leading_dots_removed"] += k
    t, k = re.subn(r"\\([.\-()\[\]#*_])", r"\1", t)
    c["escapes_removed"] += k
    # a word cut by a line-end hyphen in the booklet: "res- pecto" -> "respecto"
    t, k = re.subn(r"(\w)- (?=[a-záéíóúñ])", r"\1", t)
    c["hyphen_joins"] += k
    t = re.sub(r"<table\b.*?</table>", compact_table, t, flags=re.S)
    return t


def format_blocks(t: str, kind: str, c: Counter) -> str:
    if not t.strip():
        return ""
    # tables always stand alone as blocks
    t = re.sub(r"\s*(<table\b.*?</table>)\s*", r"\n\n\1\n\n", t, flags=re.S)
    out = []
    for b in re.split(r"\n\s*\n", t):
        b = b.strip()
        if not b:
            continue
        if BLOCK.match(b):
            out.append(b)
            continue
        b = re.sub(r"\s*\n\s*", " ", b)
        if CAPTION.match(b):
            word = CAPTION.match(b)
            out.append(f'<p style="text-align:right">**{word.group(1)}{word.group(2) or ""}**</p>')
            c["captions"] += 1
        elif SOURCE.match(b) and kind in ("stim", "passage") and len(b) < 400:
            out.append(f'<p class="fuente">{b}</p>')
            c["sources"] += 1
        elif kind in ("stim", "stem", "passage") or len(b) > 60:
            out.append(f"{JUSTIFY}{b}</p>")
            c["justified"] += 1
        else:
            out.append(b)
    return "\n\n".join(out)


def preformat(golden: dict) -> tuple[dict, Counter]:
    g = json.loads(json.dumps(golden))
    c: Counter = Counter()
    for key, text in fields(golden).items():
        if not text:
            continue
        kind = key.split(".", 1)[1]
        kind = "opt" if len(kind) == 1 else kind
        if kind == "dir":
            continue
        new = format_blocks(clean_text(text, c), kind, c)
        if new != text:
            set_field(g, key, new)
            c["fields_changed"] += 1
    return g, c


def main(argv=None) -> int:
    a = argv or sys.argv[1:]
    g = json.load(open(a[0], encoding="utf-8"))
    out, c = preformat(g)
    json.dump(out, open(a[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(dict(c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
