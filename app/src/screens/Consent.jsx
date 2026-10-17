import { useState } from "react";
import { TERMS, TERMS_TITLE } from "../lib/consent.js";

// Shown once after sign-in (and again when the texts change). Nothing else is reachable until it is accepted.
export default function Consent({ onAccept, onSignOut }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try { await onAccept(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <main className="frame consent">
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h1>{TERMS_TITLE}</h1>
        {TERMS.map(([h, t]) => (
          <div key={h}><strong>{h}</strong><p className="caption" style={{ margin: "2px 0 0" }}>{t}</p></div>
        ))}
        <label className="b-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Leí y acepto el tratamiento de mis datos</label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="report-actions">
          <button type="button" className="link" onClick={onSignOut}>Salir</button>
          <button type="button" className="primary" disabled={!ok || busy} onClick={accept}>Continuar</button>
        </div>
      </div>
    </main>
  );
}
