import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Navigator from "../components/Navigator.jsx";
import QuestionView, { textPaneKind } from "../components/QuestionView.jsx";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import AiAnalysis from "../components/AiAnalysis.jsx";
import TextToggle from "../components/TextToggle.jsx";
import Hint from "../components/Hint.jsx";
import { useMedia } from "../lib/media.js";
import { formatClock } from "../lib/exam.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { plainText } from "../lib/render.js";
import { xpFor } from "../lib/xp.js";
import { addTime } from "../lib/studentRun.js";
import { useProctor } from "../lib/proctor.js";
import { buzz, confetti, play } from "../lib/motion.js";

// +10 XP per correct practice answer, double in the weakest area.
const PRAISE = ["¡Correcto!", "¡Muy bien!", "¡Excelente!", "¡Así se hace!", "¡Bien pensado!"];

// Scrolls a pane (not the page) so `el` sits in the middle of it.
function centerIn(pane, el) {
  if (!pane || !el) return;
  const p = pane.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  pane.scrollTo?.({ top: pane.scrollTop + (r.top - p.top) - (p.height - r.height) / 2, behavior: "smooth" });
}

// The answering screen. Shows only the progress, the timer or mode, the flag, the question,
// the options and the map: no streak or XP chart here.
export default function Test({ title, examLabel, questions, attempt, answerKey, onChange, onSubmit, onExit, figures, enrich, enrichMeta, onProctorEvent }) {
  const [now, setNow] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Practice rewards: correct answers in a row (this session only) and the question just checked, which animates once.
  const [run, setRun] = useState(0);
  const [justChecked, setJustChecked] = useState(null);
  const timed = Boolean(attempt.durationSec);
  const practice = !timed;
  // Practice normally checks each answer at once; a teacher can hold the answers until the end ("Al final").
  const instant = practice && attempt.instant !== false;
  const remaining = timed ? attempt.durationSec - (now - attempt.startedAt) / 1000 : null;
  const timeUp = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (!timed) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timed]);

  // Time on each question (only while the tab is visible), so the teacher can see where a student spent it.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const seg = useRef({ key: null, t: 0 });
  const finished = useRef(false);
  const flush = useCallback((nextKey) => {
    const { key, t } = seg.current;
    const stamp = Date.now();
    if (key && t && !finished.current) {
      const sec = (stamp - t) / 1000;
      if (sec > 0) onChangeRef.current((a) => ({ ...a, times: addTime(a.times, key, sec) }));
    }
    seg.current = { key: nextKey, t: nextKey && document.visibilityState !== "hidden" ? stamp : 0 };
  }, []);
  const submitNow = useCallback((opts) => {
    flush(null);
    finished.current = true;
    onSubmit(opts);
  }, [flush, onSubmit]);
  useEffect(() => {
    const onVisible = () => flush(seg.current.key);
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); flush(null); };
  }, [flush]);

  useEffect(() => {
    if (timeUp) submitNow({ auto: true });
  }, [timeUp, submitNow]);

  const current = Math.min(attempt.current, questions.length - 1);
  const q = questions[current];

  // The teacher can monitor an assignment: tab leaves, pointer exits and idle time are logged and sent along.
  useProctor(Boolean(attempt.proctor) && !attempt.readOnly, (ev) => {
    onChangeRef.current((a) => ({ ...a, proctorLog: [...(a.proctorLog ?? []), ev] }));
    onProctorEvent?.(ev, attempt);
  }, q?.key);
  const answered = Object.keys(attempt.answers).length;
  const checked = Boolean(attempt.checked?.[q?.key]);
  const correctLetter = q ? answerKey?.get(q.key) ?? null : null;
  const picked = q && attempt.answers[q.key];
  const area = q?.section;
  const currentKey = q?.key;
  useEffect(() => { flush(currentKey ?? null); }, [currentKey, flush]);

  // Questions that share one text are shown together as one block: the text once, then each question.
  const sameText = (a, b) => Boolean(a?.group) && a.group?.id === b?.group?.id;
  let blockFrom = current;
  let blockTo = current;
  while (blockFrom > 0 && sameText(questions[blockFrom - 1], q)) blockFrom--;
  while (blockTo < questions.length - 1 && sameText(questions[blockTo + 1], q)) blockTo++;
  const fullBlock = questions.slice(blockFrom, blockTo + 1);
  const mainRef = useRef(null);
  const keepScroll = useRef(false);
  const navAt = useRef(0);
  const topRef = useRef(null);

  // A long text lives in its own pane so it never has to be scrolled past: a column beside the questions when there
  // is room (every question of the text is listed, the pane stays put), otherwise a panel docked under the top bar
  // that shows one question at a time. Short texts stay inside the question card.
  const roomy = useMedia("(min-width: 900px)");
  // Wide screens put every shared text, short or long, in the side column.
  const groupMin = roomy ? 0 : undefined;
  const paneKind = q ? textPaneKind(q, groupMin) : null;
  const sideText = roomy && (paneKind === "group" || (paneKind === "own" && fullBlock.length === 1));
  const dockText = !roomy && paneKind !== null;
  const block = dockText ? [q] : fullBlock;
  const [textEl, setTextEl] = useState(null);
  // Phone: the text or the question fills the screen. A text seen for the first time opens on the text; moving to the
  // next question of the same text opens on the question.
  const [view, setView] = useState("text"); // text | question
  const textKey = dockText ? (paneKind === "group" ? `g:${q.group.id}` : `q:${q.key}`) : null;
  const seenTexts = useRef(new Set());
  const lastKey = useRef(null);
  if (textKey !== lastKey.current) {
    lastKey.current = textKey;
    const fresh = textKey && !seenTexts.current.has(textKey);
    if (textKey) seenTexts.current.add(textKey);
    const next = fresh ? "text" : "question";
    if (view !== next) setView(next);
  }
  const switchView = (next) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };
  const textTarget = sideText || dockText ? textEl : null;

  // The docked panel and the side pane sit just under the top bar, whatever height it has.
  useLayoutEffect(() => {
    const bar = topRef.current;
    if (!bar) return undefined;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
    set();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    observer?.observe(bar);
    return () => observer?.disconnect();
  }, []);

  // `stay` keeps the page where it is: the next effect brings the question into view inside its block.
  const go = (index, { stay = false } = {}) => {
    if (index < 0 || index >= questions.length) return;
    onChange((a) => ({ ...a, current: index }));
    setSheetOpen(false);
    setJustChecked(null);
    navAt.current = Date.now();
    const sameBlock = index >= blockFrom && index <= blockTo && !dockText;
    if (!(stay || sameBlock)) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Tapping a blank in the text jumps to the question that asks for it.
  const onBodyClick = (e) => {
    const gap = e.target.closest?.(".gap");
    if (!gap?.dataset.gap) return;
    const index = questions.findIndex((x, i) => i >= blockFrom && i <= blockTo && String(x.number) === gap.dataset.gap);
    if (index >= 0 && index !== current) go(index, { stay: true });
    if (index >= 0 && dockText) switchView("question");
  };

  // Keyboard (desktop): A–D answer, ←/→ move, M flags. Inputs are left alone.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (confirmOpen) { if (e.key === "Escape") setConfirmOpen(false); return; }
      if (e.key === "ArrowRight") go(current + 1);
      if (e.key === "ArrowLeft") go(current - 1);
      if (e.key === "m" || e.key === "M") toggleFlag();
      if (e.key === "Enter" && !e.target.closest?.("button:not(.option), a, summary")) { e.preventDefault(); mainRef.current?.closest(".test")?.querySelector(".test-bottom .big:not(:disabled)")?.click(); }
      const letter = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(letter) && q && !checked && q.options.some((o) => o.letter === letter)) setAnswer(letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setAnswerFor = (qq, letter) => {
    if (attempt.checked?.[qq.key]) return;
    onChange((a) => {
      const before = a.answers[qq.key];
      const changes = before && before !== letter ? { ...(a.changes ?? {}), [qq.key]: (a.changes?.[qq.key] ?? 0) + 1 } : a.changes;
      return { ...a, answers: { ...a.answers, [qq.key]: letter }, changes };
    });
  };
  const setAnswer = (letter) => setAnswerFor(q, letter);
  // A tap on an option of another question in the block moves the current question there first.
  const answerIn = (qq) => (letter) => {
    const index = questions.indexOf(qq);
    if (index !== current) { keepScroll.current = true; onChange((a) => ({ ...a, current: index })); }
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
  // A right answer gets a chime, confetti from the right option and, every few in a row, a bigger cheer.
  const check = () => {
    if (attempt.checked?.[q.key]) return;
    const hit = Boolean(correctLetter) && attempt.answers[q.key] === correctLetter;
    onChange((a) => {
      if (a.checked?.[q.key]) return a;
      return { ...a, checked: { ...(a.checked ?? {}), [q.key]: true }, xp: (a.xp ?? 0) + (hit ? xpFor(q.section) : 0) };
    });
    setJustChecked(q.key);
    if (!correctLetter) return;
    const nextRun = hit ? run + 1 : 0;
    setRun(nextRun);
    if (hit) {
      const milestone = nextRun >= 3 && (nextRun === 3 || nextRun % 5 === 0);
      play(milestone ? "combo" : "correct");
      buzz(18);
      setTimeout(() => confetti(document.querySelector(`[data-qkey="${q.key}"] .option.correct`), { count: milestone ? 44 : 22, spread: milestone ? 1.4 : 1 }), 60);
    } else {
      play("wrong");
      buzz([30, 40, 30]);
    }
  };

  // Entregar asks first in the app itself (a browser confirm() is blocked inside embedded previews).
  const submit = () => setConfirmOpen(true);
  const blank = questions.length - answered;

  const hasKey = Boolean(answerKey);
  // The verdict of one question of the block (every checked question keeps its own), then its AI analysis.
  const feedbackOf = (qq) => {
    const row = enrich?.[String(qq.number)];
    // The teacher can switch hints off for an assignment.
    if (practice && !attempt.checked?.[qq.key]) return row && !row.hidden && attempt.hints !== false ? <Hint key={qq.key} text={row.pista} onOpen={() => onChange((a) => (a.hintsUsed?.[qq.key] ? a : { ...a, hintsUsed: { ...(a.hintsUsed ?? {}), [qq.key]: true } }))} /> : null;
    if (!instant) return null;
    const cl = answerKey?.get(qq.key) ?? null;
    const right = Boolean(cl) && attempt.answers[qq.key] === cl;
    // The current question's verdict lives in the bottom bar; other checked questions of the block keep theirs here.
    if (qq.key === q?.key) return <AiAnalysis row={row} correctLetter={cl} meta={enrichMeta} hint={false} />;
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
        <AiAnalysis row={row} correctLetter={cl} meta={enrichMeta} hint={false} />
      </>
    );
  };

  // Practice: with nothing picked the main button skips ahead, so a hard question never blocks the student.
  // On the last question the main button finishes instead of sitting disabled.
  const last = current >= questions.length - 1;
  const mainAction = instant && !checked ? (
    picked ? (
      <button type="button" className="primary big" onClick={check}>Comprobar</button>
    ) : (
      <button type="button" className="secondary big" disabled={last} onClick={() => go(current + 1)}>Saltar</button>
    )
  ) : last ? (
    <button type="button" className="primary big" onClick={submit}>{practice ? "Ver resultados" : "Entregar"}</button>
  ) : (
    <button type="button" className="primary big" onClick={() => go(current + 1)}>
      {instant ? "Continuar" : "Siguiente"}
    </button>
  );

  // Practice, once checked: the bottom bar turns green or red and says how it went, like a coach at your side.
  const right = checked && Boolean(correctLetter) && picked === correctLetter;
  const verdict = instant && checked ? (!hasKey || !correctLetter ? "neutral" : right ? "ok" : "bad") : null;
  const cheer = run >= 3 && right ? `${run} seguidas` : null;
  const aiRow = q ? enrich?.[String(q.number)] : null;
  const explained = Boolean(aiRow && !aiRow.hidden && aiRow.explicacion);
  const verdictBar = verdict && (
    <div className="verdict" role="status" key={q.key}>
      {verdict === "neutral" ? (
        <span className="verdict-ico" aria-hidden="true"><Icon name="flag" size={22} /></span>
      ) : (
        <span className="verdict-owl" aria-hidden="true"><Mascot pose={right ? "happy" : "thinking"} size={52} /></span>
      )}
      <div>
        <strong>{verdict === "neutral" ? "Clave pendiente" : right ? PRAISE[(current + run) % PRAISE.length] : `La respuesta es ${correctLetter}`}</strong>
        <span>{verdict === "neutral" ? "Esta pregunta todavía no tiene clave." : right ? `+${xpFor(q.section)} XP · clave preliminar` : explained ? "Mira la explicación abajo · clave preliminar" : "Clave preliminar, no oficial"}</span>
      </div>
      {cheer && <span className="verdict-run"><Icon name="flame" size={16} /> {cheer}</span>}
    </div>
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
    fullBlock.forEach((qq) => {
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
  }, [current, attempt.answers, blockFrom, blockTo, questions, textEl, dockText]);

  // Once per question: show its blank in the text pane, and bring the question card into view when it is not the
  // first of its block.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const gap = root.querySelector(".gap-now");
    const pane = gap?.closest(".text-dock .dock-body, .read-text");
    if (gap && pane) centerIn(pane, gap);
    else if (gap) gap.scrollIntoView?.({ block: "center", behavior: "smooth" });
    // A question that became current because the student scrolled to it or tapped in it stays where it is.
    if (!dockText && current > blockFrom && !keepScroll.current) {
      root.querySelector(`[data-qkey="${q?.key}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
    keepScroll.current = false;
  }, [current, textEl, dockText]);

  // Beside a shared text, the question being read follows the scroll, so the chips and the bottom bar match it.
  useEffect(() => {
    if (!sideText || fullBlock.length < 2) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Not while a jump the student asked for (a chip, Continuar) is still scrolling.
        if (Date.now() - navAt.current < 900) return;
        const line = window.innerHeight * 0.4;
        const cards = [...(mainRef.current?.querySelectorAll(".read-qs .block-q") ?? [])];
        let pick = null;
        for (const el of cards) if (el.getBoundingClientRect().top <= line) pick = el.dataset.qkey;
        const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
        if (atEnd && cards.length) pick = cards[cards.length - 1].dataset.qkey;
        const index = pick ? questions.findIndex((x) => x.key === pick) : -1;
        if (index >= 0 && index !== current) {
          keepScroll.current = true;
          onChange((a) => ({ ...a, current: index }));
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [sideText, blockFrom, blockTo, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const footer = (
    <footer className={verdict ? `test-bottom verdict-${verdict}` : "test-bottom"}>
      {verdictBar}
      <button type="button" className="secondary map-btn" onClick={() => setSheetOpen(true)} aria-label="Mapa de preguntas">
        <Icon name="map" />
      </button>
      <button type="button" className="secondary desk-only" onClick={() => go(current - 1)} disabled={current === 0}>
        <Icon name="left" size={18} /> Anterior
      </button>
      {mainAction}
      <button type="button" className="link submit-link" onClick={submit}>{practice ? "Terminar" : "Entregar"}</button>
      <span className="kbd-hint desk-only">A–D responder · Enter comprobar · ← → mover · M marcar</span>
    </footer>
  );

  // A text with several questions says so up front, with a chip per question (answered ones filled), so the
  // ones further down are never a surprise.
  const blockNav = fullBlock.length > 1 && (
    <nav className="block-nav" aria-label="Preguntas de este texto">
      <span className="block-nav-label">Este texto tiene {fullBlock.length} preguntas</span>
      <div className="block-chips">
        {fullBlock.map((qq) => {
          const index = questions.indexOf(qq);
          const cls = `block-chip${index === current ? " current" : ""}${attempt.answers[qq.key] ? " done" : ""}`;
          return (
            <button key={qq.key} type="button" className={cls} aria-current={index === current ? "true" : undefined}
              onClick={() => { go(index, { stay: true }); if (dockText) switchView("question"); }}>
              {qq.number}
            </button>
          );
        })}
      </div>
    </nav>
  );

  // Every question of the block (one on a phone with a docked text), each with its own card and verdict.
  const renderBlock = (lastFooter) =>
    block.map((qq, i) => {
      const memberChecked = Boolean(attempt.checked?.[qq.key]);
      const memberCorrect = answerKey?.get(qq.key) ?? null;
      return (
        <section key={qq.key} data-qkey={qq.key} className={`block-q${qq.key === q?.key ? " current" : ""}${qq.key === justChecked ? " just-checked" : ""}`}>
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
            footer={i === block.length - 1 && !dockText ? lastFooter : null}
            textTarget={textTarget}
            paneGroupMin={groupMin}
            gapLine={dockText}
          />
        </section>
      );
    });

  return (
    <div className={verdict ? "test has-verdict" : "test"}>
      {attempt.proctor && <p className="proctor-note" role="note"><Icon name="shield" size={16} /> Este examen está monitoreado: tu docente ve cuándo sales de la pestaña.</p>}
      <header className="test-top" ref={topRef}>
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
          ) : instant ? (
            <span className="meta-mode">Práctica · <b key={attempt.xp ?? 0} className="xp-bump">{fmtInt(attempt.xp ?? 0)} XP</b></span>
          ) : (
            <span className="meta-mode">Práctica · respuestas al final</span>
          )}
        </div>
        <span className="sr-only">{title}{examLabel ? ` · ${examLabel}` : ""}</span>
      </header>

      <div className="test-body" ref={mainRef} onClick={onBodyClick}>
        <main className={dockText && view === "text" ? "test-main view-text" : "test-main"}>
          {dockText && <TextToggle view={view} onView={switchView} number={q.number} bodyRef={setTextEl} />}
          {dockText && view === "question" && blockNav}
          {sideText ? (
            <div className="read-split">
              <aside className="read-text paper-card" ref={setTextEl} aria-label="Texto de las preguntas" />
              <div className="read-qs">
                {blockNav}
                {renderBlock(null)}
                {footer}
              </div>
            </div>
          ) : (
            renderBlock(footer)
          )}
          {dockText && footer}
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
              <button type="button" className="primary big" autoFocus onClick={() => { setConfirmOpen(false); submitNow({ auto: false }); }}>
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
