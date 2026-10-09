import { scoreAttempt } from "../lib/exam.js";

// Score per area, then the way into the answer review.
export default function Results({ title, questions, attempt, answerKey, keyStatus, onReview, onHome, onRetry }) {
  const preliminary = keyStatus !== "official";
  const score = scoreAttempt(questions, attempt.answers, answerKey);
  const flagged = Object.keys(attempt.flags).length;
  return (
    <section className="panel">
      <h1>Resultado</h1>
      <p className="muted">{title}</p>
      {attempt.submittedAt ? null : <p className="notice">Intento sin entregar.</p>}
      {attempt.submittedAt && attempt.auto && <p className="notice">El tiempo se acabó y el examen se entregó automáticamente.</p>}

      {score.keyed ? (
        <p className="score">
          <strong>{score.correct}</strong> {score.correct === 1 ? "correcta" : "correctas"} de <strong>{score.total}</strong>
          {preliminary && <span className="badge pending score-label">Clave preliminar, no oficial</span>}
        </p>
      ) : (
        <p className="notice">
          Clave pendiente: sus {score.answered} respuestas quedaron guardadas, pero el puntaje aparecerá cuando haya clave.
        </p>
      )}

      <table className="areas">
        <thead>
          <tr>
            <th>Área</th>
            <th>Respondidas</th>
            <th>Correctas</th>
          </tr>
        </thead>
        <tbody>
          {score.perArea.map((a) => (
            <tr key={a.name}>
              <td>{a.name}</td>
              <td>{a.answered} / {a.total}</td>
              <td>{score.keyed ? `${a.correct} / ${a.total}` : "Clave pendiente"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {flagged > 0 && <p className="muted small">Marcó {flagged} {flagged === 1 ? "pregunta" : "preguntas"} para revisar.</p>}

      <div className="actions">
        <button type="button" className="primary" onClick={onReview}>Revisar respuestas</button>
        <button type="button" onClick={onRetry}>Practicar de nuevo</button>
        <button type="button" className="link" onClick={onHome}>Volver al inicio</button>
      </div>
    </section>
  );
}
