import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../components/Icon.jsx";
import Logo from "../components/Logo.jsx";
import LessonCover from "../components/LessonCover.jsx";
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
// explanation. The explanation exists only where the key is settled. There is no ranking or student data here:
// the hand count is the class's, and the name picker only picks who speaks.
// Keys: → / space / Enter next step · ← back · A answer · E explanation · B pause (black screen) · T timer ·
//       G all slides · P pen · V hand count · R pick a student · N notes · + − size · D theme · F full screen ·
//       ? help · Esc exit.

const THEMES = [["dark", "Oscuro"], ["light", "Claro"], ["contrast", "Alto contraste"]];
const PEN_COLORS = ["#FF4D4D", "#FFD43B", "#4DABF7", "#69DB7C", "#FFFFFF"];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`condor:teach:${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`condor:teach:${k}`, JSON.stringify(v)); } catch { /* private window */ } },
};
const KEYS = [
  ["→ · espacio", "Siguiente paso"], ["←", "Paso anterior"], ["A", "Mostrar respuesta"], ["E", "Mostrar explicación"],
  ["T", "Cronómetro"], ["G", "Ver todas las diapositivas"], ["P", "Lápiz para marcar"], ["V", "Contar manos (A, B, C, D)"],
  ["R", "Sortear quién responde"], ["N", "Tus notas"], ["B", "Pausa: pantalla negra"], ["+ −", "Tamaño"], ["D", "Tema"],
  ["F", "Pantalla completa"], ["Esc", "Salir"],
];

function slideLabel(s, i) {
  if (s.type === "title") return "Portada";
  if (s.type === "end") return "Cierre";
  if (s.type === "text") return s.title || bodyBlocks(s.body)[0]?.text || bodyBlocks(s.body)[0]?.items?.[0] || `Diapositiva ${i + 1}`;
  return `Pregunta ${s.question.number} · ${s.question.section}`;
}

export default function Presenter({ lesson, bundle, onExit, start = 0, names = [] }) {
  const settings = cleanSettings(lesson.settings);
  const deck = useMemo(() => buildDeck(lesson, bundle), [lesson, bundle]);
  const [pos, setPos] = useState(() => clampPos(deck, start));
  const [blank, setBlank] = useState(false);
  const [scale, setScale] = useState(() => store.get("scale", 1.2));
  const [theme, setTheme] = useState(() => store.get("theme", "dark"));
  const [bar, setBar] = useState(true);
  const [timer, setTimer] = useState(null); // { end } while counting down, { done: true } at zero
  const [, tick] = useState(0);
  const [panel, setPanel] = useState(null); // "grid" | "help" | "view" | "notes"
  const [pen, setPen] = useState(null); // color while drawing
  const [votes, setVotes] = useState(null); // { A: 0, B: 3, … } while counting hands
  const [pickedName, setPickedName] = useState(null); // { name, rolling }
  const used = useRef([]);
  const root = useRef(null);
  const stageEl = useRef(null);
  const fitEl = useRef(null);
  const canvas = useRef(null);
  const strokes = useRef(new Map()); // slide index -> [{ color, pts: [[x, y] 0..1] }]
  const drawing = useRef(null);
  const [fit, setFit] = useState(() => store.get("fit", true));
  const hideBar = useRef(null);

  const slide = deck[pos.i];
  const stage = slideStages(slide)[pos.s];
  const last = pos.i === deck.length - 1;
  const progress = settings.progress !== false;

  useEffect(() => { store.set("scale", scale); }, [scale]);
  useEffect(() => { store.set("theme", theme); }, [theme]);
  useEffect(() => { store.set("fit", fit); }, [fit]);
  // Fit to the screen: the chosen size shrinks (never grows) until the whole slide shows without scrolling, so a
  // projector never hides the options under the toolbar. The explanation step may scroll: it is read, not compared.
  const fitNow = useCallback(() => {
    const el = fitEl.current;
    const box = stageEl.current;
    if (!el || !box) return;
    el.style.zoom = String(deck[pos.i]?.type === "title" ? 1 : scale);
    const stageNow = slideStages(deck[pos.i])[pos.s];
    if (!fit || stageNow === "explanation" || deck[pos.i]?.type === "title") return;
    const cs = getComputedStyle(box);
    const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const h = el.getBoundingClientRect().height;
    if (h > avail && avail > 0) el.style.zoom = String(Math.max(0.55, +(scale * (avail / h) * 0.98).toFixed(3)));
  }, [scale, fit, deck, pos]);
  useLayoutEffect(() => { fitNow(); });
  useEffect(() => {
    window.addEventListener("resize", fitNow);
    // Figures and fonts load after the first paint and change the height.
    const late = setTimeout(fitNow, 400);
    return () => { window.removeEventListener("resize", fitNow); clearTimeout(late); };
  }, [fitNow]);
  // The timer, the hand count and the notes belong to a slide: moving on clears them (or restarts the timer when
  // the teacher asked for one on every question and activity).
  useEffect(() => {
    const s = deck[pos.i];
    const timed = s?.type === "question" ? settings.autoTimer : s?.type === "text" && s.kind === "activity";
    setTimer(timed ? { end: Date.now() + settings.seconds * 1000 } : null);
    setVotes((v) => (v ? {} : null));
    setPanel((p) => (p === "notes" && !s?.note ? null : p));
  }, [pos.i]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const addTime = (sec) => setTimer((t) => (t?.end ? { end: t.end + sec * 1000 } : { end: Date.now() + sec * 1000 }));
  const toggle = (name) => setPanel((p) => (p === name ? null : name));
  const letters = slide.type === "question" ? (slide.question.options ?? []).map((o) => o.letter) : [];
  const toggleVotes = () => setVotes((v) => (v ? null : {}));
  const vote = (l, d) => setVotes((v) => ({ ...(v ?? {}), [l]: Math.max(0, (v?.[l] ?? 0) + d) }));
  const pick = () => {
    if (names.length === 0) return;
    if (used.current.length >= names.length) used.current = [];
    const left = names.filter((n) => !used.current.includes(n));
    const chosen = left[Math.floor(Math.random() * left.length)];
    used.current.push(chosen);
    setPickedName({ name: chosen, rolling: true });
    setTimeout(() => setPickedName((p) => (p ? { ...p, rolling: false } : p)), 900);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? "")) return;
      const k = e.key;
      const go = (fn) => { e.preventDefault(); wake(); fn(); };
      if (blank && k !== "Escape") return go(() => setBlank(false));
      if (pickedName && (k === "Escape" || k === "Enter" || k === " ")) return go(() => setPickedName(null));
      if (panel && panel !== "notes" && k === "Escape") return go(() => setPanel(null));
      if (pen && k === "Escape") return go(() => setPen(null));
      if (votes && /^[1-8]$/.test(k) && letters[Number(k) - 1]) return go(() => vote(letters[Number(k) - 1], 1));
      if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") go(next);
      else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") go(back);
      else if (k === "Home") go(() => setPos(clampPos(deck, 0)));
      else if (k === "End") go(() => setPos(clampPos(deck, deck.length - 1)));
      else if (k === "a" || k === "A") go(() => setPos((p) => jumpStage(deck, p, "answer")));
      else if (k === "e" || k === "E") go(() => setPos((p) => jumpStage(deck, p, "explanation")));
      else if (k === "b" || k === "B" || k === ".") go(() => setBlank(true));
      else if (k === "t" || k === "T") go(startTimer);
      else if (k === "g" || k === "G") go(() => toggle("grid"));
      else if (k === "p" || k === "P") go(() => setPen((c) => (c ? null : PEN_COLORS[0])));
      else if ((k === "v" || k === "V") && letters.length) go(toggleVotes);
      else if ((k === "r" || k === "R") && names.length) go(pick);
      else if ((k === "n" || k === "N") && slide.note) go(() => toggle("notes"));
      else if (k === "?" || k === "h" || k === "H") go(() => toggle("help"));
      else if (k === "+" || k === "=") go(() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2))));
      else if (k === "-" || k === "_") go(() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2))));
      else if (k === "d" || k === "D") go(() => setTheme((t) => THEMES[(THEMES.findIndex(([id]) => id === t) + 1) % THEMES.length][0]));
      else if (k === "f" || k === "F") go(fullscreen);
      else if (k === "Escape") { e.preventDefault(); if (blank) setBlank(false); else if (panel) setPanel(null); else leave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.body.classList.add("teach-open");
    return () => document.body.classList.remove("teach-open");
  }, []);

  // Pen: strokes are kept per slide in screen fractions, so they survive a resize and come back when you return.
  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const { width, height } = c.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(width * ratio); c.height = Math.round(height * ratio);
    const ctx = c.getContext?.("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = Math.max(3, width / 320);
    for (const s of strokes.current.get(pos.i) ?? []) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.pts.forEach(([x, y], j) => (j ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)));
      ctx.stroke();
    }
  }, [pos.i]);
  useEffect(() => { redraw(); window.addEventListener("resize", redraw); return () => window.removeEventListener("resize", redraw); }, [redraw]);
  const at = (e) => { const r = canvas.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const penDown = (e) => {
    if (!pen) return;
    e.preventDefault();
    canvas.current.setPointerCapture?.(e.pointerId);
    drawing.current = { color: pen, pts: [at(e)] };
    strokes.current.set(pos.i, [...(strokes.current.get(pos.i) ?? []), drawing.current]);
  };
  const penMove = (e) => { if (drawing.current) { drawing.current.pts.push(at(e)); redraw(); } };
  const penUp = () => { drawing.current = null; };
  const undo = () => { strokes.current.set(pos.i, (strokes.current.get(pos.i) ?? []).slice(0, -1)); redraw(); };
  const clear = () => { strokes.current.set(pos.i, []); redraw(); };

  const remaining = timer?.end ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : 0;
  const question = slide.type === "question" ? slide.question : null;
  const graded = stage === "answer" || stage === "explanation";

  let body = null;
  if (slide.type === "title") {
    body = <LessonCover intro={slide.intro} count={slide.count} />;
  } else if (slide.type === "text") {
    const blocks = bodyBlocks(slide.body);
    body = (
      <div className={`tp-text tp-kind-${slide.kind}${slide.image ? " has-img" : ""}`}>
        {slide.kind === "discuss" && <span className="tp-kicker"><Icon name="chat" size={22} /> Para discutir</span>}
        {slide.kind === "activity" && <span className="tp-kicker"><Icon name="clock" size={22} /> Actividad · {formatClock(settings.seconds)}</span>}
        <div className="tp-text-main">
          {slide.title && <h2 className="tp-h2">{slide.title}</h2>}
          {blocks.map((b, i) => b.type === "ul"
            ? <ul key={i} className="tp-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
            : <p key={i} className="tp-p">{b.text}</p>)}
        </div>
        {slide.image && <img className="tp-img" src={slide.image} alt="" />}
      </div>
    );
  } else if (slide.type === "end") {
    const blocks = bodyBlocks(slide.outro.body);
    body = (
      <div className="tp-center tp-end">
        <h1 className="tp-h1">{slide.outro.title || "Fin de la clase"}</h1>
        {blocks.length > 0 ? blocks.map((b, i) => b.type === "ul"
          ? <ul key={i} className="tp-list tp-end-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
          : <p key={i} className="tp-sub">{b.text}</p>) : <p className="tp-sub">{slide.title}</p>}
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

  const totalVotes = votes ? letters.reduce((n, l) => n + (votes[l] ?? 0), 0) : 0;
  const topVotes = votes ? Math.max(1, ...letters.map((l) => votes[l] ?? 0)) : 1;

  return createPortal(
    <div ref={root} className={`tp tp-${theme} ${bar ? "bar-on" : ""}${pen ? " pen-on" : ""}`} role="dialog" aria-modal="true" aria-label={`Presentación: ${lesson.title}`} onMouseMove={wake} onTouchStart={wake}>
      {progress && <div className="tp-progress" aria-hidden="true"><span style={{ width: `${((pos.i + 1) / deck.length) * 100}%` }} /></div>}
      <div ref={stageEl} className={slide.type === "title" ? "tp-stage tp-stage-cover" : "tp-stage"}><div ref={fitEl} className="tp-fit">{body}</div></div>
      <canvas ref={canvas} className="tp-canvas" aria-hidden="true" onPointerDown={penDown} onPointerMove={penMove} onPointerUp={penUp} onPointerCancel={penUp} />

      {pen && (
        <div className="tp-float tp-pen" role="toolbar" aria-label="Lápiz">
          {PEN_COLORS.map((c) => <button key={c} type="button" className={pen === c ? "tp-swatch on" : "tp-swatch"} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={pen === c} onClick={() => setPen(c)} />)}
          <button type="button" className="tp-btn" onClick={undo}>Deshacer</button>
          <button type="button" className="tp-btn" onClick={clear}>Borrar todo</button>
          <button type="button" className="tp-btn on" onClick={() => setPen(null)}>Listo</button>
        </div>
      )}

      {votes && letters.length > 0 && (
        <div className="tp-float tp-votes" aria-label="Conteo de manos">
          <div className="tp-float-head"><strong><Icon name="hand" size={18} /> Manos arriba</strong><span>{totalVotes}</span></div>
          {letters.map((l, i) => (
            <div key={l} className={graded && slide.letter === l ? "tp-vote is-key" : "tp-vote"}>
              <b>{l}</b>
              <span className="tp-vote-bar"><span style={{ width: `${((votes[l] ?? 0) / topVotes) * 100}%` }} /></span>
              <span className="tp-vote-n">{votes[l] ?? 0}</span>
              <button type="button" className="tp-mini" aria-label={`Quitar una mano a ${l}`} onClick={() => vote(l, -1)}>−</button>
              <button type="button" className="tp-mini" aria-label={`Sumar una mano a ${l} (tecla ${i + 1})`} onClick={() => vote(l, 1)}>+</button>
            </div>
          ))}
          <div className="tp-float-foot"><button type="button" className="link" onClick={() => setVotes({})}>Reiniciar</button><button type="button" className="link" onClick={() => setVotes(null)}>Cerrar</button></div>
        </div>
      )}

      {timer && (
        <div className={timer.done ? "tp-timer done" : "tp-timer"}>
          <span role="timer" aria-live="off">{timer.done ? "¡Se acabó el tiempo!" : formatClock(remaining)}</span>
          <span className="tp-timer-ctl">
            <button type="button" className="tp-mini" onClick={() => addTime(30)} aria-label="Treinta segundos más">+30 s</button>
            <button type="button" className="tp-mini" onClick={() => setTimer(null)} aria-label="Quitar cronómetro"><Icon name="close" size={14} /></button>
          </span>
        </div>
      )}

      {panel === "notes" && slide.note && (
        <div className="tp-float tp-notes" aria-label="Tus notas"><div className="tp-float-head"><strong>Tus notas</strong><button type="button" className="tp-mini" aria-label="Cerrar notas" onClick={() => setPanel(null)}><Icon name="close" size={14} /></button></div><p>{slide.note}</p></div>
      )}

      {panel === "view" && (
        <div className="tp-float tp-view" aria-label="Vista">
          <div className="tp-float-head"><strong>Vista</strong><button type="button" className="tp-mini" aria-label="Cerrar" onClick={() => setPanel(null)}><Icon name="close" size={14} /></button></div>
          <div className="tp-view-row"><span>Tamaño</span>
            <button type="button" className="tp-btn" onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))} aria-label="Letra más pequeña">A−</button>
            <b>{Math.round(scale * 100)} %</b>
            <button type="button" className="tp-btn" onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)))} aria-label="Letra más grande">A+</button></div>
          <label className="tp-view-row"><span>Ajustar a la pantalla</span><input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /></label>
          <div className="tp-view-row"><span>Tema</span>{THEMES.map(([id, label]) => <button key={id} type="button" className={theme === id ? "tp-btn on" : "tp-btn"} aria-pressed={theme === id} onClick={() => setTheme(id)}>{label}</button>)}</div>
        </div>
      )}

      <div className="tp-bar" role="toolbar" aria-label="Controles de la presentación">
        <button type="button" className="tp-btn" onClick={back} disabled={pos.i === 0 && pos.s === 0} aria-label="Anterior"><Icon name="left" size={22} /></button>
        <button type="button" className="tp-main" onClick={next}>{nextLabel(deck, pos)}<Icon name="right" size={20} /></button>
        <button type="button" className="tp-count" onClick={() => toggle("grid")} aria-label={`Diapositiva ${pos.i + 1} de ${deck.length}. Ver todas`}>{pos.i + 1} / {deck.length}</button>
        <span className="tp-spacer" />
        <button type="button" className={pen ? "tp-btn on" : "tp-btn"} onClick={() => setPen(pen ? null : PEN_COLORS[0])} aria-pressed={Boolean(pen)} aria-label="Lápiz" title="Lápiz (P)"><Icon name="pen" size={20} /></button>
        {letters.length > 0 && <button type="button" className={votes ? "tp-btn on" : "tp-btn"} onClick={toggleVotes} aria-pressed={Boolean(votes)} aria-label="Contar manos" title="Contar manos (V)"><Icon name="hand" size={20} /></button>}
        {names.length > 0 && <button type="button" className="tp-btn" onClick={pick} aria-label="Sortear quién responde" title="Sortear quién responde (R)"><Icon name="users" size={20} /></button>}
        {slide.note && <button type="button" className={panel === "notes" ? "tp-btn on" : "tp-btn"} onClick={() => toggle("notes")} aria-pressed={panel === "notes"} aria-label="Tus notas" title="Tus notas (N)"><Icon name="pencil" size={18} /><span className="tp-btn-text">Notas</span></button>}
        <button type="button" className={timer ? "tp-btn on" : "tp-btn"} onClick={startTimer} aria-label={timer ? "Quitar cronómetro" : `Cronómetro de ${settings.seconds} segundos`} aria-pressed={Boolean(timer)} title="Cronómetro (T)"><Icon name="clock" size={20} /></button>
        <button type="button" className={panel === "view" ? "tp-btn on" : "tp-btn"} onClick={() => toggle("view")} aria-pressed={panel === "view"} aria-label="Vista: tamaño, ajuste y tema" title="Vista"><Icon name="sliders" size={18} /></button>
        <button type="button" className="tp-btn" onClick={() => setBlank(true)} aria-label="Pausa: pantalla negra" title="Pausa: pantalla negra (B)"><Icon name="pause" size={20} /><span className="tp-btn-text">Pausa</span></button>
        <button type="button" className="tp-btn" onClick={fullscreen} aria-label="Pantalla completa" title="Pantalla completa (F)"><Icon name="expand" size={20} /></button>
        <button type="button" className={panel === "help" ? "tp-btn on" : "tp-btn"} onClick={() => toggle("help")} aria-label="Atajos de teclado" title="Atajos (?)">?</button>
        <button type="button" className="tp-btn exit" onClick={leave} aria-label="Salir de la presentación"><Icon name="close" size={18} /><span>Salir</span></button>
      </div>

      {slide.type === "question" && <div className="tp-brand" aria-hidden="true"><Logo size={18} />{APP_NAME} · {SOURCE_LINE}</div>}

      {panel === "grid" && (
        <div className="tp-overlay" role="dialog" aria-label="Todas las diapositivas">
          <div className="tp-overlay-card tp-grid-card">
            <div className="tp-float-head"><strong>Todas las diapositivas</strong><button type="button" className="tp-btn" onClick={() => setPanel(null)}>Cerrar</button></div>
            <ol className="tp-grid">
              {deck.map((s, i) => (
                <li key={i}><button type="button" className={i === pos.i ? "tp-thumb on" : "tp-thumb"} onClick={() => { setPos(clampPos(deck, i)); setPanel(null); }}>
                  <span className="tp-thumb-n">{i + 1}</span><span className="tp-thumb-l">{slideLabel(s, i)}</span>
                </button></li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {panel === "help" && (
        <div className="tp-overlay" role="dialog" aria-label="Atajos de teclado" onClick={() => setPanel(null)}>
          <div className="tp-overlay-card"><strong>Atajos de teclado</strong>
            <dl className="tp-keys">{KEYS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
        </div>
      )}
      {pickedName && (
        <div className="tp-overlay" role="dialog" aria-label="Quién responde">
          <div className="tp-overlay-card tp-pick">
            <span className="tp-kicker">Responde</span>
            <strong className={pickedName.rolling ? "tp-pick-name rolling" : "tp-pick-name"}>{pickedName.name}</strong>
            <span className="tp-pick-actions">
              <button type="button" className="tp-btn" onClick={pick}>Otro nombre</button>
              <button type="button" className="tp-main" onClick={() => setPickedName(null)}>Listo</button>
            </span>
            <span className="tp-note">No se repite nadie hasta que hayan pasado todos ({used.current.length} de {names.length}).</span>
          </div>
        </div>
      )}
      {blank && (
        <button type="button" className="tp-blank" onClick={() => setBlank(false)} aria-label="Quitar pantalla en blanco">
          <span className="tp-blank-hint">En pausa · toca o presiona una tecla para volver</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
