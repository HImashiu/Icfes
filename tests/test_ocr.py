import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from icfes_admin import ocr  # noqa: E402
from icfes_admin.ocr import Line, join_lines, table_spec  # noqa: E402


def _ln(text, y, h=0.02):
    return Line(text, 0.3, y, 0.1, h)


def test_lines_join_into_paragraphs_and_hyphen_breaks_close():
    lines = [_ln("Una pala-", 0.10), _ln("bra cortada sigue", 0.125), _ln("Otro párrafo", 0.20)]
    assert join_lines(lines) == "Una palabra cortada sigue\n\nOtro párrafo"


def test_option_letters_start_their_own_line():
    lines = [_ln("A. uno", 0.10), _ln("B. dos", 0.125), _ln("que sigue", 0.15)]
    assert join_lines(lines) == "A. uno\nB. dos que sigue"


def _cell(row, col, text, header=False, rowspan=1, colspan=1):
    return {"row": row, "col": col, "text": text, "header": header, "rowspan": rowspan, "colspan": colspan}


def test_table_header_row_becomes_headers_and_spans_are_kept():
    spec = table_spec({"cells": [
        _cell(0, 0, "Año", True), _cell(0, 1, "Total", True),
        _cell(1, 0, "2001"), _cell(1, 1, "4", rowspan=2),
        _cell(2, 0, "2002")]})
    assert spec == {"kind": "table", "headers": ["Año", "Total"],
                    "rows": [["2001", {"text": "4", "rowspan": 2}], ["2002"]]}


def test_table_without_header_keeps_every_row():
    spec = table_spec({"cells": [_cell(0, 0, "a"), _cell(0, 1, "b"), _cell(1, 0, "c"), _cell(1, 1, "d")]})
    assert "headers" not in spec and spec["rows"] == [["a", "b"], ["c", "d"]]


def test_azure_cells_lose_selection_marks():
    tables = ocr.tables_from_result({"tables": [{"boundingRegions": [{"pageNumber": 1, "polygon": [0, 0, 4, 0, 4, 2, 0, 2]}],
                                                 "cells": [{"rowIndex": 0, "columnIndex": 0, "content": ":selected: Sí\n  no"}]}]}, 1, 8, 4)
    assert tables[0]["cells"][0]["text"] == "Sí no"
    assert (tables[0]["x0"], tables[0]["x1"], tables[0]["y1"]) == (0, 0.5, 0.5)
