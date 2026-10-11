import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from icfes_admin.formula import Bar, find_bars, to_latex, words  # noqa: E402
from icfes_admin.ocr import Line  # noqa: E402


def test_units_get_exponents_and_words_stay_text():
    assert words("lago (m3)") == r"\text{lago (m}^{3}\text{)}"
    assert words("Cauce (m³/años)") == r"\text{Cauce (m}^{3}\text{/años)}"
    assert words("100 kg") == r"\text{100 kg}"


def test_word_fraction_with_a_stacked_left_side():
    lines = [Line("Tiempo de", 0.2, 0.3, 0.1, 0.1), Line("retención (años) =", 0.2, 0.55, 0.05, 0.1),
             Line("Volumen del", 0.7, 0.15, 0.6, 0.1), Line("lago (m3)", 0.7, 0.3, 0.6, 0.1),
             Line("Cauce", 0.7, 0.6, 0.65, 0.1), Line("(m3/años)", 0.7, 0.8, 0.6, 0.1)]
    tex = to_latex(lines, [Bar(0.45, 0.95, 0.45)])
    assert tex == (r"\displaystyle \text{Tiempo de retención (años)} = \frac{\text{Volumen del lago (m}^{3}\text{)}}"
                   r"{\text{Cauce (m}^{3}\text{/años)}}")


def test_a_lost_equals_sign_comes_back_and_no_bar_means_plain_rows():
    lines = [Line("Densidad", 0.2, 0.5, 0.1, 0.1), Line("masa", 0.7, 0.3, 0.6, 0.1), Line("volumen", 0.7, 0.7, 0.6, 0.1)]
    assert to_latex(lines, [Bar(0.5, 0.9, 0.5)]) == r"\displaystyle \text{Densidad} = \frac{\text{masa}}{\text{volumen}}"
    assert to_latex([Line("a + b", 0.5, 0.5, 0.1, 0.1)], []) == r"\text{a + b}"


def test_bars_are_long_thin_dark_runs():
    w, h = 200, 60
    px = bytearray([255] * w * h)
    for y in (30, 31):
        for x in range(40, 180):
            px[y * w + x] = 0
    for y in range(5, 15):  # a short blob, like a letter
        for x in range(10, 18):
            px[y * w + x] = 0
    bars = find_bars(bytes(px), w, h, 1)
    assert len(bars) == 1
    assert abs(bars[0].x0 - 0.2) < 0.01 and abs(bars[0].x1 - 0.9) < 0.01 and abs(bars[0].y - 30.5 / 60) < 0.01


def test_formulas_on_a_page_are_found_without_a_box():
    from icfes_admin.formula import find_formulas
    w, h = 400, 300
    px = bytearray([255] * w * h)
    for x in range(200, 320):  # the fraction bar
        px[150 * w + x] = 0
    lines = [Line("Densidad =", 0.35, 0.5, 0.25, 0.04), Line("masa", 0.65, 0.45, 0.6, 0.04),
             Line("volumen", 0.65, 0.55, 0.57, 0.04), Line("Un texto largo de la pregunta", 0.5, 0.1, 0.1, 0.04)]
    found = find_formulas(bytes(px), w, h, 1, lines)
    assert [f.tex for f in found] == [r"\displaystyle \text{Densidad} = \frac{\text{masa}}{\text{volumen}}"]
    x0, y0, x1, y1 = found[0].box
    assert x0 < 0.26 and x1 > 0.79 and y0 < 0.44 and y1 > 0.56
