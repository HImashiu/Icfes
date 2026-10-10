import { useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import Icon from "../components/Icon.jsx";
import { areaColor } from "../lib/brand.js";

// The key sidecar holds internal English notes for some questions; a student sees the explanation
// only when it is written in Spanish.
const looksSpanish = (text) => !/\b(the|and|because|stimulus|is|are|with|which)\b/i.test(text);

const CONFIDENCE = { high: "alta", medium: "media", low: "baja" };

// Revisión: filters with counts, a strip of colored question cells, the question card,
// the student's pick against the key, and the preliminary-key chips.
export default function Review({ questions, attempt, answerKey, keyStatus, notes, onBack, figures, examLabel, startIndex = 0 }) {
  const [filter, setFilter] = useState("all");
  const [index, setIndex] = useState(startIndex);

  const grade = (q) => {
    const given = attempt.answers[q.key];
    if (!given) return "blank";
    const correct = answerKey?.get(q.key);
    if (!correct) return "answered";
    return correct === given ? "ok" : "bad";
  };
  const counts = {
    all: questions.length,
    wrong: questions.filter((q) => grade(q) === "bad").length,
    flagged: questions.filter((q) => attempt.flags[q.key]).length,
  };
  const visible = questions.filter((q) => {
    if (filter === "wrong") return grade(q) === "bad";
    if (filter === "flagged") return Boolean(attempt.flags[q.key]);
    return true;
  });
  const i = Math.min(index, Math.max(0, visible.length - 1));
  const q = visible[i];
  const note = q && notes?.get(q.key);

  return (
    <section className="review">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver al resultado">
          <Icon name="left" />
        </button>
        <h1>Revisión</h1>
      </header>

      <div className="segmented" role="tablist" aria-label="Filtro">
        {[["all", "Todas"], ["wrong", "Errores"], ["flagged", "Marcadas"]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? "seg active" : "seg"}
            onClick={() => { setFilter(id); setIndex(0); }}
          >
            {label} <span className="muted">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="rv-body">
      <ol className="rv-list" aria-label="Preguntas">
        {visible.map((question, n) => {
          const g = grade(question);
          const current = q && question.key === q.key;
          const yours = attempt.answers[question.key];
          const key = answerKey?.get(question.key);
          return (
            <li key={question.key}>
              <button type="button" className={current ? "rv-row current" : "rv-row"} aria-current={current ? "true" : undefined} onClick={() => setIndex(n)}>
                <span className="rv-tile" style={{ background: areaColor(question.section) }}>{question.number}</span>
                <span className="rv-text">
                  <strong>{question.section}</strong>
                  <span className="caption">
                    {yours ? `Tu respuesta ${yours}` : "Sin responder"}
                    {key ? ` · clave ${key}` : ""}
                  </span>
                </span>
                <span className={`rv-mark ${g}`} aria-hidden="true">{g === "ok" ? "✓" : g === "bad" ? "✕" : ""}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="rv-main">
      <div className="review-strip" aria-label="Preguntas">
        {questions.map((question, n) => {
          const g = grade(question);
          const cls = ["strip-cell", g === "ok" ? "ok" : g === "bad" ? "bad" : ""];
          if (q && question.key === q.key) cls.push("current");
          return (
            <button key={question.key} type="button" className={cls.join(" ")} onClick={() => {
              const target = visible.indexOf(question);
              if (target >= 0) setIndex(target);
              else { setFilter("all"); setIndex(n); }
            }} aria-label={`Pregunta ${question.number}`}>
              {question.number}
            </button>
          );
        })}
      </div>

      {q ? (
        <>
          <QuestionView
            question={q}
            answer={attempt.answers[q.key]}
            graded={Boolean(answerKey)}
            review={{ correctLetter: answerKey?.get(q.key) ?? null }}
            figures={figures}
            examLabel={examLabel}
          />
          <div className="chips-row">
            {keyStatus !== "official" && <span className="badge pending">Clave preliminar, no oficial</span>}
            {note?.confidence && <span className={`badge confidence ${note.confidence}`}>Confianza {CONFIDENCE[note.confidence] ?? note.confidence}</span>}
            {note?.status === "verified_by_scan" && <span className="badge ok">Verificada en el escaneo</span>}
            {!attempt.answers[q.key] && <span className="badge pending">Sin responder</span>}
          </div>
          {note?.reason && answerKey && looksSpanish(note.reason) && (
            <div className="card why">
              <span className="label">Por qué</span>
              <p>{note.reason}</p>
            </div>
          )}
          <div className="test-controls">
            <button type="button" className="secondary" onClick={() => setIndex(i - 1)} disabled={i === 0}>Anterior</button>
            <button type="button" className="secondary" onClick={() => setIndex(i + 1)} disabled={i >= visible.length - 1}>
              {filter === "wrong" ? "Siguiente error" : "Siguiente"}
            </button>
          </div>
        </>
      ) : (
        <p className="notice">Nada que mostrar con este filtro.</p>
      )}
      </div>
      </div>
    </section>
  );
}
