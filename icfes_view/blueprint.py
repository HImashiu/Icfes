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
    # second-session forms number the parts differently
    "PARTE 4.A": ("cloze_text", 3),
    "PARTE 4.B": ("cloze_text", 3),
    "PARTE 5": ("reading", 3),
    "PARTE 6": ("reading", 3),
    "PARTE 7": ("cloze_text", 4),
}


def _norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalpha())


# canonical section names, matched on the letters only (the OCR garbles accents, "y", and the "1"/"2" suffix)
SECTION_KEYS = [("matem", "Matemáticas"), ("lectura", "Lectura crítica"), ("ciudad", "Sociales y ciudadanas"),
                ("udadan", "Sociales y ciudadanas"), ("social", "Sociales y ciudadanas"),
                ("natural", "Ciencias naturales"), ("ingl", "Inglés")]
# closed-question counts of the usual forms (used only when the cover table cannot be read)
TEMPLATES = {
    "s1": [("Matemáticas", 25), ("Lectura crítica", 41), ("Sociales y ciudadanas", 25), ("Ciencias naturales", 29)],
    "s2": [("Sociales y ciudadanas", 25), ("Matemáticas", 25), ("Ciencias naturales", 29), ("Inglés", 55)],
}


def canon(name: str) -> str | None:
    n = _norm(name)
    return next((c for k, c in SECTION_KEYS if k in n), None)


def parse_cover_table(md: str) -> dict | None:
    """Read the cover table: sections in exam order with their closed-question counts.

    Handles the two layouts seen so far ("Preguntas" or "Preguntas cerradas / abiertas") and garbled rows: a name
    with no readable count falls back to the usual form's count. `total` may include open questions.
    Returns {'sections': [{'name','expected','from_cover'}], 'total', 'closed', 'open'} or None."""
    for t in re.findall(r"<table>.*?</table>", md[:20000], re.S):
        low = t.lower()
        if "pregunt" not in low or "prueba" not in low:
            continue
        rows = []
        for row in ROW.findall(t):
            cells = [re.sub(r"<[^>]+>|\s+", " ", c).strip() for c in CELL.findall(row)]
            name = next((canon(c) for c in cells if c and canon(c)), None)
            nums = [int(m) for c in cells for m in re.findall(r"(?<![\d$])(\d{1,3})(?![\d:])", c)]
            rows.append((name, nums, cells))
        names = [r for r in rows if r[0]]
        if len(names) < 2:
            continue
        sections = []
        for name, nums, cells in names:
            own = [int(m) for c in cells if not canon(c) for m in re.findall(r"^\D{0,3}(\d{1,3})\.?$", c)]
            # the count is the first plausible number in the row (the suffix "1"/"2" of the name is not a count)
            own = [n for n in own if 10 <= n <= 80]
            sections.append({"name": name, "expected": own[0] if own else None})
        kind = "s2" if any(s["name"] == "Inglés" for s in sections) or sections[0]["name"].startswith("Social") else "s1"
        tmpl = dict(TEMPLATES[kind])
        for s in sections:
            s["from_cover"] = s["expected"] is not None
            s["expected"] = s["expected"] or tmpl.get(s["name"])
        if any(s["expected"] is None for s in sections):
            continue
        closed = sum(s["expected"] for s in sections)
        big = [n for _, nums, _ in rows for n in nums if 80 < n < 400]
        total = max(max(big) if big else closed, closed)
        return {"sections": sections, "total": total, "closed": closed, "open": max(0, total - closed) if total >= closed else 0}
    return None


def section_plan(cover: dict | None, first: int = 1) -> list[tuple[int, int, str]]:
    """[(from, to, name)] by cumulative closed counts in the cover table's order (headings are often missing)."""
    if not cover:
        return []
    plan, n = [], first
    for s in cover["sections"]:
        plan.append((n, n + s["expected"] - 1, s["name"]))
        n += s["expected"]
    return plan


def section_of(plan: list[tuple[int, int, str]], number: int) -> str | None:
    return next((name for a, b, name in plan if a <= number <= b), None)


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
    out = {"cover_table": bool(cover), "expected_total": cover["closed"] if cover else None,
           "open_questions": cover["open"] if cover else None,
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
