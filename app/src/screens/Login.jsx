import { useState } from "react";
import Mascot from "../components/Mascot.jsx";
import { claimMessage, pendingTeacherCode, rememberTeacherCode, useAuth } from "../lib/auth.jsx";
import { authLanding, microsoftEnabled } from "../lib/supabase.js";

// Ingreso. La app necesita una cuenta: cualquier cuenta de Google sirve para practicar; con el correo del colegio
// además aparecen las tareas y clases. `gate`: es la primera pantalla de /app/ (sin «Volver», con enlace al inicio).
export default function Login({ onBack, gate = false }) {
  const auth = useAuth();
  const [code, setCode] = useState(() => (typeof window !== "undefined" ? pendingTeacherCode() : ""));
  const [name, setName] = useState("");
  const [error, setError] = useState(auth.error ? `No se pudo leer tu perfil: ${auth.error}` : null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState(() => Boolean(code) || (typeof window !== "undefined" && window.location.hash.startsWith("#docente")));
  // Teachers go to Google with their code (if they have one) and come back to their panel.
  const googleAsTeacher = () => {
    rememberTeacherCode(code);
    if (!window.location.hash.startsWith("#docente")) window.location.hash = "#docente/hoy";
    return auth.signInWithGoogle();
  };

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.claim({ teacherCode: code, fullName: name });
      onBack?.();
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
          <span className="caption">Ingresaste como {auth.user?.email}. Solo falta tu nombre.</span>
          <label className="field">
            <span className="label">Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Nombre y apellido" />
          </label>
          {!teacher ? (
            <button type="button" className="link" onClick={() => setTeacher(true)}>Soy docente</button>
          ) : (
            <label className="field">
              <span className="label">Código de docente</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="Código de prueba o del colegio" />
            </label>
          )}
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
    <section className={gate ? "profile signin-gate" : "profile"}>
      <header className="screen-head"><h1>{gate ? "Ingresa a Cóndor" : "Ingresar"}</h1></header>
      <div className="card login-card">
        <Mascot size={64} />
        <div className="segmented login-who" role="radiogroup" aria-label="Entro como">
          <button type="button" role="radio" aria-checked={!teacher} className={!teacher ? "seg active" : "seg"} onClick={() => setTeacher(false)}>Soy estudiante</button>
          <button type="button" role="radio" aria-checked={teacher} className={teacher ? "seg active" : "seg"} onClick={() => setTeacher(true)}>Soy docente</button>
        </div>
        {!teacher ? (
          <>
            <strong>Entra con tu cuenta de Google</strong>
            <span className="caption">Cualquier cuenta sirve para practicar y guardar tu avance. Si tu colegio usa Cóndor, entra con el correo del colegio para ver tus tareas y clases.</span>
            <button type="button" className="primary big" onClick={auth.signInWithGoogle}>Continuar con Google</button>
            {microsoftEnabled && <button type="button" className="secondary big" onClick={auth.signInWithMicrosoft}>Continuar con Microsoft</button>}
          </>
        ) : (
          <>
            <strong>Entra a tu panel docente</strong>
            <span className="caption">Si tu colegio te envió un código de prueba, escríbelo aquí y entra con tu Google (el del colegio o el personal). Si coordinación ya te invitó con tu correo, deja el código vacío.</span>
            <label className="field login-code">
              <span className="label">Código de docente (opcional)</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CND-0000-0000-0000-0000" />
            </label>
            <button type="button" className="primary big" onClick={googleAsTeacher}>Continuar con Google</button>
            <span className="caption">¿Ya entraste antes como estudiante con esa cuenta? No pasa nada: el código convierte tu cuenta en docente.</span>
          </>
        )}
        {authLanding?.error && <p className="notice error" role="alert">Google o Supabase devolvió un error: {authLanding.error}</p>}
        {!authLanding?.error && auth.status === "signed-out" && authLanding?.arrived && <p className="notice error" role="alert">Volviste de Google pero la sesión no se guardó. Revisa que el navegador permita almacenamiento y las URL de redirección en Supabase.</p>}
        {auth.error && <p className="notice error" role="alert">{auth.error}</p>}
        <span className="caption">Al continuar aceptas los términos y la <a href="../privacidad.html">política de privacidad</a>. Resultados con clave preliminar, no oficial.</span>
      </div>
      {gate ? <a className="link" href="../">Volver a la página principal</a> : <button type="button" className="link" onClick={onBack}>Volver</button>}
    </section>
  );
}
