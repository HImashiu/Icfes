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
from .regions import layout_words, marked, propose, words_in_crop
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
    fb, fa = fields(before), fields(after)
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
    words = figs_layout = None
    if a.layout:
        lay = json.load(open(a.layout, encoding="utf-8"))
        words = layout_words(lay)
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
            cur = {k: f[k] for k in u["keys"]}
            longk = [k for k in u["keys"] if len(f[k]) > LONG]
            info = {"unit": u["id"], "section": u["section"], "image": "crop of this unit" if source == "crop" else "the whole page; find the unit on it",
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
            meta[u["id"]] = {"source": source, "image_size": size, "regions": [list(map(int, x)) for x in boxes], "segments": (b or {}).get("segments"), "bundle": (b or {}).get("id"),
                             "page": qpages.get(u["id"], [None])[0] if source == "page" else None}
            n += 1
    write_split(a.out, lines)
    Path(a.out).with_suffix(".meta.json").write_text(json.dumps({"examples": [e["unit"] for e in ex], "units": meta}, indent=1), encoding="utf-8")
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


def guard(old: str, new: str, shared: str = "") -> str | None:
    """Reject edits that change the words too much (a rewrite, a summary, or text from another question).
    Removing OCR garbage or adding words the OCR missed is fine: one text then mostly contains the other."""
    po, pn = plain(old), plain(new)
    if not po:
        return None
    if not pn:
        # emptying a field is allowed only when it repeats the group's shared text (or was a placeholder)
        if shared and fuzz.partial_ratio(po[:400], plain(shared)) >= 85:
            return None
        return "emptied a field that is not a repeat of the shared text"
    if len(po) < 40:
        return None
    sim = fuzz.ratio(po, pn) / 100
    contained = fuzz.token_set_ratio(po, pn) / 100
    if sim < 0.8 and contained < 0.9:
        return f"words changed too much (similarity {sim:.2f}, overlap {contained:.2f})"
    return None


_TOK = re.compile(r"\w+|[^\w\s]", re.U)


def word_changes(old: str, new: str) -> list[dict]:
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
        else:  # insert
            ok = all(not t.isalnum() for t in b[j1:j2])
        out.append({"op": op, "old": o, "new": n, "plausible": bool(ok),
                    "context": " ".join(a[max(0, i1 - 6):i2 + 6])})
    return out


def apply(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    out = json.loads(json.dumps(golden))
    f = fields(golden)
    rep = {"units": {}, "usd": 0.0, "word_checks": []}
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
                if len(f[k]) > LONG:
                    ur["rejected"].append(f"{k}: retyped a long field")
                    continue
                new = v["text"]
            else:
                continue
            gid = next((q.get("group_id") for q in golden["questions"] if f"q{q['number']}" == k.split(".")[0]), None)
            shared = " ".join(f.get(f"{gid}.{x}", "") for x in ("passage", "stim")) if gid else ""
            why = guard(f[k], new, shared)
            if why:
                ur["rejected"].append(f"{k}: {why}")
                continue
            new = re.sub(r"<p( [^>]*)?>\s*(<p\b[^>]*>)", r"\2", new)
            new = re.sub(r"(</p>)\s*</p>", r"\1", new)
            if new == f[k]:
                continue
            changes = [c for c in word_changes(f[k], new) if not c["plausible"]]
            if changes and plain(new):
                rep["word_checks"].append({"unit": uid, "key": k, "new": new, "changes": changes})
                ur["held"] = ur.get("held", []) + [k]
                continue
            set_field(out, k, new)
            ur["changed"].append(k)
        ur["figures"] = ans.get("figures") or []
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
    b.add_argument("--only")
    b.add_argument("--out", required=True)
    p = sub.add_parser("apply")
    p.add_argument("--golden", required=True)
    p.add_argument("--results", required=True, nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--report")
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
