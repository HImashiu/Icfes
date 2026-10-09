import { useEffect, useState } from "react";
import Navigator from "../components/Navigator.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { formatClock } from "../lib/exam.js";

// The answering screen: passage and question on the left, question map on the right.
export default function Test({ title, questions, attempt, onChange, onSubmit, onExit, figures }) {
  const [now, setNow] = useState(() => Date.now());
  const [mapOpen, setMapOpen] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const timed = Boolean(attempt.durationSec);
  const remaining = timed ? attempt.durationSec - (now - attempt.startedAt) / 1000 : null;
  const timeUp = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (!timed) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timed]);

  useEffect(() => {
    if (timeUp) onSubmit({ auto: true });
  }, [timeUp, onSubmit]);

  const current = Math.min(attempt.current, questions.length - 1);
  const q = questions[current];
  const answered = Object.keys(attempt.answers).length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const go = (index) => {
    if (index < 0 || index >= questions.length) return;
    onChange((a) => ({ ...a, current: index }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setAnswer = (letter) =>
    onChange((a) => ({ ...a, answers: { ...a.answers, [q.key]: letter } }));
  const clearAnswer = () =>
    onChange((a) => {
      const answers = { ...a.answers };
      delete answers[q.key];
      return { ...a, answers };
    });
  const toggleFlag = () =>
    onChange((a) => {
      const flags = { ...a.flags };
      if (flags[q.key]) delete flags[q.key];
      else flags[q.key] = true;
      return { ...a, flags };
    });

  const submit = () => {
    const blank = questions.length - answered;
    const msg = blank > 0
      ? `Le faltan ${blank} preguntas por responder. ¿Desea entregar el examen?`
      : "¿Desea entregar el examen?";
    if (window.confirm(msg)) onSubmit({ auto: false });
  };

  return (
    <div className="test">
      <header className="test-bar">
        <button type="button" className="link" onClick={onExit}>Salir</button>
        <div className="test-title">
          <strong>{title}</strong>
          <span className="muted small">{answered} de {questions.length} respondidas</span>
        </div>
        {timed && (
          <span className={`clock${remaining < 300 ? " low" : ""}`} aria-live="off">
            {formatClock(remaining)}
          </span>
        )}
        <button type="button" className="primary" onClick={submit}>Entregar</button>
      </header>

      <div className="test-body">
        <main className="test-main">
          {q && (
            <QuestionView question={q} answer={attempt.answers[q.key]} onAnswer={setAnswer} figures={figures} />
          )}
          <div className="test-controls">
            <button type="button" onClick={() => go(current - 1)} disabled={current === 0}>← Anterior</button>
            <button type="button" className={attempt.flags[q?.key] ? "flag on" : "flag"} onClick={toggleFlag} aria-pressed={Boolean(attempt.flags[q?.key])}>
              {attempt.flags[q?.key] ? "Marcada para revisar" : "Marcar para revisar"}
            </button>
            {attempt.answers[q?.key] && <button type="button" className="link" onClick={clearAnswer}>Borrar respuesta</button>}
            <button type="button" onClick={() => go(current + 1)} disabled={current >= questions.length - 1}>Siguiente →</button>
          </div>
        </main>

        <aside className="test-side">
          <details open={mapOpen} onToggle={(e) => setMapOpen(e.currentTarget.open)}>
            <summary>Mapa de preguntas</summary>
            <Navigator questions={questions} answers={attempt.answers} flags={attempt.flags} current={current} onGo={go} />
          </details>
        </aside>
      </div>
    </div>
  );
}
