"""Markdown -> sanitized HTML, and the single-file College Board-style viewer."""
from __future__ import annotations

import base64
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import markdown

ALLOWED = {"p", "br", "strong", "em", "b", "i", "u", "sub", "sup", "ul", "ol", "li", "table", "thead", "tbody",
           "tr", "th", "td", "img", "h3", "h4", "h5", "hr", "span", "blockquote", "code"}
VOID = {"br", "hr", "img"}
SAFE_SRC = re.compile(r"^(data:image/(png|jpeg|gif);base64,|(\.\./)?figures/)")


class _Sanitizer(HTMLParser):
    """Whitelist sanitizer: OCR text comes from arbitrary PDFs, so never trust embedded HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED:
            return
        keep = []
        for k, v in attrs:
            if tag in ("td", "th") and k in ("colspan", "rowspan") and (v or "").isdigit():
                keep.append(f' {k}="{v}"')
            elif tag == "img" and k == "src" and v and SAFE_SRC.match(v):
                keep.append(f' src="{html.escape(v, quote=True)}"')
            elif tag == "img" and k == "alt":
                keep.append(f' alt="{html.escape(v or "", quote=True)}"')
        self.out.append(f"<{tag}{''.join(keep)}>")

    def handle_endtag(self, tag):
        if tag in ALLOWED and tag not in VOID:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        self.out.append(html.escape(data, quote=False))


def sanitize(h: str) -> str:
    p = _Sanitizer()
    p.feed(h)
    p.close()
    return "".join(p.out)


MATH = re.compile(r"\$[^$\n]{1,300}\$")


def md_to_html(md: str, resolve_img) -> str:
    if not md.strip():
        return ""
    maths: list[str] = []

    def stash(m: re.Match) -> str:  # keep LaTeX away from Markdown (underscores, asterisks, backslashes)
        maths.append(m.group(0))
        return f"@@MATH{len(maths) - 1}@@"

    h = markdown.markdown(MATH.sub(stash, md), extensions=["tables", "sane_lists"])
    h = sanitize(h)
    h = re.sub(r"@@MATH(\d+)@@", lambda m: html.escape(maths[int(m.group(1))], quote=False), h)
    return re.sub(r'src="([^"]+)"', lambda m: f'src="{resolve_img(html.unescape(m.group(1)))}"', h)


def make_resolver(figures_root: Path, doc_id: str, embed: bool, images: dict[str, str] | None = None):
    """Embedded images are stored once in `images` and referenced as IMG:<name> (resolved by the viewer JS)."""
    def resolve(src: str) -> str:
        if src.startswith("data:"):
            return src
        name = src.rsplit("/", 1)[-1]
        f = figures_root / doc_id / name
        if embed and f.exists() and images is not None:
            images.setdefault(name, "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode())
            return f"IMG:{name}"
        return f"../figures/{doc_id}/{name}"
    return resolve


def prepare(doc_id: str, title: str, seg: dict, resolve, images: dict[str, str] | None = None,
            crops: dict[str, str] | None = None, validation: dict | None = None) -> dict:
    crops = crops or {}
    groups = {g["id"]: {"directions": g["directions"], "html": md_to_html("\n\n".join(g["stimulus"]), resolve),
                        "crop": crops.get(f"g{g['from']}-{g['to']}")} for g in seg["groups"]}
    qs = []
    for q in seg["questions"]:
        qs.append({
            "number": q["number"], "section": q["section"], "part": q["part"], "flags": q["flags"], "notes": q.get("notes", []),
            "placeholder": bool(q.get("placeholder")), "group": q.get("group_id"),
            "crop": crops.get(f"q{q['number']}"),
            "stimulus_html": md_to_html(q["stimulus_md"], resolve),
            "stem_html": md_to_html(q["stem_md"], resolve), "stem_md": q["stem_md"],
            "item_type": q.get("item_type"), "expected_options": q.get("expected_options"),
            "status": q.get("status"),
            "options": [{"letter": o["letter"], "html": md_to_html(o["text_md"], resolve), "md": o["text_md"],
                         "marked": o["marked_in_scan"]} for o in q["options"]],
            "raw": q["raw_md"],
        })
    return {"doc_id": doc_id, "title": title, "questions": qs, "groups": groups, "images": images or {},
            "missing": seg["missing"], "validation": validation or {}}


def render_html(data: dict) -> str:
    # every "<" becomes \u003c: JSON still parses identically, but the HTML parser can never see a tag or "<!--" in it
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    return TEMPLATE.replace("__TITLE__", html.escape(data["title"])).replace("__DATA__", payload)


TEMPLATE = (Path(__file__).parent / "viewer.html").read_text(encoding="utf-8") if (Path(__file__).parent / "viewer.html").exists() else ""
