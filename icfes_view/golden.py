"""The golden format: one canonical, validated JSON per exam (`icfes-golden/1`).

It is what later stages (question interpretation, tutoring, analytics) should read: every question has a stem,
its options, the shared passage it depends on, where it came from on the page, and how trustworthy it is.

  python -m icfes_view.golden --output data/out            # writes golden/<doc>.golden.json + golden/<doc>.report.md
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

FORMAT = "icfes-golden/1"
TRUSTED = ("claude_verified", "human_verified")           # checked against the source crop
ARTIFACTS = re.compile(r":formula:|@@MATH|:selected:|:unselected:|<!--|<figure|\[illegible\]")


def build_golden(doc_id: str, title: str, qdata: dict, bundles: dict | None, rec: dict) -> dict:
    bundles = bundles or {}
    groups = {g["id"]: g for g in qdata.get("groups", [])}
    qs = []
    for q in qdata["questions"]:
        b = bundles.get(f"q{q['number']}") or bundles.get(q.get("group_id") or "") or {}
        marked = [o["letter"] for o in q["options"] if o.get("marked_in_scan")]
        status = q.get("status") or "auto"
        ready = not q["flags"] and not q.get("placeholder")
        qs.append({
            "number": q["number"], "section": q["section"], "part": q.get("part"),
            "item_type": q.get("item_type") or "standard", "group_id": q.get("group_id"),
            "stimulus_md": q.get("stimulus_md", ""), "stem_md": q["stem_md"],
            "expected_options": q.get("expected_options"),
            "options": [{"letter": o["letter"], "text_md": o["text_md"], "marked_in_scan": bool(o.get("marked_in_scan"))}
                        for o in q["options"]],
            "scan_marked_option": marked[0] if len(marked) == 1 else None,
            "source": {"pages": sorted({s["page"] for s in b.get("segments", [])}), "crop": (f"crops/{doc_id}/{b['file']}" if b.get("file") else None)},
            "provenance": {"status": status, "trusted": status in TRUSTED, "notes": q.get("notes", []) + ([q["note"]] if q.get("note") else []),
                           "flags": q["flags"]},
            "ready": ready})
    nums = [q["number"] for q in qs]
    sections: dict[str, list[int]] = {}
    for q in qs:
        sections.setdefault(q["section"] or "?", []).append(q["number"])
    val = qdata.get("validation", {})
    expected = {s["name"]: s["expected"] for s in val.get("sections", [])}
    return {
        "format": FORMAT, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "exam": {"doc_id": doc_id, "title": title, "source_file": rec.get("primary_path"), "sha256": rec.get("sha256"),
                 "pdf_pages": rec.get("pages"), "cover_expected_total": val.get("expected_total"),
                 "extracted_total": len(qs), "first_number": min(nums) if nums else None, "last_number": max(nums) if nums else None,
                 "warnings": val.get("warnings", [])},
        "sections": [{"name": n, "first": min(v), "last": max(v), "found": len(v),
                      "expected": next((e for k, e in expected.items() if k[:6].lower() == n[:6].lower()), None)} for n, v in sections.items()],
        "groups": [{"id": g["id"], "from": g["from"], "to": g["to"], "directions": g["directions"],
                    "passage_md": "\n\n".join(g.get("stimulus", [])), "crop": (f"crops/{doc_id}/{g['id']}.png")} for g in groups.values()],
        "questions": qs}


def validate_golden(g: dict) -> dict:
    errors: list[str] = []
    warnings: list[str] = list(g["exam"].get("warnings", []))
    seen: set[int] = set()
    gids = {x["id"] for x in g["groups"]}
    prev = 0
    for q in g["questions"]:
        n = q["number"]
        if n in seen:
            errors.append(f"Q{n}: duplicate question number")
        seen.add(n)
        if n <= prev:
            errors.append(f"Q{n}: out of order after Q{prev}")
        prev = n
        text = " ".join([q["stem_md"]] + [o["text_md"] for o in q["options"]])
        if not q["stem_md"].strip():
            errors.append(f"Q{n}: empty question text")
        want = q.get("expected_options")
        letters = [o["letter"] for o in q["options"]]
        if want and len(letters) < want:
            errors.append(f"Q{n}: {len(letters)} options, expected {want}")
        if letters != list("ABCD"[:len(letters)]):
            errors.append(f"Q{n}: option letters are not A, B, C… in order: {letters}")
        if any(not o["text_md"].strip() for o in q["options"]):
            errors.append(f"Q{n}: an option has no text")
        if ARTIFACTS.search(text):
            errors.append(f"Q{n}: contains OCR/layout artifacts")
        if q["group_id"] and q["group_id"] not in gids:
            errors.append(f"Q{n}: refers to unknown group {q['group_id']}")
        if text.count("$") % 2:
            warnings.append(f"Q{n}: unbalanced $ in a formula")
        if q["provenance"]["flags"]:
            warnings.append(f"Q{n}: still has review flags: {q['provenance']['flags'][0][:80]}")
        texts = [o["text_md"].strip().lower() for o in q["options"]]
        if len(set(texts)) < len(texts):
            warnings.append(f"Q{n}: two options have identical text")
        if sum(o["marked_in_scan"] for o in q["options"]) > 1:
            warnings.append(f"Q{n}: more than one option carries a scan mark")
    tot = g["exam"].get("cover_expected_total")
    if tot and tot != len(g["questions"]):
        warnings.append(f"cover lists {tot} questions, golden has {len(g['questions'])}")
    qs = g["questions"]
    summary = {"questions": len(qs), "ready": sum(q["ready"] for q in qs), "trusted": sum(q["provenance"]["trusted"] for q in qs),
               "auto_clean": sum(q["ready"] and not q["provenance"]["trusted"] for q in qs),
               "errors": len(errors), "warnings": len(warnings)}
    return {"ok": not errors, "summary": summary, "errors": errors, "warnings": warnings}


def report_md(g: dict, v: dict) -> str:
    s = v["summary"]
    lines = [f"# Golden report: {g['exam']['title']}", "",
             f"- Format `{g['format']}`, {s['questions']} questions ({g['exam']['first_number']}-{g['exam']['last_number']}), source `{g['exam']['source_file']}`",
             f"- Ready (no review flags): **{s['ready']}** | verified against the crop: {s['trusted']} | automatic and clean: {s['auto_clean']}",
             f"- Validation: **{'PASS' if v['ok'] else 'FAIL'}** ({s['errors']} errors, {s['warnings']} warnings)", ""]
    for title, items in (("Errors", v["errors"]), ("Warnings", v["warnings"])):
        if items:
            lines += [f"## {title}", *[f"- {i}" for i in items], ""]
    lines += ["## Sections", "", "| Section | Numbers | Found | Cover says |", "|---|---|---|---|"]
    lines += [f"| {x['name']} | {x['first']}-{x['last']} | {x['found']} | {x['expected'] if x['expected'] is not None else '?'} |" for x in g["sections"]]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="icfes_view.golden", description=__doc__)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--doc")
    a = ap.parse_args(argv)
    mf = json.loads((a.output / "manifest.json").read_text(encoding="utf-8"))
    rc = 0
    for rec in sorted(mf["documents"].values(), key=lambda r: r.get("primary_path", "")):
        if rec["status"] not in ("completed", "partial") or (a.doc and a.doc not in rec["doc_id"]):
            continue
        d = rec["doc_id"]
        qp = a.output / "questions" / f"{d}.json"
        if not qp.exists():
            print(f"{d}: run icfes_view first", file=sys.stderr)
            rc = 1
            continue
        bp = a.output / "crops" / d / "bundles.json"
        g = build_golden(d, Path(rec["primary_path"]).stem.replace("_", " "), json.loads(qp.read_text(encoding="utf-8")),
                         json.loads(bp.read_text(encoding="utf-8"))["bundles"] if bp.exists() else None, rec)
        v = validate_golden(g)
        out = a.output / "golden"
        out.mkdir(exist_ok=True)
        (out / f"{d}.golden.json").write_text(json.dumps(g, ensure_ascii=False, indent=1), encoding="utf-8")
        (out / f"{d}.report.md").write_text(report_md(g, v), encoding="utf-8")
        s = v["summary"]
        print(f"{d}: {s['questions']} questions | ready {s['ready']} (verified {s['trusted']}, auto {s['auto_clean']}) | "
              f"{'PASS' if v['ok'] else 'FAIL'} {s['errors']} errors, {s['warnings']} warnings")
        rc = rc or (0 if v["ok"] else 1)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
