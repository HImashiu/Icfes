import json

import pypdfium2 as pdfium
from PIL import Image, ImageDraw

from icfes_crop import geometry as G
from icfes_crop.build import assign_owners, build_bundles, collect, find_anchor, norm

DPI, W, H = 200, 8.5, 11.0


class Doc:
    """Builds a fake one-page Azure result and the matching scanned PDF (ink exactly where the words are)."""

    def __init__(self, angle=0.0):
        self.content, self.paras, self.words = "", [], []
        self.angle = angle
        self.img = Image.new("RGB", (int(W * DPI), int(H * DPI)), "white")
        self.draw = ImageDraw.Draw(self.img)

    def para(self, text, x0, y0, x1, y1, role=None, ink=True):
        start = len(self.content)
        n = len(text.split())
        step = (x1 - x0) / n
        pos = start
        for i, w in enumerate(text.split()):
            bx = (x0 + i * step, y0, x0 + (i + 1) * step - 0.05, y1)
            poly = [bx[0], bx[1], bx[2], bx[1], bx[2], bx[3], bx[0], bx[3]]
            self.words.append({"content": w, "polygon": poly, "span": {"offset": pos, "length": len(w)}})
            if ink:
                self.draw.rectangle([v * DPI for v in bx], fill="black")
            pos += len(w) + 1
        self.content += text + "\n"
        p = {"content": text, "role": role, "spans": [{"offset": start, "length": len(text)}],
             "boundingRegions": [{"pageNumber": 1, "polygon": [x0, y0, x1, y0, x1, y1, x0, y1]}]}
        self.paras.append(p)

    def orphan_word(self, x0, y0, x1, y1):
        poly = [x0, y0, x1, y0, x1, y1, x0, y1]
        self.words.append({"content": "huérfano", "polygon": poly, "span": {"offset": 10_000, "length": 8}})
        self.draw.rectangle([v * DPI for v in (x0, y0, x1, y1)], fill="black")

    def result(self):
        return {"chunks": [{"page_start": 1, "page_end": 1, "page_offset": 0, "result": {
            "content": self.content, "paragraphs": self.paras, "tables": [], "figures": [],
            "pages": [{"pageNumber": 1, "angle": self.angle, "width": W, "height": H, "unit": "inch",
                       "words": self.words, "selectionMarks": []}]}}]}

    def pdf(self, path):
        self.img.save(path, "PDF", resolution=float(DPI))
        return pdfium.PdfDocument(str(path))


QDATA = {"questions": [{"number": 1, "anchor": "1. Primera pregunta de prueba"},
                       {"number": 2, "anchor": "2. Segunda pregunta de prueba"}], "groups": []}


def two_column_doc():
    d = Doc()
    d.para("R1S2PS11OSC", 0.4, 0.3, 1.5, 0.5, role="pageHeader")
    d.para("Prueba de Sociales parte II", 2.0, 0.55, 6.0, 0.8, role="title")
    d.para("1. Primera pregunta de prueba", 0.5, 1.0, 4.0, 1.25)          # Q1 anchor (left column)
    d.para("Texto del enunciado con varias palabras", 0.5, 1.4, 4.0, 1.9)
    d.para("A. uno B. dos C. tres D. cuatro", 0.5, 2.0, 4.0, 2.6)
    d.para("2. Segunda pregunta de prueba", 0.5, 3.4, 4.0, 3.65)          # Q2 anchor (left column) ...
    d.para("Contexto de la segunda pregunta", 4.5, 1.0, 8.0, 1.5)         # ... continues in the right column
    d.para("A. uno B. dos C. tres D. cuatro", 4.5, 1.6, 8.0, 2.2)
    d.para("13", 4.0, 10.5, 4.3, 10.7, role="pageNumber")
    return d


def test_crops_are_complete_isolated_and_skip_furniture(tmp_path):
    d = two_column_doc()
    res = build_bundles(d.result(), QDATA, d.pdf(tmp_path / "a.pdf"), tmp_path / "out", DPI)
    b = res["bundles"]
    assert set(b) == {"q1", "q2"} and res["missing_anchor"] == [] and res["orphans"] == []
    q1 = b["q1"]["segments"]
    assert len(q1) == 1 and q1[0]["column"] == "left" and q1[0]["words_cut"] == 0
    x0, y0, x1, y1 = q1[0]["box_in"]
    assert y0 > 0.85 and y1 < 3.4 and q1[0]["bleed_words"] == 0     # no header/title, none of Q2's text
    for w in d.words:                                              # every Q1 word fully inside its crop
        if 1.0 <= w["polygon"][1] <= 2.0 and w["polygon"][0] < 4.2:
            assert x0 <= w["polygon"][0] and w["polygon"][4] <= x1 and y0 <= w["polygon"][1] and w["polygon"][5] <= y1
    q2 = b["q2"]["segments"]
    assert sorted(s["column"] for s in q2) == ["left", "right"] and all(s["words_cut"] == 0 for s in q2)
    assert (tmp_path / "out" / "q001.png").exists() and (tmp_path / "out" / "q002.png").exists()
    img = Image.open(tmp_path / "out" / "q002.png")
    assert img.height > 100 and b["q2"]["flags"] == []


def test_orphan_words_are_reported_not_dropped(tmp_path):
    d = two_column_doc()
    d.orphan_word(0.5, 8.0, 1.5, 8.2)    # ink on the page that belongs to no extracted paragraph
    res = build_bundles(d.result(), QDATA, d.pdf(tmp_path / "a.pdf"), tmp_path / "out", DPI)
    assert [o["text"] for o in res["orphans"]] == ["huérfano"] and res["orphans"][0]["page"] == 1


def test_handwriting_the_ocr_missed_is_included_by_ink_growth(tmp_path):
    d = two_column_doc()
    # a scribble just under Q1's options that Azure did not report as text
    d.draw.rectangle([0.5 * DPI, 2.66 * DPI, 3.0 * DPI, 2.72 * DPI], fill="black")
    res = build_bundles(d.result(), QDATA, d.pdf(tmp_path / "a.pdf"), tmp_path / "out", DPI)
    seg = res["bundles"]["q1"]["segments"][0]
    assert seg["box_in"][3] >= 2.72          # grew past the OCR boxes to include the ink


def test_deskew_point_matches_pil_rotation():
    im = Image.new("L", (400, 300), 255)
    ImageDraw.Draw(im).rectangle([300, 100, 320, 120], fill=0)
    for phi in (-1.8, 0.9, 5.0):
        rot = im.rotate(phi, resample=Image.BICUBIC, fillcolor=255)
        x, y = G.deskew_point(310, 110, phi, 200, 150)
        assert rot.getpixel((round(x), round(y))) < 80


def test_tilted_page_is_deskewed_before_cropping(tmp_path):
    d = Doc(angle=0.0)
    d.para("1. Primera pregunta de prueba", 0.5, 1.0, 4.0, 1.25)
    d.para("A. uno B. dos C. tres D. cuatro", 0.5, 4.8, 4.0, 5.3)
    d.img = d.img.rotate(-2.0, resample=Image.BICUBIC, fillcolor="white")   # scan tilted by 2 degrees
    res = d.result()
    # Azure reports the tilt and polygons in the tilted frame: apply the same rotation to the polygons
    pg = res["chunks"][0]["result"]["pages"][0]
    pg["angle"] = 2.0
    import math
    def tilt(poly, phi=-2.0):
        out = []
        for x, y in zip(poly[0::2], poly[1::2]):
            nx, ny = G.deskew_point(x, y, phi, W / 2, H / 2)
            out += [nx, ny]
        return out
    for w in pg["words"]:
        w["polygon"] = tilt(w["polygon"])
    for p in res["chunks"][0]["result"]["paragraphs"]:
        p["boundingRegions"][0]["polygon"] = tilt(p["boundingRegions"][0]["polygon"])
    out = build_bundles(res, {"questions": [QDATA["questions"][0]], "groups": []}, d.pdf(tmp_path / "t.pdf"),
                        tmp_path / "out", DPI)
    seg = out["bundles"]["q1"]["segments"][0]
    assert out["sign"] in (1, -1) and seg["words_cut"] == 0 and out["orphans"] == []


def test_anchor_matching_and_heading_ownership():
    assert norm("1\\. Considere los") == norm("1. Considere  los")
    d = Doc()
    d.para("Prueba de Matemáticas parte II", 2.0, 0.5, 6.0, 0.8, role="title")
    d.para("25. Última pregunta anterior", 0.5, 1.0, 4.0, 1.2)
    d.para("A. a B. b C. c D. d", 0.5, 1.3, 4.0, 1.6)
    d.para("RESPONDA LAS PREGUNTAS 26 A 27 DE ACUERDO CON EL TEXTO", 0.5, 2.0, 4.0, 2.3, role="sectionHeading")
    d.para("Texto compartido muy largo para las dos preguntas", 0.5, 2.4, 4.0, 3.0)
    d.para("26. Pregunta veintiséis de prueba", 0.5, 3.2, 4.0, 3.4)
    _, els, _ = collect(d.result(), 1)
    qs = [{"number": 25, "anchor": "25. Última pregunta anterior"}, {"number": 26, "anchor": "26. Pregunta veintiséis de prueba"}]
    gs = [{"from": 26, "to": 27, "directions": "RESPONDA LAS PREGUNTAS 26 A 27 DE ACUERDO CON EL TEXTO"}]
    info = assign_owners(els, qs, gs)
    owners = {e.text[:12]: e.owner for e in els}
    assert owners["Prueba de Ma"] == "furniture"                 # running page title is not content
    assert owners["RESPONDA LAS"] == "g26-27" and owners["Texto compar"] == "g26-27"
    assert owners["26. Pregunta"] == "q26" and info["missing_anchor"] == []
