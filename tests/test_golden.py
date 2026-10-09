import json

from icfes_view.golden import build_golden, report_md, validate_golden
from icfes_view.score import score

REC = {"primary_path": "x/Exam.pdf", "sha256": "abc", "pages": 3}


def q(n, stem="¿Cuál es la respuesta correcta aquí?", opts=("uno", "dos", "tres", "cuatro"), **kw):
    return {"number": n, "section": "Matemáticas", "part": None, "item_type": "standard", "expected_options": 4, "group_id": None,
            "stimulus_md": "", "stem_md": stem, "flags": [], "notes": [],
            "options": [{"letter": "ABCD"[i], "text_md": t, "marked_in_scan": i == 1} for i, t in enumerate(opts)], **kw}


QDATA = {"questions": [q(1), q(2, status="claude_verified"), q(3)], "groups": [],
         "validation": {"expected_total": 3, "warnings": [], "sections": [{"name": "Matemáticas 2", "expected": 3}]}}
BUNDLES = {"q1": {"file": "q001.png", "segments": [{"page": 1}]}}


def test_clean_exam_passes_and_reports_provenance():
    g = build_golden("d", "Exam", QDATA, BUNDLES, REC)
    v = validate_golden(g)
    assert g["format"] == "icfes-golden/1" and v["ok"] and v["summary"] == {"questions": 3, "ready": 3, "trusted": 1, "auto_clean": 2, "errors": 0, "warnings": 0}
    assert g["questions"][0]["scan_marked_option"] == "B" and g["questions"][0]["source"] == {"pages": [1], "crop": "crops/d/q001.png"}
    assert g["sections"][0]["expected"] == 3 and "PASS" in report_md(g, v)


def test_validator_catches_every_kind_of_incompleteness():
    bad = {**QDATA, "questions": [q(1, opts=("a", "b", "c")), q(2, stem=" "), q(3, opts=("a", "", "c", "d")), q(3),
                                  q(5, opts=("x :formula:", "b", "c", "d")), q(6, group_id="g9")]}
    v = validate_golden(build_golden("d", "Exam", bad, None, REC))
    text = "\n".join(v["errors"])
    for needle in ("Q1: 3 options, expected 4", "Q2: empty question text", "Q3: an option has no text", "Q3: duplicate", "artifacts", "unknown group g9"):
        assert needle in text, needle
    assert not v["ok"]


def test_flagged_questions_are_not_ready_and_warn():
    bad = {**QDATA, "questions": [q(1, flags=["Expected 4 options, found 3"]), q(2), q(3)]}
    g = build_golden("d", "Exam", bad, None, REC)
    v = validate_golden(g)
    assert v["ok"] and v["summary"]["ready"] == 2 and any("review flags" in w for w in v["warnings"])


def test_golden_file_can_be_used_as_gold_for_scoring():
    g = build_golden("d", "Exam", QDATA, None, REC)
    res = score([{"number": 2, "section": "Matemáticas", "stem_md": "¿Cuál es la respuesta correcta aquí?",
                  "options": [{"letter": L, "text_md": t} for L, t in zip("ABCD", ("uno", "dos", "tres", "cuatro"))]}], g)
    assert res["pass_rate"] == 1.0 and len(res["rows"]) == 1      # only the verified question counts as gold
