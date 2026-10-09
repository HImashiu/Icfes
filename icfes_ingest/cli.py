"""Command line: `python -m icfes_ingest run|status`."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import manifest as M
from .config import ConfigError, Settings, load_credentials
from .inputs import unpack_zip
from .runner import Layout, Pipeline

log = logging.getLogger("icfes_ingest")


def setup_logging(log_file: Path | None, verbose: bool) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stderr)]
    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)-7s %(message)s")
    for noisy in ("azure", "urllib3"):  # azure's HTTP logging can include headers
        logging.getLogger(noisy).setLevel(logging.WARNING)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="icfes_ingest", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="process PDFs")
    r.add_argument("--input", required=True, type=Path, help="folder of PDFs (searched recursively) or a .zip")
    r.add_argument("--output", required=True, type=Path)
    r.add_argument("--dry-run", action="store_true", help="plan only: no Azure calls, no credentials needed")
    r.add_argument("--limit", type=int, help="process only the first N unique PDFs (e.g. --limit 1 to test)")
    r.add_argument("--only", help="only PDFs whose file name contains this text")
    r.add_argument("--workers", type=int, default=1, help="documents processed concurrently (default 1, max 8)")
    r.add_argument("--budget-usd", type=float, help="hard spending cap across ALL runs (tracked in the manifest)")
    r.add_argument("--max-pages", type=int, help="hard cap on pages sent to Azure across all runs (overrides --budget-usd)")
    r.add_argument("--usd-per-1000-pages", type=float, default=10.0,
                   help="price used to convert --budget-usd to pages; check your Azure pricing (default 10.0)")
    r.add_argument("--smallest-first", action="store_true", help="process the shortest PDFs first")
    r.add_argument("--retry-failed", action="store_true", help="also retry documents marked failed/partial")
    r.add_argument("--max-pages-per-request", type=int, default=Settings.max_pages_per_request)
    r.add_argument("--max-request-mb", type=float, default=Settings.max_request_bytes / 2**20,
                   help="split PDFs bigger than this (use 4 on the free F0 tier)")
    r.add_argument("--max-retries", type=int, default=Settings.max_retries)
    r.add_argument("--keep-work", action="store_true", help="keep per-document cache after success")
    r.add_argument("-v", "--verbose", action="store_true")
    s = sub.add_parser("status", help="show manifest summary")
    s.add_argument("--output", required=True, type=Path)
    return p


def print_plan(plan: dict) -> None:
    print(f"{'ACTION':<28}{'PAGES':>6}{'MB':>8}{'REQS':>6}  FILE")
    for d in plan["documents"]:
        print(f"{d['action']:<28}{d['pages']:>6}{d['size_mb']:>8}{d['requests']:>6}  {d['file']}")
        for dup in d["duplicates"]:
            print(f"{'  duplicate (not processed)':<28}{'':>20}  {dup}")
    for u in plan["unreadable"]:
        print(f"{'UNREADABLE':<28}{'':>20}  {u['path']}: {u['error']}")
    if plan["ignored_non_pdf"]:
        print(f"ignored non-PDF files: {len(plan['ignored_non_pdf'])}")


def cmd_status(out: Path) -> int:
    man = M.Manifest(Layout(out).manifest)
    print(json.dumps(man.summary(), indent=2))
    print(f"billed pages (tracked): {man.billed_pages}")
    bad = 0
    for rec in man.documents.values():
        if rec["status"] != M.COMPLETED:
            bad += 1
            print(f"- {rec['status']:<11} {rec.get('primary_path')}  {rec.get('error') or ''}")
            for w in rec.get("warnings") or []:
                print(f"    warning: {w}")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "status":
        setup_logging(None, False)
        return cmd_status(args.output)

    creds = None
    if not args.dry_run:
        try:
            creds = load_credentials()
        except ConfigError as e:
            print(f"ERROR: {e}\nSee README.md > Setup.", file=sys.stderr)
            return 2
    lay = Layout(args.output)
    setup_logging(None if args.dry_run else lay.log_file, args.verbose)
    settings = Settings(max_pages_per_request=args.max_pages_per_request,
                        max_request_bytes=int(args.max_request_mb * 2**20), max_retries=args.max_retries,
                        workers=max(1, min(args.workers, 8)), keep_work=args.keep_work, retry_failed=args.retry_failed)
    src = args.input
    if not src.exists():
        log.error("Input not found: %s", src)
        return 2
    if src.is_file() and src.suffix.lower() == ".zip":
        src = unpack_zip(src, args.output / "_input_unpacked")
        log.info("Unpacked PDFs from zip to %s", src)

    backend_factory = None
    if creds:
        from .backend import AzureLayoutBackend
        backend_factory = lambda: AzureLayoutBackend(creds)  # noqa: E731
        log.info("Using endpoint %s", creds.endpoint)

    cap = args.max_pages
    if cap is None and args.budget_usd is not None:
        cap = int(args.budget_usd / args.usd_per_1000_pages * 1000)
    if cap is not None:
        log.info("Budget cap: %d pages (~$%.2f at $%.2f per 1000 pages)", cap, cap * args.usd_per_1000_pages / 1000,
                 args.usd_per_1000_pages)
    pipe = Pipeline(src, args.output, settings, backend_factory, max_pages=cap)
    if args.dry_run:
        plan = pipe.dry_run(args.only, args.limit, args.smallest_first)
        print_plan(plan)
        est = plan["pages_to_bill"] * args.usd_per_1000_pages / 1000
        print(f"\nEstimated cost of this plan: ~${est:.2f} ({plan['pages_to_bill']} pages at ${args.usd_per_1000_pages}/1000)."
              + (f" Budget: {cap} pages." if cap is not None else " No budget cap set."), file=sys.stderr)
        print(f"\nDRY RUN: {plan['to_process']} document(s), {plan['pages_to_bill']} page(s), "
              f"{plan['requests']} request(s) would be sent. Nothing was uploaded.", file=sys.stderr)
        return 1 if plan["unreadable"] else 0

    result = pipe.run(args.only, args.limit, args.smallest_first)
    print(json.dumps(result["summary"], indent=2))
    print(f"Pages billed so far: {result['billed_pages']}"
          f" (~${result['billed_pages'] * args.usd_per_1000_pages / 1000:.2f})", file=sys.stderr)
    if result["budget_hit"]:
        print("BUDGET REACHED: stopped early. Raise --budget-usd and re-run the same command to resume.", file=sys.stderr)
    code = cmd_status(args.output)
    return code or (1 if result["unreadable"] else 0)
