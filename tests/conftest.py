import io
import sys
from pathlib import Path

import pytest
from azure.core.exceptions import HttpResponseError
from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from icfes_ingest import retry
from icfes_ingest.backend import Outcome
from icfes_ingest.pdfsplit import open_reader


def make_pdf(path: Path, pages: int, pad: int = 0) -> Path:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(612, 792)
    if pad:
        w.add_metadata({"/Pad": "x" * pad})
    with open(path, "wb") as f:
        w.write(f)
    return path


class FakeResp:
    def __init__(self, status, headers=None):
        self.status_code, self.headers, self.reason = status, headers or {}, "x"
        self.content_type, self.text_value = "application/json", ""

    def text(self, *a): return ""
    def body(self): return b""


def http_error(status, retry_after=None):
    h = {"Retry-After": str(retry_after)} if retry_after else {}
    return HttpResponseError(response=FakeResp(status, h))


class FakeBackend:
    """Programmable stand-in for Azure. `figures_per_chunk` figures are reported on each chunk's page 1."""

    def __init__(self, figures_per_chunk=0, analyze_errors=None, fig_errors=None, wrong_pages=False):
        self.calls = []          # page counts per analyze call
        self.analyze_errors = list(analyze_errors or [])
        self.fig_errors = list(fig_errors or [])
        self.fpc, self.wrong_pages = figures_per_chunk, wrong_pages
        self.fig_fetches = 0

    def analyze(self, pdf: bytes) -> Outcome:
        if self.analyze_errors:
            err = self.analyze_errors.pop(0)
            if err:
                raise err
        n = len(open_reader(pdf).pages)
        self.calls.append(n)
        content = "".join(f"Página {i+1} áéí\n\n" for i in range(n))
        figs = []
        for k in range(self.fpc):
            text = f"<figure>F{k}</figure>"
            off = len(content)
            content += text + "\n\n"
            figs.append({"id": f"1.{k}", "page": 1, "polygon": [1, 1, 3, 1, 3, 3, 1, 3], "caption": f"cap{k}",
                         "spans": [{"offset": off, "length": len(text)}],
                         "page_width": 8.5, "page_height": 11, "unit": "inch"})
        pc = n - 1 if self.wrong_pages else n
        return Outcome({"content": content, "pages": [{"pageNumber": i + 1} for i in range(pc)]}, content, pc, figs, handle="rid")

    def fetch_figure(self, handle, figure_id):
        self.fig_fetches += 1
        if self.fig_errors:
            err = self.fig_errors.pop(0)
            if err:
                raise err
        return b"\x89PNG-fake-" + figure_id.encode()


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(retry, "sleep", lambda s: None)


@pytest.fixture
def dirs(tmp_path):
    inp, out = tmp_path / "in", tmp_path / "out"
    inp.mkdir()
    return inp, out
