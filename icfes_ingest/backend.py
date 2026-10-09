"""Azure Document Intelligence backend (prebuilt-layout, figures on, Markdown out)."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any, Protocol

from .config import MODEL_ID, Credentials


@dataclass
class Outcome:
    result: dict[str, Any]              # full AnalyzeResult as a plain dict (raw JSON)
    content: str                        # Markdown
    page_count: int
    figures: list[dict[str, Any]]       # id, page, polygon, caption, spans, page_width/height/unit
    handle: Any = None                  # opaque (result_id) used to download figure crops


class Backend(Protocol):
    def analyze(self, pdf: bytes) -> Outcome: ...
    def fetch_figure(self, handle: Any, figure_id: str) -> bytes: ...


class AzureLayoutBackend:
    def __init__(self, creds: Credentials, poll_seconds: float = 2.0, **client_kwargs):
        from azure.ai.documentintelligence import DocumentIntelligenceClient
        from azure.core.credentials import AzureKeyCredential

        self.client = DocumentIntelligenceClient(creds.endpoint, AzureKeyCredential(creds.key), **client_kwargs)
        self.poll_seconds = poll_seconds

    def analyze(self, pdf: bytes) -> Outcome:
        from azure.ai.documentintelligence.models import (
            AnalyzeOutputOption, DocumentContentFormat, StringIndexType)

        poller = self.client.begin_analyze_document(
            MODEL_ID,
            io.BytesIO(pdf),
            content_type="application/octet-stream",
            polling_interval=self.poll_seconds,
            output=[AnalyzeOutputOption.FIGURES],
            output_content_format=DocumentContentFormat.MARKDOWN,
            # Spans index into the Markdown by code point, matching Python str offsets.
            string_index_type=StringIndexType.UNICODE_CODE_POINT,
        )
        result_id = poller.details["operation_id"]
        res = poller.result()
        pages = {p.page_number: p for p in (res.pages or [])}
        figures = []
        for f in res.figures or []:
            br = f.bounding_regions[0] if f.bounding_regions else None
            pg = pages.get(br.page_number) if br else None
            figures.append({
                "id": f.id,
                "page": br.page_number if br else None,
                "polygon": list(br.polygon) if br else None,
                "caption": f.caption.content if f.caption else None,
                "spans": [{"offset": s.offset, "length": s.length} for s in (f.spans or [])],
                "page_width": pg.width if pg else None,
                "page_height": pg.height if pg else None,
                "unit": str(pg.unit) if pg and pg.unit else None,
            })
        return Outcome(result=res.as_dict(), content=res.content or "", page_count=len(pages),
                       figures=figures, handle=result_id)

    def fetch_figure(self, handle: Any, figure_id: str) -> bytes:
        data = b"".join(self.client.get_analyze_result_figure(
            model_id=MODEL_ID, result_id=handle, figure_id=figure_id))
        if not data:
            raise RuntimeError(f"Empty image returned for figure {figure_id}")
        return data


def crop_figure_locally(pdf: bytes, fig: dict[str, Any]) -> bytes:
    """Fallback when the service's figure endpoint fails: crop the figure out of the PDF itself."""
    import pypdfium2 as pdfium

    poly, page_no, pw = fig.get("polygon"), fig.get("page"), fig.get("page_width")
    if not poly or not page_no or not pw:
        raise ValueError("figure has no geometry to crop")
    doc = pdfium.PdfDocument(pdf)
    try:
        img = doc[page_no - 1].render(scale=2.0).to_pil()
    finally:
        doc.close()
    k = img.width / pw  # pixels per page unit (service reports PDFs in inches)
    xs, ys = poly[0::2], poly[1::2]
    pad = 0.02 * k
    box = (max(0, min(xs) * k - pad), max(0, min(ys) * k - pad),
           min(img.width, max(xs) * k + pad), min(img.height, max(ys) * k + pad))
    if box[2] <= box[0] or box[3] <= box[1]:
        raise ValueError("degenerate figure box")
    out = io.BytesIO()
    img.crop(tuple(int(round(v)) for v in box)).save(out, format="PNG")
    return out.getvalue()
