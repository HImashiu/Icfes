"""Drive the REAL azure-ai-documentintelligence SDK against a fake HTTP layer to verify what we send/parse."""
import json
import io
import time
from urllib.parse import parse_qs, urlparse

import requests

from conftest import make_pdf
from icfes_ingest.backend import AzureLayoutBackend, crop_figure_locally
from icfes_ingest.config import Credentials

OP = "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/abc123?api-version=2024-11-30"
CONTENT = "Hola ñandú\n\n<figure>chart</figure>\n"
RESULT = {"status": "succeeded", "createdDateTime": "2026-01-01T00:00:00Z", "lastUpdatedDateTime": "2026-01-01T00:00:01Z",
          "analyzeResult": {"apiVersion": "2024-11-30", "modelId": "prebuilt-layout", "stringIndexType": "unicodeCodePoint",
                            "content": CONTENT, "contentFormat": "markdown",
                            "pages": [{"pageNumber": 1, "angle": 0, "width": 8.5, "height": 11, "unit": "inch",
                                       "spans": [{"offset": 0, "length": len(CONTENT)}]}],
                            "figures": [{"id": "1.1", "boundingRegions": [{"pageNumber": 1, "polygon": [1, 1, 3, 1, 3, 3, 1, 3]}],
                                         "spans": [{"offset": 12, "length": 22}], "elements": [],
                                         "caption": {"content": "Gráfica", "spans": []}}]}}


def resp(status, body=b"", headers=None):
    r = requests.Response()
    r.status_code, r.headers = status, requests.structures.CaseInsensitiveDict(headers or {})
    r.url = "x"
    r.raw = io.BytesIO(body)  # azure-core streams from / pokes attributes on response.raw
    r._content_consumed = False
    return r


def test_real_sdk_request_shape_and_parsing(monkeypatch, tmp_path):
    seen = []

    def fake_send(self, request, **kw):
        seen.append(request)
        if request.method == "POST":
            return resp(202, headers={"Operation-Location": OP})
        if "/figures/" in request.url:
            return resp(200, b"\x89PNGdata", {"Content-Type": "image/png"})
        return resp(200, json.dumps(RESULT).encode(), {"Content-Type": "application/json"})

    monkeypatch.setattr(requests.adapters.HTTPAdapter, "send", fake_send)
    monkeypatch.setattr(time, "sleep", lambda s: None)
    be = AzureLayoutBackend(Credentials("https://example.cognitiveservices.azure.com", "k"))
    pdf = make_pdf(tmp_path / "a.pdf", 1).read_bytes()
    out = be.analyze(pdf)

    post = seen[0]
    q = parse_qs(urlparse(post.url).query)
    assert urlparse(post.url).path.endswith("/documentModels/prebuilt-layout:analyze")
    assert q["output"] == ["figures"] and q["outputContentFormat"] == ["markdown"]
    assert q["stringIndexType"] == ["unicodeCodePoint"]
    body = post.body.getvalue() if hasattr(post.body, "getvalue") else post.body
    assert body == pdf and post.headers["Content-Type"] == "application/octet-stream"
    assert post.headers["Ocp-Apim-Subscription-Key"] == "k"

    assert out.handle == "abc123" and out.page_count == 1 and out.content == CONTENT
    f = out.figures[0]
    assert f["id"] == "1.1" and f["page"] == 1 and f["caption"] == "Gráfica" and f["page_width"] == 8.5
    assert f["spans"] == [{"offset": 12, "length": 22}]
    assert out.result["content"] == CONTENT  # raw JSON preserved

    assert be.fetch_figure(out.handle, "1.1") == b"\x89PNGdata"
    assert seen[-1].url.split("?")[0].endswith("/analyzeResults/abc123/figures/1.1")


def test_local_crop_produces_png_of_expected_size(tmp_path):
    pdf = make_pdf(tmp_path / "a.pdf", 1).read_bytes()
    fig = {"page": 1, "polygon": [1, 1, 3, 1, 3, 3, 1, 3], "page_width": 8.5}
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(crop_figure_locally(pdf, fig)))
    assert abs(img.width - 2 * 144) < 12 and abs(img.height - 2 * 144) < 12  # ~2in at 144dpi + padding
