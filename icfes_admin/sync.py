"""Bring edits made in the local editor back into the shared icfes folder.

The editor runs on a laptop copy of the data (C:\\Icfes\\icfes). This copies changed files back to the
shared folder that the app and the other threads read. Dry run by default.

    python -m icfes_admin.sync --from <laptop copy> --to <shared folder>            # shows what would change
    python -m icfes_admin.sync --from <laptop copy> --to <shared folder> --write    # applies it

Only what the editor's history (data/.history/<exam>.jsonl) says was edited on the laptop is carried
over: those questions (and their groups), their answers, and the figures and crops touched there.
Everything else keeps the shared version, so work other threads added to the shared folder after the
laptop copy was taken (new traced figures, fixed questions) is never lost. A golden is written only if
it does not add validator errors. The shared file is backed up to data/.backups/ first.
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
from icfes_admin.store import option_figures

SYNCED = ("data/*.golden.json", "answer-keys/*.key.json", "figures/specs/*.json",
          "figures/traced/*/manifest.json", "figures/traced/*/*-recorte-*.png", "figures/traced/*/*-recorte-*.jpg", "images/*/*")


def _history(src: Path, exam: str):
    p = src / "data" / ".history" / f"{exam}.jsonl"
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def _exam_of(rel: Path):
    name = rel.name
    if name == "manifest.json":
        return rel.parent.name
    return name.split(".")[0]


def _dump(d, indent=2):
    return json.dumps(d, ensure_ascii=False, indent=indent) + "\n"


def merged_text(src: Path, dst: Path, rel: Path):
    """The shared file with the laptop's edits laid over it, or None when the laptop has no edits for it."""
    new, old = src / rel, dst / rel
    if rel.suffix != ".json" or not old.exists():
        return None if not new.exists() else new.read_bytes()
    hist = _history(src, _exam_of(rel))
    if not hist:
        return None
    lap, sh = json.loads(new.read_text(encoding="utf-8")), json.loads(old.read_text(encoding="utf-8"))
    nums = {e.get("question") for e in hist if e.get("type") == "question"}
    if rel.name.endswith(".golden.json"):
        lq = {q["number"]: q for q in lap.get("questions", [])}
        groups = {lq[n].get("group_id") for n in nums if n in lq} - {None}
        lg = {g["id"]: g for g in lap.get("groups", [])}
        sh["questions"] = sorted([lq.get(q["number"], q) if q["number"] in nums else q for q in sh["questions"]]
                                 + [lq[n] for n in nums if n in lq and n not in {q["number"] for q in sh["questions"]}],
                                 key=lambda q: q["number"])
        sh["groups"] = [lg.get(g["id"], g) if g["id"] in groups else g for g in sh.get("groups", [])]
        return _dump(sh).encode("utf-8")
    if rel.name.endswith(".key.json"):
        la, sa = lap.get("answers", {}), sh.setdefault("answers", {})
        for n in nums:
            if str(n) in la:
                sa[str(n)] = la[str(n)]
            else:
                sa.pop(str(n), None)
        return _dump(sh, 1).encode("utf-8")
    kind = "scan" if rel.name == "manifest.json" else "figure"
    idkey = "figure_id" if kind == "scan" else "id"
    touched = {e["id"] for e in hist if e.get("type") == kind}
    touched |= {(e.get("before") or {}).get(idkey) for e in hist if e.get("type") == kind} - {None}
    if not touched:
        return None
    lf = {f.get(idkey): f for f in lap.get("figures", [])}
    # a crop drawn on the laptop takes the place of the figure it was drawn for, unless the laptop kept that one too
    replaced = {f.get("spec_id") for i, f in lf.items() if i in touched and f.get("spec_id") not in lf} if kind == "scan" else set()
    out = [lf[f.get(idkey)] if f.get(idkey) in touched else f for f in sh.get("figures", [])
           if f.get(idkey) not in replaced and (f.get(idkey) not in touched or f.get(idkey) in lf)]
    placed = {f.get(idkey) for f in out}
    out += [f for i, f in lf.items() if i in touched and i not in placed]
    sh["figures"] = out
    return _dump(sh).encode("utf-8")


def _png_image(data: bytes):
    """IHDR and IDAT chunks only: the shared folder stamps PNGs with extra metadata chunks on write."""
    if not data.startswith(b"\x89PNG"):
        return data
    out, i = [], 8
    while i + 8 <= len(data):
        size = int.from_bytes(data[i:i + 4], "big")
        kind = data[i + 4:i + 8]
        if kind in (b"IHDR", b"IDAT"):
            out.append(data[i + 8:i + 8 + size])
        i += 12 + size
    return b"".join(out)


def _same_file(a: Path, b: Path):
    if filecmp.cmp(a, b, shallow=False):
        return True
    return a.suffix == ".png" and _png_image(a.read_bytes()) == _png_image(b.read_bytes())


def changed_files(src: Path, dst: Path):
    out = []
    for pattern in SYNCED:
        for f in sorted(src.glob(pattern)):
            rel = f.relative_to(src)
            target = dst / rel
            if target.exists() and rel.suffix == ".json":
                text = merged_text(src, dst, rel)
                if text is not None and json.loads(text) != json.loads(target.read_bytes()):
                    out.append(rel)
            elif not target.exists() or not _same_file(f, target):
                out.append(rel)
    return out


def _pictured(roots, rel):
    """Options shown as a picture on either side, so an option with a crop and no text is not an error."""
    exam = rel.name[:-len(".golden.json")]
    out = set()
    for root in roots:
        out |= option_figures(root / "figures", exam)
    return out


def error_count(path: Path, pictured=None):
    if not path.exists():
        return 0
    return validate_golden(json.loads(path.read_text(encoding="utf-8")), pictured)["summary"]["errors"]


def plan(src: Path, dst: Path):
    rows = []
    for rel in changed_files(src, dst):
        new_errors = 0
        if rel.name.endswith(".golden.json"):
            text = merged_text(src, dst, rel)
            new_errors = validate_golden(json.loads(text if text is not None else (src / rel).read_bytes()),
                                         _pictured((src, dst), rel))["summary"]["errors"]
        old_errors = error_count(dst / rel, _pictured((dst,), rel)) if rel.name.endswith(".golden.json") else 0
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
        text = merged_text(src, dst, rel) if target.exists() else None
        if text is None:
            shutil.copyfile(src / rel, target)
        else:
            target.write_bytes(text)
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
