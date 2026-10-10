"""The admin editor: progress, the ready gate, saving with backups, answer keys and the HTTP layer."""
import json
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from icfes_admin.server import make_server  # noqa: E402
from icfes_admin.store import BadRequest, Conflict, NotFound, Store  # noqa: E402

EXAM = "S11-T_1ra"


def _q(n, **over):
    q = {
        "number": n, "section": "Matemáticas", "part": None, "item_type": "standard", "group_id": None,
        "stimulus_md": "", "stem_md": f"Pregunta {n}?", "expected_options": 2,
        "options": [{"letter": "A", "text_md": "uno", "marked_in_scan": n == 1},
                    {"letter": "B", "text_md": "dos", "marked_in_scan": False}],
        "scan_marked_option": "A" if n == 1 else None,
        "source": {"pages": [3], "crop": None},
        "provenance": {"status": "auto", "trusted": False, "notes": [], "flags": []},
        "ready": True,
    }
    q.update(over)
    return q


@pytest.fixture
def root(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "answer-keys").mkdir()
    (tmp_path / "figures" / "traced" / EXAM).mkdir(parents=True)
    golden = {
        "format": "icfes-golden/1",
        "exam": {"doc_id": EXAM, "title": "Prueba T", "cover_expected_total": 3, "warnings": []},
        "sections": [], "groups": [],
        "questions": [_q(1), _q(2, stem_md="[Texto pendiente: página 4] ¿?", ready=False), _q(3)],
    }
    (tmp_path / "data" / f"{EXAM}.golden.json").write_text(json.dumps(golden, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "answer-keys" / f"{EXAM}.key.json").write_text(
        json.dumps({"format": "icfes-key/1", "answers": {"1": "A"}}), encoding="utf-8")
    (tmp_path / "figures" / "traced" / EXAM / "manifest.json").write_text(json.dumps({"figures": [
        {"question": 3, "figure_id": "t-q3", "spec_id": "t-q3", "kind": "diagram", "method": "potrace",
         "pending_spec": True, "svg": "traced/S11-T_1ra/t-q3.svg"}]}), encoding="utf-8")
    (tmp_path / "figures" / "traced" / EXAM / "t-q3.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'/>")
    return tmp_path


def test_progress_counts_hidden_questions(root):
    p = Store(root).progress(EXAM)
    assert p["questions"] == 3
    assert p["ready"] == 2
    assert p["hidden"] == 2  # Q2 (not ready, text pending) and Q3 (figure pending spec)
    assert p["key"] == {"present": True, "answers": 1, "disputed": None}
    assert p["figures"]["pending_spec"] == 1


def test_hidden_reasons_name_each_gate(root):
    s = Store(root)
    rows = {r["number"]: r for r in s.question_rows(EXAM)}
    assert rows[1]["hidden"] == []
    assert set(rows[2]["hidden"]) == {"not ready", "text pending"}
    assert rows[3]["hidden"] == ["figure pending spec"]


def test_save_writes_backup_and_provenance(root):
    s = Store(root)
    detail = s.update_question(EXAM, 1, {"stem_md": "Nueva pregunta 1?"})
    assert detail["question"]["stem_md"] == "Nueva pregunta 1?"
    saved = json.loads((root / "data" / f"{EXAM}.golden.json").read_text(encoding="utf-8"))
    q1 = saved["questions"][0]
    assert q1["stem_md"] == "Nueva pregunta 1?"
    assert q1["provenance"]["notes"][0].startswith("edited in the admin editor")
    assert len(list((root / "data" / ".backups").glob(f"{EXAM}.golden.*.json"))) == 1


def test_ready_gate_refuses_and_writes_nothing(root):
    s = Store(root)
    before = (root / "data" / f"{EXAM}.golden.json").read_text(encoding="utf-8")
    with pytest.raises(Conflict) as err:
        s.update_question(EXAM, 2, {"ready": True, "answer": "B"})
    assert "text pending" in err.value.reasons
    assert (root / "data" / f"{EXAM}.golden.json").read_text(encoding="utf-8") == before
    assert json.loads((root / "answer-keys" / f"{EXAM}.key.json").read_text())["answers"] == {"1": "A"}


def test_ready_gate_accepts_fixed_text_in_the_same_request(root):
    s = Store(root)
    s.update_question(EXAM, 2, {"stem_md": "¿Cuánto es 2+2?", "ready": True})
    assert s.question_rows(EXAM)[1]["ready"] is True


def test_answer_updates_key_file_and_rejects_unknown_letters(root):
    s = Store(root)
    s.update_question(EXAM, 3, {"answer": "B"})
    assert json.loads((root / "answer-keys" / f"{EXAM}.key.json").read_text())["answers"]["3"] == "B"
    with pytest.raises(BadRequest):
        s.update_question(EXAM, 3, {"answer": "Z"})


def test_rejects_fields_outside_the_editor(root):
    with pytest.raises(BadRequest):
        Store(root).update_question(EXAM, 1, {"provenance": {}})


def test_options_keep_scan_marks_and_uppercase_letters(root):
    s = Store(root)
    s.update_question(EXAM, 1, {"options": [{"letter": "a", "text_md": "uno!"}, {"letter": "b", "text_md": "dos"}]})
    q = json.loads((root / "data" / f"{EXAM}.golden.json").read_text(encoding="utf-8"))["questions"][0]
    assert [o["letter"] for o in q["options"]] == ["A", "B"]
    assert q["options"][0]["marked_in_scan"] is True


def test_paths_cannot_escape_the_data_folder(root):
    s = Store(root)
    with pytest.raises(NotFound):
        s.golden("../etc")
    with pytest.raises(NotFound):
        s.figure_file("../../../etc/passwd")


def test_http_round_trip(root):
    server = make_server(root, port=0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with urllib.request.urlopen(base + "/") as r:
            assert "Cóndor".encode() in r.read()
        with urllib.request.urlopen(base + "/api/exams") as r:
            assert json.loads(r.read())[0]["exam"] == EXAM
        req = urllib.request.Request(f"{base}/api/exams/{EXAM}/questions/2", method="PUT",
                                     data=json.dumps({"ready": True}).encode(),
                                     headers={"Content-Type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(req)
        assert err.value.code == 409
        assert "text pending" in json.loads(err.value.read())["reasons"]
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(base + "/api/exams/NOPE/questions")
        assert err.value.code == 404
    finally:
        server.shutdown()


def test_original_pages_render_from_the_source_pdf(root, tmp_path):
    fitz = pytest.importorskip("fitz")
    pdf = tmp_path / "source.pdf"
    doc = fitz.open()
    for i in range(4):
        doc.new_page().insert_text((72, 72), f"pagina {i + 1}")
    doc.save(pdf)
    sources = tmp_path / "pdf-sources.json"
    sources.write_text(json.dumps({EXAM: str(pdf)}), encoding="utf-8")
    store = Store(root, sources=sources)

    assert store.page_count(EXAM) == 4
    png = store.page_png(EXAM, 2)
    assert png.read_bytes()[:4] == b"\x89PNG"
    with pytest.raises(NotFound):
        store.page_png(EXAM, 9)

    # Question 1 has no recorded page: its page is estimated from its place in the exam (3 questions, 4 pages).
    gold = dict(store.golden(EXAM))
    gold["questions"] = [dict(q, source={"pages": [], "crop": None}) for q in gold["questions"]]
    (root / "data" / f"{EXAM}.golden.json").write_text(json.dumps(gold), encoding="utf-8")
    detail = store.question_detail(EXAM, 1)
    assert detail["scan"] == {"pages": [], "guess": 1, "count": 4, "estimated": True}
    assert store.question_detail(EXAM, 3)["scan"]["guess"] == 4
