"""Persistent, atomically-written manifest keyed by content hash (sha256)."""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PENDING, IN_PROGRESS, COMPLETED, PARTIAL, FAILED = "pending", "in_progress", "completed", "partial", "failed"
VERSION = 1


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ManifestError(RuntimeError):
    pass


class Manifest:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self.data: dict[str, Any] = {"version": VERSION, "documents": {}, "files": {}}
        if self.path.exists():
            try:
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                # Never silently reset progress: a corrupt manifest needs a human decision.
                raise ManifestError(f"{self.path} is corrupt ({e}). Restore {self.path}.bak or delete it to start over.") from e
            if loaded.get("version") != VERSION:
                raise ManifestError(f"Unsupported manifest version {loaded.get('version')!r}")
            self.data = loaded

    @property
    def documents(self) -> dict[str, dict]:
        return self.data["documents"]

    @property
    def files(self) -> dict[str, dict]:
        return self.data["files"]

    def get(self, sha: str) -> dict | None:
        with self._lock:
            return self.documents.get(sha)

    def upsert(self, sha: str, **fields: Any) -> dict:
        with self._lock:
            rec = self.documents.setdefault(sha, {"sha256": sha, "status": PENDING, "attempts": 0})
            rec.update(fields)
            rec["updated_at"] = now()
            self.save()
            return rec

    def set_file(self, relpath: str, **fields: Any) -> None:
        with self._lock:
            self.files[relpath] = fields

    def save(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".json.tmp")
            payload = json.dumps(self.data, indent=2, ensure_ascii=False, sort_keys=True)
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(payload)
                f.flush()
                os.fsync(f.fileno())
            if self.path.exists():
                try:
                    os.replace(self.path, self.path.with_suffix(".json.bak"))
                except OSError:
                    pass
            os.replace(tmp, self.path)

    def summary(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for rec in self.documents.values():
            out[rec["status"]] = out.get(rec["status"], 0) + 1
        return out
