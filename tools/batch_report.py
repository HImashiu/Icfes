"""Summarize a processed batch: one row per exam (questions, clean rate, flags, validation, per-section counts).

  python tools/batch_report.py --output data/out
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", required=True, type=Path)
    a = ap.parse_args()
    mf = json.loads((a.output / "manifest.json").read_text(encoding="utf-8"))
    rows, tot = [], {"q": 0, "ready": 0, "flag": 0, "ph": 0}
    sec_tot: dict[str, list[int]] = {}
    for rec in sorted(mf["documents"].values(), key=lambda r: r.get("primary_path", "")):
        d = rec["doc_id"]
        qp = a.output / "questions" / f"{d}.json"
        if not qp.exists():
            rows.append((Path(rec["primary_path"]).stem, rec["status"], "-", "-", "-", "-", "-", "no questions file"))
            continue
        q = json.loads(qp.read_text(encoding="utf-8"))
        qs = q["questions"]
        flagged = [x for x in qs if x["flags"]]
        ph = [x for x in qs if x.get("placeholder")]
        val = q.get("validation", {})
        for x in qs:
            s = sec_tot.setdefault((x["section"] or "?")[:12], [0, 0])
            s[0] += 1
            s[1] += not x["flags"]
        tot["q"] += len(qs); tot["ready"] += len(qs) - len(flagged); tot["flag"] += len(flagged); tot["ph"] += len(ph)
        exp = val.get("expected_total")
        rows.append((Path(rec["primary_path"]).stem, rec["status"], len(qs), f"{len(qs) - len(flagged)}", len(flagged), len(ph),
                     f"{exp}" if exp else "?", "; ".join(w[:60] for w in val.get("warnings", [])[:1])))
    print(f"{'exam':24}{'status':10}{'found':>6}{'clean':>6}{'flag':>5}{'undet':>6}{'cover':>6}  first warning")
    for r in rows:
        print(f"{r[0]:24}{r[1]:10}{r[2]!s:>6}{r[3]!s:>6}{r[4]!s:>5}{r[5]!s:>6}{r[6]!s:>6}  {r[7]}")
    print(f"\nTOTAL questions {tot['q']} | clean {tot['ready']} ({100 * tot['ready'] / max(1, tot['q']):.0f}%) | flagged {tot['flag']} | not detected {tot['ph']}")
    print("by section:", {k: f"{v[1]}/{v[0]}" for k, v in sec_tot.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
