"""python -m icfes_llm --output data/out [--dry-run] [--budget-usd 2]   (needs ANTHROPIC_API_KEY, or `ant auth login`)"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .runner import PRICES, BudgetReached, Extractor


def targets(out: Path, doc_id: str, only: str, numbers: set[int] | None):
    qdir = out / "questions"
    auto = json.loads((qdir / f"{doc_id}.auto.json").read_text(encoding="utf-8"))["questions"]
    groups = {g["id"]: g for g in json.loads((qdir / f"{doc_id}.json").read_text(encoding="utf-8"))["groups"]}
    crops = out / "crops" / doc_id
    singles, group_jobs = [], {}
    for q in auto:
        if numbers is not None and q["number"] not in numbers:
            continue
        if numbers is None and only == "flagged" and not q["flags"] and not q.get("placeholder"):
            continue
        if q.get("placeholder"):
            g = groups.get(q.get("group_id"))
            f = crops / f"{q['group_id']}.png" if g else None
            if f and f.exists():
                group_jobs.setdefault(q["group_id"], {"group": g, "crop": f, "numbers": []})["numbers"].append(q["number"])
            continue
        f = crops / f"q{q['number']:03d}.png"
        if f.exists():
            singles.append((q, f))
    return singles, list(group_jobs.values())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_llm", description=__doc__)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--doc")
    ap.add_argument("--only", choices=["flagged", "all"], default="flagged", help="which questions to send (default: those with review notes)")
    ap.add_argument("--numbers", help="comma-separated question numbers (overrides --only)")
    ap.add_argument("--model", default="claude-opus-5-5", help="claude-sonnet-5-5 costs about half as much")
    ap.add_argument("--effort", default="medium", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--passes", type=int, default=1, help="2 = transcribe twice and compare (recommended for Math)")
    ap.add_argument("--budget-usd", type=float, default=2.0, help="hard cap across all runs (tracked in the cache file)")
    ap.add_argument("--price-in", type=float, help="USD per million input tokens (needed for models not in the built-in table)")
    ap.add_argument("--price-out", type=float, help="USD per million output tokens")
    ap.add_argument("--dry-run", action="store_true", help="list what would be sent and the estimated cost; no API calls")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    price = (a.price_in, a.price_out) if a.price_in is not None and a.price_out is not None else None
    if price is None and a.model not in PRICES:
        print(f"Unknown price for {a.model}: pass --price-in and --price-out", file=sys.stderr)
        return 2
    nums = {int(x) for x in a.numbers.split(",")} if a.numbers else None
    docs = [r for r in json.loads((a.output / "manifest.json").read_text(encoding="utf-8"))["documents"].values()
            if r["status"] in ("completed", "partial") and (not a.doc or a.doc in r["doc_id"])]
    client = None
    if not a.dry_run:
        import anthropic
        client = anthropic.Anthropic()
    rc = 0
    for rec in docs:
        doc_id = rec["doc_id"]
        try:
            singles, group_jobs = targets(a.output, doc_id, a.only, nums)
        except FileNotFoundError as e:
            print(f"{doc_id}: run icfes_view and icfes_crop first ({e.filename})", file=sys.stderr)
            rc = 1
            continue
        ex = Extractor(client, a.model, a.effort, a.passes, a.budget_usd, price, a.output / "questions" / f"{doc_id}.llm_cache.json")
        est = sum(ex.estimate(f, len(q.get("stem_md", "")) + 400) for q, f in singles) + \
            sum(ex.estimate(j["crop"], 600) / a.passes for j in group_jobs)
        print(f"{doc_id}: {len(singles)} question(s) + {len(group_jobs)} shared-passage zone(s) -> estimated ${est:.2f} "
              f"({a.model}, effort {a.effort}, {a.passes} pass(es)); cap ${a.budget_usd:.2f}; already spent ${ex.spend.usd:.3f}")
        if a.dry_run:
            print("DRY RUN: nothing was sent.")
            continue
        results, errors, skipped = [], [], []
        try:
            for q, f in singles:
                try:
                    results.append(ex.extract_question(q, f))
                except BudgetReached:
                    raise
                except Exception as e:  # noqa: BLE001 - recorded, never silent
                    errors.append({"number": q["number"], "error": f"{type(e).__name__}: {e}"})
            for j in group_jobs:
                try:
                    results += ex.extract_group(sorted(j["numbers"]), j["group"]["directions"], j["crop"])
                except BudgetReached:
                    raise
                except Exception as e:  # noqa: BLE001
                    errors.append({"numbers": j["numbers"], "error": f"{type(e).__name__}: {e}"})
        except BudgetReached as e:
            done = {r["number"] for r in results}
            skipped = [q["number"] for q, _ in singles if q["number"] not in done]
            print(f"BUDGET REACHED: {e}. Re-run with a higher --budget-usd to continue (finished work is cached).", file=sys.stderr)
            rc = 1
        ex.save()
        out = {"doc_id": doc_id, "model": a.model, "spent_usd": round(ex.spend.usd, 4), "calls": ex.spend.calls,
               "results": results, "errors": errors, "skipped_budget": skipped}
        (a.output / "questions" / f"{doc_id}.ai.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  {len(results)} transcribed ({sum(r['needs_human'] for r in results)} need a human check), "
              f"{len(errors)} error(s), spent ${ex.spend.usd:.3f}. Next: python -m icfes_view --output {a.output} --ai")
        rc = rc or (1 if errors else 0)
    return rc
