"""Math pass: printed fractions, roots and overlines typeset as KaTeX, the way Desmos shows them.

The format pass often keeps the OCR's flat reading ("(a+b)/2 / 2"). Units whose crop shows a fraction bar (a short dark
rule with ink right above and below it, not part of a table border) or a root sign are sent once more with a narrow
task: change only the math. An answer is applied only when the text outside the math is unchanged and the math holds
the same letters and digits the old text had.

    python -m icfes_polish.math_stage build --golden G --crops DIR --layout L --deployment judge --effort low --out Q.jsonl
    python -m icfes_polish.math_stage apply --golden G --results Q.*.jsonl --out G2 --report R
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from .fields import fields, set_field
from .format_stage import crop_for, jpeg_b64, units, write_split
from .images import blue_mask, remove_blue
from .spec import MATH_TASK


def fraction_bars(img, min_len: int = 14, max_frac: float = 0.4) -> int:
    """Count fraction bars: a horizontal dark run at most 3 px thick, shorter than max_frac of the crop width, with a
    white gap right above and below it, and ink just above and just below that stays within the bar's width (a
    numerator and a denominator). Underlined blanks, table borders and letter strokes fail one of these."""
    a = np.array(img.convert("RGB"))
    ink = (a.mean(2) < 130) & ~blue_mask(a)
    h, w = ink.shape
    n = 0
    seen = np.zeros_like(ink)
    for y in range(24, h - 24):
        row = ink[y]
        if not row.any():
            continue
        xs = np.flatnonzero(np.diff(np.concatenate(([0], row.astype(np.int8), [0]))))
        for x0, x1 in zip(xs[0::2], xs[1::2]):
            L = x1 - x0
            if L < min_len or L > max_frac * w or seen[y, x0]:
                continue
            thick = 1
            while y + thick < h and ink[y + thick, x0:x1].mean() > 0.9:
                thick += 1
            if thick > 3 or ink[y - 1, x0:x1].any() or ink[y + thick, x0:x1].mean() > 0.3:
                continue
            ok = True
            for lo, hi in ((y - 22, y - 1), (y + thick + 1, y + thick + 22)):
                band = ink[lo:hi]
                rows = band[:, x0:x1].any(1)
                if rows.sum() < 4:
                    ok = False
                    break
                near = np.flatnonzero(rows)
                if (near.max() < 22 - 9) if lo < y else (near.min() > 8):  # the ink must start close to the bar
                    ok = False
                    break
                pad = max(6, L // 5)
                spill = band[:, max(0, x0 - 3 * pad):max(0, x0 - pad)].sum() + band[:, x1 + pad:x1 + 3 * pad].sum()
                if spill > 0.3 * band[:, x0:x1].sum():  # a line of text runs on past the bar: not a fraction
                    ok = False
                    break
            if ok:
                n += 1
                seen[y:y + thick + 1, x0:x1] = True
    return n


def build(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    crops = Path(a.crops)
    bundles = json.load(open(crops / "bundles.json", encoding="utf-8"))
    f = fields(golden)
    lines, picked = [], {}
    for u in units(golden):
        cur = {k: f[k] for k in u["keys"] if f[k].strip()}
        if not cur:
            continue
        img, _ = crop_for(u, bundles, crops)
        if img is None:
            continue
        bars = fraction_bars(remove_blue(img))
        roots = sum(v.count("√") for v in cur.values())
        flat = sum(len(re.findall(r"[\w)]\s*/\s*[\w(]", re.sub(r"<[^>]+>|\$[^$]*\$", " ", v))) for v in cur.values())
        if not (bars or roots or flat):
            continue
        picked[u["id"]] = {"bars": bars, "roots": roots, "slashes": flat}
        b64, _ = jpeg_b64(remove_blue(img))
        msgs = [{"role": "system", "content": MATH_TASK},
                {"role": "user", "content": [{"type": "text", "text": json.dumps({"unit": u["id"], "fields": cur}, ensure_ascii=False)},
                                             {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64, "detail": "high"}}]}]
        req = {"id": f"math:{u['id']}", "deployment": a.deployment, "messages": msgs, "max_completion_tokens": 12000,
               "response_format": {"type": "json_object"}}
        if a.effort:
            req["reasoning_effort"] = a.effort
        lines.append(json.dumps(req, ensure_ascii=False))
    names = write_split(a.out, lines) if lines else []
    Path(a.out).with_suffix(".meta.json").write_text(json.dumps(picked, indent=1), encoding="utf-8")
    print(f"math: {len(lines)} units with fractions, roots or slashes -> {', '.join(names) or 'nothing to send'}")
    return 0


MATH = re.compile(r"\$[^$]+\$")


SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")


def outside(t: str) -> str:
    return re.sub(r"\s+", " ", MATH.sub(" ", t)).strip()


def _words(t: str) -> list[str]:
    t = re.sub(r"<[^>]+>|\[\[[^\]]*\]\]", " ", t)
    return re.findall(r"[^\W\d_]{2,}", t.lower())


def chars(t: str) -> Counter:
    t = re.sub(r"<[^>]+>|\[\[[^\]]*\]\]", " ", t).translate(SUP)
    t = re.sub(r"\\(?:text|mathrm|textbf|operatorname)\{([^}]*)\}", r" \1 ", t)
    t = re.sub(r"\\(ln|log|sin|cos|tan|max|min)(?![a-zA-Z])", r" \1 ", t)  # function names are printed letters
    t = re.sub(r"\\[a-zA-Z]+", " ", t)
    return Counter(c.lower() for c in t if c.isalnum())


def check(old: str, new: str) -> str | None:
    """Why a math edit is refused, or None. Words outside the math keep their order and nothing is added outside it;
    letters and digits overall stay the same (the math holds what the flat text had)."""
    if new.count("$") % 2:
        return "unbalanced $"
    for m in MATH.findall(new):
        if re.search(r"(?<!\\)%", m):
            return "unescaped % inside math"
    it = iter(_words(old))
    if not all(any(x == y for y in it) for x in _words(outside(new))):
        return "text outside the math changed"
    if re.sub(r"\$[^$]+\$", "", re.sub(r"<[^>]+>", "", new)).count("[[") != re.sub(r"<[^>]+>", "", old).count("[["):
        return "a figure or gap marker changed"
    before, after = chars(old), chars(new)
    lost, added = before - after, after - before
    if sum(lost.values()) > 1 or sum(added.values()) > 1:
        return f"letters/digits changed (lost {''.join(sorted(lost.elements()))[:20]}, added {''.join(sorted(added.elements()))[:20]})"
    return None


CMDS = r"dfrac|frac|sqrt|overline|cdot|times|neq|leq|geq|text|left|right|div|pm|degree|angle|approx|ln|log"


def fix_escapes(t: str) -> str:
    """A backslash the model forgot to double in JSON comes back as a control character (\f of \frac) or not at all
    ($dfrac{1}{2}$): put the KaTeX command back, inside the math only."""
    def one(m):
        x = m.group(0).replace("\x0c", "\\f").replace("\t", "\\t").replace("\x08", "\\b").replace("\r", "\\r")
        x = re.sub(r"(?<![\\a-zA-Z])(" + CMDS + r")(?=[{\s(\\\d])", r"\\\1", x)
        x = re.sub(r"(\d),(\d)", r"\1{,}\2", x)  # a decimal comma, not a list comma with a space after it
        return re.sub(r"(\d|\})\s*[x×]\s*(?=\d)", r"\1 \\times ", x)  # 8,95 x 10 is a product, not the variable x
    return MATH.sub(one, t)


def apply(a) -> int:
    golden = json.load(open(a.golden, encoding="utf-8"))
    f = fields(golden)
    rep = {"usd": 0.0, "changed": [], "rejected": [], "errors": []}
    for path in a.results:
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            uid = r["id"].split(":", 1)[1]
            rep["usd"] += r.get("usd", 0)
            try:
                ans = json.loads(r["content"]).get("fields") or {}
            except (json.JSONDecodeError, KeyError, TypeError, AttributeError):
                rep["errors"].append(uid)
                continue
            for k, v in ans.items():
                if k not in f or k.split(".")[0] != uid or not isinstance(v, str):
                    continue
                v = fix_escapes(v)
                if v == f[k]:
                    continue
                why = check(f[k], v)
                if why:
                    rep["rejected"].append({"field": k, "why": why, "new": v[:300]})
                else:
                    set_field(golden, k, v)
                    rep["changed"].append(k)
    json.dump(golden, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"math: {len(rep['changed'])} fields typeset, {len(rep['rejected'])} refused, {len(rep['errors'])} errors, ${rep['usd']:.3f}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_polish.math_stage")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--golden", required=True)
    b.add_argument("--crops", required=True)
    b.add_argument("--deployment", default="judge")
    b.add_argument("--effort", default="low")
    b.add_argument("--out", required=True)
    p = sub.add_parser("apply")
    p.add_argument("--golden", required=True)
    p.add_argument("--results", nargs="+", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--report", required=True)
    a = ap.parse_args(argv)
    return build(a) if a.cmd == "build" else apply(a)


if __name__ == "__main__":
    sys.exit(main())
