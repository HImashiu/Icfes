"""Exam blueprint: what the exam says it contains, used to validate what was extracted.

Section sizes are read from the document's own cover table ("Prueba | Preguntas | No. Total de preguntas"),
not hardcoded. The English test is a set of different item types; their option counts are assumptions
(verified on one form) and are only used for review notes.
"""
from __future__ import annotations

import re

ROW = re.compile(r"<tr>(.*?)</tr>", re.S)
CELL = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)
# part label -> (item_type, expected option count or None when options are not a simple A-C/A-D list)
ENGLISH_PARTS = {
    "PARTE 1": ("sign_picture", 3),      # picture signs: "¿Dónde puede ver estos avisos?"
    "PARTE 2": ("matching", None),       # word bank A-H shared by 5 descriptions
    "PARTE 3": ("conversation", 3),
    "PARTE 4": ("cloze_text", 3),
    "PARTE 5.A": ("reading", 3),
    "PARTE 5.B": ("reading", 3),
}


def _norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalpha())


def parse_cover_table(md: str) -> dict | None:
    """Return {'sections': [{'name','expected'}], 'total': int} from the first table that looks like the cover table."""
    for t in re.findall(r"<table>.*?</table>", md[:20000], re.S):
        low = t.lower()
        if "pregunt" not in low or "prueba" not in low:
            continue
        sections, total = [], None
        for row in ROW.findall(t):
            cells = [re.sub(r"<[^>]+>|\s+", " ", c).strip() for c in CELL.findall(row)]
            if len(cells) < 2 or not cells[1].isdigit():
                continue
            sections.append({"name": re.sub(r"\s+\d+$", "", cells[0]).strip(), "expected": int(cells[1])})
            for c in cells[2:]:
                if c.isdigit() and int(c) > int(cells[1]):
                    total = int(c)
        if sections:
            return {"sections": sections, "total": total or sum(s["expected"] for s in sections)}
    return None


def item_info(section: str | None, part: str | None) -> tuple[str, int | None]:
    """(item_type, expected_options) for a question."""
    if (section or "").lower().startswith("ingl"):
        return ENGLISH_PARTS.get((part or "").upper(), ("english_other", 3))
    return "standard", 4


def validate(questions: list[dict], cover: dict | None) -> dict:
    nums = sorted(q["number"] for q in questions)
    found_by_section: dict[str, list[int]] = {}
    for q in questions:
        found_by_section.setdefault(q["section"] or "?", []).append(q["number"])
    out = {"cover_table": bool(cover), "expected_total": cover["total"] if cover else None,
           "found_total": len(nums), "last_number": nums[-1] if nums else None, "sections": [], "warnings": []}
    if cover:
        for s in cover["sections"]:
            key = next((k for k in found_by_section if _norm(k)[:6] == _norm(s["name"])[:6]), None)
            found = len(found_by_section.get(key, []))
            out["sections"].append({"name": s["name"], "expected": s["expected"], "found": found})
            if found != s["expected"]:
                out["warnings"].append(f"{s['name']}: the cover says {s['expected']} questions, {found} were extracted"
                                       + (f" (numbers {min(found_by_section[key])}-{max(found_by_section[key])})" if key else ""))
        if out["expected_total"] and out["expected_total"] != len(nums):
            first = nums[0] if nums else 1
            out["warnings"].append(
                f"Total: the cover says {out['expected_total']} questions, {len(nums)} were extracted "
                f"(numbers {first}-{nums[-1] if nums else '?'}). Questions {len(nums) + first}-{out['expected_total'] + first - 1} "
                f"may be missing from this PDF or from the extraction.")
    gaps = [n for a, b in zip(nums, nums[1:]) for n in range(a + 1, b)]
    if gaps:
        out["warnings"].append(f"Missing question numbers inside the sequence: {gaps}")
    return out
