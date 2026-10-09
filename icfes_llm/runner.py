"""Claude extraction with caching, a hard spending cap, and cross-checks."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image

from icfes_view.score import sim

from . import prompts as P

log = logging.getLogger("icfes_llm")

# $ per million tokens (input, output). Source: the API reference's cached price table; override with --price-in/--price-out.
PRICES = {"claude-opus-5-5": (4.0, 20.0), "claude-opus-5": (5.0, 25.0), "claude-sonnet-5-5": (2.0, 10.0),
          "claude-sonnet-5": (2.0, 10.0), "claude-haiku-5-5": (0.10, 0.50), "claude-fable-5-1": (10.0, 50.0)}
MAX_IMAGE_WIDTH = 1568
EST_OUTPUT_TOKENS = 1500      # budget reservation per call before the real usage is known
MAX_TOKENS = 4000


class BudgetReached(RuntimeError):
    pass


def load_image(path: Path, max_w: int = MAX_IMAGE_WIDTH) -> tuple[str, str, tuple[int, int]]:
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return base64.standard_b64encode(buf.getvalue()).decode(), "image/jpeg", im.size


def est_input_tokens(size: tuple[int, int], text_chars: int) -> int:
    return int(size[0] * size[1] / 750) + int(text_chars / 3) + 600   # image tokens ~ w*h/750, plus prompt overhead


@dataclass
class Spend:
    usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0


class Extractor:
    def __init__(self, client, model: str = "claude-opus-5-5", effort: str = "medium", passes: int = 1,
                 budget_usd: float | None = None, price: tuple[float, float] | None = None,
                 cache_path: Path | None = None):
        if price is None and model not in PRICES:
            raise ValueError(f"No price known for {model!r}; pass price=(input_per_mtok, output_per_mtok)")
        self.client, self.model, self.effort, self.passes = client, model, effort, max(1, passes)
        self.price = price or PRICES[model]
        self.budget = budget_usd
        self.cache_path = cache_path
        self.cache: dict[str, Any] = {}
        self.spend = Spend()
        if cache_path and cache_path.exists():
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            self.cache, prev = data.get("cache", {}), data.get("spend", {})
            self.spend = Spend(**{k: prev.get(k, 0) for k in ("usd", "input_tokens", "output_tokens", "calls")})

    # ---------------------------------------------------------------- persistence / budget
    def save(self) -> None:
        if self.cache_path:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache_path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"cache": self.cache, "spend": self.spend.__dict__}, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.cache_path)

    def _cost(self, i: int, o: int) -> float:
        return (i * self.price[0] + o * self.price[1]) / 1e6

    def _reserve(self, est_in: int) -> None:
        """Refuse a call that could push total spend over the cap. The reservation is the larger of the pre-estimate and
        the average real cost of the calls so far, so one unexpectedly expensive call cannot be followed blindly."""
        avg = self.spend.usd / self.spend.calls if self.spend.calls else 0.0
        need = max(self._cost(est_in, EST_OUTPUT_TOKENS), avg)
        if self.budget is not None and self.spend.usd + need > self.budget:
            raise BudgetReached(f"${self.spend.usd:.3f} spent of ${self.budget:.2f}; the next call could exceed the cap")

    def estimate(self, crop: Path, text_chars: int) -> float:
        w, h = Image.open(crop).size
        k = min(1.0, MAX_IMAGE_WIDTH / w)
        return self._cost(est_input_tokens((int(w * k), int(h * k)), text_chars), EST_OUTPUT_TOKENS) * self.passes

    # ---------------------------------------------------------------- one API call
    def _call(self, img: tuple[str, str, tuple[int, int]], text: str, schema: dict) -> dict:
        data, media, size = img
        self._reserve(est_input_tokens(size, len(text)))
        resp = self.client.messages.create(
            model=self.model, max_tokens=MAX_TOKENS, system=P.SYSTEM,
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}},
                {"type": "text", "text": text}]}])
        u = resp.usage
        self.spend.input_tokens += u.input_tokens
        self.spend.output_tokens += u.output_tokens
        self.spend.usd += self._cost(u.input_tokens, u.output_tokens)
        self.spend.calls += 1
        rid = getattr(resp, "_request_id", None)
        if resp.stop_reason == "refusal":
            raise ValueError("the model declined this request (stop_reason=refusal)")
        if resp.stop_reason == "max_tokens":
            raise ValueError("response was cut off at max_tokens; the transcription is incomplete")
        block = next((b for b in resp.content if b.type == "text"), None)
        if block is None:
            raise ValueError("no text block in the response")
        out = json.loads(block.text)
        out["_request_id"] = rid
        return out

    def _key(self, kind: str, img_bytes: str, text: str) -> str:
        h = hashlib.sha256()
        for part in (P.PROMPT_VERSION, self.model, self.effort, str(self.passes), kind, img_bytes, text):
            h.update(part.encode()); h.update(b"\0")
        return h.hexdigest()

    # ---------------------------------------------------------------- public: one question
    def extract_question(self, q: dict, crop: Path) -> dict:
        text = P.question_prompt(q["number"], q.get("item_type"), q.get("expected_options"), q.get("stem_md", ""),
                                 q.get("options", []))
        img = load_image(crop)
        key = self._key("q", img[0], text)
        if key in self.cache:
            return {**self.cache[key], "cached": True}
        before = self.spend.usd
        passes = [self._call(img, text, P.QUESTION_SCHEMA) for _ in range(self.passes)]
        res = self._finish(q, passes, self.spend.usd - before)
        self.cache[key] = res
        self.save()
        return res

    # ---------------------------------------------------------------- public: a shared-passage zone with unnumbered items
    def extract_group(self, numbers: list[int], directions: str, crop: Path) -> list[dict]:
        text = P.group_prompt(numbers, directions)
        img = load_image(crop)
        key = self._key("g", img[0], text)
        if key in self.cache:
            return [{**r, "cached": True} for r in self.cache[key]]
        before = self.spend.usd
        out = self._call(img, text, P.GROUP_SCHEMA)
        cost = self.spend.usd - before
        results = []
        for it in out.get("items", []):
            if it["number"] in numbers:
                results.append(self._finish({"number": it["number"], "stem_md": "", "options": []}, [it], cost / max(1, len(numbers))))
        self.cache[key] = results
        self.save()
        return results

    # ---------------------------------------------------------------- validation
    def _finish(self, q: dict, passes: list[dict], cost: float) -> dict:
        a = passes[0]
        opts_a = {o["letter"]: o["text_md"] for o in a["options"]}
        ocr_opts = {o["letter"]: o["text_md"] for o in q.get("options", [])}
        # agreement with the OCR (informational: the image is the source of truth, so disagreement = "look at it")
        sims = [sim(a["stem_md"], q.get("stem_md", ""))] if q.get("stem_md") else []
        sims += [sim(t, ocr_opts[L]) for L, t in opts_a.items() if L in ocr_opts]
        ocr_agreement = round(sum(sims) / len(sims), 2) if sims else None
        # agreement between passes
        pass_agreement = None
        if len(passes) > 1:
            b = passes[1]
            ps = [sim(a["stem_md"], b["stem_md"])]
            bo = {o["letter"]: o["text_md"] for o in b["options"]}
            ps += [sim(opts_a.get(L, ""), bo.get(L, "")) for L in set(opts_a) | set(bo)]
            pass_agreement = round(min(ps), 2)
        issues = list(a.get("issues", []))
        want = q.get("expected_options")
        if want and len(a["options"]) != want:
            issues.append(f"transcribed {len(a['options'])} options, expected {want}")
        needs_human = bool(issues) or a["confidence"] == "low" or (pass_agreement is not None and pass_agreement < 0.95) \
            or (ocr_agreement is not None and ocr_agreement < 0.5)
        return {"number": q["number"], "source": "ai", "model": self.model, "passes": len(passes),
                "stem_md": a["stem_md"], "options": a["options"], "issues": issues, "confidence": a["confidence"],
                "ocr_agreement": ocr_agreement, "pass_agreement": pass_agreement, "needs_human": needs_human,
                "cost_usd": round(cost, 4), "request_ids": [p.get("_request_id") for p in passes]}
