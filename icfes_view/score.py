"""Score extracted questions against a gold file (corrections export with verified=true).

python -m icfes_view.score --questions questions/<doc>.auto.json --gold gold.json
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
from pathlib import Path


def _latex_plain(s: str) -> str:
    """$\\frac { 1 } { 3 }$ and 1/3 are the same thing: reduce both to a plain skeleton before comparing."""
    for _ in range(3):
        s = re.sub(r"\\frac\s*\{\s*([^{}]*?)\s*\}\s*\{\s*([^{}]*?)\s*\}", r"\1/\2", s)
    s = s.replace("\\times", "x").replace("\u00d7", "x").replace("\\cdot", "*").replace("\u00b2", "^2")
    s = re.sub(r"\\(left|right|quad|,|;)", " ", s)
    s = re.sub(r"\\([a-zA-Z]+)", r"\1", s)
    return s.replace("$", " ").replace("{", "").replace("}", "")


def _n(s: str) -> str:
    s = re.sub(r"\\([.\-()])", r"\1", s or "")
    s = re.sub(r"[#*_`>|]|<[^>]+>|!\[[^\]]*\]\([^)]*\)", " ", _latex_plain(s))
    s = s.lower()
    return re.sub(r"[^0-9a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1/^=+*,.\-]", "", s)


def sim(a: str, b: str) -> float:
    a, b = _n(a), _n(b)
    return 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()


def score_question(q: dict, g: dict, stem_min: float = 0.9, opt_min: float = 0.85) -> dict:
    stem = sim(q.get("stem_md", ""), g.get("stem_md", ""))
    gopts = {o["letter"]: o["text_md"] for o in g.get("options", []) if (o.get("text_md") or "").strip()}
    qopts = {o["letter"]: o["text_md"] for o in q.get("options", [])}
    per = {L: sim(qopts.get(L, ""), t) for L, t in gopts.items()}
    ok_count = set(qopts) == set(gopts)
    passed = stem >= stem_min and ok_count and all(v >= opt_min for v in per.values())
    return {"number": q["number"], "section": q.get("section"), "stem": round(stem, 2), "options_count_ok": ok_count,
            "options": {k: round(v, 2) for k, v in per.items()}, "pass": passed}


def score(questions: list[dict], gold: dict) -> dict:
    by = {q["number"]: q for q in questions}
    rows = []
    for g in gold.get("corrections", []):
        if not g.get("verified") or g["number"] not in by:
            continue
        rows.append(score_question(by[g["number"]], g))
    secs: dict[str, list[dict]] = {}
    for r in rows:
        secs.setdefault(r["section"] or "?", []).append(r)
    summary = {s: {"n": len(v), "pass": sum(r["pass"] for r in v),
                   "mean_stem": round(sum(r["stem"] for r in v) / len(v), 2),
                   "options_count_ok": sum(r["options_count_ok"] for r in v)} for s, v in secs.items()}
    return {"rows": rows, "summary": summary,
            "pass_rate": round(sum(r["pass"] for r in rows) / len(rows), 2) if rows else None}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_view.score", description=__doc__)
    ap.add_argument("--questions", required=True, type=Path)
    ap.add_argument("--gold", required=True, type=Path)
    a = ap.parse_args(argv)
    res = score(json.loads(a.questions.read_text(encoding="utf-8"))["questions"],
                json.loads(a.gold.read_text(encoding="utf-8")))
    for r in res["rows"]:
        print(f"Q{r['number']:<4} {'PASS' if r['pass'] else 'FAIL'}  stem={r['stem']:.2f}  options_ok={r['options_count_ok']}  {r['options']}")
    print(json.dumps(res["summary"], indent=1, ensure_ascii=False), f"\noverall pass rate: {res['pass_rate']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
