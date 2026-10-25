"""Azure OpenAI relay for the laptop. Standard library only, so it runs on any Python 3.9+.

    python relay.py C:\\Icfes\\pipeline\\queue

Watches <queue>/in for request files (*.jsonl). Each line is one chat request:
    {"id": "...", "deployment": "solve", "messages": [...], "max_completion_tokens": 4000,
     "response_format": {"type": "json_object"}, "reasoning_effort": "medium"}
Answers go to <queue>/out/<same name>.jsonl, one line per id, written as they arrive, so a stopped run resumes.
A request file is finished when <queue>/out/<name>.done exists.

Safety: only deployments listed in <queue>/allowed.txt are called (one name per line), and spending stops at the cap
in <queue>/cap_usd.txt (default 20). Spend so far is kept in <queue>/spend.json. Keys come from the environment:
AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY (optional AZURE_OPENAI_API_VERSION). Nothing secret is written to disk.
Prices (USD per 1M tokens, input/cached input/output) are in <queue>/prices.json; unknown deployments use the dearest.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_PRICES = {"*": [2.0, 0.5, 10.0]}
lock = threading.Lock()


def load_json(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


class Budget:
    def __init__(self, q: Path):
        self.q = q
        self.spend = load_json(q / "spend.json", {"usd": 0.0, "by_deployment": {}, "calls": 0})

    def cap(self) -> float:
        try:
            return float((self.q / "cap_usd.txt").read_text().strip())
        except Exception:
            return 20.0

    def prices(self, dep: str):
        table = load_json(self.q / "prices.json", DEFAULT_PRICES)
        if dep in table:
            return table[dep]
        return max(table.values(), key=lambda p: p[2])

    def add(self, dep: str, usage: dict) -> float:
        pin, pcache, pout = self.prices(dep)
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0) or 0
        prompt = usage.get("prompt_tokens", 0) - cached
        usd = (prompt * pin + cached * pcache + usage.get("completion_tokens", 0) * pout) / 1e6
        with lock:
            self.spend["usd"] += usd
            self.spend["calls"] += 1
            d = self.spend["by_deployment"].setdefault(dep, {"usd": 0.0, "calls": 0, "in": 0, "out": 0})
            d["usd"] += usd
            d["calls"] += 1
            d["in"] += usage.get("prompt_tokens", 0)
            d["out"] += usage.get("completion_tokens", 0)
            (self.q / "spend.json").write_text(json.dumps(self.spend, indent=1), encoding="utf-8")
        return usd

    def over(self) -> bool:
        return self.spend["usd"] >= self.cap()


def call(req: dict) -> dict:
    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
    # Foundry (services.ai.azure.com) accepts the v1 route only; the deployment goes in "model" and no api-version is sent.
    url = f"{endpoint}/openai/v1/chat/completions"
    body = {"model": req["deployment"], "messages": req["messages"], "max_completion_tokens": req.get("max_completion_tokens", 4000)}
    for k in ("response_format", "reasoning_effort", "temperature", "seed"):
        if k in req:
            body[k] = req[k]
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(6):
        r = urllib.request.Request(url, data, {"Content-Type": "application/json", "api-key": os.environ["AZURE_OPENAI_KEY"]})
        try:
            with urllib.request.urlopen(r, timeout=300) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")[:2000]
            last = {"http": e.code, "error": text}
            if e.code in (429, 500, 502, 503, 504):
                wait = int(e.headers.get("retry-after") or 0) or min(60, 4 * 2 ** attempt)
                time.sleep(wait)
                continue
            return {"_error": last}
        except Exception as e:  # network hiccup
            last = {"error": repr(e)}
            time.sleep(min(60, 4 * 2 ** attempt))
    return {"_error": last}


def run_file(q: Path, f: Path, budget: Budget, allowed: set[str], workers: int) -> None:
    out = q / "out" / f.name
    done_ids = set()
    if out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            try:
                done_ids.add(json.loads(line)["id"])
            except Exception:
                pass
    reqs = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    todo = [r for r in reqs if r["id"] not in done_ids]
    print(f"{f.name}: {len(reqs)} requests, {len(todo)} to do, spent so far ${budget.spend['usd']:.2f} of ${budget.cap():.2f}", flush=True)

    def one(r):
        if budget.over():
            return None
        if r["deployment"] not in allowed:
            return {"id": r["id"], "error": f"deployment {r['deployment']} is not in allowed.txt"}
        t0 = time.time()
        res = call(r)
        if "_error" in res:
            return {"id": r["id"], "error": res["_error"]}
        usage = res.get("usage", {})
        usd = budget.add(r["deployment"], usage)
        ch = (res.get("choices") or [{}])[0]
        return {"id": r["id"], "deployment": r["deployment"], "content": (ch.get("message") or {}).get("content"),
                "finish_reason": ch.get("finish_reason"), "usage": usage, "usd": round(usd, 6),
                "seconds": round(time.time() - t0, 1)}

    with cf.ThreadPoolExecutor(workers) as ex, open(out, "a", encoding="utf-8") as fo:
        for res in ex.map(one, todo):
            if res is None:
                continue
            with lock:
                fo.write(json.dumps(res, ensure_ascii=False) + "\n")
                fo.flush()
    if budget.over():
        print(f"STOPPED at the cap: ${budget.spend['usd']:.2f}. Raise cap_usd.txt to continue.", flush=True)
        return
    (q / "out" / (f.stem + ".done")).write_text(time.strftime("%Y-%m-%dT%H:%M:%S"), encoding="utf-8")
    print(f"{f.name}: finished, total spent ${budget.spend['usd']:.2f}", flush=True)


def main() -> int:
    q = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    for d in ("in", "out"):
        (q / d).mkdir(parents=True, exist_ok=True)
    for v in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY"):
        if not os.environ.get(v):
            print(f"Missing environment variable {v}", file=sys.stderr)
            return 2
    workers = int(os.environ.get("RELAY_WORKERS", "8"))
    once = "--once" in sys.argv
    print(f"relay watching {q / 'in'} (workers {workers})", flush=True)
    while True:
        budget = Budget(q)
        allowed = {l.strip() for l in (q / "allowed.txt").read_text().splitlines() if l.strip()} if (q / "allowed.txt").exists() else set()
        (q / "status.json").write_text(json.dumps({"alive": time.strftime("%Y-%m-%dT%H:%M:%S"), "spend_usd": round(budget.spend["usd"], 4),
                                                    "cap_usd": budget.cap(), "allowed": sorted(allowed)}), encoding="utf-8")
        pending = [f for f in sorted((q / "in").glob("*.jsonl")) if not (q / "out" / (f.stem + ".done")).exists()]
        for f in pending:
            if budget.over():
                break
            run_file(q, f, budget, allowed, workers)
        if once:
            return 0
        time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
