import { useState } from "react";
import Icon from "./Icon.jsx";
import Tour from "./tour/Tour.jsx";

// Cóndor is in beta: many questions were typed from scanned booklets and some still have formatting mistakes.
// The pill next to the logo explains it; the one-line note shows on the first screens until it is closed.
export const BETA_TEXT = "Cóndor está en beta. Muchas preguntas se pasaron de los cuadernillos escaneados del ICFES y todavía pueden tener errores de formato (una tabla corrida, una fórmula o una imagen mal puesta).";
export const BETA_REPORT = "Si ves uno, toca «Reportar un error» debajo de la pregunta: lo revisamos y lo corregimos para todos.";

export const BETA_STEP = { id: "beta", title: "Estamos en beta", text: `${BETA_TEXT} ${BETA_REPORT}`, owl: "thinking" };

export function BetaPill({ className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`beta-pill ${className}`} onClick={() => setOpen(true)} title="Versión beta: qué significa">Beta</button>
      {open && <Tour label="Versión beta" steps={[{ ...BETA_STEP, final: true }]} onClose={() => setOpen(false)} />}
    </>
  );
}

const KEY = "condor:beta-note";
export function BetaNote({ who = "student" }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  if (hidden) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ } setHidden(true); };
  return (
    <div className="beta-note" role="note">
      <Icon name="flag" size={18} strokeWidth={2.6} />
      <p><b>Versión beta.</b> {who === "teacher"
        ? "Algunas preguntas todavía pueden tener errores de formato. Si ves uno, corrígelo para tu colegio en Biblioteca › Banco de preguntas, o avísanos con «Reportar un error» desde la vista de estudiante."
        : "Si ves un error en una pregunta, toca «Reportar un error» y lo corregimos."}</p>
      <button type="button" className="icon-btn" aria-label="Cerrar el aviso" onClick={close}><Icon name="x" size={16} /></button>
    </div>
  );
}
