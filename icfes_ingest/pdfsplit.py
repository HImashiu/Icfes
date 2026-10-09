"""Page counting, chunk planning and page-range extraction for oversized PDFs."""
from __future__ import annotations

import io
import math
from pathlib import Path

from pypdf import PdfReader, PdfWriter


class PdfError(RuntimeError):
    pass


def open_reader(source: Path | bytes) -> PdfReader:
    try:
        reader = PdfReader(str(source) if isinstance(source, Path) else io.BytesIO(source))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfError("PDF is password protected")
        len(reader.pages)  # force parse
        return reader
    except PdfError:
        raise
    except Exception as e:  # pypdf raises many types on corrupt files
        raise PdfError(f"Cannot read PDF: {type(e).__name__}: {e}") from e


def page_count(path: Path) -> int:
    return len(open_reader(path).pages)


def plan_ranges(pages: int, size_bytes: int, max_pages: int, max_bytes: int) -> list[tuple[int, int]]:
    """1-based inclusive page ranges. One range when the whole file fits in a single request."""
    if pages <= 0:
        raise PdfError("PDF has no pages")
    per = max_pages
    if size_bytes > max_bytes:
        avg = size_bytes / pages
        per = min(per, max(1, int(max_bytes * 0.8 / avg)))
    n = math.ceil(pages / per)
    return [(i * per + 1, min(pages, (i + 1) * per)) for i in range(n)]


def extract_range(reader: PdfReader, start: int, end: int) -> bytes:
    w = PdfWriter()
    for i in range(start - 1, end):
        w.add_page(reader.pages[i])
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()
