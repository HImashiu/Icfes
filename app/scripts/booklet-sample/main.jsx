// Renders a cuadernillo straight from the exam data, for making sample PDFs with a headless browser
// (scripts/booklet-sample/make-pdfs.cjs). Dev server only: /scripts/booklet-sample/index.html?slug=S11-B_1ra&size=Carta&binding=sueltas&version=1&doc=booklet
import { createRoot } from "react-dom/client";
import { parseExam, parseKey } from "../../src/lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../../src/lib/figures.js";
import { orderForVersion, versionLabel } from "../../src/lib/seating.js";
import { geometry } from "../../src/lib/bookletLayout.js";
import BookletPages from "../../src/components/print/BookletPages.jsx";
import TeacherKeyPrint from "../../src/components/print/TeacherKeyPrint.jsx";
import BookletStudio from "../../src/components/print/BookletStudio.jsx";
import "../../src/styles.css";
import "../../src/components/print/booklet.css";

const q = new URLSearchParams(location.search);
const slug = q.get("slug") ?? "S11-B_1ra";
const size = q.get("size") ?? "Carta";
const binding = q.get("binding") ?? "sueltas";
const versions = (q.get("versions") ?? "").split(",").filter(Boolean).map(Number);
const doc = q.get("doc") ?? "booklet";
const limit = Number(q.get("limit") ?? 0);
const sections = (q.get("sections") ?? "").split(",").filter(Boolean);
const get = async (p) => { const r = await fetch(`/exams/${p}`); return r.ok ? r.json() : null; };

(async () => {
  const index = await get("index.json");
  const entry = index.exams.find((e) => e.slug === slug);
  const [raw, rawKey, rawFigures] = await Promise.all([get(`${slug}.json`), entry.hasKey ? get(`${slug}.key.json`) : null, entry.hasFigures ? get(`${slug}.figures.json`) : null]);
  const parsed = parseExam(raw);
  const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
  const bundle = { slug, exam: prepareExam(parsed, figures), key: parseKey(rawKey), figures };
  let questions = bundle.exam.questions.filter((x) => !x.hidden);
  if (sections.length) questions = questions.filter((x) => sections.includes(x.section));
  if (limit) questions = questions.slice(0, limit);
  const g = geometry(size, binding);
  const paper = size === "A4" ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
  const sets = (versions.length ? versions : [null]).map((v) => ({ v, label: v == null ? null : versionLabel(v), qs: v == null ? questions : orderForVersion(questions, v, 12345) }));
  let pending = sets.length;
  window.__laid = [];
  const title = q.get("title") ?? "Simulacro Saber 11 · Sesión 1";
  const meta = (label) => ({ title, course: q.get("course") ?? "11 A", version: label, examLabel: bundle.exam.title, schoolName: q.get("school") ?? "Nuevo Colegio del Prado", logo: q.get("logo") ?? null, size, binding });
  if (q.get("studio")) {
    // The print screen as teachers see it, with a seating plan of three versions (8, 7 and 7 students).
    const seats = Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`${Math.floor(i / 6)},${i % 6}`, `s${i}`]));
    const seatVersion = Object.fromEntries(Object.keys(seats).map((k, i) => [k, i % 3]));
    const plan = { versions: 3, seats, seatVersion, orderSeed: 12345 };
    createRoot(document.getElementById("root")).render(
      <div className="print-body" style={{ display: "grid", justifyItems: "center", padding: 12 }}>
        <BookletStudio bundle={bundle} questions={questions} title={title} course="11 A" plan={plan} />
      </div>,
    );
    return;
  }
  createRoot(document.getElementById("root")).render(
    <div className="print-body" style={{ display: "grid", justifyItems: "center", gap: 18, padding: 18 }}>
      <style>{doc === "key" ? `@page { size: ${paper.w}mm ${paper.h}mm; margin: 14mm 15mm; } @media print { .print-body{padding:0 !important; display:block !important} }` : `@page { size: ${g.sheet.w}mm ${g.sheet.h}mm; margin: 0; } @media print { body{background:#fff !important} .print-body{padding:0 !important; display:block !important} }`}</style>
      {doc === "key"
        ? sets.map((s) => <TeacherKeyPrint key={s.v ?? "x"} questions={s.qs} bundle={bundle} title={title} course="11 A" version={s.label} paper={paper} />)
        : sets.map((s) => <BookletPages key={s.v ?? "x"} questions={s.qs} figures={bundle.figures} meta={meta(s.label)} onLaid={(r) => { window.__laid.push(r); if (--pending === 0) window.__ready = true; }} />)}
    </div>,
  );
  if (doc === "key") setTimeout(() => { window.__ready = true; }, 500);
})();
