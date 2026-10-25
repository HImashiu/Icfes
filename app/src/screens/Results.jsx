import { isFullSession, nextSession, simulacros } from "../lib/simulacro.js";
import { gradeAttempt, isAdjusted, itemFromAttempt } from "../lib/grading.js";
import { useEffect, useMemo, useRef } from "react";
import CountUp from "../components/CountUp.jsx";
import { confetti, play } from "../lib/motion.js";
import Mascot from "../components/Mascot.jsx";
import { loadHistory, recordAttempt } from "../lib/local.js";
import { scoreAttempt } from "../lib/exam.js";
import { attemptXp } from "../lib/xp.js";
import { WEAKEST_AREA } from "../data/mock.js";
import { areaColor, fmtInt, fmtPct } from "../lib/brand.js";
import { fmtSec, timeSummary } from "../lib/timing.js";
import { missedKeys, rightKeys } from "../lib/repechaje.js";

// Resultados: celebrating mascot, three stats, per-area bars, the preliminary-key notice and the next steps.
// Phone: each area folds to one line; the areas with errors start open. Desktop shows every area.
// The title follows the score, so 1 of 25 is not "¡Buen trabajo!".
function headline(pct, answered) {
  if (pct === null) return answered ? "¡Sesión entregada!" : "Sin respuestas todavía";
  if (pct >= 70) return "¡Excelente trabajo!";
  if (pct >= 50) return "¡Buen trabajo!";
  if (pct >= 30) return "Vas por buen camino";
  return "Sigue practicando";
}
const isPhone = typeof window !== "undefined" && !window.matchMedia?.("(min-width: 768px)").matches;

export default function Results({ title, questions, attempt, answerKey, keyStatus, onReview, onReviewAt, onHome, onRetry, locked = false, lockedNote = null, onReviewTimes, onRepechaje, grading = null, exams = [], onStartSession }) {
  const score = scoreAttempt(questions, attempt.answers, answerKey);
  const preliminary = keyStatus !== "official";
  // A simulacro is graded like the real exam: blanks count as wrong, so the score is out of every question.
  // Practice is graded on what was answered, since stopping early is normal there.
  const outOf = attempt.mode === "timed" ? score.total : score.answered;
  const pct = score.keyed && outOf > 0 ? (score.correct / outOf) * 100 : null;
  // This attempt as a history row, so a whole session pairs with the other session of its cuadernillo.
  const sim = useMemo(() => {
    if (!delivered || !score.keyed || attempt.assignmentId || attempt.repechaje || attempt.custom) return null;
    const row = { id: String(attempt.startedAt), at: attempt.submittedAt, mode: attempt.mode, keyed: true, total: score.total, answered: score.answered, perArea: score.perArea, snapshot: { slug: attempt.slug, scope: attempt.scope } };
    if (!isFullSession(row)) return null;
    const all = simulacros([...loadHistory().filter((h) => h.id !== row.id), row]);
    return all.filter((x) => x.s1?.id === row.id || x.s2?.id === row.id).pop() ?? null;
  }, [delivered, attempt.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextUp = sim && !sim.complete ? nextSession(sim, exams) : null;
  const wrong = score.keyed ? score.answered - score.correct : 0;
  const flagged = Object.keys(attempt.flags).length;
  const delivered = Boolean(attempt.submittedAt);
  const xpEarned = attemptXp(questions, attempt, answerKey);
  // The teacher's grading model, only when it says something the percent does not.
  const grade = grading && delivered && score.keyed && isAdjusted(grading) ? gradeAttempt(itemFromAttempt(attempt, attempt.attemptNo ?? 1), grading, { questions, key: answerKey }) : null;
  const time = timeSummary(questions, attempt.times);
  // A repechaje round reports how many second chances were won.
  const again = attempt.repechaje || attempt.assignmentId || attempt.readOnly ? [] : missedKeys(questions, attempt.answers, answerKey, attempt.mode);
  const won = attempt.repechaje ? score.correct : 0;

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
      outOf,
      percent: pct ?? 0,
      perArea: score.perArea.map((a) => ({ name: a.name, correct: a.correct, answered: a.answered, total: a.total })),
      xp: xpEarned,
      missed: attempt.readOnly ? [] : missedKeys(questions, attempt.answers, answerKey, attempt.mode),
      right: attempt.readOnly ? [] : rightKeys(questions, attempt.answers, answerKey),
      // What "Abrir" needs to show this attempt again (its answers and flags, no key).
      snapshot: {
        slug: attempt.slug,
        scope: attempt.scope,
        mode: attempt.mode,
        answers: attempt.answers,
        flags: attempt.flags,
        times: attempt.times,
        // A practice of chosen questions reopens with exactly those questions.
        ...(attempt.keys ? { keys: attempt.keys } : {}),
        ...(attempt.custom ? { custom: attempt.custom } : {}),
        ...(attempt.repechaje ? { repechaje: true } : {}),
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        auto: attempt.auto,
        xp: xpEarned,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivered, attempt.startedAt]);
  // A good result is celebrated once: confetti over the hero and a short fanfare.
  const heroRef = useRef(null);
  useEffect(() => {
    if (!delivered || pct === null || pct < 50) return undefined;
    const t = setTimeout(() => { play("finish"); confetti(heroRef.current, { count: 60, spread: 1.6 }); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.startedAt]);

  // Per-question grade for the answers grid: ok or bad when a key exists, answered or blank otherwise.
  const cellGrade = (q) => {
    const given = attempt.answers[q.key];
    if (!given) return "blank";
    const correct = locked ? null : answerKey?.get(q.key);
    if (!correct) return "answered";
    return correct === given ? "ok" : "bad";
  };
  const GRADE_LABEL = { ok: "correcta", bad: "incorrecta", answered: "respondida", blank: "sin responder" };

  return (
    <section className="results">
      <div className="results-hero card" ref={heroRef}>
        <div className="hero-row">
          <Mascot pose={pct === null ? "normal" : pct >= 50 ? "celebrating" : "thinking"} size={84} idle={pct === null} />
          <div className="hero-text">
            <h1>{!delivered ? "Intento sin entregar" : headline(pct, score.answered)}</h1>
            <span className="caption">{title}</span>
            {attempt.auto && <span className="caption">El tiempo se acabó y el examen se entregó automáticamente.</span>}
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <span className="label">Correctas</span>
            <strong className="display">{score.keyed ? <CountUp value={pct ?? 0} format={fmtPct} delay={250} /> : "—"}</strong>
            <span className="caption">{score.keyed ? `${fmtInt(score.correct)} de ${fmtInt(outOf)}${attempt.mode === "timed" && score.answered < score.total ? " · en blanco cuentan como error" : ""}` : "Clave pendiente"}</span>
          </div>
          {grade?.ok && (
            <div className="stat">
              <span className="label">Nota de tu docente</span>
              <strong className="display">{grade.display}</strong>
              <span className="caption">{grade.passed === false ? "Todavía no alcanza la nota para aprobar · " : ""}{grade.provisional ? "provisional · " : ""}clave preliminar</span>
            </div>
          )}
          {sim && !sim.complete && (
            <div className="stat stat-score">
              <span className="label">Puntaje Saber 11</span>
              <strong className="display">Falta la Sesión {sim.s1 ? 2 : 1}</strong>
              <span className="caption">El puntaje sale con el examen completo: Sesión 1 y Sesión 2 de {sim.code}.</span>
              {nextUp && onStartSession && <button type="button" className="primary small" onClick={() => onStartSession(nextUp.slug)}>Hacer Sesión {nextUp.n}</button>}
            </div>
          )}
          {sim?.complete && (
            <div className="stat stat-score">
              <span className="label">Puntaje Saber 11 estimado</span>
              <strong className="display"><CountUp value={sim.global} format={(n) => String(Math.round(n))} delay={300} /><small className="muted"> /500</small></strong>
              <span className="caption">Sesión 1 + Sesión 2 de {sim.code} · rango {sim.low}–{sim.high} · curva provisional, clave preliminar</span>
            </div>
          )}
          <div className="stat">
            <span className="label">XP ganado</span>
            <strong className="display accent">+<CountUp value={xpEarned} format={(n) => fmtInt(Math.round(n))} delay={350} /></strong>
          </div>
          <div className="stat">
            <span className="label">Respondidas</span>
            <strong className="display">{fmtInt(score.answered)}</strong>
            <span className="caption">de {fmtInt(score.total)} preguntas</span>
          </div>
        </div>
      </div>

      <div className="card area-card">
        <span className="label">Por área</span>
        {score.perArea.map((a) => {
          const areaOutOf = attempt.mode === "timed" ? a.total : a.answered;
          const share = score.keyed && areaOutOf > 0 ? (a.correct / areaOutOf) * 100 : 0;
          return (
            <div key={a.name} className="area-row">
              <div className="area-row-head">
                <span><span className="dot" style={{ background: areaColor(a.name) }} /> {a.name}</span>
                <span className="muted">{score.keyed ? `${a.correct} de ${areaOutOf} correctas` : `${a.answered} de ${a.total}`}</span>
              </div>
              <div className="progress thin">
                <span style={{ width: `${share}%`, background: areaColor(a.name) }} />
              </div>
            </div>
          );
        })}
        <p className="footnote">+10 XP por acierto{score.perArea.some((a) => a.name === WEAKEST_AREA) ? ` · +20 en ${WEAKEST_AREA}` : ""}.{preliminary ? " Clave preliminar, no oficial: el puntaje es orientativo." : ""}</p>
      </div>

      {attempt.repechaje && delivered && score.keyed && (
        <div className="card repechaje-card">
          <Mascot pose={won > 0 ? "celebrating" : "normal"} size={48} />
          <div><strong>Repechaje: recuperaste {fmtInt(won)} de {fmtInt(score.total)}</strong><span className="caption">{won === score.total ? "¡Todas! Esas preguntas ya no están pendientes." : "Las que aún fallas siguen en tu lista de repechaje."}</span></div>
        </div>
      )}
      {!attempt.repechaje && delivered && !locked && again.length > 0 && onRepechaje && (
        <div className="card repechaje-card">
          <Mascot size={48} />
          <div><strong>Segunda oportunidad</strong><span className="caption">Fallaste {fmtInt(again.length)} {again.length === 1 ? "pregunta" : "preguntas"}. Inténtalas otra vez ahora.</span></div>
          <button type="button" className="primary" onClick={() => onRepechaje(again)}>Repechaje</button>
        </div>
      )}

      {time.has && (
        <div className="card time-card">
          <span className="label">Tiempo por pregunta</span>
          <div className="time-stats">
            <span><strong className="display">{fmtSec(time.total)}</strong> <span className="caption">en total</span></span>
            <span><strong className="display">{fmtSec(time.avg)}</strong> <span className="caption">por pregunta</span></span>
          </div>
          {time.perArea.length > 1 && time.perArea.map((a) => (
            <div key={a.name} className="area-row-head"><span><span className="dot" style={{ background: areaColor(a.name) }} /> {a.name}</span><span className="muted">{fmtSec(a.avg)} por pregunta</span></div>
          ))}
          <span className="caption">Las que más tiempo te tomaron</span>
          <div className="time-slow">
            {time.slowest.map((r) => (
              <button key={r.key} type="button" className="time-chip" disabled={locked} onClick={() => onReviewTimes?.(questions.findIndex((q) => q.key === r.key))}>
                Pregunta {r.number} · {fmtSec(r.sec)}
              </button>
            ))}
          </div>
        </div>
      )}

      {flagged > 0 && <p className="caption">Marcó {fmtInt(flagged)} {flagged === 1 ? "pregunta" : "preguntas"} para revisar.</p>}

      <div className="card answers-card">
        <div className="section-head">
          <span className="label">Tus {fmtInt(questions.length)} respuestas</span>
          <span className="caption">Toca una para revisarla</span>
        </div>
        <div className="answers-legend">
          <span><i className="sw sw-ok" /> Correcta</span>
          <span><i className="sw sw-bad" /> Incorrecta</span>
          <span><i className="sw" /> Sin responder</span>
        </div>
        {score.perArea.map((a) => {
          const hasErrors = questions.some((q) => q.section === a.name && cellGrade(q) === "bad");
          return (
          <details key={a.name} className="answers-area" open={hasErrors || !isPhone}>
            <summary>
              <span className="caption"><span className="dot" style={{ background: areaColor(a.name) }} /> {a.name}</span>
              <span className="caption">{a.answered} de {a.total}</span>
            </summary>
            <div className="answers-grid">
              {questions.map((q, n) => (q.section === a.name ? (
                <button
                  key={q.key}
                  type="button"
                  className={`answer-cell ${cellGrade(q)}`}
                  disabled={locked}
                  onClick={() => (onReviewAt ? onReviewAt(n) : onReview())}
                  aria-label={`Pregunta ${q.number}, ${GRADE_LABEL[cellGrade(q)]}`}
                >
                  {q.number}
                </button>
              ) : null))}
            </div>
          </details>
          );
        })}
      </div>

      <div className="results-actions">
        {locked && <p className="notice">{lockedNote ?? "Tu docente mostrará las respuestas más adelante."}</p>}
        {!locked && (score.keyed && wrong > 0 ? (
          <button type="button" className="primary big" onClick={onReview}>Revisar {fmtInt(wrong)} {wrong === 1 ? "error" : "errores"}</button>
        ) : (
          <button type="button" className="primary big" onClick={onReview}>Revisar respuestas</button>
        ))}
        {onRetry && <button type="button" className="secondary big" onClick={onRetry}>{attempt.assignmentId ? "Otro intento" : "Practicar de nuevo"}</button>}
        <button type="button" className="text-btn" onClick={onHome}>Volver al inicio</button>
      </div>
    </section>
  );
}
