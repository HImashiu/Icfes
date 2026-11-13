import { useEffect, useState } from "react";
import Icon from "../../components/Icon.jsx";

// Hoy, trial schools only (migration 0038): bring colleagues into the same workspace with the school's code, and
// tell coordination what the teacher already did, so one teacher's trial can become the whole school.
// Mounted with one line in Today.jsx; shows nothing for a real (paying) school or in the example data.
const SITE = "https://condoricfes.com/";

export function inviteLink(code, inviterId, origin = typeof window !== "undefined" ? window.location.origin : SITE) {
  const base = /localhost|127\.0\.0\.1|workers\.dev/.test(origin) ? origin.replace(/\/$/, "") : SITE.replace(/\/$/, "");
  const q = new URLSearchParams({ codigo: code, fuente: "invita-docente" });
  if (inviterId) q.set("de", inviterId);
  return `${base}/app/?${q.toString()}#docente/hoy`;
}

export function inviteText(link) {
  return `Hola. Estoy usando Cóndor para preparar el ICFES con mis cursos: armo simulacros con preguntas de cuadernillos que publicó el ICFES, los asigno o los imprimo, y veo los resultados por área. Con este enlace entras a nuestro espacio del colegio y ves solo tus cursos: ${link}`;
}

export function coordinationText({ students = 0, activities = 0, avgPct = null, school = "" } = {}) {
  const did = students || activities
    ? ` Ya lo usé con ${students} ${students === 1 ? "estudiante" : "estudiantes"}${activities ? ` en ${activities} ${activities === 1 ? "actividad" : "actividades"}` : ""}${avgPct != null ? ` (promedio ${avgPct} %)` : ""}.`
    : "";
  return `Hola. Estoy probando Cóndor para preparar el Saber 11${school ? ` en ${school}` : ""}.${did} Arma simulacros con preguntas de cuadernillos del ICFES, se presentan en línea o en papel, y da los resultados por área y competencia en el formato del ICFES. Está gratis durante la demostración. ¿Lo miramos para todo el grado 11? ${SITE}preicfes-para-colegios/?fuente=docente-coordinacion`;
}

// «Ahora no» hides the card for a week on this device.
const HIDE_KEY = (id) => `condor:spread-hidden:${id}`;
const hiddenUntil = (id) => { try { return Number(localStorage.getItem(HIDE_KEY(id)) || 0); } catch { return 0; } };

const wa = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const mail = (subject, body) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export default function TeacherSpread({ api, profile, stats }) {
  const [trial, setTrial] = useState(null);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(() => hiddenUntil(profile?.id) > Date.now());
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api?.myTrial?.()).then((t) => alive && setTrial(t ?? null), () => {});
    return () => { alive = false; };
  }, [api]);
  if (!trial?.code || hidden) return null;
  const later = () => { try { localStorage.setItem(HIDE_KEY(profile?.id), String(Date.now() + 7 * 864e5)); } catch { /* storage blocked */ } setHidden(true); };

  const link = inviteLink(trial.code, profile?.id);
  const seats = Math.max(0, (trial.max_teachers ?? 0) - (trial.teachers ?? 0));
  const school = String(trial.school_name || "").split(",")[0];
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt?.("Copia este enlace", link); }
  };
  const toCoord = coordinationText({ ...stats, school });

  return (
    <section className="card td-card ts-spread" data-tour="invitar">
      <div className="section-head">
        <h2>Trae a tus colegas</h2>
        <span className="caption">{trial.teachers} de {trial.max_teachers} docentes en {school || "tu espacio"}{seats ? ` · quedan ${seats} cupos` : ""}</span>
        <button type="button" className="link ts-later" onClick={later}>Ahora no</button>
      </div>
      <p className="caption">Los docentes de tu colegio entran a este mismo espacio con su Google. Cada uno ve sus cursos, y el banco, los simulacros y el control de preguntas repetidas quedan compartidos.</p>
      <div className="report-actions ts-row">
        <a className="primary btn-like" href={wa(inviteText(link))} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} /> Invitar por WhatsApp</a>
        <a className="secondary btn-like" href={mail("Te invito a Cóndor (preparación ICFES)", inviteText(link))}>Por correo</a>
        <button type="button" className="secondary" onClick={copy}>{copied ? "Enlace copiado" : "Copiar enlace"}</button>
      </div>
      <div className="ts-coord">
        <div>
          <strong>Lleva Cóndor a todo el colegio</strong>
          <span className="caption">Envíale a coordinación un resumen de lo que ya hiciste. Con todo el grado 11 en Cóndor, coordinación ve los cursos y las áreas en un solo panel.</span>
        </div>
        <div className="report-actions ts-row">
          <a className="secondary btn-like" href={wa(toCoord)} target="_blank" rel="noopener noreferrer"><Icon name="school" size={18} /> Enviar a coordinación</a>
          <a className="link" href={`${SITE}preicfes-para-colegios/?fuente=docente-app`} target="_blank" rel="noopener noreferrer">Qué incluye para el colegio</a>
        </div>
      </div>
    </section>
  );
}
