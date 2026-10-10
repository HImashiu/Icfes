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
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from icfes_view.golden import validate_golden  # noqa: E402

EXAM_ID = re.compile(r"^[A-Za-z0-9_-]+$")
QUESTION_PREFIX = re.compile(r"^Q(\d+):")
PENDING_TEXT = "[Texto pendiente"
FIGURE_NOTE = "[FIGURE"
EDITABLE = {"stem_md", "stimulus_md", "options", "ready", "answer"}


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


class Conflict(Exception):
    def __init__(self, reasons):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


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
    def __init__(self, root, scans=None, sources=None):
        self.root = Path(root)
        self.data = self.root / "data"
        self.keys = self.root / "answer-keys"
        self.figures = self.root / "figures"
        self.backups = self.data / ".backups"
        self.scans = Path(scans) if scans else None
        # sources: a JSON map {"S11-A_1ra": "C:/.../S11- A 1ra Sesión.pdf"} to the exam's source PDF.
        self.sources = {}
        if sources:
            self.sources = {k: Path(v) for k, v in json.loads(Path(sources).read_text(encoding="utf-8")).items()}
        self.page_cache = Path(tempfile.gettempdir()) / "icfes-admin-pages"
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
        }

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

        # Apply the change in memory first, so the ready check sees the question as it will be saved.
        if "stem_md" in patch:
            q["stem_md"] = _text(patch["stem_md"], "stem_md")
        if "stimulus_md" in patch:
            q["stimulus_md"] = _text(patch["stimulus_md"], "stimulus_md")
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

        if "answer" in patch:
            self._set_answer(exam, n, patch["answer"])
        note = f"edited in the admin editor {datetime.now().strftime('%Y-%m-%d %H:%M')}"
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
