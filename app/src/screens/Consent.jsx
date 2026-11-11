import { useState } from "react";
import { TERMS, TERMS_PERSONAL, TERMS_TITLE } from "../lib/consent.js";

// Shown once after sign-in (and again when the texts change). Nothing else is reachable until it is accepted.
// `personal`: an account with no school.
export default function Consent({ onAccept, onSignOut, personal = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try { await onAccept(); } catch (e) { setError(e.message); setBusy(false); }
  };
  // One tap: the main points in two lines, the full text one tap away, and a button that says what it accepts.
  const points = personal ? TERMS_PERSONAL : TERMS;
  return (
    <main className="frame consent">
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h1>{TERMS_TITLE}</h1>
        <p className="caption" style={{ margin: 0 }}>Usamos tu nombre, tu correo y las preguntas que respondes para guardar tu avance y mejorar Cóndor. No vendemos tus datos, no hay publicidad ni rankings.</p>
        <details className="consent-more">
          <summary>Leer el detalle</summary>
          {points.map(([h, t]) => (
            <div key={h}><strong>{h}</strong><p className="caption" style={{ margin: "2px 0 0" }}>{t}</p></div>
          ))}
          <p className="caption"><a href="../privacidad.html">Política de privacidad</a></p>
        </details>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button type="button" className="primary big" disabled={busy} onClick={accept}>{busy ? "Guardando…" : "Acepto y empiezo"}</button>
        <button type="button" className="link" onClick={onSignOut}>Salir</button>
      </div>
    </main>
  );
}
