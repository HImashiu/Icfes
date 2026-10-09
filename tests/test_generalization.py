"""Layouts that only appear in some exams: cloze answer tables, stems-first English parts, odd cover tables."""
from icfes_view.blueprint import parse_cover_table, section_of, section_plan
from icfes_view.segment import expand_tables, segment


def table(*rows: list[str]) -> str:
    return "<table>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</table>"


def test_cloze_table_rows_become_questions():
    items = ["# Prueba de Inglés", "## PARTE 4.A", "RESPONDA LAS PREGUNTAS 97 A 99 DE ACUERDO CON EL SIGUIENTE TEXTO",
             "Text with blanks (97) and (98) and (99).",
             table(["97.", "☒", "happier", "B.", "happy", "C.", "happiest"],
                   ["98.", "A.", "thinking", "☒", "thought", "$\\mathrm { c } .$", "think"],
                   ["99.", "A.", "instead", "B.", "next", "☒", "however"])]
    qs = segment(items)["questions"]
    assert [q["number"] for q in qs] == [97, 98, 99]
    assert [o["text_md"] for o in qs[1]["options"]] == ["thinking", "thought", "think"]
    assert [o["marked_in_scan"] for o in qs[1]["options"]] == [False, True, False]
    assert [o["letter"] for o in qs[0]["options"]] == ["A", "B", "C"] and qs[0]["options"][0]["marked_in_scan"]
    assert qs[0]["stem_md"].startswith("Blank (97)") and not qs[0]["flags"]


def test_option_table_with_embedded_numbers_and_answer_columns():
    out = expand_tables([table(["125. A. to", "B. in", "C. on", "", "D. at"],
                               ["126. A. who", "B. where", "C. whose", "", "D. that"],
                               ["127. A. jumps", "B. flies", "C. rushes", "", "D. swims"])])
    assert out[0] == "125\\." and out[1:5] == ["A. to", "B. in", "C. on", "D. at"]


def test_cover_like_tables_are_not_expanded():
    cover = table(["Prueba", "Preguntas", "Total"], ["Matemáticas 1", "25", "120"])
    assert expand_tables([cover]) == [cover]


def test_stems_first_conversation_part_gets_its_options_back():
    items = ["# Prueba de Inglés", "## PARTE 3", "## RESPONDA LAS PREGUNTAS 90 A 92 DE ACUERDO CON EL EJEMPLO",
             "90\\. Where did they buy their new car?", "91\\. I'm going to the art exhibition soon.",
             "92\\. Shall I get the door, please my dear friend?",
             "☒ I don't know.", "B. You are right.", "C. It's bigger.",
             "A. By the way.", "B. How long ago?", "☒ How interesting!",
             "A. Yes, please.", "☒ Wait for me.", "C. Not now."]
    qs = {q["number"]: q for q in segment(items)["questions"]}
    assert [o["text_md"] for o in qs[90]["options"]] == ["I don't know.", "You are right.", "It's bigger."]
    assert qs[91]["options"][2]["marked_in_scan"] and qs[92]["options"][1]["marked_in_scan"]
    assert all(len(q["options"]) == 3 for q in qs.values())


def test_matching_part_shares_one_word_bank():
    items = ["# Prueba de Inglés", "## PARTE 2 RESPONDA LAS PREGUNTAS 85 A 87 DE ACUERDO CON EL EJEMPLO",
             "85\\. A very fine slender piece of polished metal.", "86\\. A container in which flowers grow.",
             "87\\. A square of thin fabric carried in the pocket.",
             *[f"{L}. {w}" for L, w in zip("ABCDEFGH", ["Cocktail", "Flowerpot", "Grapefruit", "Stash", "Handkerchief",
                                                          "Warehouse", "Needle", "Soursop"])]]
    qs = segment(items)["questions"]
    assert all(len(q["options"]) == 8 for q in qs)
    assert qs[2]["stem_md"].startswith("87") or "square" in qs[2]["stem_md"]


COVER_G = table(["Prueba", "Preguntas cerradas", "Preguntas abiertas", "Total preguntas", "Tiempo"],
                ["Matemáticas", "26", "$ 2", "117", "4 Horas y"], ["Lectura crítica", "38", "2"],
                ["udadanas 1", "22", "", "30 Minutos"], ["Ciencias naturales 1", "27.", ""])


def test_cover_with_open_questions_and_garbled_names():
    c = parse_cover_table(COVER_G)
    assert [(s["name"], s["expected"]) for s in c["sections"]] == [
        ("Matemáticas", 26), ("Lectura crítica", 38), ("Sociales y ciudadanas", 22), ("Ciencias naturales", 27)]
    assert (c["closed"], c["total"], c["open"]) == (113, 117, 4)


def test_cover_with_unreadable_counts_falls_back_to_the_usual_form():
    c = parse_cover_table(table(["Prueba", "Preguntas cerradas", "Total preguntas", "Tiempo"],
                                ["", "25 25 4 Horas y 29 124 30 Minutos 45"],
                                ["Sociales y ciudadanas 2"], ["Matemáticas 2"], ["Ciencias naturales 2"], ["Inglés"]))
    assert [s["expected"] for s in c["sections"]] == [25, 25, 29, 55] and c["closed"] == 134


def test_sections_follow_the_cover_order_not_the_headings():
    plan = section_plan(parse_cover_table(COVER_G))
    assert [section_of(plan, n) for n in (1, 26, 27, 64, 65, 86, 87, 113)] == [
        "Matemáticas", "Matemáticas", "Lectura crítica", "Lectura crítica", "Sociales y ciudadanas",
        "Sociales y ciudadanas", "Ciencias naturales", "Ciencias naturales"]
    assert section_of(plan, 114) is None
