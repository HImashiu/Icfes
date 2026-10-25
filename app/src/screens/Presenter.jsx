import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import QuestionView from "../components/QuestionView.jsx";
import AiAnalysis from "../components/AiAnalysis.jsx";
import { APP_NAME } from "../lib/brand.js";
import { SOURCE_LINE } from "../lib/exam.js";
import {
  advance, bodyBlocks, buildDeck, clampPos, cleanSettings, explanationOf, formatClock, jumpStage, nextLabel, retreat, slideStages,
} from "../lib/lesson.js";
import "./teach.css";

// Classroom projection: one slide at a time, large type, nothing but the content and a toolbar that hides itself.
// The teacher controls what the class sees: the question, then (optionally) the options, the answer and the
// explanation. The explanation exists only where the key is settled. There is no ranking or student data here.
// Keys: → / space / Enter next step · ← back · A answer · E explanation · B blank screen · T timer · + − size ·
//       D theme · F full screen · Esc exit.

const THEMES = [["dark", "Oscuro"], ["light", "Claro"], ["contrast", "Alto contraste"]];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`condor:teach:${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`condor:teach:${k}`, JSON.stringify(v)); } catch { /* private window */ } },
};

export default function Presenter({ lesson, bundle, onExit, start = 0 }) {
  const settings = cleanSettings(lesson.settings);
  const deck = useMemo(() => buildDeck(lesson, bundle), [lesson, bundle]);
  const [pos, setPos] = useState(() => clampPos(deck, start));
  const [blank, setBlank] = useState(false);
  const [scale, setScale] = useState(() => store.get("scale", 1.2));
  const [theme, setTheme] = useState(() => store.get("theme", "dark"));
  const [bar, setBar] = useState(true);
  const [timer, setTimer] = useState(null); // { end } while counting down, { done: true } at zero
  const [, tick] = useState(0);
  const root = useRef(null);
  const stageEl = useRef(null);
  const hideBar = useRef(null);

  const slide = deck[pos.i];
  const stage = slideStages(slide)[pos.s];
  const last = pos.i === deck.length - 1;

  useEffect(() => { store.set("scale", scale); }, [scale]);
  useEffect(() => { store.set("theme", theme); }, [theme]);
  // The timer belongs to a slide: moving on clears it.
  useEffect(() => { setTimer(null); }, [pos.i]);
  useEffect(() => {
    if (!timer?.end) return undefined;
    const id = setInterval(() => {
      if (Date.now() >= timer.end) { setTimer({ done: true }); clearInterval(id); } else tick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [timer]);

  // The explanation opens below the question: bring it into view.
  useEffect(() => {
    if (slideStages(deck[pos.i])[pos.s] === "explanation") stageEl.current?.scrollTo?.({ top: stageEl.current.scrollHeight, behavior: "smooth" });
  }, [deck, pos]);

  const wake = useCallback(() => {
    setBar(true);
    clearTimeout(hideBar.current);
    hideBar.current = setTimeout(() => setBar(false), 3500);
  }, []);
  useEffect(() => { wake(); return () => clearTimeout(hideBar.current); }, [wake]);

  const fullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else root.current?.requestFullscreen?.();
    } catch { /* not allowed here */ }
  };
  const leave = useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
    onExit();
  }, [onExit]);
  const next = () => (last && slideStages(slide).length - 1 === pos.s ? leave() : setPos((p) => advance(deck, p)));
  const back = () => setPos((p) => retreat(deck, p));
  const startTimer = () => setTimer(timer ? null : { end: Date.now() + settings.seconds * 1000 });

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? "")) return;
      const k = e.key;
      const go = (fn) => { e.preventDefault(); wake(); fn(); };
      if (blank && k !== "Escape") return go(() => setBlank(false));
      if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") go(next);
      else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") go(back);
      else if (k === "Home") go(() => setPos(clampPos(deck, 0)));
      else if (k === "End") go(() => setPos(clampPos(deck, deck.length - 1)));
      else if (k === "a" || k === "A") go(() => setPos((p) => jumpStage(deck, p, "answer")));
      else if (k === "e" || k === "E") go(() => setPos((p) => jumpStage(deck, p, "explanation")));
      else if (k === "b" || k === "B" || k === ".") go(() => setBlank(true));
      else if (k === "t" || k === "T") go(startTimer);
      else if (k === "+" || k === "=") go(() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2))));
      else if (k === "-" || k === "_") go(() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2))));
      else if (k === "d" || k === "D") go(() => setTheme((t) => THEMES[(THEMES.findIndex(([id]) => id === t) + 1) % THEMES.length][0]));
      else if (k === "f" || k === "F") go(fullscreen);
      else if (k === "Escape") { e.preventDefault(); if (blank) setBlank(false); else leave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.body.classList.add("teach-open");
    return () => document.body.classList.remove("teach-open");
  }, []);

  const remaining = timer?.end ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : 0;
  const question = slide.type === "question" ? slide.question : null;
  const graded = stage === "answer" || stage === "explanation";

  let body = null;
  if (slide.type === "title") {
    body = (
      <div className="tp-center">
        <Mascot pose="happy" size={140} idle />
        <h1 className="tp-h1">{slide.title}</h1>
        <p className="tp-sub">{slide.count} {slide.count === 1 ? "pregunta" : "preguntas"} · {SOURCE_LINE}</p>
      </div>
    );
  } else if (slide.type === "text") {
    body = (
      <div className="tp-text">
        {slide.title && <h2 className="tp-h2">{slide.title}</h2>}
        {bodyBlocks(slide.body).map((b, i) => b.type === "ul"
          ? <ul key={i} className="tp-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
          : <p key={i} className="tp-p">{b.text}</p>)}
      </div>
    );
  } else if (slide.type === "end") {
    body = (
      <div className="tp-center">
        <Mascot pose="celebrating" size={140} />
        <h1 className="tp-h1">Fin de la clase</h1>
        <p className="tp-sub">{slide.title}</p>
      </div>
    );
  } else {
    const row = bundle.enrich?.[String(question.number)];
    const showOptions = !(settings.hideOptions && stage === "question");
    body = (
      <div className="tp-question">
        <QuestionView
          question={question}
          answer={null}
          graded={graded}
          review={{ correctLetter: slide.letter }}
          figures={bundle.figures}
          examLabel={bundle.exam.title}
          report={false}
          hideOptions={!showOptions}
        />
        {graded && <p className="tp-note">Clave preliminar, no oficial.</p>}
        {stage === "explanation" && explanationOf(row) && <AiAnalysis row={row} correctLetter={slide.letter} meta={bundle.enrichMeta} hint={false} />}
        {!slide.letter && <p className="tp-note">Esta pregunta no tiene clave: no hay respuesta que mostrar.</p>}
      </div>
    );
  }

  return createPortal(
    <div ref={root} className={`tp tp-${theme} ${bar ? "bar-on" : ""}`} role="dialog" aria-modal="true" aria-label={`Presentación: ${lesson.title}`} onMouseMove={wake} onTouchStart={wake}>
      <div ref={stageEl} className="tp-stage" style={{ zoom: scale }}>{body}</div>

      {timer && (
        <div className={timer.done ? "tp-timer done" : "tp-timer"} role="timer" aria-live="off">
          {timer.done ? "¡Se acabó el tiempo!" : formatClock(remaining)}
        </div>
      )}

      <div className="tp-bar" role="toolbar" aria-label="Controles de la presentación">
        <button type="button" className="tp-btn" onClick={back} disabled={pos.i === 0 && pos.s === 0} aria-label="Anterior"><Icon name="left" size={22} /></button>
        <button type="button" className="tp-main" onClick={next}>{nextLabel(deck, pos)}<Icon name="right" size={20} /></button>
        <span className="tp-count" aria-label="Posición">{pos.i + 1} / {deck.length}</span>
        <span className="tp-spacer" />
        <button type="button" className={timer ? "tp-btn on" : "tp-btn"} onClick={startTimer} aria-label={timer ? "Quitar cronómetro" : `Cronómetro de ${settings.seconds} segundos`} aria-pressed={Boolean(timer)}><Icon name="clock" size={20} /></button>
        <button type="button" className="tp-btn" onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))} aria-label="Letra más pequeña">A−</button>
        <button type="button" className="tp-btn" onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)))} aria-label="Letra más grande">A+</button>
        <button type="button" className="tp-btn" onClick={() => setTheme(THEMES[(THEMES.findIndex(([id]) => id === theme) + 1) % THEMES.length][0])} aria-label={`Tema: ${THEMES.find(([id]) => id === theme)[1]}`}><Icon name="bulb" size={20} /></button>
        <button type="button" className="tp-btn" onClick={() => setBlank(true)} aria-label="Pantalla en blanco"><Icon name="close" size={20} /></button>
        <button type="button" className="tp-btn" onClick={fullscreen} aria-label="Pantalla completa"><Icon name="expand" size={20} /></button>
        <button type="button" className="tp-btn exit" onClick={leave}>Salir</button>
      </div>

      <div className="tp-brand" aria-hidden="true">{APP_NAME}</div>
      {blank && <button type="button" className="tp-blank" onClick={() => setBlank(false)} aria-label="Quitar pantalla en blanco" />}
    </div>,
    document.body,
  );
}
