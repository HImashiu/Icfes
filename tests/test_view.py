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
    assert "<script>alert" not in page and page.count("</script>") == 2   # only the page's own two script tags
    assert "Doc &lt;b&gt;" in page
    data = json.loads(page.split('type="application/json">')[1].split("</script>")[0].replace("<\\/", "</"))
    assert len(data["questions"]) == 5 and data["groups"]["g5-6"]["directions"].startswith("RESPONDA")


def test_crops_are_attached_to_questions_and_groups():
    _, _, seg = run()
    crops = {"q1": "crop:q1", "g5-6": "crop:g5-6"}
    data = prepare("d", "t", seg, lambda s: s, {}, crops)
    q = {x["number"]: x for x in data["questions"]}
    assert q[1]["crop"] == "crop:q1" and q[2]["crop"] is None
    assert data["groups"]["g5-6"]["crop"] == "crop:g5-6"
