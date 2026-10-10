"""Reading text and tables out of a box on a scanned page.

Three engines, best first:
- the saved Azure layout results (icfes-azure-data/json): free and instant, already read for the whole PDF;
- Azure Document Intelligence on the box itself (prebuilt-layout), when the endpoint and key are in the environment;
- RapidOCR on the laptop (pip install rapidocr onnxruntime): free and offline, a little less accurate on Spanish.

Every engine returns lines as (text, cx, cy, left, height) in fractions of the box or page, and tables as cells.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import NamedTuple

ENDPOINT_VARS = ("AZURE_DI_ENDPOINT", "DOCUMENTINTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
KEY_VARS = ("AZURE_DI_KEY", "DOCUMENTINTELLIGENCE_KEY", "AZURE_DOCUMENT_INTELLIGENCE_KEY")
API_VERSION = "2024-11-30"


class OcrError(Exception):
    pass


class Line(NamedTuple):
    text: str
    cx: float
    cy: float
    left: float
    height: float


# ----- turning lines into text ---------------------------------------------------

def join_lines(lines):
    """Lines in reading order become paragraphs: a line break inside a paragraph is a space, a larger gap starts a new
    paragraph, and a word cut with a hyphen at a line end is joined again."""
    out, last = [], None
    for ln in lines:
        if last is not None:
            gap = ln.cy - last.cy
            out.append("\n\n" if gap > 1.9 * max(ln.height, last.height) else "\n" if _starts_item(ln.text) else " ")
        out.append(ln.text.strip())
        last = ln
    text = "".join(out)
    text = re.sub(r"(\w)- (\w)", r"\1\2", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _starts_item(text):
    # An option letter (A. / B) ...) at the start of a line starts a new line, so options stay apart.
    return bool(re.match(r"^\s*[A-D][.)]\s", text))


def lines_from_polys(raw_lines, width, height):
    """Azure lines ({content, polygon}) to Line tuples in fractions of width and height."""
    rows = []
    for line in raw_lines:
        poly = line.get("polygon") or []
        if len(poly) < 8:
            continue
        xs, ys = poly[0::2], poly[1::2]
        rows.append(Line(line.get("content", ""), sum(xs) / len(xs) / width, sum(ys) / len(ys) / height,
                         min(xs) / width, (max(ys) - min(ys)) / height))
    return rows


def tables_from_result(res, page_number, width, height):
    """Azure tables on one page as {x0, y0, x1, y1, cells:[{row, col, rowspan, colspan, text, header}]} in fractions."""
    out = []
    for t in res.get("tables", []):
        regions = [r for r in t.get("boundingRegions", []) if r.get("pageNumber") == page_number]
        if not regions:
            continue
        poly = regions[0]["polygon"]
        xs, ys = poly[0::2], poly[1::2]
        cells = [{"row": c.get("rowIndex", 0), "col": c.get("columnIndex", 0), "rowspan": c.get("rowSpan", 1) or 1,
                  "colspan": c.get("columnSpan", 1) or 1, "text": _clean_cell(c.get("content", "")),
                  "header": c.get("kind") in ("columnHeader", "rowHeader")} for c in t.get("cells", [])]
        out.append({"x0": min(xs) / width, "y0": min(ys) / height, "x1": max(xs) / width, "y1": max(ys) / height,
                    "rows": t.get("rowCount"), "cols": t.get("columnCount"), "cells": cells})
    return out


def _clean_cell(text):
    text = re.sub(r":selected:|:unselected:", "", text)
    return re.sub(r"\s+", " ", text).strip()


def table_spec(table):
    """An Azure table as a figure spec of kind table. A first row of plain header cells becomes `headers`."""
    by_row = {}
    for c in table["cells"]:
        by_row.setdefault(c["row"], []).append(c)
    rows = []
    for r in sorted(by_row):
        cells = []
        for c in sorted(by_row[r], key=lambda c: c["col"]):
            if c["rowspan"] > 1 or c["colspan"] > 1:
                cell = {"text": c["text"]}
                if c["colspan"] > 1:
                    cell["colspan"] = c["colspan"]
                if c["rowspan"] > 1:
                    cell["rowspan"] = c["rowspan"]
                cells.append(cell)
            else:
                cells.append(c["text"])
        rows.append((cells, all(c["header"] for c in by_row[r])))
    spec = {"kind": "table"}
    if rows and rows[0][1] and all(isinstance(c, str) for c in rows[0][0]):
        spec["headers"] = rows.pop(0)[0]
    spec["rows"] = [cells for cells, _ in rows]
    return spec


# ----- saved Azure results -----------------------------------------------------------

def load_saved(path, pdf_name):
    """{page: {"lines": [Line], "tables": [...]}} from one saved run for this PDF, or None when there is none."""
    for f in sorted(path.glob("*.json")):
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if (doc.get("source") or {}).get("file") != pdf_name:
            continue
        pages = {}
        for chunk in doc.get("chunks", []):
            res = chunk.get("result", {})
            res = res.get("analyzeResult", res)
            start, end = chunk.get("page_start"), chunk.get("page_end")
            for p in res.get("pages", []):
                num = p["pageNumber"]
                if not (start and end and start <= num <= end):
                    num += chunk.get("page_offset") or 0
                w, h = p.get("width") or 1, p.get("height") or 1
                pages[num] = {"lines": lines_from_polys(p.get("lines", []), w, h),
                              "tables": tables_from_result(res, p["pageNumber"], w, h)}
        return pages
    return None


def inside(lines, box):
    x0, y0, x1, y1 = box
    return [ln for ln in lines if x0 <= ln.cx <= x1 and y0 <= ln.cy <= y1]


def tables_inside(tables, box):
    x0, y0, x1, y1 = box
    return [t for t in tables if x0 <= (t["x0"] + t["x1"]) / 2 <= x1 and y0 <= (t["y0"] + t["y1"]) / 2 <= y1]


# ----- Azure on the box itself -------------------------------------------------------------

def azure_config():
    endpoint = next((os.environ[v].strip() for v in ENDPOINT_VARS if os.environ.get(v, "").strip()), None)
    key = next((os.environ[v].strip() for v in KEY_VARS if os.environ.get(v, "").strip()), None)
    return (endpoint.rstrip("/"), key) if endpoint and key else None


def azure_live(png, config=None, opener=urllib.request.urlopen, sleep=time.sleep, timeout=60):
    """Runs prebuilt-layout on one picture and returns its analyzeResult. About 1 cent per call."""
    config = config or azure_config()
    if config is None:
        raise OcrError("Azure no está configurado en este equipo (faltan AZURE_DI_ENDPOINT y AZURE_DI_KEY)")
    endpoint, key = config
    url = f"{endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version={API_VERSION}"
    req = urllib.request.Request(url, data=png, method="POST",
                                 headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "image/png"})
    try:
        with opener(req, timeout=timeout) as resp:
            op = resp.headers.get("Operation-Location")
    except urllib.error.HTTPError as e:
        raise OcrError(f"Azure respondió {e.code}: {e.read()[:200].decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        raise OcrError(f"no se pudo llegar a Azure: {e.reason}")
    if not op:
        raise OcrError("Azure no devolvió la operación")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        sleep(1)
        with opener(urllib.request.Request(op, headers={"Ocp-Apim-Subscription-Key": key}), timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        status = body.get("status")
        if status == "succeeded":
            return body.get("analyzeResult", {})
        if status == "failed":
            raise OcrError(f"Azure no pudo leer el recuadro: {body.get('error', {}).get('message', '')}")
    raise OcrError("Azure tardó demasiado")


def azure_read(png, **kw):
    res = azure_live(png, **kw)
    page = (res.get("pages") or [{}])[0]
    w, h = page.get("width") or 1, page.get("height") or 1
    return {"lines": lines_from_polys(page.get("lines", []), w, h),
            "tables": tables_from_result(res, page.get("pageNumber", 1), w, h)}


# ----- RapidOCR on the laptop ----------------------------------------------------------------

_rapid = None


def rapid_read(pix_samples, width, height, channels):
    """RapidOCR over raw pixels (from PyMuPDF). Lines come back in reading order, top to bottom."""
    global _rapid
    try:
        import numpy as np
        from rapidocr import RapidOCR
    except ImportError:
        raise OcrError("el OCR local no está instalado: python -m pip install rapidocr onnxruntime")
    if _rapid is None:
        _rapid = RapidOCR()
    img = np.frombuffer(pix_samples, dtype=np.uint8).reshape(height, width, channels)[:, :, :3]
    res = _rapid(img)
    lines = []
    for box, text in zip(res.boxes if res.boxes is not None else [], res.txts or []):
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        lines.append(Line(text, sum(xs) / len(xs) / width, sum(ys) / len(ys) / height, min(xs) / width, (max(ys) - min(ys)) / height))
    # Sort into rows: lines whose centres are closer than half a line height share a row, read left to right.
    lines.sort(key=lambda ln: (ln.cy, ln.cx))
    rows, cur = [], []
    for ln in lines:
        if cur and abs(ln.cy - cur[-1].cy) > 0.5 * max(ln.height, cur[-1].height):
            rows.append(sorted(cur, key=lambda x: x.cx))
            cur = []
        cur.append(ln)
    if cur:
        rows.append(sorted(cur, key=lambda x: x.cx))
    return {"lines": [ln for row in rows for ln in row], "tables": []}
