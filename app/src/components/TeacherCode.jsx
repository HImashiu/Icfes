import { useState } from "react";
import { claimMessage, pendingTeacherCode, useAuth } from "../lib/auth.jsx";

// For an account that already exists as a student: type the trial code (or the school's teacher code) and the
// account becomes a teacher (migration 0035), or, with no code, open their own trial workspace (migration 0038).
// Shown on Perfil and when a student account opens the teacher panel.
export default function TeacherCode({ onDone, error: firstError = null, open: startOpen = false }) {
  const auth = useAuth();
  const [open, setOpen] = useState(startOpen || Boolean(firstError));
  const [code, setCode] = useState(() => pendingTeacherCode());
  const [error, setError] = useState(firstError);
  const [busy, setBusy] = useState(false);
  // "code": type a code · "trial": no code, open my own workspace with the school's name and city.
  const [mode, setMode] = useState(() => (pendingTeacherCode() ? "code" : "trial"));
  const [school, setSchool] = useState("");
  const [city, setCity] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (mode === "trial") {
      if (!school.trim()) { setError("Escribe el nombre de tu colegio."); return; }
      setBusy(true); setError(null);
      try { await auth.startTrial({ schoolName: school, city }); onDone?.(); } catch (err) { setError(claimMessage(err)); } finally { setBusy(false); }
      return;
    }
    if (!code.trim()) { setError("Escribe el código que te envió tu colegio o Cóndor."); return; }
    setBusy(true); setError(null);
    try { await auth.redeemTeacherCode(code); onDone?.(); } catch (err) { setError(claimMessage(err)); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <button type="button" className="card quick-row tc-open" onClick={() => setOpen(true)}>
        <span><strong>¿Eres docente?</strong><span className="caption">Crea tu espacio docente en un minuto, o escribe el código de tu colegio.</span></span>
      </button>
    );
  }
  return (
    <form className="card t-card tc-form" onSubmit={submit}>
      <strong>{mode === "trial" ? "Crea tu espacio docente" : "Entrar como docente"}</strong>
      {mode === "trial" ? (
        <>
          <span className="caption">Tus cursos, el banco de preguntas, simulacros en línea y en papel. Tu cuenta {auth.user?.email ? `(${auth.user.email}) ` : ""}pasa a ser de docente.</span>
          <label className="field">
            <span className="label">Tu colegio</span>
            <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} autoComplete="organization" placeholder="Ej.: IE San José" />
          </label>
          <label className="field">
            <span className="label">Ciudad o municipio</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" placeholder="Ej.: Pasto" />
          </label>
          <button type="button" className="link" onClick={() => { setMode("code"); setError(null); }}>Mi colegio me dio un código</button>
        </>
      ) : (
        <>
          <span className="caption">Escribe el código de prueba que recibió tu colegio, o el código de docente que te dio coordinación. Tu cuenta {auth.user?.email ? `(${auth.user.email}) ` : ""}pasa a ser de docente.</span>
          <label className="field login-code">
            <span className="label">Código de docente</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CND-0000-0000-0000-0000" />
          </label>
          <button type="button" className="link" onClick={() => { setMode("trial"); setError(null); }}>No tengo código: crear mi espacio</button>
        </>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="report-actions">
        {!startOpen && <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>}
        <button type="submit" className="primary" disabled={busy}>{busy ? "Entrando…" : mode === "trial" ? "Crear mi espacio docente" : "Abrir mi panel docente"}</button>
      </div>
    </form>
  );
}
