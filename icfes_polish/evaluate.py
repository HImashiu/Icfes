"""Measure a candidate golden against a reference golden (for the pilot: Juan's hand-finished S11-A).

python -m icfes_polish.evaluate <candidate.golden.json> <reference.golden.json> [--show N] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import sys

from rapidfuzz import fuzz

from .fields import canon, fields, markup_counts, plain


def compare(cand: dict, ref: dict) -> dict:
    fc, fr = fields(cand), fields(ref)
    keys = [k for k in fr if (fr[k] or fc.get(k))]
    rows = []
    tags_hit: dict[str, int] = {}
    tags_ref: dict[str, int] = {}
    tags_cand: dict[str, int] = {}
    for k in keys:
        c, r = fc.get(k, ""), fr[k]
        rows.append({
            "key": k,
            "exact": canon(c) == canon(r),
            "words": plain(c) == plain(r),
            "sim": fuzz.ratio(canon(c), canon(r)) / 100,
            "wsim": fuzz.ratio(plain(c), plain(r)) / 100,
        })
        mc, mr = markup_counts(c), markup_counts(r)
        for t in mr:
            tags_ref[t] = tags_ref.get(t, 0) + mr[t]
            tags_cand[t] = tags_cand.get(t, 0) + mc[t]
            tags_hit[t] = tags_hit.get(t, 0) + min(mc[t], mr[t])
        rows[-1]["markup_ok"] = {t: v for t, v in mc.items() if t != "justify"} == {t: v for t, v in mr.items() if t != "justify"}
    n = len(rows) or 1
    tags = {t: {"ref": tags_ref[t], "cand": tags_cand[t],
                "recall": round(tags_hit[t] / tags_ref[t], 3) if tags_ref[t] else None,
                "precision": round(tags_hit[t] / tags_cand[t], 3) if tags_cand[t] else None}
            for t in tags_ref if tags_ref[t] or tags_cand[t]}
    return {
        "fields": len(rows),
        "exact": round(sum(r["exact"] for r in rows) / n, 4),
        "words_exact": round(sum(r["words"] for r in rows) / n, 4),
        "markup_exact": round(sum(r["markup_ok"] for r in rows) / n, 4),
        "similarity": round(sum(r["sim"] for r in rows) / n, 4),
        "word_similarity": round(sum(r["wsim"] for r in rows) / n, 4),
        "tags": tags,
        "rows": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate")
    ap.add_argument("reference")
    ap.add_argument("--show", type=int, default=0, help="print the N worst fields")
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    cand = json.load(open(a.candidate, encoding="utf-8"))
    ref = json.load(open(a.reference, encoding="utf-8"))
    res = compare(cand, ref)
    print(f"fields {res['fields']}  exact {res['exact']:.1%}  words exact {res['words_exact']:.1%}  "
          f"markup exact {res['markup_exact']:.1%}  similarity {res['similarity']:.3f}  word similarity {res['word_similarity']:.3f}")
    for t, v in res["tags"].items():
        print(f"  {t:8} ref {v['ref']:4} cand {v['cand']:4} recall {v['recall']} precision {v['precision']}")
    if a.show:
        fc, fr = fields(cand), fields(ref)
        for r in sorted(res["rows"], key=lambda r: r["sim"])[: a.show]:
            print(f"\n--- {r['key']} sim {r['sim']:.2f}\nCAND: {canon(fc.get(r['key'], ''))[:400]}\nREF:  {canon(fr[r['key']])[:400]}")
    if a.json:
        json.dump(res, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
