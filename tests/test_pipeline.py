import json
import zipfile

import pytest

from conftest import FakeBackend, http_error, make_pdf
from icfes_ingest import manifest as M
from icfes_ingest.config import Settings
from icfes_ingest.inputs import unpack_zip
from icfes_ingest.runner import Pipeline


def pipe(dirs, backend, **kw):
    inp, out = dirs
    st = Settings(**{"retry_base_delay": 0, **kw})
    return Pipeline(inp, out, st, lambda: backend)


def manifest(dirs):
    return M.Manifest(dirs[1] / "manifest.json")


def test_happy_path_outputs_and_figures(dirs):
    make_pdf(dirs[0] / "exam one.pdf", 3)
    b = FakeBackend(figures_per_chunk=2)
    res = pipe(dirs, b).run()
    assert res["summary"] == {"completed": 1}
    rec = next(iter(manifest(dirs).documents.values()))
    out = dirs[1]
    doc = json.loads((out / rec["outputs"]["json"]).read_text(encoding="utf-8"))
    assert doc["source"]["pages"] == 3 and len(doc["figures"]) == 2
    md = (out / rec["outputs"]["markdown"]).read_text(encoding="utf-8")
    assert "Página 3 áéí" in md and md.count("![") == 2 and "../figures/" in md
    figs = list((out / rec["outputs"]["figures_dir"]).glob("*.png"))
    assert len(figs) == 2
    assert not (out / "work" / rec["sha256"]).exists()  # cache cleaned on success


def test_oversized_pdf_is_chunked_without_losing_pages(dirs):
    make_pdf(dirs[0] / "big.pdf", 25)
    b = FakeBackend()
    pipe(dirs, b, max_pages_per_request=10).run()
    assert b.calls == [10, 10, 5]
    rec = next(iter(manifest(dirs).documents.values()))
    doc = json.loads((dirs[1] / rec["outputs"]["json"]).read_text(encoding="utf-8"))
    assert [(c["page_start"], c["page_end"]) for c in doc["chunks"]] == [(1, 10), (11, 20), (21, 25)]
    md = (dirs[1] / rec["outputs"]["markdown"]).read_text(encoding="utf-8")
    assert all(f"Página {i} " in md for i in range(1, 6)) and md.count("<!-- PageBreak -->") == 2


def test_byte_limit_splits_recursively(dirs, monkeypatch):
    from icfes_ingest import runner
    from icfes_ingest.pdfsplit import extract_range, open_reader
    p = make_pdf(dirs[0] / "heavy.pdf", 8)
    whole = len(extract_range(open_reader(p), 1, 8))
    # planner thinks one request is enough (size estimate off); the real byte check must halve it
    monkeypatch.setattr(runner, "plan_ranges", lambda pages, size, mp, mb: [(1, pages)])
    b = FakeBackend()
    pipe(dirs, b, max_request_bytes=whole - 1).run()
    assert b.calls == [4, 4]
    assert manifest(dirs).summary() == {"completed": 1}


def test_planner_uses_size_to_pick_chunk_pages():
    from icfes_ingest.pdfsplit import plan_ranges
    assert plan_ranges(100, 10 * 2**20, 100, 100 * 2**20) == [(1, 100)]
    r = plan_ranges(100, 400 * 2**20, 100, 100 * 2**20)  # 4 MB/page -> ~20 pages per request
    assert r[0][1] - r[0][0] + 1 <= 20 and r[-1][1] == 100 and len(r) >= 5


def test_single_page_over_byte_limit_fails_loudly(dirs):
    make_pdf(dirs[0] / "x.pdf", 2)
    pipe(dirs, FakeBackend(), max_request_bytes=50).run()
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["status"] == M.FAILED and "alone" in rec["error"]


def test_duplicates_processed_once_and_recorded(dirs):
    a = make_pdf(dirs[0] / "a.pdf", 2)
    (dirs[0] / "sub").mkdir()
    (dirs[0] / "sub" / "copy.pdf").write_bytes(a.read_bytes())
    b = FakeBackend()
    pipe(dirs, b).run()
    assert b.calls == [2]
    m = manifest(dirs)
    assert len(m.documents) == 1
    assert next(iter(m.documents.values()))["duplicates"] == ["sub/copy.pdf"]
    assert m.files["sub/copy.pdf"]["role"] == "duplicate_of"


def test_throttling_429_is_retried_with_retry_after(dirs, monkeypatch):
    from icfes_ingest import retry
    slept = []
    monkeypatch.setattr(retry, "sleep", slept.append)
    make_pdf(dirs[0] / "a.pdf", 1)
    b = FakeBackend(analyze_errors=[http_error(429, retry_after=30), http_error(503)])
    pipe(dirs, b).run()
    assert manifest(dirs).summary() == {"completed": 1}
    assert len(slept) == 2 and slept[0] >= 30


def test_non_retryable_error_fails_and_is_recorded(dirs):
    make_pdf(dirs[0] / "a.pdf", 1)
    b = FakeBackend(analyze_errors=[http_error(400)])
    pipe(dirs, b).run()
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["status"] == M.FAILED and "HttpResponseError" in rec["error"]
    assert not list((dirs[1] / "markdown").glob("*")) if (dirs[1] / "markdown").exists() else True


def test_retries_exhausted_marks_failed(dirs):
    make_pdf(dirs[0] / "a.pdf", 1)
    b = FakeBackend(analyze_errors=[http_error(429)] * 10)
    pipe(dirs, b, max_retries=2).run()
    assert manifest(dirs).summary() == {"failed": 1}


def test_page_count_mismatch_is_never_accepted(dirs):
    make_pdf(dirs[0] / "a.pdf", 3)
    pipe(dirs, FakeBackend(wrong_pages=True), max_retries=1).run()
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["status"] == M.FAILED and "expected 3" in rec["error"]


def test_resume_skips_completed_and_cached_chunks(dirs):
    make_pdf(dirs[0] / "big.pdf", 30)
    make_pdf(dirs[0] / "small.pdf", 1)
    # 2nd chunk of big.pdf dies permanently on the first run
    b1 = FakeBackend(analyze_errors=[None, http_error(400)])
    pipe(dirs, b1, max_pages_per_request=10).run()
    m = manifest(dirs)
    assert m.summary() == {"completed": 1, "failed": 1}
    # default re-run leaves failed docs alone and does not redo the completed one
    b2 = FakeBackend()
    pipe(dirs, b2, max_pages_per_request=10).run()
    assert b2.calls == []
    # --retry-failed resumes: chunk 1-10 is cached, only 11-20 and 21-30 are sent
    b3 = FakeBackend()
    pipe(dirs, b3, max_pages_per_request=10, retry_failed=True).run()
    assert b3.calls == [10, 10]
    assert manifest(dirs).summary() == {"completed": 2}


def test_completed_doc_with_deleted_outputs_is_redone(dirs):
    make_pdf(dirs[0] / "a.pdf", 1)
    pipe(dirs, FakeBackend()).run()
    rec = next(iter(manifest(dirs).documents.values()))
    (dirs[1] / rec["outputs"]["markdown"]).unlink()
    b = FakeBackend()
    pipe(dirs, b).run()
    assert b.calls == [1]


def test_interrupted_in_progress_doc_is_picked_up(dirs):
    from icfes_ingest.inputs import sha256_file
    pdf = make_pdf(dirs[0] / "a.pdf", 1)
    m = M.Manifest(dirs[1] / "manifest.json")
    m.upsert(sha256_file(pdf), status=M.IN_PROGRESS, attempts=1)  # as left by a killed run
    b = FakeBackend()
    pipe(dirs, b).run()
    assert b.calls == [1] and manifest(dirs).summary() == {"completed": 1}


def test_figure_download_failure_falls_back_to_local_crop(dirs):
    make_pdf(dirs[0] / "a.pdf", 1)
    b = FakeBackend(figures_per_chunk=1, fig_errors=[http_error(404)])
    pipe(dirs, b, max_retries=0).run()
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["status"] == M.COMPLETED
    figs = json.loads((dirs[1] / rec["outputs"]["figures_dir"] / "figures.json").read_text())
    assert figs[0]["source"] == "local-crop"
    png = dirs[1] / rec["outputs"]["figures_dir"] / figs[0]["file"]
    assert png.read_bytes()[:4] == b"\x89PNG"


def test_unrecoverable_figure_marks_partial_not_complete(dirs):
    make_pdf(dirs[0] / "a.pdf", 1)
    b = FakeBackend(figures_per_chunk=1, fig_errors=[http_error(404)])
    b_poly = b.analyze
    def bad(pdf):
        o = b_poly(pdf)
        o.figures[0]["polygon"] = None  # nothing to crop from either
        return o
    b.analyze = bad
    pipe(dirs, b, max_retries=0).run()
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["status"] == M.PARTIAL and rec["warnings"] and rec["outputs"]["figures_missing"] == 1


def test_dry_run_makes_no_calls_and_writes_nothing(dirs):
    a = make_pdf(dirs[0] / "a.pdf", 12)
    (dirs[0] / "b.pdf").write_bytes(a.read_bytes())
    (dirs[0] / "bad.pdf").write_bytes(b"not a pdf")
    (dirs[0] / "notes.txt").write_text("x")
    inp, out = dirs
    p = Pipeline(inp, out, Settings(max_pages_per_request=5), backend_factory=None)  # would raise if used
    plan = p.dry_run()
    assert plan["to_process"] == 1 and plan["pages_to_bill"] == 12 and plan["requests"] == 3
    assert plan["documents"][0]["duplicates"] == ["b.pdf"]
    assert [u["path"] for u in plan["unreadable"]] == ["bad.pdf"]
    assert plan["ignored_non_pdf"] == ["notes.txt"]
    assert not out.exists()


def test_unreadable_pdf_is_reported_not_dropped(dirs):
    make_pdf(dirs[0] / "ok.pdf", 1)
    (dirs[0] / "broken.pdf").write_bytes(b"%PDF-1.4 garbage")
    res = pipe(dirs, FakeBackend()).run()
    assert res["summary"] == {"completed": 1}
    assert res["unreadable"][0]["path"] == "broken.pdf"
    assert manifest(dirs).files["broken.pdf"]["role"] == "unreadable"


def test_limit_and_only(dirs):
    for n in "abc":
        make_pdf(dirs[0] / f"{n}.pdf", 1 + ord(n) % 3)
    b = FakeBackend()
    pipe(dirs, b).run(limit=1)
    assert len(b.calls) == 1
    pipe(dirs, b).run(only="c.pdf")
    assert manifest(dirs).summary()["completed"] == 2


def test_corrupt_manifest_is_not_silently_reset(dirs):
    dirs[1].mkdir()
    (dirs[1] / "manifest.json").write_text("{broken")
    make_pdf(dirs[0] / "a.pdf", 1)
    with pytest.raises(M.ManifestError):
        pipe(dirs, FakeBackend()).run()


def test_concurrent_workers(dirs):
    for i in range(6):
        make_pdf(dirs[0] / f"d{i}.pdf", i + 1)
    b = FakeBackend()
    pipe(dirs, b, workers=3).run()
    assert manifest(dirs).summary() == {"completed": 6}
    assert sorted(b.calls) == [1, 2, 3, 4, 5, 6]


def test_zip_slip_rejected_and_pdfs_extracted(tmp_path):
    z = tmp_path / "evil.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("../../escape.pdf", b"%PDF-")
    with pytest.raises(ValueError):
        unpack_zip(z, tmp_path / "dest")
    z2 = tmp_path / "ok.zip"
    with zipfile.ZipFile(z2, "w") as zf:
        zf.writestr("folder/a.pdf", b"%PDF-1.4")
        zf.writestr("readme.txt", "x")
    root = unpack_zip(z2, tmp_path / "dest")
    assert (root / "folder" / "a.pdf").exists() and not (root / "readme.txt").exists()


def test_budget_cap_stops_run_and_resumes_later(dirs):
    for n in "abc":
        make_pdf(dirs[0] / f"{n}.pdf", 5 + ord(n) % 2, pad=ord(n))  # a=6, b=5, c=6 pages; pad keeps hashes distinct
    b = FakeBackend()
    res = Pipeline(dirs[0], dirs[1], Settings(retry_base_delay=0), lambda: b, max_pages=11).run()
    m = manifest(dirs)
    assert res["budget_hit"] and m.billed_pages == sum(b.calls) <= 11
    assert m.summary() == {"completed": 2, "in_progress": 1}
    # resume with a bigger cap: only the unfinished document is sent, total counter keeps accumulating
    b2 = FakeBackend()
    Pipeline(dirs[0], dirs[1], Settings(retry_base_delay=0), lambda: b2, max_pages=100).run()
    assert len(b2.calls) == 1 and manifest(dirs).summary() == {"completed": 3}
    assert manifest(dirs).billed_pages == 17


def test_budget_never_exceeded_mid_document(dirs):
    make_pdf(dirs[0] / "big.pdf", 30)
    b = FakeBackend()
    Pipeline(dirs[0], dirs[1], Settings(retry_base_delay=0, max_pages_per_request=10), lambda: b, max_pages=25).run()
    assert b.calls == [10, 10] and manifest(dirs).billed_pages == 20  # third chunk (10) would exceed 25
    b2 = FakeBackend()
    Pipeline(dirs[0], dirs[1], Settings(retry_base_delay=0, max_pages_per_request=10), lambda: b2, max_pages=100).run()
    assert b2.calls == [10]  # cached chunks reused, only the last is billed


def test_failed_request_is_refunded_from_budget(dirs):
    make_pdf(dirs[0] / "a.pdf", 4)
    b = FakeBackend(analyze_errors=[http_error(400)])
    Pipeline(dirs[0], dirs[1], Settings(retry_base_delay=0), lambda: b, max_pages=10).run()
    assert manifest(dirs).billed_pages == 0


def test_dry_run_flags_over_budget_and_smallest_first(dirs):
    make_pdf(dirs[0] / "big.pdf", 9)
    make_pdf(dirs[0] / "small.pdf", 2)
    p = Pipeline(dirs[0], dirs[1], Settings(), None, max_pages=5)
    plan = p.dry_run(smallest_first=True)
    assert [d["file"] for d in plan["documents"]] == ["small.pdf", "big.pdf"]
    assert plan["documents"][0]["action"] == "process" and "OVER BUDGET" in plan["documents"][1]["action"]


def test_remove_blue_option_preprocesses_chunks_and_is_recorded(dirs, monkeypatch):
    from icfes_ingest import preprocess
    make_pdf(dirs[0] / "a.pdf", 2)
    seen = []
    real = preprocess.remove_blue_ink
    monkeypatch.setattr(preprocess, "remove_blue_ink", lambda b: (seen.append(len(b)), real(b))[1])
    b = FakeBackend()
    pipe(dirs, b, remove_blue=True, features=("formulas",)).run()
    assert seen and b.calls == [2]                       # page count preserved through the image-only PDF
    rec = next(iter(manifest(dirs).documents.values()))
    assert rec["processing"] == {"features": ["formulas"], "remove_blue": True}


def test_whiten_blue_keeps_answer_dots_but_removes_other_blue_ink():
    from PIL import Image, ImageDraw
    from icfes_ingest.preprocess import whiten_blue
    im = Image.new("RGB", (400, 120), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, 30, 20], fill=(10, 10, 10))                    # black print
    d.ellipse([60, 40, 82, 62], fill=(20, 90, 235))                   # answer dot ~0.11 in at 200 dpi
    for x in range(120, 380, 14):                                      # blue handwriting-like strokes
        d.line([x, 30, x + 6, 70], fill=(20, 90, 235), width=3)
    out = whiten_blue(im, 200)
    assert out.getpixel((10, 10)) == (10, 10, 10)
    assert out.getpixel((71, 51)) == (20, 90, 235)                    # dot preserved: it marks where an option starts
    assert all(out.getpixel((x + 3, 50)) == (255, 255, 255) for x in range(120, 380, 14))
