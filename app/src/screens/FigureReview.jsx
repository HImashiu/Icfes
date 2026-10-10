import { useEffect, useState } from "react";
import FigureBlock from "../components/FigureBlock.jsx";

const base = import.meta.env.BASE_URL;

// Internal review (#revision-figuras): every figure spec, grouped by exam and question, with its draft or
// approximate note. Not in the student navigation. Built only from the private exam data folder.
export default function FigureReview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`${base}exams/figures-review.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <main className="frame"><p className="notice error">No se pudo cargar: {error}</p></main>;
  if (!data) return <main className="frame"><p className="muted">Cargando…</p></main>;
  const total = data.exams.reduce((sum, ex) => sum + ex.figures.length, 0);
  return (
    <main className="frame figure-review">
      <h1>Revisión de figuras</h1>
      <p className="caption">{data.exams.length} cuadernillos · {total} figuras. Uso interno: no es parte de la app de estudiante.</p>
      {data.exams.map((ex) => (
        <ExamBlock key={ex.slug} exam={ex} />
      ))}
    </main>
  );
}

// Groups a list by question number, keeping the order of first appearance.
function byQuestion(figures) {
  const map = new Map();
  for (const f of figures) {
    const key = f.question ?? "Sin pregunta";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return [...map.entries()];
}

// Figures are drawn only when the exam is opened, so the page stays light.
function ExamBlock({ exam }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="card check-item" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>{exam.title}</strong>
        <span className="caption"> · {exam.figures.length} figuras · {exam.pending.length} pendientes</span>
      </summary>
      {open && (
        <>
          {exam.note && <p className="caption">{exam.note}</p>}
          {exam.pending.length > 0 && (
            <ul className="caption">
              {exam.pending.map((p, i) => (
                <li key={i}>Pendiente · pregunta {p.question ?? "—"} · pág. {p.page ?? "—"}: {p.reason ?? p.kind}</li>
              ))}
            </ul>
          )}
          {byQuestion(exam.figures).map(([question, figs]) => (
            <section key={question} className="review-group">
              <h3>Pregunta {question}</h3>
              {figs.map((f) => (
                <figure key={f.id} className="check-item">
                  <span className="label">{f.kind}{f.target ? ` · ${f.target}` : ""}{f.page ? ` · pág. ${f.page}` : ""}</span>
                  {(f.fidelity || f.note) && <span className="caption">{[f.fidelity, f.note].filter(Boolean).join(" · ")}</span>}
                  {f.spec ? <FigureBlock figure={{ kind: f.kind, spec: f.spec }} alt={f.id} /> : <span className="notice">Sin especificación</span>}
                </figure>
              ))}
            </section>
          ))}
        </>
      )}
    </details>
  );
}
