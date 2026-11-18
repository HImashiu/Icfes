import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { OwlPeek } from "../Mascot.jsx";
import "./tour.css";

// First visit to the student app (Juan 2026-11-18): Inicio opens, and instead of a random question the person is
// offered the Inicio guide. Nothing starts by itself: «Ver el tutorial» opens it, «Ahora no» closes for good (the «?»
// keeps every guide one tap away). Shown once per browser.
const KEY = "condor:welcome-invite";

export function welcomeInviteSeen() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; } // storage blocked: never nag
}
export function markWelcomeInviteSeen() {
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ }
}

export default function WelcomeInvite({ name = null, onTutorial, onClose }) {
  const card = useRef(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="ob-tour dim ob-welcome" role="dialog" aria-modal="true" aria-labelledby="ob-welcome-title">
      <div ref={card} tabIndex={-1} className="ob-card owl ob-welcome-card">
        <OwlPeek className="ob-welcome-owl" width={96} happy />
        <span className="caption ob-count">Primera vez en Cóndor</span>
        <h2 id="ob-welcome-title">{name ? `¡Bienvenido, ${name}!` : "¡Bienvenido a Cóndor!"}</h2>
        <p>Este es tu inicio: desde aquí practicas, haces simulacros y ves cómo vas. ¿Te mostramos cómo funciona? Toma un minuto.</p>
        <span className="caption">Puedes verlo cuando quieras con el botón «?».</span>
        <div className="ob-foot ob-welcome-foot">
          <button type="button" className="link" onClick={onClose}>Ahora no</button>
          <button type="button" className="primary" onClick={onTutorial}>Ver el tutorial</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
