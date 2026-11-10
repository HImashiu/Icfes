import { useState } from "react";
import { claimMessage, pendingTeacherCode, useAuth } from "../lib/auth.jsx";

// For an account that already exists as a student: type the trial code (or the school's teacher code) and the
// account becomes a teacher (migration 0035). Shown on Perfil and when a student account opens the teacher panel.
export default function TeacherCode({ onDone, error: firstError = null, open: startOpen = false }) {
  const auth = useAuth();
  const [open, setOpen] = useState(startOpen || Boolean(firstError));
  const [code, setCode] = useState(() => pendingTeacherCode());
  const [error, setError] = useState(firstError);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) { setError("Escribe el código que te envió tu colegio o Cóndor."); return; }
    setBusy(true); setError(null);
    try { await auth.redeemTeacherCode(code); onDone?.(); } catch (err) { setError(claimMessage(err)); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <button type="button" className="card quick-row tc-open" onClick={() => setOpen(true)}>
        <span><strong>¿Eres docente?</strong><span className="caption">Escribe tu código de prueba o del colegio para abrir el panel docente.</span></span>
      </button>
    );
  }
  return (
    <form className="card t-card tc-form" onSubmit={submit}>
      <strong>Entrar como docente</strong>
      <span className="caption">Escribe el código de prueba que recibió tu colegio, o el código de docente que te dio coordinación. Tu cuenta {auth.user?.email ? `(${auth.user.email}) ` : ""}pasa a ser de docente.</span>
      <label className="field login-code">
        <span className="label">Código de docente</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CND-0000-0000-0000-0000" />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="report-actions">
        {!startOpen && <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>}
        <button type="submit" className="primary" disabled={busy}>{busy ? "Entrando…" : "Abrir mi panel docente"}</button>
      </div>
    </form>
  );
}
