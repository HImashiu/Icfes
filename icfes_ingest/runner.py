"""Batch orchestration: scan -> dedupe -> chunk -> analyze -> persist -> manifest."""
from __future__ import annotations

import json
import logging
import re
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from . import manifest as M
from .backend import Backend, crop_figure_locally
from .config import MODEL_ID, Settings
from .inputs import looks_like_pdf, scan_pdfs, sha256_file
from .pdfsplit import PdfError, extract_range, open_reader, page_count, plan_ranges
from .render import merge_markdown
from .retry import Interrupted, TransientError, call_with_retry

log = logging.getLogger("icfes_ingest")


def safe_name(s: str) -> str:
    s = re.sub(r"[^\w.\-]+", "_", s, flags=re.UNICODE).strip("._")
    return s[:80] or "doc"


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class Layout:
    out: Path

    @property
    def manifest(self): return self.out / "manifest.json"
    @property
    def json_dir(self): return self.out / "json"
    @property
    def md_dir(self): return self.out / "markdown"
    @property
    def fig_dir(self): return self.out / "figures"
    @property
    def work_dir(self): return self.out / "work"
    @property
    def log_file(self): return self.out / "logs" / "ingest.log"


def atomic_write(path: Path, data: bytes | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    if isinstance(data, str):
        tmp.write_text(data, encoding="utf-8")
    else:
        tmp.write_bytes(data)
    tmp.replace(path)


@dataclass
class Job:
    sha: str
    doc_id: str
    path: Path
    relpath: str
    size: int
    pages: int
    ranges: list[tuple[int, int]]
    duplicates: list[str]


class Pipeline:
    def __init__(self, input_dir: Path, out: Path, settings: Settings,
                 backend_factory: Callable[[], Backend] | None = None, max_pages: int | None = None):
        self.max_pages = max_pages  # hard cap on pages sent to Azure, across all runs (manifest-tracked)
        self.input_dir, self.settings, self.lay = Path(input_dir), settings, Layout(Path(out))
        self.backend_factory = backend_factory
        self.stop = threading.Event()
        self.budget_hit = False
        self._backend: Backend | None = None

    # ---------------------------------------------------------------- discovery
    def discover(self, manifest: M.Manifest | None, only: str | None = None,
                 limit: int | None = None, smallest_first: bool = False) -> tuple[list[Job], list[dict], list[Path]]:
        """Hash + page-count every PDF. Returns (jobs, problems, ignored_non_pdfs)."""
        pdfs, ignored = scan_pdfs(self.input_dir)
        if only:
            pdfs = [p for p in pdfs if only.lower() in p.name.lower()]
        by_hash: dict[str, Job] = {}
        problems: list[dict] = []
        for p in pdfs:
            rel = p.relative_to(self.input_dir).as_posix()
            try:
                if not looks_like_pdf(p):
                    raise PdfError("File has .pdf extension but is not a PDF")
                sha, size = sha256_file(p), p.stat().st_size
                if sha in by_hash:
                    by_hash[sha].duplicates.append(rel)
                    continue
                rec = manifest.get(sha) if manifest else None
                pages = rec["pages"] if rec and rec.get("pages") else page_count(p)
                by_hash[sha] = Job(sha, f"{safe_name(p.stem)}__{sha[:8]}", p, rel, size, pages,
                                   plan_ranges(pages, size, self.settings.max_pages_per_request,
                                               self.settings.max_request_bytes), [])
            except PdfError as e:
                problems.append({"path": rel, "error": str(e)})
                log.error("Unreadable PDF %s: %s", rel, e)
        jobs = list(by_hash.values())
        if smallest_first:
            jobs.sort(key=lambda j: (j.pages, j.relpath))
        if limit:
            jobs = jobs[:limit]
        return jobs, problems, ignored

    # ---------------------------------------------------------------- dry run
    def dry_run(self, only: str | None = None, limit: int | None = None, smallest_first: bool = False) -> dict[str, Any]:
        man = M.Manifest(self.lay.manifest) if self.lay.manifest.exists() else None
        jobs, problems, ignored = self.discover(man, only, limit, smallest_first)
        already = man.billed_pages if man else 0
        running = already
        rows = []
        for j in jobs:
            rec = man.get(j.sha) if man else None
            status = rec["status"] if rec else "new"
            action = "skip (completed)" if status == M.COMPLETED else \
                     "skip (needs --retry-failed)" if status in (M.FAILED, M.PARTIAL) and not self.settings.retry_failed else "process"
            if action == "process":
                running += j.pages
                if self.max_pages is not None and running > self.max_pages:
                    action = "OVER BUDGET (would stop)"
            rows.append({"file": j.relpath, "doc_id": j.doc_id, "pages": j.pages, "size_mb": round(j.size / 2**20, 2),
                         "requests": len(j.ranges), "ranges": j.ranges, "duplicates": j.duplicates,
                         "manifest_status": status, "action": action})
        todo = [r for r in rows if r["action"] in ("process", "OVER BUDGET (would stop)")]
        return {"budget_pages": self.max_pages, "already_billed_pages": already, "documents": rows, "unreadable": problems, "ignored_non_pdf": [p.name for p in ignored],
                "to_process": len(todo), "pages_to_bill": sum(r["pages"] for r in todo),
                "requests": sum(r["requests"] for r in todo)}

    # ---------------------------------------------------------------- run
    def run(self, only: str | None = None, limit: int | None = None, smallest_first: bool = False) -> dict[str, Any]:
        lay = self.lay
        lay.out.mkdir(parents=True, exist_ok=True)
        man = M.Manifest(lay.manifest)
        jobs, problems, ignored = self.discover(man, only, limit, smallest_first)
        for pr in problems:
            man.set_file(pr["path"], role="unreadable", error=pr["error"])
        for j in jobs:
            man.set_file(j.relpath, sha256=j.sha, role="primary")
            for d in j.duplicates:
                man.set_file(d, sha256=j.sha, role="duplicate_of", primary=j.relpath)
            rec = man.get(j.sha)
            man.upsert(j.sha, doc_id=j.doc_id, primary_path=j.relpath, size_bytes=j.size, pages=j.pages,
                       duplicates=sorted(set((rec or {}).get("duplicates", [])) | set(j.duplicates)))
        todo = []
        for j in jobs:
            st = man.get(j.sha)["status"]
            if st == M.COMPLETED and self._outputs_exist(man.get(j.sha)):
                log.info("skip %s (already completed)", j.relpath)
            elif st in (M.FAILED, M.PARTIAL) and not self.settings.retry_failed:
                log.warning("skip %s (status=%s; use --retry-failed)", j.relpath, st)
            else:
                todo.append(j)
        log.info("%d PDFs found, %d unique, %d to process, %d unreadable", len(jobs) + sum(len(j.duplicates) for j in jobs),
                 len(jobs), len(todo), len(problems))
        try:
            if self.settings.workers <= 1:
                for j in todo:
                    if self.stop.is_set():
                        break
                    self._process(j, man)
            else:
                with ThreadPoolExecutor(self.settings.workers) as ex:
                    futs = [ex.submit(self._process, j, man) for j in todo]
                    for f in as_completed(futs):
                        f.result()
        except KeyboardInterrupt:
            self.stop.set()
            log.warning("Interrupted; progress saved. Re-run the same command to resume.")
        man.save()
        return {"summary": man.summary(), "unreadable": problems, "billed_pages": man.billed_pages,
                "budget_pages": self.max_pages, "budget_hit": self.budget_hit}

    def _outputs_exist(self, rec: dict) -> bool:
        o = rec.get("outputs") or {}
        return bool(o) and all((self.lay.out / o[k]).exists() for k in ("json", "markdown"))

    def _get_backend(self) -> Backend:
        if self._backend is None:
            if self.backend_factory is None:
                raise RuntimeError("No backend configured")
            self._backend = self.backend_factory()
        return self._backend

    # ---------------------------------------------------------------- one document
    def _process(self, job: Job, man: M.Manifest) -> None:
        rec = man.get(job.sha)
        man.upsert(job.sha, status=M.IN_PROGRESS, attempts=rec.get("attempts", 0) + 1,
                   started_at=M.now(), error=None, warnings=[], chunks_total=len(job.ranges), chunks_done=0)
        log.info("processing %s (%d pages, %d request(s))", job.relpath, job.pages, len(job.ranges))
        work = self.lay.work_dir / job.sha
        try:
            reader = open_reader(job.path) if len(job.ranges) > 1 else None
            whole = job.path.read_bytes() if reader is None else None
            chunks: list[dict] = []
            for s, e in job.ranges:
                chunks += self._do_range(job, s, e, reader, whole, work, man)
            self._finalize(job, chunks, man)
        except BudgetExceeded as e:
            self.budget_hit = True
            self.stop.set()
            man.upsert(job.sha, status=M.IN_PROGRESS, error=f"budget reached; will resume with a higher budget ({e})")
            log.warning("BUDGET REACHED at %s: %s. Stopping; progress is saved.", job.relpath, e)
        except Interrupted:
            man.upsert(job.sha, status=M.IN_PROGRESS, error="interrupted; will resume")
            log.warning("%s interrupted", job.relpath)
        except Exception as e:  # noqa: BLE001 - recorded, never swallowed
            log.exception("FAILED %s", job.relpath)
            man.upsert(job.sha, status=M.FAILED, error=f"{type(e).__name__}: {e}")

    def _do_range(self, job: Job, s: int, e: int, reader, whole: bytes | None, work: Path, man: M.Manifest) -> list[dict]:
        cache = work / f"chunk_{s:05d}-{e:05d}.json"
        cached = self._load_chunk(cache)
        if cached is not None:
            log.info("%s pages %d-%d: using cached result", job.relpath, s, e)
            return [cached]
        data = whole if whole is not None else extract_range(reader or open_reader(job.path), s, e)
        if len(data) > self.settings.max_request_bytes:
            if e == s:
                raise PdfError(f"Page {s} alone is {len(data)/2**20:.1f} MB, over the {self.settings.max_request_bytes/2**20:.0f} MB request limit")
            mid = (s + e) // 2
            log.info("%s pages %d-%d is %.1f MB; splitting", job.relpath, s, e, len(data) / 2**20)
            rd = reader or open_reader(job.path)
            return (self._do_range(job, s, mid, rd, None, work, man)
                    + self._do_range(job, mid + 1, e, rd, None, work, man))
        chunk = self._analyze_chunk(job, s, e, data, work, man)
        atomic_write(cache, json.dumps(chunk, ensure_ascii=False))
        rec = man.get(job.sha)
        man.upsert(job.sha, chunks_done=rec.get("chunks_done", 0) + 1)
        return [chunk]

    def _retry(self, fn, what):
        st = self.settings
        return call_with_retry(fn, what=what, max_retries=st.max_retries, base_delay=st.retry_base_delay,
                               max_delay=st.retry_max_delay, stop=self.stop)

    def _analyze_chunk(self, job: Job, s: int, e: int, data: bytes, work: Path, man: M.Manifest) -> dict:
        backend, expected = self._get_backend(), e - s + 1
        label = f"{job.relpath} pages {s}-{e}"

        if self.settings.remove_blue:  # same page count and sizes, so geometry and billing are unchanged
            from .preprocess import remove_blue_ink
            data = remove_blue_ink(data)

        def go():
            if not man.reserve_pages(expected, self.max_pages):
                raise BudgetExceeded(f"{man.billed_pages} of {self.max_pages} pages already used; "
                                     f"{label} needs {expected} more")
            try:
                out = backend.analyze(data)
            except BaseException:
                man.refund_pages(expected)  # request failed before a result: not billed
                raise
            if out.page_count != expected:  # never accept silently lost pages
                raise TransientError(f"service returned {out.page_count} pages, expected {expected}")
            return out

        out = self._retry(go, f"analyze {label}")
        figs = []
        for f in out.figures:
            fig = dict(f, global_page=(f["page"] + s - 1) if f.get("page") else None, file=None, error=None, source=None)
            name = f"p{fig['global_page'] or 0:04d}_fig{safe_name(f['id'])}.png"
            img, src = None, "service"
            try:
                img = self._retry(lambda f=f: backend.fetch_figure(out.handle, f["id"]), f"figure {f['id']} of {label}")
            except Interrupted:
                raise
            except Exception as ex:  # noqa: BLE001 - fall back to local crop
                log.warning("figure %s of %s: service download failed (%s); cropping locally", f["id"], label, ex)
                try:
                    img, src = crop_figure_locally(data, f), "local-crop"
                except Exception as ex2:  # noqa: BLE001
                    fig["error"] = f"service: {ex}; local crop: {ex2}"
            if img:
                atomic_write(work / f"fig_{s:05d}" / name, img)
                fig.update(file=name, source=src)
            figs.append(fig)
        return {"page_start": s, "page_end": e, "page_offset": s - 1, "content": out.content,
                "result": out.result, "figures": figs}

    def _load_chunk(self, cache: Path) -> dict | None:
        if not cache.exists():
            return None
        try:
            c = json.loads(cache.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None
        for f in c["figures"]:  # chunks with missing figures are retried (figure URLs expire, so redo whole chunk)
            if f["file"] is None or not (cache.parent / f"fig_{c['page_start']:05d}" / f["file"]).exists():
                return None
        return c

    # ---------------------------------------------------------------- assemble outputs
    def _finalize(self, job: Job, chunks: list[dict], man: M.Manifest) -> None:
        chunks.sort(key=lambda c: c["page_start"])
        covered = [p for c in chunks for p in range(c["page_start"], c["page_end"] + 1)]
        if covered != list(range(1, job.pages + 1)):
            raise RuntimeError(f"Page coverage mismatch: got {len(covered)} pages, expected 1..{job.pages}")
        lay, work = self.lay, self.lay.work_dir / job.sha
        figs_out = lay.fig_dir / job.doc_id
        warnings, index = [], []
        for c in chunks:
            for f in c["figures"]:
                rec = {k: v for k, v in f.items() if k != "spans"}
                if f["file"]:
                    dst = figs_out / f["file"]
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(work / f"fig_{c['page_start']:05d}" / f["file"], dst)
                else:
                    warnings.append(f"figure {f['id']} on page {f['global_page']}: {f['error']}")
                index.append(rec)
        if index:
            atomic_write(figs_out / "figures.json", json.dumps(index, indent=2, ensure_ascii=False))
        md = merge_markdown(chunks, f"../figures/{job.doc_id}")
        doc = {"source": {"file": job.relpath, "sha256": job.sha, "size_bytes": job.size, "pages": job.pages,
                          "duplicates": job.duplicates},
               "model": MODEL_ID, "processed_at": M.now(),
               "chunks": [{k: c[k] for k in ("page_start", "page_end", "page_offset", "result")} for c in chunks],
               "figures": index}
        atomic_write(lay.json_dir / f"{job.doc_id}.json", json.dumps(doc, ensure_ascii=False))
        atomic_write(lay.md_dir / f"{job.doc_id}.md", md)
        status = M.PARTIAL if warnings else M.COMPLETED
        man.upsert(job.sha, status=status, completed_at=M.now(), warnings=warnings, error=None,
                   processing={"features": list(self.settings.features), "remove_blue": self.settings.remove_blue},
                   outputs={"json": f"json/{job.doc_id}.json", "markdown": f"markdown/{job.doc_id}.md",
                            "figures_dir": f"figures/{job.doc_id}", "figure_count": len(index),
                            "figures_missing": len(warnings)})
        if status == M.COMPLETED and not self.settings.keep_work:
            shutil.rmtree(work, ignore_errors=True)
        log.info("%s %s: %d pages, %d figures%s", status.upper(), job.relpath, job.pages, len(index),
                 f", {len(warnings)} MISSING" if warnings else "")
