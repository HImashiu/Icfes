"""Text fields of a golden, addressed by a stable key such as "q22.stem", "q22.B" or "g26-28.passage"."""
from __future__ import annotations

import html
import re

Q_FIELDS = {"stim": "stimulus_md", "stem": "stem_md"}
G_FIELDS = {"passage": "passage_md", "dir": "directions", "stim": "stimulus_md"}


def iter_fields(golden: dict):
    for g in golden.get("groups", []):
        for short, name in G_FIELDS.items():
            if name in g:
                yield f"g{g['id'][1:] if g['id'].startswith('g') else g['id']}.{short}", g.get(name) or ""
    for q in golden["questions"]:
        n = q["number"]
        for short, name in Q_FIELDS.items():
            yield f"q{n}.{short}", q.get(name) or ""
        for o in q.get("options", []):
            yield f"q{n}.{o['letter']}", o.get("text_md") or ""


def fields(golden: dict) -> dict[str, str]:
    return dict(iter_fields(golden))


def set_field(golden: dict, key: str, value: str) -> None:
    owner, short = key.split(".", 1)
    if owner.startswith("g"):
        gid = "g" + owner[1:]
        g = next(x for x in golden["groups"] if x["id"] == gid)
        g[G_FIELDS[short]] = value
        return
    n = int(owner[1:])
    q = next(x for x in golden["questions"] if x["number"] == n)
    if short in Q_FIELDS:
        q[Q_FIELDS[short]] = value
    else:
        next(o for o in q["options"] if o["letter"] == short)["text_md"] = value


def owner_of(key: str) -> str:
    return key.split(".", 1)[0]


# --- normalization used to compare two versions of a field ---

_WS = re.compile(r"\s+")
_FIG = re.compile(r"\[\[figura:[^\]]*\]\]")


_BLOCK = re.compile(r"^\s*<(p|div|ul|ol|table|h\d)\b", re.I)


def blocks_as_paragraphs(text: str) -> str:
    """Plain blank-line paragraphs written as <p> blocks, the way the renderer shows them."""
    out = []
    for b in re.split(r"\n\s*\n", text or ""):
        b = b.strip()
        if b:
            out.append(b if _BLOCK.match(b) else f"<p>{b}</p>")
    return "\n\n".join(out)


def canon(text: str, strict: bool = False) -> str:
    """Same content and same markup, ignoring whitespace, entity spelling, quote style and figure ids.
    Unless strict, justified paragraphs count as plain paragraphs (justify is cosmetic and the
    hand-finished reference applies it unevenly)."""
    t = html.unescape(text or "")
    if not strict:
        t = blocks_as_paragraphs(t.replace('<p style="text-align:justify">', "<p>"))
    t = _FIG.sub("[[figura]]", t)
    t = re.sub(r'<table class="exam-table">', "<table>", t)
    t = re.sub(r"</?tbody>", "", t)
    t = re.sub(r"<strong>(.*?)</strong>", r"**\1**", t, flags=re.S)
    t = t.replace("µ", "μ").replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    t = re.sub(r">\s+<", "><", t)
    t = re.sub(r"\s*(<(?:/?p|/?div|/?table|/?tr|/?td|/?th|/?tbody|/?thead|br)[^>]*>)\s*", r"\1", t)
    return _WS.sub(" ", t).strip()


def plain(text: str) -> str:
    """Only the words: markup, math delimiters and figure tokens removed."""
    t = html.unescape(text or "")
    t = _FIG.sub(" ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("**", "").replace("$", "")
    t = t.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return _WS.sub(" ", t).strip()


MARKUP = {
    "justify": r'<p style="text-align:justify">',
    "right": r'text-align:right',
    "center": r'text-align:center',
    "fuente": r'class="fuente"',
    "cita": r'class="cita"',
    "poema": r'class="poema"',
    "espacio": r'class="espacio"',
    "figura": r"\[\[figura",
    "hueco": r"\[\[hueco",
    "ejemplo": r"\[\[ejemplo",
    "table": r"<table",
    "math": r"(?<!\\)\$[^$\n]*[\\^_{}][^$\n]*\$",
    "mol": r"\\mol\{",
    "bold": r"<strong>|\*\*",
    "em": r"<em>",
    "sub": r"<sub>",
    "sup": r"<sup>",
}


def markup_counts(text: str) -> dict[str, int]:
    return {k: len(re.findall(p, text or "")) for k, p in MARKUP.items()}
