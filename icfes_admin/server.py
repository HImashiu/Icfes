"""Local web editor for the ICFES question data. Serves on 127.0.0.1 only.

    python -m icfes_admin --data /path/to/icfes [--scans "C:/Users/you/Downloads/icfes-hi300-check"]

The data folder is read on every request, so the page always shows what is on disk.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import NamedTuple
from urllib.parse import parse_qs, unquote, urlparse

from .store import BadRequest, Conflict, NotFound, Store

STATIC = Path(__file__).resolve().parent / "static"
ROUTES = []


class Raw(NamedTuple):
    content_type: str
    data: bytes


def route(method, pattern):
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        ROUTES.append((method, rx, fn))
        return fn
    return deco


@route("GET", r"/api/exams")
def list_exams(store, m, body, query):
    return store.progress_all()


@route("GET", r"/api/exams/([^/]+)/questions")
def list_questions(store, m, body, query):
    return store.question_rows(m.group(1))


@route("GET", r"/api/exams/([^/]+)/questions/(\d+)")
def get_question(store, m, body, query):
    return store.question_detail(m.group(1), int(m.group(2)))


@route("PUT", r"/api/exams/([^/]+)/questions/(\d+)")
def put_question(store, m, body, query):
    if not isinstance(body, dict):
        raise BadRequest("send a JSON object with the fields to change")
    return store.update_question(m.group(1), int(m.group(2)), body)


@route("GET", r"/api/exams/([^/]+)/validation")
def validation(store, m, body, query):
    report, _ = store.validation(store.golden(m.group(1)))
    return report


@route("GET", r"/api/scan/([^/]+)/(\d+)")
def scan(store, m, body, query):
    path = store.scan_file(m.group(1), int(m.group(2)))
    if path is None:
        raise NotFound("no scan page for that exam and page")
    return Raw("image/png", path.read_bytes())


@route("GET", r"/api/figure")
def figure(store, m, body, query):
    rel = (query.get("path") or [""])[0]
    path = store.figure_file(rel)
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return Raw(ctype, path.read_bytes())


class Handler(BaseHTTPRequestHandler):
    store: Store = None

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass

    def do_GET(self):
        self._dispatch("GET")

    def do_PUT(self):
        self._dispatch("PUT")

    def _dispatch(self, method):
        url = urlparse(self.path)
        path = unquote(url.path)
        if method == "GET" and path in ("/", "/index.html"):
            return self._send(200, "text/html; charset=utf-8", (STATIC / "index.html").read_bytes())
        if method == "GET" and not path.startswith("/api/"):
            return self._static(path)
        try:
            for verb, rx, fn in ROUTES:
                match = rx.match(path) if verb == method else None
                if match:
                    body = self._read_json() if method == "PUT" else None
                    result = fn(self.store, match, body, parse_qs(url.query))
                    if isinstance(result, Raw):
                        return self._send(200, result.content_type, result.data)
                    return self._send_json(200, result)
            return self._send_json(404, {"error": "not found"})
        except NotFound as e:
            return self._send_json(404, {"error": str(e)})
        except BadRequest as e:
            return self._send_json(400, {"error": str(e)})
        except Conflict as e:
            return self._send_json(409, {"error": "question cannot be ready yet", "reasons": e.reasons})
        except Exception as e:  # report to the page, keep the server running
            traceback.print_exc(file=sys.stderr)
            return self._send_json(500, {"error": f"{type(e).__name__}: {e}"})

    def _static(self, path):
        target = (STATIC / path.lstrip("/")).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            return self._send_json(404, {"error": "not found"})
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return self._send(200, ctype, target.read_bytes())

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError as e:
            raise BadRequest(f"body is not JSON: {e}")

    def _send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(status, "application/json; charset=utf-8", data)

    def _send(self, status, ctype, data):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def make_server(data, scans=None, port=0):
    store = Store(data, scans)
    handler = type("BoundHandler", (Handler,), {"store": store})
    return ThreadingHTTPServer(("127.0.0.1", port), handler)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="icfes_admin", description="Local ICFES question editor.")
    ap.add_argument("--data", default=os.environ.get("ICFES_DATA"),
                    help="the icfes folder (contains data/, answer-keys/, figures/); default $ICFES_DATA")
    ap.add_argument("--scans", default=os.environ.get("ICFES_SCANS"),
                    help="folder of 300 dpi page renders (optional); default $ICFES_SCANS")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args(argv)
    if not args.data:
        ap.error("pass --data or set ICFES_DATA")
    server = make_server(args.data, args.scans, args.port)
    print(f"ICFES editor on http://127.0.0.1:{server.server_address[1]}  (data: {args.data})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
