import { useEffect, useRef, useState } from "react";
import Navigator from "../components/Navigator.jsx";
import QuestionView from "../components/QuestionView.jsx";
import Icon from "../components/Icon.jsx";
import AiAnalysis from "../components/AiAnalysis.jsx";
import { formatClock } from "../lib/exam.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { plainText } from "../lib/render.js";
import { xpFor } from "../lib/xp.js";

// +10 XP per correct practice answer, double in the weakest area.

// The answering screen. Shows only the progress, the timer or mode, the flag, the question,
// the options and the map: no streak, XP chart or league here.
export default function Test({ title, examLabel, questions, attempt, answerKey, onChange, onSubmit, onExit, figures, enrich, enrichMeta }) {
  const [now, setNow] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
  const area = q?.section;

  // Questions that share one text are shown together as one block: the text once, then each question.
  const sameText = (a, b) => Boolean(a?.group) && a.group?.id === b?.group?.id;
  let blockFrom = current;
  let blockTo = current;
  while (blockFrom > 0 && sameText(questions[blockFrom - 1], q)) blockFrom--;
  while (blockTo < questions.length - 1 && sameText(questions[blockTo + 1], q)) blockTo++;
  const block = questions.slice(blockFrom, blockTo + 1);
  const mainRef = useRef(null);

  // After "Comprobar" the verdict sits under the options; on a phone that is below the fold, so bring it up.
  const showVerdict = () => setTimeout(() => {
    const el = document.querySelector(".test .feedback");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bar = document.querySelector(".test-bottom")?.getBoundingClientRect();
    const bottom = bar && bar.top > 0 && bar.top < window.innerHeight ? bar.top : window.innerHeight;
    if (r.bottom > bottom) window.scrollBy({ top: r.bottom - bottom + 16, behavior: "smooth" });
  }, 60);

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
      if (confirmOpen) { if (e.key === "Escape") setConfirmOpen(false); return; }
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
      if (e.key === "m" || e.key === "M") toggleFlag();
      const letter = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(letter) && q && !checked && q.options.some((o) => o.letter === letter)) setAnswer(letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setAnswerFor = (qq, letter) => {
    if (attempt.checked?.[qq.key]) return;
    onChange((a) => ({ ...a, answers: { ...a.answers, [qq.key]: letter } }));
  };
  const setAnswer = (letter) => setAnswerFor(q, letter);
  // A tap on an option of another question in the block moves the current question there first.
  const answerIn = (qq) => (letter) => {
    const index = questions.indexOf(qq);
    if (index !== current) onChange((a) => ({ ...a, current: index }));
    setAnswerFor(qq, letter);
  };
  const toggleFlagOf = (qq) => () =>
    onChange((a) => {
      const flags = { ...a.flags };
      if (flags[qq.key]) delete flags[qq.key];
      else flags[qq.key] = true;
      return { ...a, flags };
    });
  const toggleFlag = toggleFlagOf(q);

  // Practice: "Comprobar" reveals the grade for this question once. XP counts only the first correct check.
  const check = () => {
    onChange((a) => {
      if (a.checked?.[q.key]) return a;
      const hit = Boolean(correctLetter) && a.answers[q.key] === correctLetter;
      return { ...a, checked: { ...(a.checked ?? {}), [q.key]: true }, xp: (a.xp ?? 0) + (hit ? xpFor(q.section) : 0) };
    });
    showVerdict();
  };

  // Entregar asks first in the app itself (a browser confirm() is blocked inside embedded previews).
  const submit = () => setConfirmOpen(true);
  const blank = questions.length - answered;

  const hasKey = Boolean(answerKey);
  // The verdict of one question of the block (every checked question keeps its own), then its AI analysis.
  const feedbackOf = (qq) => {
    if (!practice || !attempt.checked?.[qq.key]) return null;
    const cl = answerKey?.get(qq.key) ?? null;
    const right = Boolean(cl) && attempt.answers[qq.key] === cl;
    return (
      <>
        <div className={`feedback ${hasKey ? (right ? "ok" : "bad") : "neutral"}`} role="status">
          <Icon name={hasKey && right ? "check" : "x"} size={22} />
          <div>
            <strong>
              {!hasKey ? "Clave pendiente" : right ? `¡Correcto! +${xpFor(qq.section)} XP` : `Casi. La respuesta es ${cl}`}
            </strong>
            <span>{hasKey ? "Clave preliminar, no oficial" : "Esta pregunta todavía no tiene clave."}</span>
          </div>
        </div>
        <AiAnalysis row={enrich?.[String(qq.number)]} correctLetter={cl} meta={enrichMeta} />
      </>
    );
  };

  // Practice: with nothing picked the main button skips ahead, so a hard question never blocks the student.
  const last = current >= questions.length - 1;
  const mainAction = practice && !checked ? (
    picked ? (
      <button type="button" className="primary big" onClick={check}>Comprobar</button>
    ) : (
      <button type="button" className="secondary big" disabled={last} onClick={() => go(current + 1)}>Saltar</button>
    )
  ) : (
    <button type="button" className="primary big" disabled={last} onClick={() => go(current + 1)}>
      Siguiente
    </button>
  );

  const flagged = Boolean(attempt.flags[q?.key]);
  const progress = (answered / questions.length) * 100;
  const mapCells = (
    <Navigator questions={questions} answers={attempt.answers} flags={attempt.flags} current={current} onGo={go} />
  );

  // Fill-in gaps: each answered question fills its own blank with the chosen option, and the current one is marked.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    root.querySelectorAll(".gap-now").forEach((g) => g.classList.remove("gap-now"));
    root.querySelectorAll(".gap-fill").forEach((el) => {
      if (el.previousSibling?.nodeType === Node.TEXT_NODE) el.previousSibling.remove();
      el.remove();
    });
    block.forEach((qq) => {
      const chosen = attempt.answers[qq.key] ? qq.options.find((o) => o.letter === attempt.answers[qq.key]) : null;
      const fill = chosen ? plainText(chosen.text_md) : "";
      root.querySelectorAll(`.gap[data-gap="${qq.number}"]`).forEach((g) => {
        if (qq.key === q?.key) g.classList.add("gap-now");
        if (!fill) return;
        const el = document.createElement("span");
        el.className = "gap-fill";
        el.style.fontStyle = "italic";
        el.textContent = fill;
        g.append(" ", el);
      });
    });
  }, [current, attempt.answers, blockFrom, blockTo, questions]);

  // Once per question: bring the blank into view, or the question card when it is not the first of its block.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const gap = root.querySelector(".gap-now");
    if (gap) {
      gap.scrollIntoView?.({ block: "center", behavior: "smooth" });
    } else if (current > blockFrom) {
      root.querySelector(`[data-qkey="${q?.key}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  }, [current]);

  const footer = (
    <footer className="test-bottom">
      <button type="button" className="secondary map-btn" onClick={() => setSheetOpen(true)} aria-label="Mapa de preguntas">
        <Icon name="map" />
      </button>
      <button type="button" className="secondary desk-only" onClick={() => go(current - 1)} disabled={current === 0}>
        <Icon name="left" size={18} /> Anterior
      </button>
      {mainAction}
      <button type="button" className="link submit-link" onClick={submit}>{practice ? "Terminar" : "Entregar"}</button>
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
          <button type="button" className="secondary desk-only desk-submit" onClick={submit}>{practice ? "Terminar" : "Entregar"}</button>
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
        <main className="test-main" ref={mainRef}>
          {block.map((qq, i) => {
            const memberChecked = Boolean(attempt.checked?.[qq.key]);
            const memberCorrect = answerKey?.get(qq.key) ?? null;
            return (
              <section key={qq.key} data-qkey={qq.key} className={qq.key === q?.key ? "block-q current" : "block-q"}>
                <QuestionView
                  question={qq}
                  answer={attempt.answers[qq.key]}
                  onAnswer={answerIn(qq)}
                  graded={memberChecked}
                  review={hasKey && memberChecked ? { correctLetter: memberCorrect } : null}
                  figures={figures}
                  showPassage={i === 0}
                  examLabel={examLabel}
                  flagged={Boolean(attempt.flags[qq.key])}
                  onToggleFlag={toggleFlagOf(qq)}
                  feedback={feedbackOf(qq)}
                  footer={i === block.length - 1 ? footer : null}
                />
              </section>
            );
          })}
        </main>
        <aside className="test-side" aria-label="Mapa de preguntas">
          <span className="label map-title">Mapa de preguntas</span>
          {mapCells}
        </aside>
      </div>

      {confirmOpen && (
        <div className="confirm-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <strong id="confirm-title">{practice ? "¿Terminar la práctica?" : "¿Entregar el simulacro?"}</strong>
            <p className="caption">
              {blank > 0
                ? `Te ${blank === 1 ? "falta 1 pregunta" : `faltan ${fmtInt(blank)} preguntas`} por responder.${practice ? "" : " Las que dejes en blanco cuentan como incorrectas."}`
                : "Respondiste todas las preguntas."}
            </p>
            <div className="confirm-actions">
              <button type="button" className="primary big" autoFocus onClick={() => { setConfirmOpen(false); onSubmit({ auto: false }); }}>
                {practice ? "Terminar y ver resultados" : "Entregar"}
              </button>
              <button type="button" className="secondary big" onClick={() => setConfirmOpen(false)}>Seguir respondiendo</button>
            </div>
          </div>
        </div>
      )}

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
