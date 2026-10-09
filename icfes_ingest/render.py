"""Merge per-chunk analysis into one Markdown document with figure images linked in."""
from __future__ import annotations

from typing import Any

CHUNK_SEPARATOR = "\n\n<!-- PageBreak -->\n\n"


def markdown_with_figures(content: str, figures: list[dict[str, Any]], rel_dir: str) -> str:
    """Insert an image link right after each figure's span. Original text is never removed."""
    inserts = []
    for fig in figures:
        if not fig.get("file") or not fig.get("spans"):
            continue
        sp = fig["spans"][-1]
        alt = (fig.get("caption") or f"Figure {fig['id']} (page {fig['global_page']})").replace("\n", " ")
        inserts.append((sp["offset"] + sp["length"], f"\n\n![{alt}]({rel_dir}/{fig['file']})\n"))
    for pos, text in sorted(inserts, reverse=True):
        content = content[:pos] + text + content[pos:]
    return content


def merge_markdown(chunks: list[dict[str, Any]], rel_dir: str) -> str:
    parts = []
    for c in chunks:
        header = f"<!-- pages {c['page_start']}-{c['page_end']} -->\n\n"
        parts.append(header + markdown_with_figures(c["content"], c["figures"], rel_dir))
    return CHUNK_SEPARATOR.join(parts) + "\n"
