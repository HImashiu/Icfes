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

    pipe = Pipeline(src, args.output, settings, backend_factory)
    if args.dry_run:
        plan = pipe.dry_run(args.only, args.limit)
        print_plan(plan)
        print(f"\nDRY RUN: {plan['to_process']} document(s), {plan['pages_to_bill']} page(s), "
              f"{plan['requests']} request(s) would be sent. Nothing was uploaded.", file=sys.stderr)
        return 1 if plan["unreadable"] else 0

    result = pipe.run(args.only, args.limit)
    print(json.dumps(result["summary"], indent=2))
    code = cmd_status(args.output)
    return code or (1 if result["unreadable"] else 0)
