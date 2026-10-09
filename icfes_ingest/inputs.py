"""Input discovery: scan a folder (or safely unpack a .zip) for PDFs and hash them."""
from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def unpack_zip(zip_path: Path, dest: Path) -> Path:
    """Extract only PDF members, refusing paths that escape `dest` (zip-slip)."""
    target = dest / zip_path.stem
    marker = target / ".unpacked"
    stamp = f"{zip_path.stat().st_size}:{int(zip_path.stat().st_mtime)}"
    if marker.exists() and marker.read_text() == stamp:
        return target
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".pdf"):
                continue
            out = (target / info.filename).resolve()
            if root not in out.parents:
                raise ValueError(f"Unsafe path in zip: {info.filename!r}")
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(out, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
    marker.write_text(stamp)
    return target


def scan_pdfs(root: Path) -> tuple[list[Path], list[Path]]:
    """Return (pdfs, other_files_ignored), both sorted for deterministic duplicate resolution."""
    pdfs, other = [], []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name.startswith(".") or p.name.endswith(".unpacked"):
            continue
        (pdfs if p.suffix.lower() == ".pdf" else other).append(p)
    return pdfs, other


def looks_like_pdf(path: Path) -> bool:
    with open(path, "rb") as f:
        return b"%PDF-" in f.read(1024)
