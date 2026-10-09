import json
from types import SimpleNamespace as NS

import pytest
from PIL import Image

from icfes_llm.cli import main as llm_main
from icfes_llm.runner import BudgetReached, Extractor
from icfes_view.ai import apply_ai

Q = {"number": 36, "item_type": "standard", "expected_options": 4,
     "stem_md": "¿cuál es la probabilidad de que le corresponda una planta de flores rojas?",
     "options": [{"letter": "A", "text_md": "3"}, {"letter": "B", "text_md": "1 2"}, {"letter": "C", "text_md": "2"}, {"letter": "D", "text_md": "3"}]}
GOOD = {"stem_md": "De acuerdo con el anterior procedimiento, ¿cuál es la probabilidad de que a una habitación le corresponda una planta de flores rojas?",
        "options": [{"letter": "A", "text_md": "$\\frac{1}{3}$", "marked_in_scan": False}, {"letter": "B", "text_md": "$\\frac{1}{2}$", "marked_in_scan": True},
                    {"letter": "C", "text_md": "2", "marked_in_scan": False}, {"letter": "D", "text_md": "3", "marked_in_scan": False}],
        "issues": [], "confidence": "high"}


class FakeClient:
    """Stands in for anthropic.Anthropic(): records requests, returns queued JSON payloads."""

    def __init__(self, payloads, stop_reason="end_turn", in_tok=1000, out_tok=300):
        self.payloads, self.calls, self.stop_reason, self.in_tok, self.out_tok = list(payloads), [], stop_reason, in_tok, out_tok
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        p = self.payloads.pop(0) if len(self.payloads) > 1 else self.payloads[0]
        return NS(content=[NS(type="text", text=json.dumps(p))], stop_reason=self.stop_reason,
                  usage=NS(input_tokens=self.in_tok, output_tokens=self.out_tok), _request_id="req_x")


@pytest.fixture
def crop(tmp_path):
    p = tmp_path / "q036.png"
    Image.new("RGB", (800, 600), "white").save(p)
    return p


def test_request_shape_and_result(crop, tmp_path):
    c = FakeClient([GOOD])
    ex = Extractor(c, "claude-opus-5-5", cache_path=tmp_path / "c.json")
    r = ex.extract_question(Q, crop)
    kw = c.calls[0]
    assert kw["model"] == "claude-opus-5-5" and kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["output_config"]["effort"] == "medium" and "temperature" not in kw and "tool_choice" not in kw
    blocks = kw["messages"][0]["content"]
    assert blocks[0]["type"] == "image" and blocks[0]["source"]["media_type"] == "image/jpeg" and "OCR text" in blocks[1]["text"]
    assert r["options"][1]["marked_in_scan"] and r["confidence"] == "high" and not r["needs_human"]
    assert r["cost_usd"] == pytest.approx((1000 * 4 + 300 * 20) / 1e6, abs=1e-4)


def test_cached_second_run_costs_nothing(crop, tmp_path):
    cache = tmp_path / "c.json"
    ex1 = Extractor(FakeClient([GOOD]), "claude-opus-5-5", cache_path=cache)
    ex1.extract_question(Q, crop)
    c2 = FakeClient([GOOD])
    r = Extractor(c2, "claude-opus-5-5", cache_path=cache).extract_question(Q, crop)
    assert c2.calls == [] and r["cached"] and r["stem_md"].startswith("De acuerdo")


def test_budget_cap_is_enforced_before_the_call(crop, tmp_path):
    c = FakeClient([GOOD], in_tok=50_000, out_tok=2_000)
    ex = Extractor(c, "claude-opus-5-5", budget_usd=0.30, cache_path=tmp_path / "c.json")
    ex.extract_question(Q, crop)                       # costs ~$0.24
    with pytest.raises(BudgetReached):
        ex.extract_question({**Q, "number": 37}, crop)  # would exceed the cap -> refused WITHOUT calling the API
    assert len(c.calls) == 1 and ex.spend.usd <= 0.30


def test_refusal_and_truncation_are_errors_not_silent_results(crop, tmp_path):
    with pytest.raises(ValueError, match="declined"):
        Extractor(FakeClient([GOOD], stop_reason="refusal"), "claude-opus-5-5").extract_question(Q, crop)
    with pytest.raises(ValueError, match="cut off"):
        Extractor(FakeClient([GOOD], stop_reason="max_tokens"), "claude-opus-5-5").extract_question(Q, crop)


def test_two_passes_disagreement_and_low_confidence_need_a_human(crop):
    other = {**GOOD, "options": [{**o, "text_md": "9"} for o in GOOD["options"]]}
    r = Extractor(FakeClient([GOOD, other]), "claude-opus-5-5", passes=2).extract_question(Q, crop)
    assert r["passes"] == 2 and r["pass_agreement"] < 0.95 and r["needs_human"]
    low = Extractor(FakeClient([{**GOOD, "confidence": "low"}]), "claude-opus-5-5").extract_question(Q, crop)
    assert low["needs_human"]
    short = {**GOOD, "options": GOOD["options"][:3]}
    assert any("expected 4" in i for i in Extractor(FakeClient([short]), "claude-opus-5-5").extract_question(Q, crop)["issues"])


def test_unknown_model_requires_a_price():
    with pytest.raises(ValueError):
        Extractor(FakeClient([GOOD]), "claude-future-9")
    Extractor(FakeClient([GOOD]), "claude-future-9", price=(1.0, 5.0))


def test_group_mode_returns_numbered_items(crop):
    payload = {"items": [{"number": 80, **{k: GOOD[k] for k in ("stem_md", "options", "issues", "confidence")}},
                         {"number": 81, **{k: GOOD[k] for k in ("stem_md", "options", "issues", "confidence")}},
                         {"number": 999, **{k: GOOD[k] for k in ("stem_md", "options", "issues", "confidence")}}]}
    res = Extractor(FakeClient([payload]), "claude-opus-5-5").extract_group([80, 81, 82], "RESPONDA LAS PREGUNTAS 80 A 82", crop)
    assert [r["number"] for r in res] == [80, 81]          # unrequested numbers are dropped, missing ones stay missing


def test_apply_ai_merges_and_respects_human_edits(tmp_path):
    seg = {"questions": [{"number": 36, "stem_md": "x", "options": [], "flags": ["Expected 4 options"], "status": None},
                         {"number": 37, "stem_md": "keep", "options": [], "flags": [], "status": "human_verified"},
                         {"number": 80, "stem_md": "", "options": [], "flags": ["not detected"], "placeholder": True}]}
    ai = {"results": [
        {"number": 36, "model": "m", "stem_md": "nuevo", "options": GOOD["options"], "needs_human": False, "issues": [], "ocr_agreement": 0.4, "pass_agreement": None},
        {"number": 37, "model": "m", "stem_md": "ai", "options": GOOD["options"], "needs_human": False, "issues": [], "ocr_agreement": 1, "pass_agreement": None},
        {"number": 80, "model": "m", "stem_md": "Where?", "options": GOOD["options"][:3], "needs_human": True, "issues": ["picture"], "ocr_agreement": None, "pass_agreement": None}]}
    p = tmp_path / "a.ai.json"; p.write_text(json.dumps(ai))
    assert apply_ai(seg, p) == 2
    q = {x["number"]: x for x in seg["questions"]}
    assert q[36]["status"] == "ai" and not q[36]["flags"] and q[36]["stem_md"] == "nuevo"
    assert q[37]["stem_md"] == "keep"                                   # human-verified text is never overwritten
    assert q[80]["status"] == "ai_review" and "placeholder" not in q[80] and q[80]["flags"]


def test_cli_dry_run_needs_no_key_and_sends_nothing(tmp_path, capsys):
    out = tmp_path / "out"
    (out / "questions").mkdir(parents=True)
    (out / "crops" / "d").mkdir(parents=True)
    Image.new("RGB", (900, 700), "white").save(out / "crops" / "d" / "q036.png")
    (out / "manifest.json").write_text(json.dumps({"version": 1, "documents": {"h": {"doc_id": "d", "status": "completed"}}, "files": {}}))
    q = {"number": 36, "section": "Matemáticas", "stem_md": "x", "options": [], "flags": ["Expected 4 options"], "item_type": "standard", "expected_options": 4}
    (out / "questions" / "d.auto.json").write_text(json.dumps({"questions": [q]}))
    (out / "questions" / "d.json").write_text(json.dumps({"questions": [q], "groups": []}))
    assert llm_main(["--output", str(out), "--dry-run"]) == 0
    assert "1 question(s)" in capsys.readouterr().out and not list((out / "questions").glob("*.ai.json"))
