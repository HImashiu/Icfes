"""Bring edits made in the local editor back into the shared icfes folder.

The editor runs on a laptop copy of the data (C:\\Icfes\\icfes). This copies changed files back to the
shared folder that the app and the other threads read. Dry run by default.

    python -m icfes_admin.sync --from <laptop copy> --to <shared folder>            # shows what would change
    python -m icfes_admin.sync --from <laptop copy> --to <shared folder> --write    # applies it

A golden is copied only if it does not add validator errors to the shared version. The shared
file is backed up to data/.backups/ first. Answer keys and traced manifests are copied as they are.
"""
from __future__ import annotations

import argparse
import filecmp
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

from icfes_view.golden import validate_golden

SYNCED = ("data/*.golden.json", "answer-keys/*.key.json", "figures/traced/*/manifest.json")


def changed_files(src: Path, dst: Path):
    out = []
    for pattern in SYNCED:
        for f in sorted(src.glob(pattern)):
            target = dst / f.relative_to(src)
            if not target.exists() or not filecmp.cmp(f, target, shallow=False):
                out.append(f.relative_to(src))
    return out


def error_count(path: Path):
    if not path.exists():
        return 0
    return validate_golden(json.loads(path.read_text(encoding="utf-8")))["summary"]["errors"]


def plan(src: Path, dst: Path):
    rows = []
    for rel in changed_files(src, dst):
        new_errors = error_count(src / rel) if rel.name.endswith(".golden.json") else 0
        old_errors = error_count(dst / rel) if rel.name.endswith(".golden.json") else 0
        ok = new_errors <= old_errors
        rows.append((rel, ok, old_errors, new_errors))
    return rows


def apply(src: Path, dst: Path, rows):
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    done = []
    for rel, ok, _, _ in rows:
        if not ok:
            continue
        target = dst / rel
        if target.exists():
            backup = dst / "data" / ".backups" / f"{rel.name}.{stamp}"
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / rel, target)
        done.append(rel)
    return done


def main(argv=None):
    ap = argparse.ArgumentParser(prog="icfes_admin.sync", description=__doc__.split("\n")[0])
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)
    src, dst = Path(args.src), Path(args.dst)
    rows = plan(src, dst)
    if not rows:
        print("nothing changed")
        return 0
    for rel, ok, old, new in rows:
        note = "" if not rel.name.endswith(".golden.json") else f"  validator errors {old} -> {new}"
        print(f"{'copy' if ok else 'SKIP (adds validator errors)'}  {rel}{note}")
    if not args.write:
        print("dry run; pass --write to apply")
        return 0
    done = apply(src, dst, rows)
    print(f"copied {len(done)} file(s); backups in {dst / 'data' / '.backups'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
