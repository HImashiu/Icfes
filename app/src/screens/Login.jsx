import { useState } from "react";
import Mascot from "../components/Mascot.jsx";
import { claimMessage, useAuth } from "../lib/auth.jsx";
import { microsoftEnabled } from "../lib/supabase.js";

// Ingreso con la cuenta del colegio. Practicar no exige cuenta: esta pantalla solo abre las funciones del colegio.
export default function Login({ onBack }) {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(auth.error ? claimMessage() : null);
  const [busy, setBusy] = useState(false);

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.claim({ teacherCode: code, fullName: name });
      onBack();
    } catch (err) {
      setError(claimMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "needs-profile") {
    return (
      <section className="profile">
        <header className="screen-head"><h1>Casi listo</h1></header>
        <form className="card t-card assign-form" onSubmit={claim}>
          <span className="caption">Ingresaste como {auth.user?.email}.</span>
          <label className="field">
            <span className="label">Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Nombre y apellido" />
          </label>
          <label className="field">
            <span className="label">Código de docente (solo si eres docente)</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="Pídelo a la coordinación" />
          </label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="report-actions">
            <button type="button" className="secondary" onClick={auth.signOut}>Salir</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Entrando…" : "Continuar"}</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="profile">
      <header className="screen-head"><h1>Ingresar</h1></header>
      <div className="card" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
        <Mascot size={64} />
        <strong>Usa la cuenta de tu colegio</strong>
        <span className="caption">Con tu cuenta ves las tareas de tu curso y tu docente ve cómo vas. Practicar sigue siendo gratis y no necesita cuenta.</span>
        <button type="button" className="primary big" onClick={auth.signInWithGoogle}>Continuar con Google</button>
        {microsoftEnabled && <button type="button" className="secondary big" onClick={auth.signInWithMicrosoft}>Continuar con Microsoft</button>}
        <span className="caption">Solo funcionan los correos de colegios registrados. Resultados con clave preliminar, no oficial.</span>
      </div>
      <button type="button" className="link" onClick={onBack}>Volver</button>
    </section>
  );
}
