import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../components/Icon.jsx";
import Mascot from "../../components/Mascot.jsx";
import { demoEnabled, setDemo } from "../../demo/mode.js";

// First visit to the teacher panel: a short guided tour that points at the real controls, a "first steps" list
// that ticks itself as the school sets up, and the switch that opens the example school (invented students and
// results) so a new teacher can see every tool with data before importing anything.

const seenKey = (uid) => `condor:tour:docente:${uid}`;
export function tourSeen(uid) {
  try { return localStorage.getItem(seenKey(uid)) === "1"; } catch { return true; } // storage blocked: never nag
}
export function markTourSeen(uid) {
  try { localStorage.setItem(seenKey(uid), "1"); } catch { /* storage blocked */ }
}

// The example school: off for every real school; a teacher turns it on to look around and off to come back.
export function ExampleDataSwitch({ className = "" }) {
  const on = demoEnabled;
  return (
    <div className={`ob-switch ${className}`}>
      <span className="ob-switch-text">
        <strong>Datos de ejemplo</strong>
        <span className="caption">{on
          ? "Estás viendo un colegio inventado. Apágalo para volver al tuyo."
          : "Mira cómo se ven las herramientas con estudiantes y resultados inventados, sin importar nada. Tu colegio no cambia."}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label="Datos de ejemplo" className={on ? "aj-switch on" : "aj-switch"} onClick={() => setDemo(!on)} />
    </div>
  );
}

// What a new teacher does first. Each step ticks itself from the real data and opens where it is done.
export function firstSteps({ admin, courses, assignments }) {
  return [
    admin
      ? { id: "cursos", done: courses.length > 0, title: "Arma los cursos del colegio", text: "Cada curso (por ejemplo 11 A) se crea con sus cinco materias del ICFES.", to: { section: "colegio", tab: "cursos" } }
      : { id: "clase", done: courses.length > 0, title: "Crea tu clase", text: "Ponle nombre y pega la lista de estudiantes con su correo.", to: { section: "estudiantes", tab: "clases" } },
    { id: "actividad", done: assignments.length > 0, title: "Asigna la primera actividad", text: "Un simulacro diagnóstico o una tarea corta, en línea o en papel.", to: { section: "actividades", tab: "nueva" } },
    { id: "resultados", done: false, title: "Revisa los resultados", text: "Puntaje como el ICFES, por competencia y por estudiante.", to: { section: "resultados" } },
  ];
}

export function FirstSteps({ steps, go, onTour }) {
  const next = steps.find((s) => !s.done);
  return (
    <section className="ob-steps" aria-label="Primeros pasos">
      <ol>
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? "done" : s === next ? "next" : ""}>
            <button type="button" onClick={() => go(s.to)}>
              <span className="ob-num" aria-hidden="true">{s.done ? <Icon name="check" size={15} strokeWidth={3.2} /> : i + 1}</span>
              <span className="ob-step-text"><strong>{s.title}</strong><span className="caption">{s.text}</span></span>
              <Icon name="right" size={16} strokeWidth={3} />
            </button>
          </li>
        ))}
      </ol>
      <ExampleDataSwitch />
      {onTour && <button type="button" className="link ob-replay" onClick={onTour}><Icon name="play" size={14} /> Ver el recorrido otra vez</button>}
    </section>
  );
}

// Steps point at elements by [data-tour]; on a phone the bottom bar's copy is the visible one.
function tourSteps({ admin, name }) {
  return [
    { id: "hola", title: `¡Hola${name ? `, ${name}` : ""}!`, text: "Este es tu espacio docente. Te muestro dónde está cada cosa en menos de un minuto.", owl: "happy" },
    { id: "hoy", target: "nav-hoy", title: "Hoy", text: "Tu inicio: lo que pide atención, las entregas nuevas, los estudiantes que necesitan apoyo y el calendario." },
    { id: "ctx", target: "context", title: "Materia y curso", text: "Elige una materia o un curso aquí y todo el panel se filtra a esa clase." },
    { id: "estudiantes", target: "nav-estudiantes", title: "Estudiantes", text: "Crea tus listas de clase pegando nombres y correos. Cada estudiante tiene su perfil con alertas, notas y todo su trabajo." },
    { id: "nueva", target: "new", title: "Nueva actividad", text: "Simulacros, tareas y quizzes con preguntas del ICFES. Se resuelven en línea o en papel, con hojas de respuesta que escaneas con el celular." },
    { id: "vivo", target: "live", title: "Juego en vivo", text: "Proyecta preguntas en clase; tus estudiantes responden desde el celular con un código QR." },
    { id: "resultados", target: "nav-resultados", title: "Resultados", text: "Puntaje calculado como el ICFES (0 a 500), análisis por competencia, hoja de datos y tableros con gráficas." },
    { id: "biblioteca", target: "nav-biblioteca", title: "Biblioteca", text: "El banco de preguntas del ICFES, tus propias preguntas, clases para proyectar y el control de qué preguntas ya vio cada grupo." },
    ...(admin ? [{ id: "colegio", target: "nav-colegio", title: "Colegio", text: "Solo coordinación: cursos y materias, docentes y permisos, la calificación del colegio y los ajustes." }] : []),
    { id: "listo", title: "¡Listo para empezar!", text: "Estos son tus primeros pasos. Puedes volver a verlo cuando quieras con «Ver el recorrido».", owl: "celebrating", final: true },
  ];
}

function findTarget(name) {
  if (!name || typeof document === "undefined") return null;
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const CARD_W = 340;
const PAD = 6;

export function TeacherTour({ admin, name, steps: first, go, onClose }) {
  const steps = tourSteps({ admin, name });
  const [i, setI] = useState(0);
  const [hole, setHole] = useState(null);
  const [pos, setPos] = useState(null);
  const card = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const place = useCallback(() => {
    const el = findTarget(step.target);
    const vw = window.innerWidth, vh = window.innerHeight;
    const h = card.current?.offsetHeight ?? 220;
    const w = Math.min(CARD_W, vw - 24);
    if (!el) { setHole(null); setPos({ left: (vw - w) / 2, top: Math.max(12, (vh - h) / 2), w }); return; }
    const r = el.getBoundingClientRect();
    setHole({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    const clampX = (x) => Math.max(12, Math.min(x, vw - w - 12));
    const clampY = (y) => Math.max(12, Math.min(y, vh - h - 12));
    let left, top, side;
    if (r.left < vw / 3 && r.right + 16 + w <= vw - 12 && r.height < vh / 2 && r.bottom < vh - 80) { left = r.right + 16; top = clampY(r.top + r.height / 2 - h / 2); side = "right"; }
    else if (vh - r.bottom - 16 >= h) { left = clampX(r.left + r.width / 2 - w / 2); top = r.bottom + 14; side = "below"; }
    else { left = clampX(r.left + r.width / 2 - w / 2); top = clampY(r.top - h - 14); side = "above"; }
    setPos({ left, top, w, side });
  }, [step.target]);

  useLayoutEffect(() => {
    findTarget(step.target)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    place();
    const t = setTimeout(place, 60); // the card's height is known after the first paint
    return () => clearTimeout(t);
  }, [place, step.target]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [place]);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [i]);

  const finish = useCallback(() => onClose(), [onClose]);
  const nextStep = useCallback(() => (last ? finish() : setI((n) => n + 1)), [last, finish]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") nextStep();
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [finish, nextStep]);

  return createPortal(
    <div className={hole ? "ob-tour" : "ob-tour dim"} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      {hole && <div className="ob-hole" style={hole} aria-hidden="true" />}
      <div ref={card} tabIndex={-1} key={step.id} className={`ob-card ${pos?.side ?? "center"} ${step.final ? "final" : ""}`}
        style={pos ? { left: pos.left, top: pos.top, width: pos.w } : { visibility: "hidden" }}>
        <button type="button" className="icon-btn ob-x" aria-label="Cerrar el recorrido" onClick={finish}><Icon name="x" size={16} /></button>
        {step.owl && <Mascot pose={step.owl} size={step.final ? 64 : 80} />}
        <span className="caption ob-count">{step.final || i === 0 ? "Recorrido" : `${i} de ${steps.length - 2}`}</span>
        <h2 id="ob-title">{step.title}</h2>
        <p>{step.text}</p>
        {step.final && <FirstSteps steps={first} go={(to) => { finish(); go(to); }} />}
        <div className="ob-foot">
          <span className="ob-dots" aria-hidden="true">{steps.map((st, k) => <span key={st.id} className={k === i ? "on" : k < i ? "past" : ""} />)}</span>
          {i > 0 && !last && <button type="button" className="secondary" onClick={() => setI(i - 1)}>Atrás</button>}
          {i === 0 && <button type="button" className="link" onClick={finish}>Ahora no</button>}
          <button type="button" className="primary" onClick={nextStep}>{i === 0 ? "Empezar" : last ? "Terminar" : "Siguiente"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
