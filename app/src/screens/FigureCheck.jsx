import { useEffect, useState } from "react";
import FigureBlock from "../components/FigureBlock.jsx";

const base = import.meta.env.BASE_URL;

// Dev check (#figuras): one native figure per engine kind, drawn exactly as the question screens draw them.
export default function FigureCheck() {
  const [figures, setFigures] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`${base}exams/figure-check.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setFigures(data.figures ?? []))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="frame figure-check">
      <h1>Figuras nuevas del motor</h1>
      {error && <p className="notice error">No se pudo cargar: {error}</p>}
      {figures === null && !error && <p className="muted">Cargando…</p>}
      {(figures ?? []).map((f) => (
        <section key={f.id} className="card check-item">
          <span className="label">{f.label}</span>
          <span className="caption">{f.from} · {f.id}</span>
          <FigureBlock figure={{ kind: f.spec.kind, spec: f.spec }} alt={f.id} />
        </section>
      ))}
    </main>
  );
}
