import json

from icfes_view.clean import clean
from icfes_view.render import md_to_html, prepare, render_html, sanitize
from icfes_view.segment import segment

MD = """<!-- pages 1-3 -->

<!-- PageHeader="X1" -->
# PRUEBA

<figure>

S11-0

</figure>

![Figure 1.1 (page 1)](../figures/d/p0001_fig1.1.png)

# Prueba de Sociales y Ciudadanas parte II

1\\. Lea el siguiente fragmento de un discurso muy conocido de la histo-
ria contemporánea:

Texto del fragmento con una cita larga.

¿Cuál es la idea principal del fragmento?

A. Primera opción.

B. Segunda opción.

☒
Tercera opción con la marca.

D. Cuarta opción.

<!-- PageFooter="Escaneado con CamScanner" -->
<!-- PageBreak -->

# PRUEBA

<figure>
S11-0
</figure>

![Figure 2.1 (page 2)](../figures/d/p0002_fig2.1.png)

## 2. TÍTULO DE LA PREGUNTA

Un párrafo de contexto para la segunda pregunta.

Elija la mejor respuesta: 1\\. Escrito a mano
A. uno

dos sin letra
C. tres

cuatro sin letra

3\\. ¿Cuánto es dos más dos si se suman en la tabla?

<table>
<tr><th>x</th></tr>
<tr><td>2</td></tr>
</table>

A. 3

B. 4

C. 5

D. 6

# PRUEBA

<figure>S11-0</figure>
![Figure 3.1 (page 3)](../figures/d/p0003_fig3.1.png)

# RESPONDA LAS PREGUNTAS 5 A 6 DE ACUERDO CON EL SIGUIENTE TEXTO

Este es el texto compartido para las preguntas cinco y seis, un poco largo.

5\\. ¿De qué trata el texto compartido de arriba, en pocas palabras?

A. De un tema.

B. De otro tema.

C. De un tercero.

D. De un cuarto.
"""


def run():
    items, figs = clean(MD)
    return items, figs, segment(items)


def test_cleaning_removes_noise_and_furniture():
    items, figs, _ = run()
    text = "\n".join(items)
    assert "PageFooter" not in text and "CamScanner" not in text and "PageBreak" not in text
    assert "S11-0" not in text and figs == []           # logo repeated on every page is dropped
    assert "historia contemporánea" in text              # hyphenated line break repaired
    assert "# PRUEBA" not in text                        # repeated running header dropped


def test_questions_options_and_restored_letters():
    _, _, seg = run()
    q = {x["number"]: x for x in seg["questions"]}
    assert [o["letter"] for o in q[1]["options"]] == list("ABCD")
    assert q[1]["options"][2]["text_md"].startswith("Tercera opción") and q[1]["options"][2]["marked_in_scan"]
    assert q[1]["stem_md"].startswith("¿Cuál es la idea principal")
    assert "Texto del fragmento" in q[1]["stimulus_md"]
    assert q[1]["section"] == "Sociales y Ciudadanas" and not q[1]["flags"]


def test_heading_question_sublist_and_letterless_options():
    _, _, seg = run()
    q = {x["number"]: x for x in seg["questions"]}
    assert 2 in q and "TÍTULO DE LA PREGUNTA" in q[2]["stimulus_md"]
    # "1. Escrito a mano" is a sub-list item, not question 1 again; letterless B and D are restored
    assert [o["letter"] for o in q[2]["options"]] == list("ABCD")
    assert q[2]["options"][1]["text_md"] == "dos sin letra" and q[2]["options"][3]["text_md"] == "cuatro sin letra"


def test_missing_number_becomes_flagged_placeholder_and_groups_work():
    _, _, seg = run()
    q = {x["number"]: x for x in seg["questions"]}
    assert 4 in seg["missing"] and q[4]["placeholder"] and q[4]["flags"]   # "3." then "5.": 4 was never seen
    assert q[5]["group_id"] == "g5-6"
    assert "texto compartido" in seg["groups"][0]["stimulus"][0]
    assert sorted(q) == [1, 2, 3, 4, 5]                                   # nothing silently dropped


def test_sanitizer_blocks_active_content():
    bad = '<p onclick="x()">hi</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="x()"><a href="javascript:x">l</a>'
    out = sanitize(bad)
    assert "script" not in out.replace("alert(1)", "") and "onclick" not in out and "javascript" not in out
    assert "<img>" in out or "<img" in out and "src=" not in out
    assert "<table>" in md_to_html("<table><tr><td>1</td></tr></table>", lambda s: s)


def test_viewer_html_embeds_data_safely(tmp_path):
    _, _, seg = run()
    seg["questions"][0]["stem_md"] = "</script><script>alert(1)</script> ¿Pregunta?"
    page = render_html(prepare("d", "Doc <b>", seg, lambda s: s))
    from icfes_view.render import TEMPLATE
    assert "<script>alert" not in page and page.count("</script>") == TEMPLATE.count("</script>")   # embedding adds no tags
    assert "<!--" not in page.split('type="application/json">')[1].split("</script>")[0]
    assert "Doc &lt;b&gt;" in page
    data = json.loads(page.split('type="application/json">')[1].split("</script>")[0])
    assert len(data["questions"]) == 5 and data["groups"]["g5-6"]["directions"].startswith("RESPONDA")


def test_crops_are_attached_to_questions_and_groups():
    _, _, seg = run()
    crops = {"q1": "crop:q1", "g5-6": "crop:g5-6"}
    data = prepare("d", "t", seg, lambda s: s, {}, crops)
    q = {x["number"]: x for x in data["questions"]}
    assert q[1]["crop"] == "crop:q1" and q[2]["crop"] is None
    assert data["groups"]["g5-6"]["crop"] == "crop:g5-6"


def test_merged_options_are_flagged_not_trusted():
    from icfes_view.segment import cut, build
    items = ["1\\. Pregunta de prueba larga para el test completo?", "A. uno", "B. dos C. tres muy distinto", "D. cuatro"]
    q = build(cut(items)[0][0])
    assert any("may contain another option" in f for f in q["flags"])


def test_boundary_mark_between_options_does_not_merge_them():
    from icfes_view.clean import clean
    from icfes_view.segment import cut, build
    md = ("# Prueba de Matemáticas parte II\n\n40\\. ¿Cuál de los requerimientos es imposible de cumplir en el problema?\n\n"
          "A. Requerimiento 1.\n☒\nRequerimiento 2.\nC. Requerimiento 3.\nD. Requerimiento 4.\n")
    items, _ = clean(md)
    q = build(cut(items)[0][0])
    assert [o["letter"] for o in q["options"]] == list("ABCD")
    assert q["options"][0]["text_md"] == "Requerimiento 1." and q["options"][1]["text_md"] == "Requerimiento 2."
    assert q["options"][1]["marked_in_scan"] and not q["flags"]


def test_mark_inside_a_letterless_option_still_belongs_to_that_option():
    from icfes_view.clean import clean
    from icfes_view.segment import cut, build
    md = ("15\\. ¿Las conclusiones de estos estudios son?\n\nA. uno largo\n\nB. dos largo\n\n"
          "contradictorias, porque una se refiere a los efectos\n☒\npositivos de tener ambos padres\n\nD. cuatro largo\n")
    items, _ = clean(md)
    q = build(cut(items)[0][0])
    assert [o["letter"] for o in q["options"]] == list("ABCD")
    assert q["options"][2]["text_md"].startswith("contradictorias") and "positivos" in q["options"][2]["text_md"]


def test_options_with_letters_but_no_text_are_flagged():
    from icfes_view.segment import cut, build
    items = ["30\\. Pregunta cuyas opciones están en una tabla de datos?", "A.", "B.", ".", "D."]
    q = build(cut(items)[0][0])
    assert any("no text" in f for f in q["flags"])


def test_mark_between_the_two_lines_of_an_option_keeps_it_as_one_option():
    from icfes_view.clean import clean
    from icfes_view.segment import cut, build
    md = ("9\\. ¿Qué derecho se está vulnerando en esta situación descrita?\n\n"
          "A. protegiendo el derecho a la libre empresa, pues sí\n\n"
          "vulnerando el derecho a la diversidad étnica y cultural,\n\n☒ pues los sitios sagrados son parte esencial\n\n"
          "C. protegiendo el derecho a la libertad de expresión\n\nD. vulnerando el derecho al trabajo de todos\n")
    items, _ = clean(md)
    q = build(cut(items)[0][0])
    assert [o["letter"] for o in q["options"]] == list("ABCD") and not q["flags"]
    assert q["options"][1]["text_md"].startswith("vulnerando el derecho a la diversidad") and "pues los sitios" in q["options"][1]["text_md"]


def test_last_option_with_dot_and_mark_on_second_line():
    from icfes_view.clean import clean
    from icfes_view.segment import cut, build
    md = ("20\\. ¿Cuál puede ser la principal intención de esta acción pública?\n\nA. Tranquilizar a la población\n\n"
          "B. Intimidar a los demás criminales\n\nC. Presionar a las Fuerzas Armadas\n\n"
          ". Desviar la atención de las acusaciones en su contra\n\n☒ otra información.\n")
    items, _ = clean(md)
    q = build(cut(items)[0][0])
    assert [o["letter"] for o in q["options"]] == list("ABCD") and q["options"][3]["text_md"].endswith("otra información.")


def test_latex_is_tidied_protected_from_markdown_and_kept_as_text():
    from icfes_view.clean import tidy_math
    assert tidy_math("expresión $\\frac { x ^ { 2 } + 1 } { 1 0 0 }$ y $0 , 5$ m") == "expresión $\\frac { x ^ { 2 } + 1 } { 100 }$ y $0,5$ m"
    h = md_to_html("Valor de $a_1 * b_2$ y **negrita** y $\\frac { 1 } { 3 }$", lambda s: s)
    assert "$a_1 * b_2$" in h and "<strong>negrita</strong>" in h and "\\frac { 1 } { 3 }" in h
    assert "<script" not in md_to_html("$<script>alert(1)</script>$", lambda s: s) and "&lt;script&gt;" in md_to_html("$<script>x</script>$", lambda s: s)
