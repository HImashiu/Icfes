import Mascot from "../components/Mascot.jsx";
import { scoreAttempt } from "../lib/exam.js";
import { areaColor, fmtInt, fmtPct } from "../lib/brand.js";

// Resultados: celebrating mascot, three stats, per-area bars, the preliminary-key notice and the next steps.
export default function Results({ title, questions, attempt, answerKey, keyStatus, onReview, onHome, onRetry }) {
  const score = scoreAttempt(questions, attempt.answers, answerKey);
  const preliminary = keyStatus !== "official";
  const pct = score.keyed && score.answered > 0 ? (score.correct / score.answered) * 100 : null;
  const wrong = score.keyed ? score.answered - score.correct : 0;
  const flagged = Object.keys(attempt.flags).length;

  return (
    <section className="results">
      <div className="results-hero card">
        <Mascot pose="celebrating" size={96} />
        <h1>{attempt.submittedAt ? "¡Buen trabajo!" : "Intento sin entregar"}</h1>
        <span className="caption">{title}</span>
        {attempt.auto && <span className="caption">El tiempo se acabó y el examen se entregó automáticamente.</span>}
      </div>

      <div className="stat-grid">
        <div className="stat card">
          <span className="label">Correctas</span>
          <strong className="display">{score.keyed ? fmtPct(pct ?? 0) : "—"}</strong>
          <span className="caption">{score.keyed ? `${fmtInt(score.correct)} de ${fmtInt(score.answered)}` : "Clave pendiente"}</span>
        </div>
        <div className="stat card">
          <span className="label">XP ganado</span>
          <strong className="display accent">{fmtInt(attempt.xp ?? 0)}</strong>
          <span className="caption">Sólo modo práctica</span>
        </div>
        <div className="stat card">
          <span className="label">Respondidas</span>
          <strong className="display">{fmtInt(score.answered)}</strong>
          <span className="caption">de {fmtInt(score.total)} preguntas</span>
        </div>
      </div>

      {preliminary && (
        <p className="notice">Clave preliminar, no oficial: el puntaje es orientativo.</p>
      )}

      <div className="card area-card">
        <span className="label">Por área</span>
        {score.perArea.map((a) => {
          const share = score.keyed && a.answered > 0 ? (a.correct / a.answered) * 100 : 0;
          return (
            <div key={a.name} className="area-row">
              <div className="area-row-head">
                <span><span className="dot" style={{ background: areaColor(a.name) }} /> {a.name}</span>
                <span className="muted">{score.keyed ? `${a.correct} / ${a.answered}` : `${a.answered} / ${a.total}`}</span>
              </div>
              <div className="progress thin">
                <span style={{ width: `${share}%`, background: areaColor(a.name) }} />
              </div>
            </div>
          );
        })}
      </div>

      {flagged > 0 && <p className="caption">Marcó {fmtInt(flagged)} {flagged === 1 ? "pregunta" : "preguntas"} para revisar.</p>}

      <div className="results-actions">
        {score.keyed && wrong > 0 ? (
          <button type="button" className="primary big" onClick={onReview}>Revisar {fmtInt(wrong)} {wrong === 1 ? "error" : "errores"}</button>
        ) : (
          <button type="button" className="primary big" onClick={onReview}>Revisar respuestas</button>
        )}
        <button type="button" className="secondary big" onClick={onRetry}>Practicar de nuevo</button>
        <button type="button" className="link" onClick={onHome}>Volver al inicio</button>
      </div>
    </section>
  );
}
