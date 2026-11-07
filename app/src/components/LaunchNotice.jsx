import { useState } from "react";
import Popup from "./Popup.jsx";
import { EMAIL_RE, joinWaitlist, sendFeedback, waitlisted } from "../lib/publicFeedback.js";

// Shown on the public site: says this is a free demo, that prices are not set yet, and offers the launch discount
// waitlist plus a place for comments. One compact bar, so it doesn't take space on a phone.
export default function LaunchNotice() {
  const [panel, setPanel] = useState(null); // null | "discount" | "comments"
  const [joined, setJoined] = useState(() => waitlisted());
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  const close = () => { setPanel(null); setNote(""); };

  const join = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setEmailError(true); return; }
    setEmailError(false);
    const ok = await joinWaitlist(email, "demo");
    if (ok) { setJoined(true); setEmail(""); setNote(""); }
    else setNote("No pudimos guardar tu correo. Inténtalo de nuevo en unos minutos.");
  };

  const sendComment = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const result = await sendFeedback({ kind: "general", message, contact: contact || null });
    setMessage(""); setContact("");
    setNote(result.stored === "server" ? "Gracias. Tu comentario nos ayuda a mejorar." : "Guardado en este navegador. Gracias.");
  };

  return (
    <>
      <div className="launch-bar" role="region" aria-label="Versión de demostración">
        <span className="launch-chip">Demo gratuita</span>
        <span className="launch-text">Los precios aún no están definidos. Regístrate y recibe descuento al abrirlos.</span>
        <button type="button" className="link launch-open" onClick={() => setPanel("discount")}>{joined ? "Registrado" : "Quiero el descuento"}</button>
        <button type="button" className="link launch-open" onClick={() => setPanel("comments")}>Comentarios</button>
      </div>

      {panel === "discount" && (
        <Popup title="Descuento de lanzamiento" subtitle="Lo que pagan los primeros usuarios" onClose={close}>
          <p>Esta versión es una demostración. Cuando definamos los precios, quienes se registren aquí recibirán un descuento. Solo usaremos tu correo para avisarte.</p>
          {joined ? <p className="muted">Ya estás en la lista. Te avisaremos al abrir los precios.</p> : (
          <form className="report-form" onSubmit={join} noValidate>
            <label className="label" htmlFor="launch-email">Correo electrónico</label>
            <input id="launch-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={emailError} placeholder="tu@correo.com" />
            {emailError && <p className="notice error">Escribe un correo válido.</p>}
            <div className="report-actions">
              <button type="submit" className="primary">Registrarme</button>
            </div>
          </form>
          )}
          {note && <p className="muted" role="status">{note}</p>}
        </Popup>
      )}

      {panel === "comments" && (
        <Popup title="Comentarios" subtitle="Ayúdanos a mejorar la demostración" onClose={close}>
          <form className="report-form" onSubmit={sendComment}>
            <label className="label" htmlFor="launch-comment">¿Qué te gustó, qué falta o qué no funciona?</label>
            <textarea id="launch-comment" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
            <label className="label" htmlFor="launch-contact">Correo o teléfono (opcional, para responderte)</label>
            <input id="launch-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
            <div className="report-actions">
              <button type="submit" className="primary" disabled={!message.trim()}>Enviar comentario</button>
            </div>
          </form>
          {note && <p className="muted" role="status">{note}</p>}
        </Popup>
      )}
    </>
  );
}
