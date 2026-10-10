"""Applies edits saved in the published admin page to the shared icfes folder.

    python -m icfes_admin.apply_edits --edits edits.json --to /mnt/project-files/icfes [--write]

edits.json is a list of rows {"exam", "number", "patch"}, as the page saves them to its `edits` collection.
Each row goes through the same path as the local editor (Store.update_question): the ready gate refuses
a question that has validator errors or hidden reasons, and every replaced file is backed up first.
Dry run by default: it reports what would be applied and writes nothing.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from .store import BadRequest, Conflict, NotFound, Store


def apply(rows: list[dict], target: str, write: bool) -> dict:
    if write:
        store = Store(target)
    else:
        # A dry run applies to a scratch copy, so the gate is checked without touching the shared folder.
        scratch = Path(tempfile.mkdtemp(prefix="icfes-dry-"))
        for sub in ("data", "answer-keys"):
            shutil.copytree(Path(target) / sub, scratch / sub)
        for manifest in (Path(target) / "figures" / "traced").glob("*/manifest.json"):
            dest = scratch / "figures" / "traced" / manifest.parent.name
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(manifest, dest / "manifest.json")
        store = Store(scratch)
    results = {"applied": [], "refused": []}
    for row in rows:
        key = f"{row.get('exam')}#{row.get('number')}"
        try:
            store.update_question(row["exam"], int(row["number"]), dict(row["patch"]))
            results["applied"].append(key)
        except Conflict as e:
            results["refused"].append({"key": key, "reason": "not ready: " + "; ".join(e.reasons)})
        except (BadRequest, NotFound, KeyError) as e:
            results["refused"].append({"key": key, "reason": str(e)})
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(prog="icfes_admin.apply_edits", description=__doc__.split("\n")[0])
    ap.add_argument("--edits", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)
    rows = json.loads(Path(args.edits).read_text(encoding="utf-8"))
    res = apply(rows, args.to, args.write)
    for k in res["applied"]:
        print(("applied " if args.write else "would apply ") + k)
    for r in res["refused"]:
        print(f"REFUSED {r['key']}: {r['reason']}")
    print(f"{len(res['applied'])} {'applied' if args.write else 'to apply'}, {len(res['refused'])} refused")
    if not args.write:
        print("dry run; pass --write to apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
