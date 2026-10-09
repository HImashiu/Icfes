"""Merge Claude transcriptions (questions/<doc>.ai.json) onto the extracted questions."""
from __future__ import annotations

import json
from pathlib import Path


def apply_ai(seg: dict, path: Path) -> int:
    if not Path(path).exists():
        return 0
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    by = {r["number"]: r for r in data.get("results", [])}
    n = 0
    for q in seg["questions"]:
        r = by.get(q["number"])
        if not r or (q.get("status") or "") in ("human_verified", "human_edited", "claude_verified", "claude_edited"):
            continue
        q["stem_md"] = r["stem_md"] or q["stem_md"]
        q["options"] = [{"letter": o["letter"], "text_md": o["text_md"], "marked_in_scan": bool(o.get("marked_in_scan"))}
                        for o in r["options"]]
        q["status"] = "ai_review" if r["needs_human"] else "ai"
        q.pop("placeholder", None)
        q["flags"] = []
        if r["needs_human"]:
            q["flags"] = [f"Claude's transcription needs a human check: {i}" for i in (r["issues"] or ["low confidence or disagreement"])]
        q.setdefault("notes", []).append(
            f"Transcribed by {r['model']} from the source crop (agreement with OCR: {r['ocr_agreement']}"
            + (f", between passes: {r['pass_agreement']}" if r.get("pass_agreement") is not None else "") + ")")
        n += 1
    return n
