import { useState } from "react";
import { AREA_MINUTES, formatClock, questionsFor, timedSeconds } from "../lib/exam.js";
import { loadAttempt } from "../lib/storage.js";

// Pick an exam, then an area or the whole exam, then practice or timed mode.
export default function Home({ exams, onOpen, onStart, onResume, selected, loading, error }) {
  const [scope, setScope] = useState("all");
  const [mode, setMode] = useState("practice");

  if (!selected) {
    return (
      <section className="panel">
        <h1>Práctica Saber 11</h1>
        <p className="muted">Escoja un examen para empezar.</p>
        {exams.length === 0 && <p className="notice">No hay exámenes cargados todavía.</p>}
        <ul className="exam-list">
          {exams.map((e) => (
            <li key={e.slug}>
              <button type="button" className="exam-card" onClick={() => onOpen(e.slug)}>
                <strong>{e.title}</strong>
                <span className="muted">{e.questions} preguntas · {e.sections.length} áreas</span>
                <span className={e.hasKey ? "badge ok" : "badge pending"}>
                  {e.hasKey ? "Con clave de respuestas" : "Clave pendiente"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const { exam, key } = selected;
  const scoped = questionsFor(exam, scope);
  const saved = loadAttempt(selected.slug, scope);
  const savedUsable = saved && saved.mode === mode && saved.durationSec === (mode === "timed" ? timedSeconds(scoped) : null);

  return (
    <section className="panel">
      <button type="button" className="link" onClick={() => onOpen(null)}>← Todos los exámenes</button>
      <h1>{exam.title}</h1>
      {!key && <p className="notice">Clave pendiente: podrá responder y ver sus respuestas, pero el puntaje aparecerá cuando haya clave.</p>}

      <fieldset>
        <legend>Qué quiere practicar</legend>
        <label className="choice">
          <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
          Examen completo ({exam.questions.length} preguntas)
        </label>
        {exam.sections.map((s) => (
          <label key={s.name} className="choice">
            <input type="radio" name="scope" checked={scope === s.name} onChange={() => setScope(s.name)} />
            {s.name} ({s.questions.length} preguntas)
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Modo</legend>
        <label className="choice">
          <input type="radio" name="mode" checked={mode === "practice"} onChange={() => setMode("practice")} />
          Práctica: sin límite de tiempo
        </label>
        <label className="choice">
          <input type="radio" name="mode" checked={mode === "timed"} onChange={() => setMode("timed")} />
          Simulacro con tiempo: {formatClock(timedSeconds(scoped))}
          <span className="muted"> (tiempo de práctica aproximado)</span>
        </label>
      </fieldset>

      <div className="actions">
        {savedUsable && (
          <button type="button" className="primary" onClick={() => onResume(saved)}>
            {saved.submittedAt ? "Ver resultado guardado" : "Continuar intento"}
          </button>
        )}
        <button
          type="button"
          className={savedUsable ? "" : "primary"}
          disabled={loading || scoped.length === 0}
          onClick={() => onStart(scope, mode)}
        >
          Empezar nuevo intento
        </button>
      </div>
      {error && <p className="notice error">{error}</p>}
      <p className="muted small">
        Los tiempos del simulacro son una referencia de práctica: {Object.entries(AREA_MINUTES).map(([a, m]) => `${a} ${m} min`).join(", ")}.
      </p>
    </section>
  );
}
