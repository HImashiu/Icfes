"""Apply human corrections (exported from the viewer) onto the extracted questions."""
from __future__ import annotations

import json
from pathlib import Path


LOCKED = ("human_verified", "human_edited", "claude_verified", "claude_edited")


def is_locked(q: dict) -> bool:
    return (q.get("status") or "") in LOCKED


def apply_corrections(seg: dict, path: Path) -> int:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    by = {c["number"]: c for c in data.get("corrections", [])}
    n = 0
    for q in seg["questions"]:
        c = by.get(q["number"])
        if not c:
            continue
        if c.get("stem_md") is not None:
            q["stem_md"] = c["stem_md"]
        if c.get("options"):
            old = {o["letter"]: o for o in q["options"]}
            q["options"] = [{"letter": o["letter"], "text_md": o["text_md"],
                             "marked_in_scan": bool(o.get("marked_in_scan", old.get(o["letter"], {}).get("marked_in_scan", False)))}
                            for o in c["options"] if (o.get("text_md") or "").strip()]
        who = c.get("by") or "human"           # who checked it: "human" (default, from the viewer) or "claude"
        q["status"] = f"{who}_verified" if c.get("verified") else f"{who}_edited"
        if c.get("note"):
            q["note"] = c["note"]
        if c.get("verified"):
            q["flags"] = []
            q.pop("placeholder", None)
        n += 1
    return n
