"""Stage 2: the model formats each unit (question or shared text) from its scan crop.

Build the request file (no network; the laptop relay sends it to Azure):
  python -m icfes_polish.format_stage build --golden pre.json --crops <icfes_crop dir> --pdf exam.pdf
         --examples-before ref.bak.json --examples-after ref.json --deployment solve --out req.jsonl [--only q22,g26-28]
Apply the relay's answers:
  python -m icfes_polish.format_stage apply --golden pre.json --crops <dir> --results out.jsonl --out cand.json --report rep.json
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image
from rapidfuzz import fuzz

from .fields import canon, fields, plain, set_field
from .images import remove_blue
from .regions import layout_lines, layout_words, marked, propose, unit_ocr, words_in_crop
from .spec import EDITOR_SPEC, FORMAT_TASK

LONG = 700          # fields longer than this are edited with find/replace ops, never retyped
MAX_SIDE = 1600     # image side sent to the model


def units(golden: dict) -> list[dict]:
    """One unit per group (its shared fields) and one per question."""
    f = fields(golden)
    out = []
    for g in golden.get("groups", []):
        keys = [k for k in f if k.startswith(g["id"] + ".")]
        out.append({"id": g["id"], "kind": "group", "keys": keys, "section": None, "group": g["id"]})
    for q in golden["questions"]:
        n = q["number"]
        keys = [k for k in f if k.split(".")[0] == f"q{n}"]
        out.append({"id": f"q{n}", "kind": "question", "keys": keys, "section": q.get("section"), "group": q.get("group_id")})
    return out


def jpeg_b64(img: Image.Image) -> tuple[str, tuple[int, int]]:
    img = img.convert("RGB")
    s = MAX_SIDE / max(img.size)
    if s < 1:
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode(), img.size


def crop_for(unit: dict, bundles: dict, crops: Path):
    b = bundles["bundles"].get(unit["id"])
    if b is None and unit["group"]:
        b = bundles["bundles"].get(unit["group"])
    if b is None:
        return None, None
    return Image.open(crops / b["file"]), b


def page_image(pdf, page: int, dpi: int = 150) -> Image.Image:
    import fitz
    pix = pdf[page - 1].get_pixmap(dpi=dpi)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def layout_boxes_in_crop(segments, figs_inches, dpi):
    """Azure layout figure regions (inches) that fall on this crop, in crop pixels."""
    out = []
    for s in segments or []:
        x0, y0, x1, y1 = s["box_px"]
        for fb in (figs_inches or {}).get(s["page"], []):
            bx0, by0, bx1, by1 = (v * dpi for v in fb)
            if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
                continue
            out.append((int(max(bx0, x0) - x0), int(max(by0, y0) - y0 + s["y_in_image"]),
                        int(min(bx1, x1) - x0), int(min(by1, y1) - y0 + s["y_in_image"])))
    return out


def pick_examples(before: dict, after: dict, limit_chars: int = 14000) -> list[dict]:
    """Units where the hand-finished version adds markup, chosen to cover every kind of markup once or twice."""
    fb = fields(before)
    fa = {k: re.sub(r"\[\[figura:[^\]]+\]\]", "[[figura:?]]", v) for k, v in fields(after).items()}  # ids are filled in later
    want = ["fuente", "cita", "espacio", "mol", "math", "em", "sub", "hueco", "ejemplo", "table", "right", "center", "poema", "bold"]
    from .fields import markup_counts
    by_unit: dict[str, dict] = {}
    for k, v in fa.items():
        if canon(v) != canon(fb.get(k, "")) and v:
            by_unit.setdefault(k.split(".")[0], {})[k] = (fb.get(k, ""), v)
    chosen, used, total = [], set(), 0
    for kind in want:
        for uid, flds in sorted(by_unit.items(), key=lambda kv: sum(len(a) for _, a in kv[1].values())):
            if uid in used:
                continue
            if any(markup_counts(a)[kind] for _, a in flds.values()):
                size = sum(len(a) + len(b) for b, a in flds.values())
                if size > 3500 or total + size > limit_chars:
                    continue
                chosen.append({"unit": uid, "fields": flds})
                used.add(uid)
                total += size
                break
    return chosen


def system_prompt(examples: list[dict]) -> str:
    parts = [EDITOR_SPEC, "", FORMAT_TASK, "", "EXAMPLES (current text -> the answer you would give):"]
    for ex in examples:
        cur = {k: b for k, (b, a) in ex["fields"].items()}
        ans = {"fields": {k: {"text": a} for k, (b, a) in ex["fields"].items()}, "figures": [], "uncertain": []}
        parts.append("CURRENT " + json.dumps(cur, ensure_ascii=False))
        parts.append("ANSWER " + json.dumps(ans, ensure_ascii=False))
    return "\n".join(parts)


def build(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    crops = Path(a.crops)
    bundles = json.load(open(crops / "bundles.json", encoding="utf-8"))
    words = figs_layout = ocr_lines = None
    if a.layout:
        lay = json.load(open(a.layout, encoding="utf-8"))
        words = layout_words(lay)
        ocr_lines = layout_lines(lay)
        from .figures import layout_figures
        figs_layout = layout_figures(lay, inches=True)
    pdf = None
    if a.pdf:
        import fitz
        pdf = fitz.open(a.pdf)
    ex = []
    if a.examples_before:
        from .preformat import preformat
        ex = pick_examples(preformat(json.load(open(a.examples_before, encoding="utf-8")))[0], json.load(open(a.examples_after, encoding="utf-8")))
    sysmsg = system_prompt(ex)
    if getattr(a, "fresh", False):
        from .spec import FRESH_TASK
        sysmsg += "\n\n" + FRESH_TASK
    f = fields(golden)
    only = set(a.only.split(",")) if a.only else None
    qpages = {f"q{q['number']}": (q.get("source") or {}).get("pages") or [] for q in golden["questions"]}
    n = 0
    meta = {}
    lines = []
    if True:
        for u in units(golden):
            if only and u["id"] not in only:
                continue
            if not any(f[k] for k in u["keys"]) and u["kind"] == "group":
                continue
            img, b = crop_for(u, bundles, crops)
            source = "crop"
            if img is None and pdf is not None and qpages.get(u["id"]):
                img, source = page_image(pdf, qpages[u["id"]][0]), "page"
            if img is None:
                meta[u["id"]] = {"skipped": "no image"}
                continue
            b64, size = jpeg_b64(remove_blue(img))
            boxes = []
            if source == "crop" and words is not None:
                wb = words_in_crop(b["segments"], words, bundles.get("dpi", 250))
                boxes = propose(img, wb) + [bx for bx in layout_boxes_in_crop(b["segments"], figs_layout, bundles.get("dpi", 250))]
            mk64 = jpeg_b64(remove_blue(marked(img, boxes)))[0] if boxes else None
            ocr = ""
            if ocr_lines is not None:
                if source == "crop":
                    ocr = unit_ocr(b["segments"], ocr_lines, bundles.get("dpi", 250))
                else:
                    ocr = "\n".join(t for *_, t in sorted(ocr_lines.get(qpages[u["id"]][0], []), key=lambda x: (x[0] > 4.2, x[1], x[0])))  # left column, then right
            cur = {k: f[k] for k in u["keys"]}
            longk = [k for k in u["keys"] if len(f[k]) > LONG]
            info = {"unit": u["id"], "section": u["section"], "image": "crop of this unit" if source == "crop" else "the whole page; find the unit on it",
                    "ocr": ocr[:8000],
                    "long_fields": longk, "fields": cur}
            if u["kind"] == "question" and u["group"]:
                shared = " ".join(f.get(f"{u['group']}.{x}", "") for x in ("passage", "stim"))
                info["note"] = (f"belongs to group {u['group']}; its shared text is formatted separately. Format only this question's "
                                "fields. If a field of this question repeats the shared text (or a part of it), return it as \"\".")
                info["shared_text_start"] = plain(shared)[:500]
            msgs = [{"role": "system", "content": sysmsg},
                    {"role": "user", "content": [{"type": "text", "text": json.dumps(info, ensure_ascii=False)},
                                                 {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64, "detail": "high"}}]
                     + ([{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + mk64, "detail": "high"}}] if mk64 else [])}]
            if not mk64:
                info["note_figures"] = "no numbered second image for this unit: report pictures with \"box\""
                msgs[1]["content"][0]["text"] = json.dumps(info, ensure_ascii=False)
            req = {"id": f"fmt:{u['id']}", "deployment": a.deployment, "messages": msgs, "max_completion_tokens": 16000,
                   "response_format": {"type": "json_object"}}
            if a.effort:
                req["reasoning_effort"] = a.effort
            lines.append(json.dumps(req, ensure_ascii=False))
            meta[u["id"]] = {"ocr": ocr, "source": source, "image_size": size, "regions": [list(map(int, x)) for x in boxes], "segments": (b or {}).get("segments"), "bundle": (b or {}).get("id"),
                             "page": qpages.get(u["id"], [None])[0] if source == "page" else None}
            n += 1
    write_split(a.out, lines)
    Path(a.out).with_suffix(".meta.json").write_text(json.dumps({"examples": [e["unit"] for e in ex], "dpi": bundles.get("dpi", 250), "units": meta}, indent=1), encoding="utf-8")
    print(f"{n} requests -> {a.out}; few-shot units: {[e['unit'] for e in ex]}; system prompt {len(sysmsg)} chars")
    return 0


def write_split(out: str, lines: list[str], max_bytes: int = 24_000_000) -> list[str]:
    """Writes out.jsonl, or out.1.jsonl, out.2.jsonl... when it would pass max_bytes (the laptop copy limit)."""
    parts, cur, size = [], [], 0
    for l in lines:
        if cur and size + len(l) > max_bytes:
            parts.append(cur)
            cur, size = [], 0
        cur.append(l)
        size += len(l.encode("utf-8")) + 1
    if cur:
        parts.append(cur)
    names = [out] if len(parts) == 1 else [str(Path(out).with_suffix(f".{i + 1}.jsonl")) for i in range(len(parts))]
    for name, part in zip(names, parts):
        Path(name).write_text("\n".join(part) + "\n", encoding="utf-8")
    return names


# ---------------- apply ----------------

def apply_ops(text: str, ops: list[dict]) -> tuple[str, list[str]]:
    errs = []
    for op in ops or []:
        find, rep = op.get("find", ""), op.get("replace", "")
        if not find:
            errs.append("empty find")
            continue
        c = text.count(find)
        if c != 1:
            errs.append(f"find occurs {c} times: {find[:60]!r}")
            continue
        text = text.replace(find, rep)
    return text, errs


_SUP = str.maketrans("0123456789+-−=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿ")
_SUB = str.maketrans("0123456789+-−=()", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎")


def unicode_scripts(t: str) -> str:
    """Short digit/sign super- and subscripts as Unicode (m², CuSO₄, 1s²), the way the editor's finished text has them."""
    t = re.sub(r"<sup>([0-9+\-−=()n]{1,3})</sup>", lambda m: m.group(1).translate(_SUP), t)
    return re.sub(r"<sub>([0-9+\-−=()]{1,3})</sub>", lambda m: m.group(1).translate(_SUB), t)


def _words(t: str, minlen: int = 1) -> list[str]:
    import unicodedata
    t = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", t)  # a word split at a line end in the OCR
    t = re.sub(r"</?su[bp]>", "", t)  # 1s<sup>2</sup> is printed as one token, 1s2 in the OCR
    t = re.sub(r"\\[a-zA-Z]+", " ", plain(t))  # KaTeX commands are markup, not printed words
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return [w for w in re.findall(r"[a-z0-9]+", t) if len(w) >= minlen]


def grounded(new: str, ocr: str, minlen: int = 1) -> float:
    """Share of the words of `new` that the OCR of the scan also has (each OCR word used once)."""
    from collections import Counter
    if not ocr:
        return 0.0
    pool, ws = Counter(_words(ocr)), _words(new, minlen)
    if not ws:
        return 1.0
    # a symbol glued to a word is often misread as one character (∠MPR -> 2MPR, ΔT -> AT)
    glued = {}
    for p in pool:
        if len(p) > 2 and p[0] in "2z1l7ia":
            glued.setdefault(p[1:], p)
    hit = 0
    for w in ws:
        p = w if pool[w] > 0 else glued.get(w)
        if p and pool[p] > 0:
            pool[p] -= 1
            hit += 1
    return hit / len(ws)


def guard(old: str, new: str, shared: str = "", ocr: str = "") -> str | None:
    """Reject edits that change the words too much (a rewrite, a summary, or text from another question).
    Removing OCR garbage or adding words the OCR missed is fine: one text then mostly contains the other."""
    po, pn = plain(old), plain(new)
    if not po:
        return None
    if not pn:
        # emptying a field is allowed only when it repeats the group's shared text (or was a placeholder)
        if shared and fuzz.partial_ratio(po[:400], plain(shared)) >= 85:
            return None
        if ocr and grounded(old, ocr, minlen=5) < 0.6:
            return None  # the old text was a description of a picture, not printed words
        return "emptied a field that is not a repeat of the shared text"
    if len(po) < 40:
        return None
    if ocr and grounded(new, ocr) >= 0.95:
        return None  # rebuilt from the scan's own words (the old text was a summary or misread)
    sim = fuzz.ratio(po, pn) / 100
    contained = fuzz.token_set_ratio(po, pn) / 100
    if sim < 0.8 and contained < 0.9:
        return f"words changed too much (similarity {sim:.2f}, overlap {contained:.2f})"
    return None


_TOK = re.compile(r"\w+|[^\w\s]", re.U)


def word_changes(old: str, new: str, ocr: str = "", kept_elsewhere: set | None = None, in_pictures: set | None = None) -> list[dict]:
    """Word-level differences between two versions of a field (markup ignored), each marked plausible or not.
    Plausible: an OCR misreading fixed (the two spellings look alike), stray symbols or one-letter junk removed,
    punctuation added. Anything else (a different word, an added "no") needs a second reading of the scan."""
    import difflib
    a, b = _TOK.findall(plain(old)), _TOK.findall(plain(new))
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        o, n = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        if op == "replace":
            ok = fuzz.ratio(o.lower(), n.lower()) >= 60 or (not re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}", o) and not re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}", n))
        elif op == "delete":
            ok = all(len(t) <= 1 or not t.isalpha() for t in a[i1:i2])
            if not ok and ocr:
                # words moved elsewhere (e.g. into a table) or never printed (a summary's words) may go
                kept, printed = set(_words(new)) | (kept_elsewhere or set()), set(_words(ocr))
                pics = in_pictures or set()
                ok = all(w in kept or w not in printed or w in pics for w in _words(o, 2))
        else:  # insert
            ok = all(not t.isalnum() for t in b[j1:j2])
        if not ok and ocr and op != "delete" and grounded(n, ocr) >= 0.9:
            ok = True  # the added words are printed on the scan (OCR has them)
        out.append({"op": op, "old": o, "new": n, "plausible": bool(ok),
                    "context": " ".join(a[max(0, i1 - 6):i2 + 6])})
    return out


def picture_words(m: dict, figs: list[dict], lw: dict, dpi: int, sizes: dict | None = None) -> set:
    """Normalized OCR words whose centre lies inside the candidate regions the model named as pictures."""
    if m.get("source") == "page" and sizes and m.get("page") in sizes:
        # a unit sent as its whole page (English notices): boxes are thousandths of the page
        Wp, Hp = sizes[m["page"]]
        out = set()
        for g in figs:
            b = g.get("box")
            if not (isinstance(b, list) and len(b) == 4):
                continue
            for w in lw.get(m["page"], []):
                cx, cy = (w[0] + w[2]) / 2 / Wp * 1000, (w[1] + w[3]) / 2 / Hp * 1000
                if b[0] - 10 <= cx <= b[2] + 10 and b[1] - 10 <= cy <= b[3] + 10:
                    out |= set(_words(str(w[4])))
        return out
    regs = m.get("regions") or []
    boxes = [regs[r - 1] for g in figs for r in (g.get("regions") or []) if isinstance(r, int) and 1 <= r <= len(regs)]
    # a picture the model boxed itself (no candidate region fitted it), in thousandths of the crop
    segs = m.get("segments") or []
    W = max((s["box_px"][2] - s["box_px"][0] for s in segs), default=0)
    H = max((s["y_in_image"] + s["box_px"][3] - s["box_px"][1] for s in segs), default=0)
    boxes += [[b[0] * W / 1000, b[1] * H / 1000, b[2] * W / 1000, b[3] * H / 1000] for g in figs
              if not g.get("regions") and isinstance(b := g.get("box"), list) and len(b) == 4]
    if not boxes or not m.get("segments"):
        return set()
    from .regions import grow_over_labels
    out = set()
    wb = words_in_crop(m["segments"], lw, dpi)
    for b in boxes:
        b = grow_over_labels(tuple(b), wb)
        for w in wb:
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                out |= set(_words(str(w[4])))
    return out


def apply(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    out = json.loads(json.dumps(golden))
    f = fields(golden)
    rep = {"units": {}, "usd": 0.0, "word_checks": []}
    mfile = json.load(open(a.meta, encoding="utf-8")) if getattr(a, "meta", None) else {}
    mu = mfile.get("units", {})
    lay = json.load(open(a.layout, encoding="utf-8")) if getattr(a, "layout", None) else None
    lw = layout_words(lay, text=True) if lay else None
    from .paragraphs import page_sizes
    sizes = page_sizes(lay) if lay else {}
    for line in (l for path in a.results for l in open(path, encoding="utf-8")):
        r = json.loads(line)
        uid = r["id"].split(":", 1)[1]
        ur = rep["units"].setdefault(uid, {"changed": [], "rejected": [], "errors": [], "figures": [], "uncertain": []})
        rep["usd"] += r.get("usd", 0)
        if r.get("error") or not r.get("content"):
            ur["errors"].append(str(r.get("error") or r.get("finish_reason")))
            continue
        try:
            ans = json.loads(r["content"])
        except json.JSONDecodeError as e:
            ur["errors"].append(f"bad json: {e}")
            continue
        # words of the whole unit after the edit (text moved to another field is not lost), and the printed words that
        # sit inside the pictures the model reported (labels typed as text before; removing them is right)
        unit_new = set()
        for k2 in f:
            if k2.split(".")[0] == uid:
                v2 = (ans.get("fields") or {}).get(k2)
                unit_new |= set(_words(v2["text"] if isinstance(v2, dict) and isinstance(v2.get("text"), str) else f[k2]))
        pic_words = picture_words(mu.get(uid) or {}, ans.get("figures") or [], lw, mfile.get("dpi", 250), sizes) if lw else set()
        for k, v in (ans.get("fields") or {}).items():
            if k not in f:
                ur["errors"].append(f"unknown field {k}")
                continue
            if k.endswith(".dir"):
                continue  # directions stay as plain text
            if not isinstance(v, dict):
                continue
            if "ops" in v:
                new, errs = apply_ops(f[k], v["ops"])
                ur["errors"] += [f"{k}: {e}" for e in errs]
            elif "text" in v and isinstance(v["text"], str):
                if len(f[k]) > LONG and grounded(v["text"], (mu.get(uid) or {}).get("ocr", "")) < 0.95:
                    ur["rejected"].append(f"{k}: retyped a long field")
                    continue
                new = v["text"]
            else:
                continue
            gid = next((q.get("group_id") for q in golden["questions"] if f"q{q['number']}" == k.split(".")[0]), None)
            shared = " ".join(f.get(f"{gid}.{x}", "") for x in ("passage", "stim")) if gid else ""
            ocr = (mu.get(uid) or {}).get("ocr", "")
            why = guard(f[k], new, shared, ocr)
            if why and not plain(new).strip():
                # emptied: fine when its words are still in another field of the unit (stim repeating the stem) or are
                # the labels of a picture the unit keeps
                others = set()
                for k2 in f:
                    if k2 != k and k2.split(".")[0] == uid:
                        v2 = (ans.get("fields") or {}).get(k2)
                        others |= set(_words(v2["text"] if isinstance(v2, dict) and isinstance(v2.get("text"), str) else f[k2]))
                if all(w in others or w in pic_words for w in _words(f[k], 2)):
                    why = None
            if why:
                ur["rejected"].append(f"{k}: {why}")
                continue
            new = unicode_scripts(new)
            new = re.sub(r"<p( [^>]*)?>\s*(<p\b[^>]*>)", r"\2", new)
            new = re.sub(r"(</p>)\s*</p>", r"\1", new)
            if new == f[k]:
                continue
            changes = [c for c in word_changes(f[k], new, ocr, unit_new, pic_words) if not c["plausible"]]
            if changes and plain(new):
                rep["word_checks"].append({"unit": uid, "key": k, "new": new, "changes": changes})
                ur["held"] = ur.get("held", []) + [k]
                continue
            set_field(out, k, new)
            ur["changed"].append(k)
        if ur["rejected"] and ur["changed"]:
            # half an edit can duplicate text moved between fields (stim -> stem): keep the unit as it was
            for k in ur["changed"]:
                set_field(out, k, f[k])
            ur["rejected"].append(f"other fields kept as they were too: {', '.join(ur['changed'])}")
            ur["changed"] = []
        # a box over the whole crop is the text itself, not a picture
        ur["figures"] = [g for g in ans.get("figures") or []
                         if not (isinstance(g.get("box"), list) and len(g["box"]) == 4
                                 and (g["box"][2] - g["box"][0]) * (g["box"][3] - g["box"][1]) >= 0.8e6)]
        ur["uncertain"] = ans.get("uncertain") or []
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.report:
        json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    u = rep["units"].values()
    print(f"units {len(rep['units'])}: changed fields {sum(len(x['changed']) for x in u)}, rejected {sum(len(x['rejected']) for x in u)}, "
          f"errors {sum(len(x['errors']) for x in u)}, figures {sum(len(x['figures']) for x in u)}, cost ${rep['usd']:.3f}")
    return 0


WORDCHECK_SYS = (
    "You compare two readings of a few words of a printed exam booklet with the scan. For each numbered change, look at "
    "the scan and say which reading matches the printed text exactly: \"old\", \"new\", or \"neither\" (then give the "
    "exact printed words in \"printed\"). Spelling, accents and punctuation count. Return JSON "
    '{"answers": [{"n": 1, "pick": "old|new|neither", "printed": ""}]}.')


def wordcheck_build(a) -> int:
    rep = json.load(open(a.report, encoding="utf-8"))
    golden = json.load(open(a.golden, encoding="utf-8"))
    crops = Path(a.crops)
    bundles = json.load(open(crops / "bundles.json", encoding="utf-8"))
    by_id = {u["id"]: u for u in units(golden)}
    lines = []
    for i, wc in enumerate(rep.get("word_checks", [])):
        u = by_id.get(wc["unit"])
        img, _ = crop_for(u, bundles, crops) if u else (None, None)
        if img is None:
            continue
        b64, _ = jpeg_b64(remove_blue(img))
        items = [{"n": j + 1, "context": c["context"], "old": c["old"], "new": c["new"]} for j, c in enumerate(wc["changes"])]
        msgs = [{"role": "system", "content": WORDCHECK_SYS},
                {"role": "user", "content": [{"type": "text", "text": json.dumps({"field": wc["key"], "changes": items}, ensure_ascii=False)},
                                             {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64, "detail": "high"}}]}]
        req = {"id": f"wc:{i}", "deployment": a.deployment, "messages": msgs, "max_completion_tokens": 6000,
               "response_format": {"type": "json_object"}}
        if a.effort:
            req["reasoning_effort"] = a.effort
        lines.append(json.dumps(req, ensure_ascii=False))
    names = write_split(a.out, lines)
    print(f"{len(lines)} word checks -> {', '.join(names)}")
    return 0


def wordcheck_apply(a) -> int:
    """A held field is applied only when the second reader picks "new" for every one of its word changes."""
    rep = json.load(open(a.report, encoding="utf-8"))
    golden = json.load(open(a.golden, encoding="utf-8"))
    res = {}
    for path in a.results:
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            res[r["id"]] = r
    applied, kept = 0, []
    for i, wc in enumerate(rep.get("word_checks", [])):
        r = res.get(f"wc:{i}")
        try:
            ans = {x["n"]: x for x in json.loads(r["content"])["answers"]} if r and r.get("content") else {}
        except (json.JSONDecodeError, KeyError, TypeError):
            ans = {}
        picks = [ans.get(j + 1, {}).get("pick") for j in range(len(wc["changes"]))]
        if picks and all(p == "new" for p in picks):
            set_field(golden, wc["key"], wc["new"])
            applied += 1
        else:
            kept.append({"key": wc["key"], "picks": picks, "changes": wc["changes"]})
    json.dump(golden, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    rep["word_checks_result"] = {"applied": applied, "kept_old": kept}
    json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"word checks: {applied} applied, {len(kept)} kept as before")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--golden", required=True)
    b.add_argument("--crops", required=True)
    b.add_argument("--pdf")
    b.add_argument("--layout", help="saved Azure layout JSON, for picture candidates")
    b.add_argument("--examples-before")
    b.add_argument("--examples-after")
    b.add_argument("--deployment", default="solve")
    b.add_argument("--effort", default="low")
    b.add_argument("--fresh", action="store_true", help="rewrite every field from the scan and OCR instead of editing it")
    b.add_argument("--only")
    b.add_argument("--out", required=True)
    p = sub.add_parser("apply")
    p.add_argument("--golden", required=True)
    p.add_argument("--results", required=True, nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--report")
    p.add_argument("--meta", help="the build's .meta.json: unit OCR lets edits that use the scan's own words through")
    p.add_argument("--layout", help="saved Azure layout: text removed because it is inside a reported picture is allowed")
    w = sub.add_parser("wordcheck-build")
    w.add_argument("--golden", required=True)
    w.add_argument("--crops", required=True)
    w.add_argument("--report", required=True)
    w.add_argument("--deployment", default="enrich")
    w.add_argument("--effort", default="")
    w.add_argument("--out", required=True)
    x = sub.add_parser("wordcheck-apply")
    x.add_argument("--golden", required=True)
    x.add_argument("--report", required=True)
    x.add_argument("--results", required=True, nargs="+")
    x.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    return {"build": build, "apply": apply, "wordcheck-build": wordcheck_build, "wordcheck-apply": wordcheck_apply}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
