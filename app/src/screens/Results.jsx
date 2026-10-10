import { useEffect } from "react";
import Mascot from "../components/Mascot.jsx";
import { recordAttempt } from "../lib/local.js";
import { scoreAttempt } from "../lib/exam.js";
import { areaColor, fmtInt, fmtPct } from "../lib/brand.js";

// Resultados: celebrating mascot, three stats, per-area bars, the preliminary-key notice and the next steps.
export default function Results({ title, questions, attempt, answerKey, keyStatus, onReview, onReviewAt, onHome, onRetry }) {
  const score = scoreAttempt(questions, attempt.answers, answerKey);
  const preliminary = keyStatus !== "official";
  const pct = score.keyed && score.answered > 0 ? (score.correct / score.answered) * 100 : null;
  const wrong = score.keyed ? score.answered - score.correct : 0;
  const flagged = Object.keys(attempt.flags).length;
  const delivered = Boolean(attempt.submittedAt);

  // Keep the finished attempt in "Mis simulacros" (once per attempt, stored in this browser).
  useEffect(() => {
    if (!delivered) return;
    recordAttempt({
      id: String(attempt.startedAt),
      title,
      mode: attempt.mode,
      at: attempt.submittedAt,
      answered: score.answered,
      total: score.total,
      keyed: score.keyed,
      correct: score.correct,
      percent: pct ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivered, attempt.startedAt]);
  // Per-question grade for the answers grid: ok or bad when a key exists, answered or blank otherwise.
  const cellGrade = (q) => {
    const given = attempt.answers[q.key];
    if (!given) return "blank";
    const correct = answerKey?.get(q.key);
    if (!correct) return "answered";
    return correct === given ? "ok" : "bad";
  };
  const GRADE_LABEL = { ok: "correcta", bad: "incorrecta", answered: "respondida", blank: "sin responder" };

  return (
    <section className="results">
      <div className="results-hero card">
        <Mascot pose="celebrating" size={96} />
        <h1>{!delivered ? "Intento sin entregar" : pct && pct > 0 ? "¡Buen trabajo!" : "¡Sesión entregada!"}</h1>
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

      <div className="card answers-card">
        <div className="section-head">
          <span className="label">Tus {fmtInt(questions.length)} respuestas</span>
          <span className="caption">Toca una para revisarla</span>
        </div>
        {score.perArea.map((a) => (
          <div key={a.name} className="answers-area">
            <span className="caption"><span className="dot" style={{ background: areaColor(a.name) }} /> {a.name}</span>
            <div className="answers-grid">
              {questions.map((q, n) => (q.section === a.name ? (
                <button
                  key={q.key}
                  type="button"
                  className={`answer-cell ${cellGrade(q)}`}
                  onClick={() => (onReviewAt ? onReviewAt(n) : onReview())}
                  aria-label={`Pregunta ${q.number}, ${GRADE_LABEL[cellGrade(q)]}`}
                >
                  {q.number}
                </button>
              ) : null))}
            </div>
          </div>
        ))}
      </div>

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
