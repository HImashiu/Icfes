import { useState } from "react";
import QuestionView from "../components/QuestionView.jsx";

// Walk through every question with the answer given and, when a key exists, the correct one.
export default function Review({ questions, attempt, answerKey, onBack, figures }) {
  const [filter, setFilter] = useState("all");
  const [index, setIndex] = useState(0);

  const status = (q) => {
    const given = attempt.answers[q.key];
    if (!given) return "blank";
    const correct = answerKey?.get(q.key);
    if (!correct) return "answered"; // no key for this question yet
    return correct === given ? "correct" : "wrong";
  };
  const visible = questions.filter((q) => filter === "all" || status(q) === filter);
  const i = Math.min(index, Math.max(0, visible.length - 1));
  const q = visible[i];

  return (
    <section className="panel review">
      <div className="review-bar">
        <button type="button" className="link" onClick={onBack}>← Resultado</button>
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setIndex(0); }} aria-label="Filtrar preguntas">
          <option value="all">Todas</option>
          {answerKey && <option value="wrong">Incorrectas</option>}
          {answerKey && <option value="correct">Correctas</option>}
          <option value="blank">Sin responder</option>
        </select>
        <span className="muted small">{visible.length ? `${i + 1} de ${visible.length}` : "Nada que mostrar"}</span>
      </div>

      {q && (
        <>
          <QuestionView
            question={q}
            answer={attempt.answers[q.key]}
            review={{ correctLetter: answerKey?.get(q.key) ?? null }}
            figures={figures}
          />
          <p className="review-status">
            {!answerKey && <span className="badge pending">Clave pendiente</span>}
            {answerKey && status(q) === "correct" && <span className="badge ok">Correcta</span>}
            {answerKey && status(q) === "wrong" && <span className="badge bad">Incorrecta</span>}
            {answerKey && status(q) === "blank" && <span className="badge pending">Sin responder</span>}
            {answerKey && !answerKey.get(q.key) && <span className="badge pending">Clave pendiente para esta pregunta</span>}
          </p>
          <div className="test-controls">
            <button type="button" onClick={() => setIndex(i - 1)} disabled={i === 0}>← Anterior</button>
            <button type="button" onClick={() => setIndex(i + 1)} disabled={i >= visible.length - 1}>Siguiente →</button>
          </div>
        </>
      )}
    </section>
  );
}
