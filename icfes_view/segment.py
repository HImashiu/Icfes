"""Split cleaned paragraphs into numbered questions (stimulus / stem / options / figures).

Two passes: (1) cut the paragraph stream into per-question chunks using the running question number,
(2) inside each chunk locate the A-D options (restoring letters the scan hid) and separate
stimulus, stem and leftovers.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .blueprint import item_info
from .clean import IMG_RE, MARKS, MARKS_ON

Q_START = re.compile(r"^(\d{1,3})\\?\.(?!\d)\s*(.*)$", re.S)
OPT = re.compile(r"^\(?([A-Da-d])\)?\\?[\.\)]\s*(.*)$", re.S)
MARKED = re.compile(rf"^([{MARKS}])\s*[\.\)]?\s*(.*)$", re.S)
LIST_ITEM = re.compile(r"^\d{1,3}\\?\.(?!\d)\s")
RANGE = re.compile(r"PREGUNTAS?\s+(\d+)\s+(?:A|Y|-)\s+(\d+)", re.I)
SECTION = re.compile(r"^#+\s*Prueba\s+de\s+(.+?)(?:\s+parte\s+[IVX\d]+)?\s*$", re.I)
PART = re.compile(r"^#+\s*(PARTE\s+\w+(?:\.\w)?)", re.I)
LETTERS = "ABCD"


@dataclass
class Chunk:
    number: int
    section: str | None
    part: str | None
    group: dict | None
    body: list[str] = field(default_factory=list)   # everything between this question's number and the next
    raw: list[str] = field(default_factory=list)


def is_text(item: str) -> bool:
    return not item.startswith(("![", "<table", "#"))


def _letter(item: str) -> str | None:
    if m := OPT.match(item):
        return m.group(1).upper()
    return None


def _first_question_number(items: list[str]) -> int | None:
    for i, it in enumerate(items):
        m = Q_START.match(it)
        if m and any(_letter(x) == "A" for x in items[i + 1:i + 40]):
            return int(m.group(1))
    return None


def _has_options(body: list[str]) -> bool:
    return any(_letter(x) in ("A", "B") or MARKED.match(x) for x in body)


def cut(items: list[str]) -> tuple[list[Chunk], list[dict], list[int]]:
    expected = _first_question_number(items)
    if expected is None:
        return [], [], []
    chunks: list[Chunk] = []
    groups: list[dict] = []
    missing: list[int] = []
    cur: Chunk | None = None
    section = part = None
    group: dict | None = None
    collecting: dict | None = None  # group whose shared stimulus is being collected

    def start(n: int, first_text: str, raw: str) -> None:
        nonlocal cur, collecting, expected
        g = group if group and group["from"] <= n <= group["to"] else None
        cur = Chunk(n, section, part, g)
        cur.body.append(first_text)
        cur.raw.append(raw)
        chunks.append(cur)
        collecting, expected = None, n + 1

    for it in items:
        if not it.startswith("#") and it.upper().startswith("RESPONDA LAS PREGUNTAS") and RANGE.search(it):
            it = "## " + it  # some parts print the directive as plain text instead of a heading
        hq = Q_START.match(re.sub(r"^#+\s*", "", it)) if it.startswith("#") else None
        if hq and int(hq.group(1)) == expected:  # "## 23. REVOLUCIÓN MEXICANA"
            start(int(hq.group(1)), f"#### {hq.group(2).strip()}" if hq.group(2).strip() else "", it)
            continue
        if it.startswith("#"):
            if sm := SECTION.match(it):
                section, part = sm.group(1).strip(), None
            if pm := PART.match(it):
                part = pm.group(1).upper()
            if rm := RANGE.search(it):
                group = collecting = {"id": f"g{rm.group(1)}-{rm.group(2)}", "from": int(rm.group(1)),
                                      "to": int(rm.group(2)), "directions": re.sub(r"^#+\s*", "", it), "stimulus": [],
                                      "section": section, "part": part}
                groups.append(group)
            elif collecting is not None:
                collecting["stimulus"].append(it)
            elif cur:
                cur.body.append(it); cur.raw.append(it)
            continue

        qm = Q_START.match(it)
        if qm and cur is not None and _has_options(cur.body) and len(qm.group(2)) > 20:
            n = int(qm.group(1))
            # OCR/layout lost one or more question numbers (e.g. picture-based items): jump ahead, but report it.
            # Small numbers are more likely sub-list items, so long jumps only count for n > 10.
            if n == expected + 1 or (expected + 1 < n <= expected + 12 and n > 10):
                missing.extend(range(expected, n))
                expected = n
        if qm and int(qm.group(1)) == expected:
            n = int(qm.group(1))
            # A numbered sub-list item that equals the expected number is rejected while the current
            # question has not reached its options yet.
            if cur is None or _has_options(cur.body) or n > 6 or (part or "").startswith("PARTE"):
                start(n, qm.group(2).strip(), it)
                continue
        if collecting is not None:
            collecting["stimulus"].append(it)
        elif cur is not None:
            cur.body.append(it); cur.raw.append(it)
    return chunks, groups, missing


def parse_options(body: list[str]) -> tuple[list[str], list[dict], list[str]]:
    """Return (pre_option_items, options, trailer). Restores letters hidden by scan marks / OCR."""
    a = None
    for i, it in enumerate(body):
        if _letter(it) == "A" and any(_letter(x) in ("B", "C", "D") or MARKED.match(x) for x in body[i + 1:]):
            a = i
            break
    if a is None:  # option A may have lost its letter: anchor on the first "B."
        for i, it in enumerate(body):
            if _letter(it) == "B" and i > 0 and is_text(body[i - 1]):
                a = i - 1
                break
    if a is None:
        for i, it in enumerate(body):  # lone scan mark = an option whose letter was destroyed
            if MARKED.match(it) and i + 1 < len(body):
                a = i
                break
    if a is None:
        return body, [], []
    options: list[dict] = []
    i = a
    while i < len(body) and len(options) < 4:
        it, want = body[i], LETTERS[len(options)]
        nxt = LETTERS[len(options) + 1] if len(options) < 3 else None
        if _letter(it) == want:
            options.append({"letter": want, "text": OPT.match(it).group(2).strip(), "marked_in_scan": False})
        elif (m := MARKED.match(it)):
            options.append({"letter": want, "text": m.group(2).strip(), "marked_in_scan": m.group(1) in MARKS_ON,
                            "letter_restored": True})
        elif (is_text(it) and not LIST_ITEM.match(it) and i + 1 < len(body) and (mm := MARKED.match(body[i + 1]))
              and (nxt is None or (i + 2 < len(body) and _letter(body[i + 2]) == nxt))):
            # the scan mark landed BETWEEN the two lines of this option (letter hidden): one option, two lines
            txt = re.sub(r"^[\.\u2022\u25CF\u00B7]\s*", "", it.strip())
            options.append({"letter": want, "text": (txt + " " + mm.group(2)).strip(),
                            "marked_in_scan": mm.group(1) in MARKS_ON, "letter_restored": True})
            i += 1
        elif is_text(it) and not LIST_ITEM.match(it) and nxt and i + 1 < len(body) and _letter(body[i + 1]) == nxt:
            options.append({"letter": want, "text": re.sub(r"^[\.\u2022\u25CF\u00B7]\s+", "", it.strip()),
                            "marked_in_scan": False, "letter_restored": True})
        else:
            break
        i += 1
    # last option whose letter was lost: only trust it when it directly follows the previous option
    if len(options) == 3 and i < len(body) and is_text(body[i]) and not LIST_ITEM.match(body[i]) \
            and not body[i].startswith("#") and len(body[i]) <= 300 and not _has_options(body[i + 1:i + 2]) \
            and not (body[i].startswith(("<", "!"))):
        options.append({"letter": "D", "text": body[i].strip(), "marked_in_scan": False, "letter_restored": True})
        i += 1
    return body[:a], options, body[i:]


def build(ch: Chunk, trailer_out: list[str] | None = None) -> dict:
    pre, options, trailer = parse_options(ch.body)
    # sub-lists ("1. ... 2. ...") belong to the paragraph they follow
    paras: list[str] = []
    for p in pre:
        if p and LIST_ITEM.match(p) and paras and is_text(paras[-1]):
            paras[-1] += "\n\n" + p
        elif p:
            paras.append(p)
    text_idx = [i for i, p in enumerate(paras) if is_text(p)]
    if text_idx:
        k = text_idx[-1]
        stem, stimulus = paras[k], paras[:k] + paras[k + 1:]
    else:
        stem, stimulus = "", paras
    flags: list[str] = []
    item_type, want = item_info(ch.section, ch.part)
    if want and len(options) < want:
        flags.append(f"Expected {want} options, found {len(options)} (answer choices may be inside an image: check the figure)")
    empty = [o["letter"] for o in options if not re.sub(r"[\W_]+", "", o["text"])]
    if empty:
        flags.append(f"Option(s) {', '.join(empty)} have a letter but no text (the choices are probably in a table or an image)")
    for o in options:  # a second option marker inside one option's text: two options were glued together
        if re.search(r"(?:^|\s)[A-D][\.\)]\s+\S", o["text"][1:] if o["text"][:1] in "ABCD" else o["text"]):
            flags.append(f"Option {o['letter']} may contain another option (merged answer choices): check the source crop")
    lens = [len(o["text"]) for o in options]
    if len(lens) >= 3:
        med = sorted(lens)[len(lens) // 2]
        for o in options:
            if med >= 8 and len(o["text"]) > 2.6 * med and not any(f.startswith(f"Option {o['letter']} may") for f in flags):
                flags.append(f"Option {o['letter']} is much longer than the others (possible merged options)")
    leftovers = " ".join(t for t in trailer if is_text(t) and len(t) > 14)
    if len(leftovers) > 120:
        flags.append("Unclassified text after the options was left out of the view (see Original extraction)")
    if not stem:
        flags.append("No question text found")
    if trailer_out is not None:
        trailer_out.extend(trailer)
    figs = [m.group(2) for p in paras + [o["text"] for o in options] for m in IMG_RE.finditer(p)]
    return {"number": ch.number, "section": ch.section, "part": ch.part, "item_type": item_type,
            "expected_options": want, "group_id": ch.group["id"] if ch.group else None,
            "stimulus_md": "\n\n".join(stimulus), "stem_md": stem,
            "options": [{"letter": o["letter"], "text_md": o["text"], "marked_in_scan": o["marked_in_scan"]}
                        for o in options],
            "figures": figs, "flags": flags, "raw_md": "\n\n".join(ch.raw + ch.body[len(ch.raw):]),
            "anchor": (ch.raw[0] if ch.raw else "")[:120]}  # text of the paragraph that starts this question


def segment(items: list[str]) -> dict:
    """Full pass: returns {'questions': [...], 'groups': [...], 'missing': [...]}."""
    chunks, groups, missing = cut(items)
    questions: list[dict] = []
    for idx, ch in enumerate(chunks):
        trailer: list[str] = []
        q = build(ch, trailer)
        questions.append(q)
        # An unnumbered question hiding in the trailer (its number was lost by the OCR)?
        nxt = chunks[idx + 1].number if idx + 1 < len(chunks) else None
        if (ch.number + 1) in missing and nxt == ch.number + 2 and _has_options(trailer):
            ghost = Chunk(ch.number + 1, ch.section, ch.part, ch.group, body=list(trailer), raw=list(trailer))
            gq = build(ghost)
            gq["flags"].append("Question number was lost by the OCR; assigned from sequence")
            questions.append(gq)
            q["flags"] = [f for f in q["flags"] if not f.startswith("Unclassified")]
    have = {q["number"] for q in questions}
    lost = [m for m in missing if m not in have]
    sec_of = {q["number"]: (q["section"], q["part"]) for q in questions}
    for m in lost:
        g = next((g for g in groups if g["from"] <= m <= g["to"]), None)
        prev = max((n for n in sec_of if n < m), default=None)
        sec, part = (g["section"], g["part"]) if g else sec_of.get(prev, (None, None))
        questions.append({"number": m, "section": sec, "part": part, "item_type": item_info(sec, part)[0],
                          "expected_options": item_info(sec, part)[1], "group_id": g["id"] if g else None,
                          "stimulus_md": "", "stem_md": "", "options": [], "figures": [], "placeholder": True,
                          "flags": ["This question was not detected (picture-based item or lost question number). "
                                    "Its content is in the shared passage / source figures; check the original page."],
                          "raw_md": ""})
    questions.sort(key=lambda q: q["number"])
    return {"questions": questions, "groups": groups, "missing": lost}
