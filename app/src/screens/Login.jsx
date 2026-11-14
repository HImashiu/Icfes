import { noteAuthStart } from "../lib/growth/app.js";
import { useEffect, useRef, useState } from "react";
import Mascot from "../components/Mascot.jsx";
import { claimMessage, pendingInviter, pendingTeacherCode, rememberTeacherCode, useAuth } from "../lib/auth.jsx";
import { authLanding, microsoftEnabled } from "../lib/supabase.js";
import { chromeIntent, inAppBrowser, readQuickStart } from "../lib/quickStart.js";

const AUTO = "condor:quick-google";

// Ingreso. La app necesita una cuenta: cualquier cuenta de Google sirve para practicar; con el correo del colegio
// además aparecen las tareas y clases. `gate`: es la primera pantalla de /app/ (sin «Volver», con enlace al inicio).
export default function Login({ onBack, gate = false }) {
  const auth = useAuth();
  const [code, setCode] = useState(() => (typeof window !== "undefined" ? (pendingInviter(), pendingTeacherCode()) : ""));
  const [name, setName] = useState("");
  // A teacher without a code opens their own trial workspace (migration 0038): only the school and the city.
  const [school, setSchool] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState(auth.error ? `No se pudo leer tu perfil: ${auth.error}` : null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState(() => Boolean(code) || (typeof window !== "undefined" && window.location.hash.startsWith("#docente")));
  // Teachers go to Google with their code (if they have one) and come back to their panel.
  const googleAsTeacher = () => {
    rememberTeacherCode(code);
    if (!window.location.hash.startsWith("#docente")) window.location.hash = "#docente/hoy";
    noteAuthStart();
    return auth.signInWithGoogle();
  };

  // A student's first visit needs nothing more than the Google account: the name comes from Google, no form.
  // Teachers (a code or #docente) still see the form. If it fails, the form is shown with the reason.
  const autoClaim = useRef(false);
  const [autoFailed, setAutoFailed] = useState(false);
  useEffect(() => {
    if (auth.status !== "needs-profile" || teacher || autoClaim.current) return;
    autoClaim.current = true;
    auth.claim({ teacherCode: "", fullName: "" }).then(() => onBack?.(), (err) => { setError(claimMessage(err)); setAutoFailed(true); });
  }, [auth.status, teacher]); // eslint-disable-line react-hooks/exhaustive-deps

  // From the landing's «Practicar gratis»: Google opens right away (once per tab, and never in Facebook's own browser,
  // where Google refuses to sign in).
  const embedded = typeof window !== "undefined" ? inAppBrowser() : null;
  const [quick] = useState(() => gate && readQuickStart());
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (!quick || embedded || teacher || auth.status !== "signed-out" || authLanding?.error || authLanding?.arrived) return;
    try { if (sessionStorage.getItem(AUTO) === "1") return; sessionStorage.setItem(AUTO, "1"); } catch { return; }
    setGoing(true);
    noteAuthStart();
    Promise.resolve(auth.signInWithGoogle()).catch(() => setGoing(false));
  }, [quick, auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (teacher && !code.trim()) await auth.startTrial({ schoolName: school, city, fullName: name });
      else await auth.claim({ teacherCode: code, fullName: name });
      onBack?.();
    } catch (err) {
      setError(claimMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "needs-profile" && !teacher && !autoFailed) {
    return <section className="profile signin-gate"><div className="card login-card"><Mascot size={64} /><strong>Preparando tu cuenta…</strong></div></section>;
  }

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
            <>
              {!code.trim() && (
                <>
                  <label className="field">
                    <span className="label">Tu colegio</span>
                    <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} autoComplete="organization" placeholder="Ej.: IE San José" required />
                  </label>
                  <label className="field">
                    <span className="label">Ciudad o municipio</span>
                    <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} autoComplete="address-level2" placeholder="Ej.: Pasto" />
                  </label>
                </>
              )}
              <label className="field">
                <span className="label">Código de docente (si tu colegio te dio uno)</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CND-0000-0000-0000-0000" />
              </label>
              <span className="caption">{code.trim() ? "Entras al espacio de tu colegio con este código." : "Sin código creas tu propio espacio de prueba y luego invitas a tus colegas."}</span>
            </>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="report-actions">
            <button type="button" className="secondary" onClick={auth.signOut}>Salir</button>
            <button type="submit" className="primary" disabled={busy || (teacher && !code.trim() && !school.trim())}>{busy ? "Entrando…" : teacher && !code.trim() ? "Crear mi espacio docente" : "Continuar"}</button>
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
        {!teacher && embedded ? (
          <OpenOutside embedded={embedded} />
        ) : !teacher ? (
          <>
            <strong>{going ? "Te llevamos a Google…" : "Practica gratis con tu cuenta de Google"}</strong>
            <span className="caption">Un toque y empiezas con tu primera pregunta. Tu avance queda guardado. Si tu colegio usa Cóndor, entra con el correo del colegio.</span>
            <button type="button" className="primary big" onClick={() => { noteAuthStart(); auth.signInWithGoogle(); }}>Continuar con Google</button>
            {microsoftEnabled && <button type="button" className="secondary big" onClick={() => { noteAuthStart(); auth.signInWithMicrosoft(); }}>Continuar con Microsoft</button>}
          </>
        ) : (
          <>
            <strong>Crea tu espacio docente</strong>
            <span className="caption">Entra con tu Google y en un minuto tienes tus cursos, el banco de preguntas y tus primeros simulacros.</span>
            <label className="field login-code">
              <span className="label">¿Tu colegio te dio un código? (opcional)</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CND-0000-0000-0000-0000" />
            </label>
            <button type="button" className="primary big" onClick={googleAsTeacher}>Continuar con Google</button>
            <span className="caption">¿Ya entraste antes como estudiante con esa cuenta? No pasa nada: tu cuenta pasa a ser de docente.</span>
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

// Facebook's (or Instagram's…) own browser: Google does not let anyone sign in there. One button opens the page in
// Chrome on Android; on iPhone the steps to open it in Safari; on both, copy the link.
function OpenOutside({ embedded }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?empezar=1` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { window.prompt("Copia este enlace", url); }
  };
  return (
    <div className="open-outside">
      <strong>Ábrelo en tu navegador para entrar</strong>
      <span className="caption">Estás dentro de {embedded.app}. Google no deja iniciar sesión aquí, así que abre Cóndor en {embedded.ios ? "Safari" : "Chrome"} (es un solo paso).</span>
      {embedded.android && <a className="primary big btn-like" href={chromeIntent(url)}>Abrir en Chrome</a>}
      {!embedded.android && (
        <ol className="open-steps">
          <li>Toca <b>···</b> (arriba o abajo a la derecha).</li>
          <li>Elige <b>Abrir en el navegador</b> o <b>Abrir en Safari</b>.</li>
        </ol>
      )}
      <button type="button" className="secondary big" onClick={copy}>{copied ? "Enlace copiado: pégalo en tu navegador" : "Copiar el enlace"}</button>
    </div>
  );
}
