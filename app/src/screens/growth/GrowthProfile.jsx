import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select } from "../../components/Controls.jsx";
import { familyPayload, reportUrl, whatsappLink } from "../../lib/family.js";
import { loadGoal } from "../../lib/goal.js";
import { loadHistory } from "../../lib/local.js";
import { icsCalendar, practiceReminders } from "../../lib/growth/tools-core.js";
import {
  canInstall, certificateLink, certificateProgress, createMyFamilyReport, disablePush, enablePush, inviteLink, inviteMessage,
  isInstalled, isIos, issueCertificate, myReferralCode, partnerStats, myReferrals, mySchoolName, onInstallChange, promptInstall, pushStatus,
  pushSupported, setMySchoolName, teacherMessage, whatsapp,
} from "../../lib/growth/app.js";
import { track } from "../../lib/growth/events.js";
import "./growth.css";

// Growth cards on the student's Perfil (docs/growth/LEDGER.md):
//   F8  Invita a tus amigos: personal link and code, extra daily questions for both when the friend practices
//   F9  Recomiéndale Cóndor a tu profe: a ready WhatsApp message with the teacher trial link
//   F11 Parche de estudio: link to the study groups
//   F14 Cartel con tu QR: printable poster with the personal link
//   F48 Mi colegio: the student's school (anonymous demand signal for school sales)
//   F33 Recordatorios en tu calendario (.ics, any phone) and F34 notifications (Web Push)
//   F39 Certificado de práctica, verifiable at /verificar/
//   F40 Enlace para tu familia, for students without a school account
//   F32 Instala Cóndor
const DAYS = [["0,2,4", "Lunes, miércoles y viernes"], ["0,1,2,3,4", "De lunes a viernes"], ["1,3,5", "Martes, jueves y sábado"], ["0,1,2,3,4,5,6", "Todos los días"]];
const HOURS = [["6", "6:00 a. m."], ["12", "12:00 m."], ["16", "4:00 p. m."], ["18", "6:00 p. m."], ["19", "7:00 p. m."], ["20", "8:00 p. m."], ["21", "9:00 p. m."]];

export default function GrowthProfile({ profile }) {
  const student = profile?.role === "student";
  const firstName = String(profile?.full_name ?? "").split(" ")[0];
  const [code, setCode] = useState(null);
  const [refs, setRefs] = useState(null);
  const [copied, setCopied] = useState(false);
  const [school, setSchool] = useState({ name: "", city: "" });
  const [schoolMsg, setSchoolMsg] = useState("");
  const [days, setDays] = useState("0,2,4");
  const [hour, setHour] = useState("18");
  const [push, setPush] = useState("off");
  const [pushMsg, setPushMsg] = useState("");
  const [cert, setCert] = useState(null);
  const [certMsg, setCertMsg] = useState("");
  const [family, setFamily] = useState(null);
  const [familyMsg, setFamilyMsg] = useState("");
  const [installable, setInstallable] = useState(canInstall());
  const [partner, setPartner] = useState([]);

  useEffect(() => {
    if (!profile) return;
    myReferralCode().then((c) => { setCode(c); return myReferrals(); }).then(setRefs).catch(() => null);
    mySchoolName().then((s) => s && setSchool({ name: s.name ?? "", city: s.city ?? "" }));
    if (student) certificateProgress().then(setCert).catch(() => null);
    if (pushSupported()) pushStatus().then(setPush).catch(() => null);
    partnerStats().then((r) => setPartner(r ?? []), () => null);
  }, [profile, student]);
  useEffect(() => onInstallChange(setInstallable), []);

  const history = useMemo(() => loadHistory(), []);
  if (!profile) return null;

  const link = code ? inviteLink(code) : "";
  const share = (via) => { try { localStorage.setItem("condor:invited", "1"); } catch { /* blocked */ } track(`share:${via}`, {}); };
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); share("copiar"); setTimeout(() => setCopied(false), 2000); });

  const saveSchool = async () => {
    try {
      const r = await setMySchoolName(school.name, school.city);
      setSchoolMsg(r === "ok" ? "Guardado. Gracias: así sabemos a qué colegios llevar Cóndor." : "Escribe el nombre completo del colegio.");
      if (r === "ok") track("school:named", {});
    } catch { setSchoolMsg("No pudimos guardarlo ahora."); }
  };

  const calendar = () => {
    const goal = loadGoal();
    const until = goal?.examDate && /^\d{4}-\d{2}-\d{2}$/.test(goal.examDate) ? goal.examDate : null;
    const hh = String(hour).padStart(2, "0");
    const events = practiceReminders({ days: days.split(",").map(Number), time: `${hh}:00`, minutes: 20, until, url: `${window.location.origin}/app/?empezar=1&fuente=calendario` });
    if (until) events.push({ uid: `examen-${until}`, date: until, title: "Examen Saber 11", description: "Lleva tu documento y la citación. ¡Éxitos!" });
    const blob = new Blob([icsCalendar("Practicar ICFES · Cóndor", events)], { type: "text/calendar;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "recordatorios-icfes.ics" });
    document.body.appendChild(a); a.click(); a.remove();
    track("ics:app", { d: days });
  };
  const togglePush = async () => {
    setPushMsg("");
    try {
      if (push === "on") { await disablePush(); setPush("off"); return; }
      await enablePush(Number(hour));
      setPush("on");
      setPushMsg("Listo: te avisamos a esa hora los días que no hayas practicado.");
    } catch (e) {
      setPushMsg(e.message === "denied" ? "El navegador bloqueó las notificaciones. Actívalas en los ajustes del sitio." : e.message === "no_key" ? "Las notificaciones aún no están activas. Usa el calendario mientras tanto." : "No pudimos activarlas en este navegador.");
    }
  };

  const makeCert = async () => {
    setCertMsg("");
    try {
      const r = await issueCertificate(profile.full_name || firstName || "Estudiante");
      if (r?.code) { setCert({ ...cert, code: r.code }); track("cert:issue", {}); }
      else setCertMsg("Todavía no: mira lo que falta.");
    } catch { setCertMsg("No pudimos crearlo ahora."); }
  };
  const makeFamily = async () => {
    setFamilyMsg("");
    try {
      const attempts = history.filter((h) => h.keyed && h.perArea?.length).map((h) => ({
        submitted_at: new Date(h.at).toISOString(), mode: h.mode,
        score: { keyed: true, perArea: h.perArea.map((a) => ({ name: a.name, correct: a.correct, total: a.answered })) },
      }));
      if (!attempts.length) { setFamilyMsg("Haz al menos una práctica primero: el informe muestra tu avance."); return; }
      const token = await createMyFamilyReport(familyPayload({ studentName: profile.full_name || firstName, attempts }));
      setFamily(token);
      track("family:link", {});
    } catch { setFamilyMsg("No pudimos crearlo ahora. Intenta más tarde."); }
  };

  const need = cert?.need ?? { answered: 150, areas: 3, days: 5 };
  const certReady = cert && cert.answered >= need.answered && cert.areas >= need.areas && cert.days >= need.days;

  return (
    <div className="gr-profile">
      {partner.map((p) => (
        <div key={p.code} className="card sp-card">
          <div className="section-head"><span className="label">Panel de aliado · {p.label ?? p.code}</span><span className="caption">Tu enlace: condoricfes.com/r/{p.code}</span></div>
          <div className="gr-kpis">
            <span><b>{p.signups}</b><span className="caption">cuentas con tu código</span></span>
            <span><b>{p.activated}</b><span className="caption">ya practican</span></span>
            <span><b>{p.answers_30d}</b><span className="caption">preguntas en 30 días</span></span>
          </div>
          <div className="gr-row" style={{ marginTop: 10 }}><a className="secondary" href={`../cartel/?ref=${p.code}`} target="_blank" rel="noreferrer">Cartel con tu QR</a><a className="link" href="../diagnostico-icfes/curso/" target="_blank" rel="noreferrer">Diagnóstico para tu grupo</a></div>
        </div>
      ))}
      {code && (
        <div className="card sp-card gr-invite">
          <div className="section-head"><span className="label">Invita a tus amigos</span><span className="caption">Practicar acompañado rinde más</span></div>
          <p className="caption">Cuando un amigo entra con tu enlace y responde 5 preguntas, los dos tienen <b>10 preguntas extra al día</b>. Si invitas a un profe y se une, son 20.</p>
          <div className="gr-code"><code>{link.replace(/^https?:\/\//, "")}</code><button type="button" className="secondary small" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button></div>
          <div className="gr-row">
            <a className="primary" href={whatsapp(inviteMessage(code, firstName))} target="_blank" rel="noreferrer" onClick={() => share("whatsapp-app")}>Invitar por WhatsApp</a>
            <a className="secondary" href={`../cartel/?ref=${code}&de=${encodeURIComponent(firstName)}`} target="_blank" rel="noreferrer" onClick={() => share("cartel")}>Cartel con mi QR</a>
          </div>
          {refs && (
            <div className="gr-kpis">
              <span><b>{refs.invited ?? 0}</b><span className="caption">entraron</span></span>
              <span><b>{refs.activated ?? 0}</b><span className="caption">ya practican</span></span>
              <span><b>+{refs.bonus ?? 0}</b><span className="caption">preguntas extra hoy</span></span>
            </div>
          )}
          {refs?.invited_by && <span className="caption">Llegaste invitado por {refs.invited_by}.</span>}
        </div>
      )}

      {code && student && (
        <div className="card sp-card">
          <div className="section-head"><span className="label">Recomiéndale Cóndor a tu profe</span></div>
          <p className="caption">Con Cóndor tu profe puede hacer un diagnóstico del curso, mandar práctica por prueba y ver quién necesita ayuda. Mándale el mensaje listo:</p>
          <div className="gr-row">
            <a className="secondary" href={whatsapp(teacherMessage(code))} target="_blank" rel="noreferrer" onClick={() => share("profe")}><Icon name="chat" /> Enviar a mi profe</a>
            <a className="link" href="#parche">Arma un parche de estudio</a>
          </div>
        </div>
      )}

      {student && (
        <div className="card sp-card">
          <div className="section-head"><span className="label">Recordatorios para practicar</span><span className="caption">Pocos minutos, seguido</span></div>
          <div className="gr-grid2">
            <label><span className="caption">Días</span><Select value={days} onChange={setDays} options={DAYS.map(([value, label]) => ({ value, label }))} /></label>
            <label><span className="caption">Hora</span><Select value={hour} onChange={setHour} options={HOURS.map(([value, label]) => ({ value, label }))} /></label>
          </div>
          <div className="gr-row">
            <button type="button" className="secondary" onClick={calendar}><Icon name="clock" /> Agregar a mi calendario</button>
            {pushSupported() && push !== "unsupported" && <button type="button" className={push === "on" ? "secondary" : "primary"} onClick={togglePush}><Icon name="bell" /> {push === "on" ? "Quitar notificaciones" : "Avisarme en el celular"}</button>}
          </div>
          {pushMsg && <span className="caption" role="status">{pushMsg}</span>}
        </div>
      )}

      {!isInstalled() && (installable || isIos()) && (
        <div className="card sp-card gr-install">
          <div><b>Instala Cóndor en tu celular</b><span className="caption">{installable ? "Ábrelo como una app, sin buscar la página." : "En el iPhone: toca Compartir y luego «Agregar a inicio»."}</span></div>
          {installable && <button type="button" className="primary" onClick={promptInstall}>Instalar</button>}
        </div>
      )}

      {student && (
        <div className="card sp-card">
          <div className="section-head"><span className="label">Mi colegio</span><span className="caption">Opcional</span></div>
          <div className="gr-grid2">
            <label><span className="caption">Colegio</span><input value={school.name} maxLength={100} onChange={(e) => setSchool({ ...school, name: e.target.value })} placeholder="IE San José" /></label>
            <label><span className="caption">Ciudad o municipio</span><input value={school.city} maxLength={60} onChange={(e) => setSchool({ ...school, city: e.target.value })} /></label>
          </div>
          <div className="gr-row"><button type="button" className="secondary" disabled={school.name.trim().length < 3} onClick={saveSchool}>Guardar</button>{schoolMsg && <span className="caption">{schoolMsg}</span>}</div>
        </div>
      )}

      {student && cert && (
        <div className="card sp-card">
          <div className="section-head"><span className="label">Certificado de práctica</span><span className="caption">Para tu hoja de vida o tu colegio</span></div>
          {cert.code ? (
            <>
              <p className="caption">Tu certificado dice cuánto has practicado. Cualquiera puede verificarlo con su código.</p>
              <div className="gr-code"><code>{cert.code.toUpperCase()}</code><a className="secondary small" href={certificateLink(cert.code)} target="_blank" rel="noreferrer">Ver</a></div>
              <a className="link" href={whatsapp(`Mi certificado de práctica para el ICFES en Cóndor: ${certificateLink(cert.code)}`)} target="_blank" rel="noreferrer">Compartir</a>
            </>
          ) : (
            <>
              <ul className="gr-checks">
                <li className={cert.answered >= need.answered ? "done" : ""}>{Math.min(cert.answered, need.answered)} de {need.answered} preguntas</li>
                <li className={cert.areas >= need.areas ? "done" : ""}>{Math.min(cert.areas, need.areas)} de {need.areas} pruebas distintas</li>
                <li className={cert.days >= need.days ? "done" : ""}>{Math.min(cert.days, need.days)} de {need.days} días de práctica</li>
              </ul>
              <button type="button" className={certReady ? "primary" : "secondary"} disabled={!certReady} onClick={makeCert}>Crear mi certificado</button>
              {certMsg && <span className="caption">{certMsg}</span>}
            </>
          )}
        </div>
      )}

      {student && !profile.school_id && (
        <div className="card sp-card">
          <div className="section-head"><span className="label">Enlace para tu familia</span></div>
          <p className="caption">Un resumen de tu avance (sin tu correo) para que tu familia lo vea sin crear cuenta.</p>
          {family ? (
            <div className="gr-row">
              <a className="primary" href={whatsappLink(reportUrl(family), firstName)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
              <a className="secondary" href={reportUrl(family)} target="_blank" rel="noreferrer">Ver el informe</a>
            </div>
          ) : <button type="button" className="secondary" onClick={makeFamily}>Crear el enlace</button>}
          {familyMsg && <span className="caption">{familyMsg}</span>}
        </div>
      )}
    </div>
  );
}
