import { useEffect, useState } from "react";
import Navigator from "../components/Navigator.jsx";
import QuestionView from "../components/QuestionView.jsx";
import Icon from "../components/Icon.jsx";
import { formatClock } from "../lib/exam.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { xpFor } from "../lib/xp.js";

// +10 XP per correct practice answer, double in the weakest area.

// The answering screen. Shows only the progress, the timer or mode, the flag, the question,
// the options and the map: no streak, XP chart or league here.
export default function Test({ title, examLabel, questions, attempt, answerKey, onChange, onSubmit, onExit, figures }) {
  const [now, setNow] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  const timed = Boolean(attempt.durationSec);
  const practice = !timed;
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
  const checked = Boolean(attempt.checked?.[q?.key]);
  const correctLetter = q ? answerKey?.get(q.key) ?? null : null;
  const picked = q && attempt.answers[q.key];
  const isCorrect = checked && correctLetter && picked === correctLetter;
  const area = q?.section;
  const prev = questions[current - 1];

  const go = (index) => {
    if (index < 0 || index >= questions.length) return;
    onChange((a) => ({ ...a, current: index }));
    setSheetOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keyboard (desktop): A–D answer, ←/→ move, M flags. Inputs are left alone.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
      if (e.key === "m" || e.key === "M") toggleFlag();
      const letter = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(letter) && q && !checked && q.options.some((o) => o.letter === letter)) setAnswer(letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setAnswer = (letter) => {
    if (checked) return;
    onChange((a) => ({ ...a, answers: { ...a.answers, [q.key]: letter } }));
  };
  const toggleFlag = () =>
    onChange((a) => {
      const flags = { ...a.flags };
      if (flags[q.key]) delete flags[q.key];
      else flags[q.key] = true;
      return { ...a, flags };
    });

  // Practice: "Comprobar" reveals the grade for this question once. XP counts only the first correct check.
  const check = () =>
    onChange((a) => {
      if (a.checked?.[q.key]) return a;
      const hit = Boolean(correctLetter) && a.answers[q.key] === correctLetter;
      return { ...a, checked: { ...(a.checked ?? {}), [q.key]: true }, xp: (a.xp ?? 0) + (hit ? xpFor(q.section) : 0) };
    });

  const submit = () => {
    const blank = questions.length - answered;
    const msg = blank > 0 ? `Le faltan ${blank} preguntas por responder. ¿Desea entregar el examen?` : "¿Desea entregar el examen?";
    if (window.confirm(msg)) onSubmit({ auto: false });
  };

  const hasKey = Boolean(answerKey);
  const feedback = practice && checked && (
    <div className={`feedback ${hasKey ? (isCorrect ? "ok" : "bad") : "neutral"}`} role="status">
      <Icon name={hasKey && isCorrect ? "check" : "x"} size={22} />
      <div>
        <strong>
          {!hasKey ? "Clave pendiente" : isCorrect ? `¡Correcto! +${xpFor(q.section)} XP` : `Casi. La respuesta es ${correctLetter}`}
        </strong>
        <span>{hasKey ? "Clave preliminar, no oficial" : "Esta pregunta todavía no tiene clave."}</span>
      </div>
    </div>
  );

  const mainAction = practice && !checked ? (
    <button type="button" className="primary big" disabled={!picked} onClick={check}>Comprobar</button>
  ) : (
    <button type="button" className="primary big" disabled={current >= questions.length - 1} onClick={() => go(current + 1)}>
      Siguiente
    </button>
  );

  const flagged = Boolean(attempt.flags[q?.key]);
  const progress = (answered / questions.length) * 100;
  const mapCells = (
    <Navigator questions={questions} answers={attempt.answers} flags={attempt.flags} current={current} onGo={go} />
  );

  const footer = (
    <footer className="test-bottom">
      <button type="button" className="secondary map-btn" onClick={() => setSheetOpen(true)} aria-label="Mapa de preguntas">
        <Icon name="map" />
      </button>
      <button type="button" className="secondary desk-only" onClick={() => go(current - 1)} disabled={current === 0}>
        <Icon name="left" size={18} /> Anterior
      </button>
      {mainAction}
      {!practice && (
        <button type="button" className="link submit-link" onClick={submit}>Entregar</button>
      )}
      <span className="kbd-hint desk-only">A–D responder · ← → mover · M marcar</span>
    </footer>
  );

  return (
    <div className="test">
      <header className="test-top">
        <div className="test-row">
          <button type="button" className="icon-btn" onClick={onExit} aria-label="Salir del simulacro">
            <Icon name="close" />
          </button>
          <div className="test-title desk-only">
            <strong>{title}</strong>
            <span className="caption">{area} · pregunta {fmtInt(current + 1)} de {fmtInt(questions.length)} · {fmtInt(answered)} respondidas</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered} aria-label="Progreso">
            <span style={{ width: `${progress}%` }} />
          </div>
          <button
            type="button"
            className={flagged ? "icon-btn flag on flag-top" : "icon-btn flag flag-top"}
            onClick={toggleFlag}
            aria-pressed={flagged}
            aria-label="Marcar para revisar"
          >
            <Icon name="flag" />
          </button>
          <span className="clock-pill desk-only" aria-hidden="true">
            {timed ? formatClock(remaining) : "Práctica"}
          </span>
          <button type="button" className="secondary desk-only desk-submit" onClick={submit}>Entregar</button>
        </div>
        <div className="test-meta">
          <span className="meta-area">
            <span className="dot" style={{ background: areaColor(area) }} />
            {area} · {fmtInt(current + 1)} de {fmtInt(questions.length)}
          </span>
          {timed ? (
            <span className={remaining < 300 ? "clock low" : "clock"} aria-live="off">{formatClock(remaining)}</span>
          ) : (
            <span className="meta-mode">Práctica · {fmtInt(attempt.xp ?? 0)} XP</span>
          )}
        </div>
        <span className="sr-only">{title}{examLabel ? ` · ${examLabel}` : ""}</span>
      </header>

      <div className="test-body">
        <main className="test-main">
          {q && (
            <QuestionView
              question={q}
              answer={picked}
              onAnswer={setAnswer}
              graded={checked}
              review={hasKey && checked ? { correctLetter } : null}
              figures={figures}
              collapsedGroup={Boolean(q.group && prev?.group?.id === q.group.id)}
              examLabel={examLabel}
              flagged={flagged}
              onToggleFlag={toggleFlag}
              feedback={feedback}
              footer={footer}
            />
          )}
        </main>
        <aside className="test-side" aria-label="Mapa de preguntas">
          <span className="label map-title">Mapa de preguntas</span>
          {mapCells}
        </aside>
      </div>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Mapa de preguntas" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-head">
              <strong>Mapa de preguntas</strong>
              <button type="button" className="icon-btn" onClick={() => setSheetOpen(false)} aria-label="Cerrar mapa">
                <Icon name="close" />
              </button>
            </div>
            {mapCells}
          </div>
        </div>
      )}
    </div>
  );
}
