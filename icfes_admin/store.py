"""Data layer for the ICFES editor: golden files, answer keys, traced-figure manifests and scan pages.

Everything lives under one data folder (the layout of /mnt/project-files/icfes):

    data/<exam>.golden.json            question records (format icfes-golden/1)
    answer-keys/<exam>.key.json        answers by question number
    answer-keys/<exam>.sidecar.json    key provenance and disputed items (read only here)
    figures/traced/<exam>/manifest.json  traced or eyeballed figures per question

Every write first copies the old file to data/.backups/, then replaces the file atomically.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from icfes_view.golden import validate_golden  # noqa: E402
from icfes_admin import ocr  # noqa: E402

EXAM_ID = re.compile(r"^[A-Za-z0-9_-]+$")
QUESTION_PREFIX = re.compile(r"^Q(\d+):")
PENDING_TEXT = "[Texto pendiente"
FIGURE_NOTE = "[FIGURE"
EDITABLE = {"stem_md", "stimulus_md", "group_passage_md", "section", "options", "ready", "answer"}


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


class Conflict(Exception):
    def __init__(self, reasons):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


FIGURE_KINDS = {"bar", "line", "pie", "scatter", "table", "curve", "diagram", "geometry", "combo", "map"}
IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg"}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_PATH = re.compile(r"^S11-[A-Za-z0-9_]+/[A-Za-z0-9_.-]+\.(png|jpg)$")


def _pymupdf():
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            return None
    return pymupdf


def _count(value):
    return len(value) if isinstance(value, (list, dict)) else value


class Store:
    def __init__(self, root, scans=None, sources=None, ocr=None):
        self.root = Path(root)
        self.data = self.root / "data"
        self.keys = self.root / "answer-keys"
        self.figures = self.root / "figures"
        self.images = self.root / "images"
        self.backups = self.data / ".backups"
        self.scans = Path(scans) if scans else None
        # sources: a JSON map {"S11-A_1ra": "C:/.../S11- A 1ra Sesión.pdf"} to the exam's source PDF.
        self.sources = {}
        if sources:
            self.sources = {k: Path(v) for k, v in json.loads(Path(sources).read_text(encoding="utf-8")).items()}
        self.page_cache = Path(tempfile.gettempdir()) / "icfes-admin-pages"
        # ocr: the folder of raw Azure layout results (icfes-azure-data/json); lets the page copy text from a box.
        self.ocr = Path(ocr) if ocr else None
        self._ocr_pages = {}
        self.history = self.data / ".history"
        if not self.data.is_dir():
            raise FileNotFoundError(f"no data/ folder under {self.root}")

    # ----- reading -------------------------------------------------------

    def exam_ids(self):
        return sorted(p.name[: -len(".golden.json")] for p in self.data.glob("*.golden.json"))

    def _exam(self, exam):
        if not EXAM_ID.match(exam) or exam not in self.exam_ids():
            raise NotFound(f"no exam {exam}")
        return exam

    def golden(self, exam):
        exam = self._exam(exam)
        return json.loads((self.data / f"{exam}.golden.json").read_text(encoding="utf-8"))

    def answers(self, exam):
        p = self.keys / f"{exam}.key.json"
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8")).get("answers", {})

    def sidecar(self, exam):
        p = self.keys / f"{exam}.sidecar.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def manifest_figures(self, exam):
        p = self.figures / "traced" / exam / "manifest.json"
        if not p.exists():
            return []
        return json.loads(p.read_text(encoding="utf-8")).get("figures", [])

    def figures_by_question(self, exam):
        by_q = {}
        for f in self.manifest_figures(exam):
            by_q.setdefault(f.get("question"), []).append(f)
        return by_q

    @staticmethod
    def hidden_reasons(q, groups, figs):
        """Why students do not see this question yet (mirrors the app's gate)."""
        reasons = []
        if not q.get("ready"):
            reasons.append("not ready")
        group = groups.get(q.get("group_id")) or {}
        texts = [q.get("stem_md"), q.get("stimulus_md"), group.get("passage_md")]
        texts += [o.get("text_md") for o in q.get("options", [])]
        texts = [t or "" for t in texts]
        if any(PENDING_TEXT in t for t in texts):
            reasons.append("text pending")
        if any(FIGURE_NOTE in t for t in texts):
            reasons.append("[FIGURE] note")
        if any(f.get("pending_spec") for f in figs):
            reasons.append("figure pending spec")
        if any(not (o.get("text_md") or "").strip() for o in q.get("options", [])):
            reasons.append("blank option")
        return reasons

    def validation(self, g):
        report = validate_golden(g)
        per_q = {}
        for kind in ("errors", "warnings"):
            for msg in report[kind]:
                m = QUESTION_PREFIX.match(msg)
                if m:
                    per_q.setdefault(int(m.group(1)), {"errors": [], "warnings": []})[kind].append(msg)
        return report, per_q

    def progress(self, exam):
        g = self.golden(exam)
        report, _ = self.validation(g)
        groups = {x["id"]: x for x in g["groups"]}
        figs = self.figures_by_question(exam)
        qs = g["questions"]
        hidden = sum(1 for q in qs if self.hidden_reasons(q, groups, figs.get(q["number"], [])))
        answers = self.answers(exam)
        side = self.sidecar(exam)
        traced = self.manifest_figures(exam)
        return {
            "exam": exam,
            "title": g["exam"]["title"],
            "questions": len(qs),
            "expected": g["exam"].get("cover_expected_total"),
            "ready": sum(1 for q in qs if q.get("ready")),
            "hidden": hidden,
            "errors": report["summary"]["errors"],
            "warnings": report["summary"]["warnings"],
            "validation_ok": report["ok"],
            "key": {
                "present": answers is not None,
                "answers": len(answers) if answers else 0,
                "disputed": _count(side.get("disputed")) if side else None,
            },
            "figures": {
                "traced": len(traced),
                "pending_spec": sum(1 for f in traced if f.get("pending_spec")),
                "eyeballed": sum(1 for f in traced if "eyeball" in str(f.get("method", ""))),
            },
        }

    def progress_all(self):
        return [self.progress(e) for e in self.exam_ids()]

    def question_rows(self, exam):
        g = self.golden(exam)
        _, per_q = self.validation(g)
        groups = {x["id"]: x for x in g["groups"]}
        figs = self.figures_by_question(exam)
        rows = []
        for q in g["questions"]:
            n = q["number"]
            msgs = per_q.get(n, {"errors": [], "warnings": []})
            rows.append({
                "number": n,
                "section": q.get("section"),
                "ready": bool(q.get("ready")),
                "hidden": self.hidden_reasons(q, groups, figs.get(n, [])),
                "errors": len(msgs["errors"]),
                "warnings": len(msgs["warnings"]),
            })
        return rows

    def question_detail(self, exam, n):
        g = self.golden(exam)
        q = next((x for x in g["questions"] if x["number"] == n), None)
        if q is None:
            raise NotFound(f"no question {n} in {exam}")
        groups = {x["id"]: x for x in g["groups"]}
        figs = self.figures_by_question(exam).get(n, [])
        _, per_q = self.validation(g)
        answers = self.answers(exam) or {}
        return {
            "exam": exam,
            "number": n,
            "question": q,
            "group": groups.get(q.get("group_id")),
            "hidden_reasons": self.hidden_reasons(q, groups, figs),
            "messages": per_q.get(n, {"errors": [], "warnings": []}),
            "figures": figs,
            "native_figures": self.native_figures(exam, n),
            "key": answers.get(str(n)),
            "scan_pages": q.get("source", {}).get("pages", []),
            "scan": self.scan_info(exam, n, q, len(g["questions"])),
            "numbers": [x["number"] for x in g["questions"]],
            "undo": self.undo_count(exam, n),
            "ocr": self.ocr_available(exam),
            "anchor": self.locate(exam, n, self.scan_info(exam, n, q, len(g["questions"]))),
        }

    def locate(self, exam, n, scan):
        """Where question n starts on the page, from the OCR lines: {page, y} with y as a fraction of the page height."""
        pages = self._ocr_doc(exam)
        if not pages:
            return None
        first = scan["pages"][0] if scan["pages"] else scan["guess"]
        order = [first] + ([] if scan["pages"] else [first - 1, first + 1, first - 2, first + 2])
        rx = re.compile(rf"^\s*{n}\s*[.)]?(\s|$)")
        for page in order:
            for text, cx, cy, left, height in (pages.get(page) or {}).get("lines", []):
                if rx.match(text) and left < 0.6:
                    return {"page": page, "y": round(max(0.0, cy - 0.8 * height), 4)}
        return None

    def save_native_figure(self, exam, n, fig_id, patch):
        """Create (fig_id 'new') or update one native figure of question n in figures/specs/<exam>.json.

        The spec is what the app's figure engine draws. Only the spec, its kind, its place and its fidelity can change.
        """
        exam = self._exam(exam)
        p, booklet = self._specs_file(exam)
        if p is None:
            raise BadRequest(f"no figure spec file for {exam}")
        raw = json.loads(p.read_text(encoding="utf-8"))
        if raw.get("format") not in ("icfes-figures-specs/1", "icfes-figure/1"):
            raise BadRequest(f"{p.name} has an unknown format")
        kind = patch.get("kind")
        if kind not in FIGURE_KINDS:
            raise BadRequest(f"kind must be one of {', '.join(sorted(FIGURE_KINDS))}")
        spec = patch.get("spec")
        if not isinstance(spec, dict):
            raise BadRequest("spec must be an object")
        spec = dict(spec, kind=kind)
        target = patch.get("target") or "stem"
        if target not in ("stem", "option"):
            raise BadRequest("target must be stem or option")
        option = (patch.get("option") or "").strip().upper()[:1] or None
        if target == "option" and option is None:
            raise BadRequest("an option figure needs its letter")
        fidelity = patch.get("fidelity") or "draft"
        if fig_id == "new":
            code, session = exam[len("S11-"):].split("_")
            prefix = (booklet + "-") if booklet else ""
            fig = {"id": f"{prefix}{code.lower()}{session[0]}-q{n}-{uuid.uuid4().hex[:6]}", "location": {}}
            raw.setdefault("figures", []).append(fig)
        else:
            fig = next((f for f in raw.get("figures", []) if f.get("id") == fig_id
                        and str((f.get("location") or {}).get("question")) == str(n)
                        and (not booklet or str(f.get("id", "")).startswith(booklet + "-"))), None)
            if fig is None:
                raise NotFound(f"no figure {fig_id} on Q{n}")
        self._remember(exam, n, {"type": "figure", "id": fig["id"], "before": None if fig_id == "new" else json.loads(json.dumps(fig))})
        fig.update(kind=kind, spec=spec, fidelity=fidelity,
                   location={"page": (fig.get("location") or {}).get("page"), "question": n,
                             "stem_or_option": target, "option": option if target == "option" else None})
        self._write(p, json.dumps(raw, ensure_ascii=False, indent=2) + "\n", p.stem)
        return next(f for f in self.native_figures(exam, n) if f["id"] == fig["id"])

    def delete_native_figure(self, exam, n, fig_id):
        """Removes one native figure of question n, for example when a crop of the page replaces it."""
        exam = self._exam(exam)
        p, booklet = self._specs_file(exam)
        if p is None:
            raise NotFound(f"no figure spec file for {exam}")
        raw = json.loads(p.read_text(encoding="utf-8"))
        figs = raw.get("figures", [])
        hit = next((f for f in figs if f.get("id") == fig_id and str((f.get("location") or {}).get("question")) == str(n)), None)
        if hit is None:
            raise NotFound(f"no figure {fig_id} on Q{n}")
        self._remember(exam, n, {"type": "figure", "id": fig_id, "before": hit})
        raw["figures"] = [f for f in figs if f is not hit]
        self._write(p, json.dumps(raw, ensure_ascii=False, indent=2) + "\n", p.stem)
        return {"deleted": fig_id}

    def search(self, text, exam=None, limit=60):
        """Questions whose stem, own text, options or shared passage contain all the words, accents ignored."""
        words = [w for w in _fold(text).split() if w]
        if not words:
            return []
        hits = []
        for e in ([self._exam(exam)] if exam else self.exam_ids()):
            g = self.golden(e)
            groups = {x["id"]: x for x in g["groups"]}
            for q in g["questions"]:
                grp = groups.get(q.get("group_id")) or {}
                parts = [q.get("stem_md"), q.get("stimulus_md"), grp.get("passage_md")] + [o.get("text_md") for o in q.get("options", [])]
                body = " ".join(p for p in parts if p)
                folded = _fold(body)
                if all(w in folded for w in words):
                    at = folded.find(words[0])
                    hits.append({"exam": e, "number": q["number"], "section": q.get("section"),
                                 "snippet": re.sub(r"\s+", " ", body[max(0, at - 60): at + 140]).strip()})
                    if len(hits) >= limit:
                        return hits
        return hits

    def all_native_figures(self, exam):
        """Every native figure of the exam by question number, so the page can find invalid specs."""
        exam = self._exam(exam)
        return {str(q["number"]): figs for q in self.golden(exam)["questions"]
                if (figs := self.native_figures(exam, q["number"]))}

    # ----- undo: every save records what it replaced, per question ----------

    def _history_file(self, exam):
        return self.history / f"{exam}.jsonl"

    def _remember(self, exam, n, entry):
        self.history.mkdir(parents=True, exist_ok=True)
        entry = dict(entry, question=n, at=datetime.now().isoformat(timespec="seconds"))
        with self._history_file(exam).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def _entries(self, exam):
        p = self._history_file(exam)
        if not p.exists():
            return []
        return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

    def undo_count(self, exam, n):
        return sum(1 for e in self._entries(exam) if e.get("question") == n)

    def undo(self, exam, n):
        """Puts back what the last save of question n replaced (text, options, answer, ready, or one figure)."""
        exam = self._exam(exam)
        entries = self._entries(exam)
        idx = next((i for i in range(len(entries) - 1, -1, -1) if entries[i].get("question") == n), None)
        if idx is None:
            raise BadRequest(f"nothing to undo on Q{n}")
        entry = entries.pop(idx)
        if entry["type"] == "question":
            g = self.golden(exam)
            g["questions"] = [entry["before"] if q["number"] == n else q for q in g["questions"]]
            if entry.get("group_id") is not None:
                for grp in g["groups"]:
                    if grp["id"] == entry["group_id"]:
                        grp["passage_md"] = entry.get("passage_md")
            self._write(self.data / f"{exam}.golden.json", json.dumps(g, ensure_ascii=False, indent=2) + "\n", f"{exam}.golden")
            if "answer" in entry and (self.keys / f"{exam}.key.json").exists():
                self._set_answer(exam, n, entry["answer"])
        elif entry["type"] == "scan":
            mp = self.figures / "traced" / exam / "manifest.json"
            manifest = json.loads(mp.read_text(encoding="utf-8"))
            figs = [f for f in manifest.get("figures", []) if not (f.get("figure_id") == entry["id"] and f.get("question") == n)]
            if entry["before"] is not None:
                figs.append(entry["before"])
            manifest["figures"] = figs
            self._write(mp, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", f"{exam}.manifest")
        else:
            p, _ = self._specs_file(exam)
            raw = json.loads(p.read_text(encoding="utf-8"))
            figs = [f for f in raw.get("figures", []) if f.get("id") != entry["id"]]
            if entry["before"] is not None:
                figs.append(entry["before"])
            raw["figures"] = figs
            self._write(p, json.dumps(raw, ensure_ascii=False, indent=2) + "\n", p.stem)
        text = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in entries)
        self._history_file(exam).write_text(text, encoding="utf-8")
        return self.question_detail(exam, n)

    def _specs_file(self, exam):
        p = self.figures / "specs" / f"{exam}.json"
        booklet = None
        if not p.exists() and exam.startswith("S11-M_"):
            p = self.figures / "specs" / "S11-M_1ra-2da.json"
            booklet = "m1" if exam.endswith("1ra") else "m2"
        return (p if p.exists() else None), booklet

    def native_figures(self, exam, n):
        """Figure specs for this question from figures/specs/<exam>.json (icfes-figures-specs/1).

        The page validates and draws them with the app's engine. Entries with no spec are kept, so they show as pending.
        """
        p = self.figures / "specs" / f"{exam}.json"
        # The two M booklets share one spec file; its ids start with m1- (1ra) or m2- (2da).
        booklet = None
        if not p.exists() and exam.startswith("S11-M_"):
            p = self.figures / "specs" / "S11-M_1ra-2da.json"
            booklet = "m1" if exam.endswith("1ra") else "m2"
        if not p.exists():
            return []
        raw = json.loads(p.read_text(encoding="utf-8"))
        if raw.get("format") not in ("icfes-figures-specs/1", "icfes-figure/1"):
            return []
        out = []
        for fig in raw.get("figures", []):
            loc = fig.get("location") or {}
            if str(loc.get("question")) != str(n):
                continue
            if booklet and not str(fig.get("id", "")).startswith(booklet + "-"):
                continue
            out.append({
                "id": fig.get("id"),
                "kind": fig.get("kind"),
                "target": loc.get("stem_or_option") or "stem",
                "option": loc.get("option"),
                "spec": fig.get("spec"),
                "fidelity": fig.get("fidelity", "draft"),
            })
        return out

    def scan_info(self, exam, n, q, total):
        """Which PDF page shows question n. Known pages come from the golden; otherwise the page is estimated from its position."""
        pages = q.get("source", {}).get("pages", []) or []
        count = self.page_count(exam)
        if pages:
            guess = pages[0]
        elif count:
            guess = 1 + round((n - 1) / max(total - 1, 1) * (count - 1))
        else:
            guess = 1
        return {"pages": pages, "guess": guess, "count": count, "estimated": not pages}

    def page_count(self, exam):
        pdf = self.sources.get(self._exam(exam))
        if pdf is None or not pdf.is_file():
            return None
        fitz = _pymupdf()
        if fitz is None:
            return None
        with fitz.open(pdf) as doc:
            return doc.page_count

    def page_png(self, exam, page):
        """Path to one PDF page rendered at 300 dpi (cached). Falls back to the scan folder when the exam has no source PDF."""
        exam = self._exam(exam)
        pdf = self.sources.get(exam)
        if pdf is None or not pdf.is_file():
            return self.scan_file(exam, page)
        fitz = _pymupdf()
        if fitz is None:
            raise NotFound("para ver las páginas originales instala PyMuPDF: python -m pip install pymupdf")
        out = self.page_cache / exam / f"p{page:03d}.png"
        if not out.is_file():
            with fitz.open(pdf) as doc:
                if not 1 <= page <= doc.page_count:
                    raise NotFound(f"{exam} has pages 1-{doc.page_count}")
                out.parent.mkdir(parents=True, exist_ok=True)
                tmp = out.with_name(out.name + ".tmp")
                tmp.write_bytes(doc[page - 1].get_pixmap(dpi=300).tobytes("png"))
                os.replace(tmp, out)
        return out

    def scan_file(self, exam, page):
        """Best-effort lookup in the 300 dpi render folder, named like 'o1-10-10.png' (letter, session, page)."""
        if not self.scans or not self.scans.is_dir():
            return None
        exam = self._exam(exam)
        code, session = exam[len("S11-"):].split("_")
        short = code.lower() + ("1" if session.startswith("1") else "2")
        for pattern in (f"{short}-{page}-{page:02d}.png", f"{short}-{page}-*.png"):
            hit = next(iter(sorted(self.scans.glob(pattern))), None)
            if hit:
                return hit
        return None

    # ----- working from a box drawn on the page --------------------------------

    @staticmethod
    def _box(box):
        if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)):
            raise BadRequest("box must be [x0, y0, x1, y1] as fractions of the page")
        x0, y0, x1, y1 = (min(1.0, max(0.0, float(v))) for v in box)
        x0, x1 = sorted((x0, x1))
        y0, y1 = sorted((y0, y1))
        if x1 - x0 < 0.01 or y1 - y0 < 0.01:
            raise BadRequest("the box is too small")
        return x0, y0, x1, y1

    def crop_page(self, exam, n, page, box, option=None, replaces=None, dpi=200):
        """Cuts a box out of the original page (PDF, or the scan PNG) and stores it as the question's figure."""
        exam = self._exam(exam)
        x0, y0, x1, y1 = self._box(box)
        data = self._render_box(exam, page, (x0, y0, x1, y1), dpi).tobytes("png")
        return self.add_scan_figure(exam, n, data, option=option, replaces=replaces, page=page,
                                    box=[round(v, 4) for v in (x0, y0, x1, y1)])

    def crop_image(self, exam, page, box, dpi=200):
        """The PNG of a box on the original page, for the clean-up step before it is saved."""
        exam = self._exam(exam)
        return self._render_box(exam, page, self._box(box), dpi).tobytes("png")

    def add_scan_figure(self, exam, n, data, option=None, replaces=None, page=None, box=None, ctype="image/png"):
        """Stores a picture of the scan as the figure of question n (or of one option) in figures/traced/<exam>/manifest.json.

        The student app shows these entries as pictures ("eyeballed_box": a box drawn by eye on the scan). An option
        figure carries "-opt-<letter>-" in its id, which is how the app knows its option. `replaces` names the native
        figure it stands in for, so the app drops that spec.
        """
        exam = self._exam(exam)
        if not any(q["number"] == n for q in self.golden(exam)["questions"]):
            raise NotFound(f"no question {n} in {exam}")
        ext = IMAGE_TYPES.get(ctype)
        if ext is None:
            raise BadRequest(f"{ctype or 'this type'} is not a picture the editor stores (use PNG or JPEG)")
        if not data or not data.startswith(PNG_MAGIC if ext == "png" else JPEG_MAGIC):
            raise BadRequest("the data is not a PNG or JPEG picture")
        if len(data) > MAX_IMAGE_BYTES:
            raise BadRequest("the picture is larger than 8 MB")
        option = (option or "").strip().upper()[:1] or None
        code, session = exam[len("S11-"):].split("_")
        fid = f"{code.lower()}{session[0]}-q{n}-" + (f"opt-{option.lower()}-" if option else "") + f"recorte-{uuid.uuid4().hex[:6]}"
        folder = self.figures / "traced" / exam
        folder.mkdir(parents=True, exist_ok=True)
        tmp = folder / (fid + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, folder / f"{fid}.{ext}")
        mp = folder / "manifest.json"
        manifest = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {"exam": exam, "figures": []}
        entry = {"question": n, "page": page, "kind": "image", "spec_id": replaces or fid, "figure_id": fid,
                 "method": "eyeballed_box", "svg": f"traced/{exam}/{fid}.{ext}", "crop_png": None, "pending_spec": False,
                 "box_page_fraction": box, "option": option,
                 "note": "box drawn in the admin editor" if box else "picture added in the admin editor"}
        manifest.setdefault("figures", []).append(entry)
        self._remember(exam, n, {"type": "scan", "id": fid, "before": None})
        self._write(mp, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", f"{exam}.manifest")
        return entry

    def delete_scan_figure(self, exam, n, fig_id):
        exam = self._exam(exam)
        mp = self.figures / "traced" / exam / "manifest.json"
        manifest = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {"figures": []}
        hit = next((f for f in manifest.get("figures", []) if f.get("figure_id") == fig_id and f.get("question") == n), None)
        if hit is None:
            raise NotFound(f"no scan figure {fig_id} on Q{n}")
        self._remember(exam, n, {"type": "scan", "id": fig_id, "before": hit})
        manifest["figures"] = [f for f in manifest["figures"] if f is not hit]
        self._write(mp, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", f"{exam}.manifest")
        return {"deleted": fig_id}

    def _render_box(self, exam, page, box, dpi):
        """Pixels of a box on the original page (the PDF, or the scan PNG when there is no PDF)."""
        x0, y0, x1, y1 = box
        fitz = _pymupdf()
        if fitz is None:
            raise BadRequest("para recortar instala PyMuPDF: python -m pip install pymupdf")
        pdf = self.sources.get(exam)
        if pdf is not None and pdf.is_file():
            path = pdf
        else:
            path = self.scan_file(exam, page)
            if path is None:
                raise NotFound("no page to crop for that exam and page")
            page = 1
        with fitz.open(path) as doc:
            if not 1 <= page <= doc.page_count:
                raise NotFound(f"{exam} has pages 1-{doc.page_count}")
            pg = doc[page - 1]
            r = pg.rect
            clip = fitz.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height, r.x0 + x1 * r.width, r.y0 + y1 * r.height)
            return pg.get_pixmap(dpi=dpi, clip=clip)

    def _ocr_doc(self, exam):
        """The saved Azure layout result for this exam's PDF: {page: {"lines", "tables"}} in page fractions, or None."""
        if exam not in self._ocr_pages:
            pdf = self.sources.get(exam)
            ok = self.ocr and self.ocr.is_dir() and pdf is not None
            self._ocr_pages[exam] = ocr.load_saved(self.ocr, pdf.name) if ok else None
        return self._ocr_pages[exam]

    def ocr_available(self, exam):
        return {"saved": self._ocr_doc(exam) is not None, "azure": ocr.azure_config() is not None}

    def ocr_box(self, exam, page, box, engine="auto", want="text"):
        """Text (or a table spec) from a box on the page. engine: auto, saved, azure or local.

        Auto uses the saved Azure reading when it has something in the box, then Azure on the box, then RapidOCR.
        """
        exam = self._exam(exam)
        box = self._box(box)
        if engine not in ("auto", "saved", "azure", "local"):
            raise BadRequest("engine must be auto, saved, azure or local")
        if want not in ("text", "table"):
            raise BadRequest("want must be text or table")
        order = {"auto": ["saved", "azure", "local"], "saved": ["saved"], "azure": ["azure"], "local": ["local"]}[engine]
        if engine == "auto" and ocr.azure_config() is None:
            order.remove("azure")
        if want == "table":
            # RapidOCR reads lines, not tables, so a table always comes from Azure.
            order = [e for e in (order if engine != "local" else ["saved", "azure"]) if e != "local"]
            if ocr.azure_config() is None and "azure" in order and engine != "azure":
                order.remove("azure")
        problems = []
        for name in order:
            try:
                found = self._read_with(name, exam, page, box)
            except ocr.OcrError as e:
                problems.append(str(e))
                continue
            if found is None:
                continue
            if want == "table":
                if found["tables"]:
                    best = max(found["tables"], key=lambda t: len(t["cells"]))
                    return {"engine": name, "spec": ocr.table_spec(best)}
                continue
            if found["lines"]:
                return {"engine": name, "text": ocr.join_lines(found["lines"])}
        what = "ninguna tabla" if want == "table" else "texto"
        raise NotFound(f"no se encontró {what} en el recuadro" + (f" ({'; '.join(problems)})" if problems else ""))

    def _read_with(self, name, exam, page, box):
        if name == "saved":
            pages = self._ocr_doc(exam)
            if pages is None:
                if self.ocr is None:
                    raise ocr.OcrError("no hay lectura guardada de Azure (abre el editor con --ocr)")
                return None
            got = pages.get(page) or {"lines": [], "tables": []}
            return {"lines": ocr.inside(got["lines"], box), "tables": ocr.tables_inside(got["tables"], box)}
        pix = self._render_box(exam, page, box, dpi=300)
        if name == "azure":
            return ocr.azure_read(pix.tobytes("png"))
        return ocr.rapid_read(pix.samples, pix.width, pix.height, pix.n)

    def ocr_text(self, exam, page, box):
        """Text of the saved Azure lines inside a box (kept for older callers)."""
        return {"text": self.ocr_box(exam, page, box, engine="saved")["text"]}

    # ----- pictures pasted into questions ----------------------------------

    def save_image(self, exam, n, data, ctype):
        """Store a pasted picture under images/<exam>/ and return the reference the golden uses: IMG:<exam>/<file>."""
        exam = self._exam(exam)
        golden = self.golden(exam)
        if not any(q["number"] == n for q in golden["questions"]):
            raise NotFound(f"no question {n} in {exam}")
        ext = IMAGE_TYPES.get(ctype)
        if ext is None:
            raise BadRequest(f"{ctype or 'this type'} is not a picture the editor stores (use PNG or JPEG)")
        if not data:
            raise BadRequest("the picture is empty")
        if len(data) > MAX_IMAGE_BYTES:
            raise BadRequest("the picture is larger than 8 MB")
        magic = PNG_MAGIC if ext == "png" else JPEG_MAGIC
        if not data.startswith(magic):
            raise BadRequest("the data is not a PNG or JPEG picture")
        name = f"{exam}-q{n}-{uuid.uuid4().hex[:8]}.{ext}"
        folder = self.images / exam
        folder.mkdir(parents=True, exist_ok=True)
        tmp = folder / (name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, folder / name)
        return f"IMG:{exam}/{name}"

    def image_file(self, rel):
        target = (self.images / rel).resolve()
        if not IMAGE_PATH.match(rel) or self.images.resolve() not in target.parents or not target.is_file():
            raise NotFound(f"no picture {rel}")
        return target

    def figure_file(self, rel):
        target = (self.figures / rel).resolve()
        if self.figures.resolve() not in target.parents or not target.is_file():
            raise NotFound(f"no figure {rel}")
        return target

    # ----- writing -------------------------------------------------------

    def _write(self, path, text, backup_name):
        self.backups.mkdir(exist_ok=True)
        if path.exists():
            stamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
            (self.backups / f"{backup_name}.{stamp}.json").write_bytes(path.read_bytes())
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)

    def update_question(self, exam, n, patch):
        unknown = set(patch) - EDITABLE
        if unknown:
            raise BadRequest(f"not editable: {', '.join(sorted(unknown))}")
        g = self.golden(exam)
        q = next((x for x in g["questions"] if x["number"] == n), None)
        if q is None:
            raise NotFound(f"no question {n} in {exam}")
        before = json.loads(json.dumps(q))
        old_group = next((x for x in g["groups"] if x["id"] == q.get("group_id")), None)
        old_passage = old_group.get("passage_md") if old_group else None
        old_answer = (self.answers(exam) or {}).get(str(n))

        # Apply the change in memory first, so the ready check sees the question as it will be saved.
        if "stem_md" in patch:
            q["stem_md"] = _text(patch["stem_md"], "stem_md")
        if "stimulus_md" in patch:
            q["stimulus_md"] = _text(patch["stimulus_md"], "stimulus_md")
        if "section" in patch:
            q["section"] = _text(patch["section"], "section") or None
        if "group_passage_md" in patch:
            # The shared passage is canonical in passage_md (stimulus_md is only the fallback), so that is the field written.
            if not q.get("group_id"):
                raise BadRequest(f"Q{n} has no shared text")
            group = next((x for x in g["groups"] if x["id"] == q["group_id"]), None)
            if group is None:
                raise NotFound(f"no group {q['group_id']} in {exam}")
            group["passage_md"] = _text(patch["group_passage_md"], "group_passage_md")
        if "options" in patch:
            q["options"] = _options(patch["options"], q["options"])
        if "answer" in patch and patch["answer"] not in (None, ""):
            if patch["answer"] not in [o["letter"] for o in q["options"]]:
                raise BadRequest(f"{patch['answer']} is not an option of Q{n}")
        if "ready" in patch:
            if not isinstance(patch["ready"], bool):
                raise BadRequest("ready must be true or false")
            if patch["ready"]:
                _, per_q = self.validation(g)
                blockers = list(per_q.get(n, {}).get("errors", []))
                groups = {x["id"]: x for x in g["groups"]}
                figs = self.figures_by_question(exam).get(n, [])
                blockers += [r for r in self.hidden_reasons(q, groups, figs) if r != "not ready"]
                if blockers:
                    raise Conflict(blockers)
            q["ready"] = patch["ready"]

        entry = {"type": "question", "before": before,
                 "group_id": old_group["id"] if old_group and "group_passage_md" in patch else None, "passage_md": old_passage}
        if "answer" in patch:
            entry["answer"] = old_answer
        self._remember(exam, n, entry)
        if "answer" in patch:
            self._set_answer(exam, n, patch["answer"])
        note =f"edited in the admin editor {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        q.setdefault("provenance", {}).setdefault("notes", []).append(note)
        self._write(self.data / f"{exam}.golden.json",
                    json.dumps(g, ensure_ascii=False, indent=2) + "\n", f"{exam}.golden")
        return self.question_detail(exam, n)

    def _set_answer(self, exam, n, letter):
        path = self.keys / f"{exam}.key.json"
        if not path.exists():
            raise BadRequest(f"no answer key file for {exam}")
        key = json.loads(path.read_text(encoding="utf-8"))
        answers = key.setdefault("answers", {})
        if letter in (None, ""):
            answers.pop(str(n), None)
        else:
            answers[str(n)] = letter
        self._write(path, json.dumps(key, ensure_ascii=False, indent=1) + "\n", f"{exam}.key")


def _fold(text):
    import unicodedata
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def _text(value, field):
    if not isinstance(value, str):
        raise BadRequest(f"{field} must be a string")
    return value


def _options(value, current):
    if not isinstance(value, list) or not value:
        raise BadRequest("options must be a non-empty list")
    marks = {o["letter"]: o.get("marked_in_scan", False) for o in current}
    out = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("letter"), str):
            raise BadRequest("each option needs a letter")
        letter = item["letter"].strip().upper()[:1]
        out.append({
            "letter": letter,
            "text_md": _text(item.get("text_md", ""), "text_md"),
            "marked_in_scan": marks.get(letter, False),
        })
    return out
