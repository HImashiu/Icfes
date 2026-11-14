import { useEffect, useState } from "react";
import Icon from "../../components/Icon.jsx";

// Hoy: «Invita a otros profes» (migrations 0038 and 0051). A teacher shares a personal link with teachers of any
// school; as those colleagues' students start practicing, the teacher goes up a level (Aliado, Embajador, Fundador)
// and gets higher limits and recognition. In a self-serve workspace there is also the workspace link, so a colleague
// of the same school lands in the same space. Nothing here talks about prices, trials or selling to the school.
// Mounted with one line in Today.jsx; shows nothing in the example data or when the server has neither call.
const SITE = "https://condoricfes.com/";
const local = (origin) => /localhost|127\.0\.0\.1|workers\.dev/.test(origin || "");
const here = () => (typeof window !== "undefined" ? window.location.origin : SITE);

// Same workspace (same school): joins the colleague to this teacher's space and records who invited them.
export function inviteLink(code, inviterId, origin = here()) {
  const base = local(origin) ? origin.replace(/\/$/, "") : SITE.replace(/\/$/, "");
  const q = new URLSearchParams({ codigo: code, fuente: "invita-docente" });
  if (inviterId) q.set("de", inviterId);
  return `${base}/app/?${q.toString()}#docente/hoy`;
}

// Any school: the teacher page with the personal code; the site keeps it until the colleague signs in.
export function referralLink(refCode, origin = here()) {
  const base = local(origin) ? `${origin.replace(/\/$/, "")}/app/?` : `${SITE}prueba-docente/?`;
  return `${base}${new URLSearchParams({ ref: refCode, via: "docente", fuente: "referido-docente" }).toString()}`;
}

export function inviteText(link) {
  return `Hola. Estoy usando Cóndor para preparar el ICFES con mis cursos: armo simulacros con preguntas de exámenes pasados del ICFES, los hago en línea o en papel y veo qué competencias están flojas. Con este enlace entras a nuestro espacio del colegio y ves solo tus cursos: ${link}`;
}

export function referralText(link) {
  return `Hola. Estoy usando Cóndor para preparar el ICFES con mis cursos: armo simulacros con preguntas de exámenes pasados del ICFES, los hago en línea o en papel y veo qué competencias están flojas. Entras con tu Google en un minuto: ${link}`;
}

export const LEVELS = ["Sin nivel todavía", "Aliado", "Embajador", "Fundador"];

// What the next level gives, in the teacher's words. Booklets only matter in a workspace with a booklet cap.
export function rewardText(level, rewards = {}, trial = false) {
  if (level === 1) return "una insignia y una constancia de docente aliado de Cóndor";
  const q = rewards.student_questions?.[level] ?? 0;
  const b = rewards.trial_booklets?.[level] ?? 0;
  const parts = [];
  if (trial && b) parts.push(`${b} cuadernillos más para tu espacio`);
  if (q) parts.push(`${q} preguntas más al día para tus estudiantes`);
  if (level === 3) parts.push("tu nombre en la página de docentes fundadores");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0] || "";
}

// Share of the way to the next level: the smaller of the two (colleagues and students).
export function progress(r) {
  if (!r?.next) return 1;
  const a = r.next.colleagues ? Math.min(1, (r.colleagues ?? 0) / r.next.colleagues) : 1;
  const b = r.next.students ? Math.min(1, (r.students ?? 0) / r.next.students) : 1;
  return Math.min(a, b);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function constanciaHtml({ name, school, level, since, colleagues, students }) {
  const date = since ? new Date(since).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia Cóndor</title><style>
body{font-family:Georgia,serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#F6F3EA;color:#0D110F}
.c{width:min(720px,90vw);border:3px solid #2B5F2E;padding:56px 48px;background:#fff;text-align:center}
h1{font-family:Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#2B5F2E;margin:0 0 24px;font-size:22px}
.n{font-size:30px;margin:12px 0}.l{font-family:Arial,sans-serif;font-weight:700;color:#377B3A}
p{font-size:17px;line-height:1.55}.f{margin-top:40px;font-family:Arial,sans-serif;font-size:13px;color:#555}
@media print{body{background:#fff}.c{border-width:2px}}</style></head><body><div class="c">
<h1>Constancia</h1><p>Cóndor hace constar que</p><div class="n">${esc(name)}</div>
<p>${school ? `docente de ${esc(school)}, ` : ""}es <span class="l">Docente ${esc(LEVELS[level])}</span> de Cóndor${date ? ` desde el ${esc(date)}` : ""}.
Invitó a ${colleagues} ${colleagues === 1 ? "colega" : "colegas"} cuyos estudiantes (${students}) preparan el Saber 11 con Cóndor.</p>
<div class="f">Equipo Cóndor · condoricfes.com</div></div><script>setTimeout(function(){print()},300)</script></body></html>`;
}

// «Ahora no» hides the card for a week on this device.
const HIDE_KEY = (id) => `condor:spread-hidden:${id}`;
const hiddenUntil = (id) => { try { return Number(localStorage.getItem(HIDE_KEY(id)) || 0); } catch { return 0; } };

const wa = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const mail = (subject, body) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export default function TeacherSpread({ api, profile }) {
  const [trial, setTrial] = useState(null);
  const [refs, setRefs] = useState(null);
  const [copied, setCopied] = useState("");
  const [hidden, setHidden] = useState(() => hiddenUntil(profile?.id) > Date.now());
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api?.myTrial?.()).then((t) => alive && setTrial(t ?? null), () => {});
    Promise.resolve().then(() => api?.myTeacherReferrals?.()).then((r) => alive && setRefs(r ?? null), () => {});
    return () => { alive = false; };
  }, [api]);
  const sameSchool = trial?.code ? inviteLink(trial.code, profile?.id) : null;
  const personal = refs?.code ? referralLink(refs.code) : null;
  if ((!sameSchool && !personal) || hidden) return null;
  const later = () => { try { localStorage.setItem(HIDE_KEY(profile?.id), String(Date.now() + 7 * 864e5)); } catch { /* storage blocked */ } setHidden(true); };
  const copy = async (link, which) => {
    try { await navigator.clipboard.writeText(link); setCopied(which); setTimeout(() => setCopied(""), 2500); }
    catch { window.prompt?.("Copia este enlace", link); }
  };
  const level = refs?.level ?? 0;
  const school = String(trial?.school_name || "").split(",")[0];
  const pct = Math.round(progress(refs) * 100);
  const printConstancia = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(constanciaHtml({ name: profile?.full_name || "", school, level, since: refs?.reached_at?.[String(level)], colleagues: refs?.colleagues ?? 0, students: refs?.students ?? 0 }));
    w.document.close();
  };
  const main = personal || sameSchool;
  const mainText = personal ? referralText(personal) : inviteText(sameSchool);

  return (
    <section className="card td-card ts-spread" data-tour="invitar">
      <div className="section-head">
        <h2>Invita a otros profes</h2>
        {refs && <span className={`ts-level ts-level-${level}`}>{level ? <><Icon name="flag" size={14} /> Docente {LEVELS[level]}</> : LEVELS[0]}</span>}
        <button type="button" className="link ts-later" onClick={later}>Ahora no</button>
      </div>
      {refs ? (
        <>
          <p className="caption">Cuando los estudiantes de los profes que invitas empiezan a practicar, subes de nivel.</p>
          {refs.next ? (
            <div className="ts-progress">
              <div className="ts-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
              <span className="caption">
                {refs.colleagues} de {refs.next.colleagues} {refs.next.colleagues === 1 ? "colega" : "colegas"} · {refs.students} de {refs.next.students} estudiantes activos para {LEVELS[refs.next.level]}.
                {" "}En {LEVELS[refs.next.level]}: {rewardText(refs.next.level, refs.rewards, !!trial?.code)}.
              </span>
            </div>
          ) : (
            <p className="caption">Llegaste al nivel más alto. Gracias por traer a tantos profes.</p>
          )}
        </>
      ) : (
        <p className="caption">Los docentes de tu colegio entran a este mismo espacio con su Google. Cada uno ve sus cursos, y el banco y el control de preguntas repetidas quedan compartidos.</p>
      )}
      <div className="report-actions ts-row">
        <a className="primary btn-like" href={wa(mainText)} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={18} /> Invitar por WhatsApp</a>
        <a className="secondary btn-like" href={mail("Te invito a Cóndor (preparación ICFES)", mainText)}>Por correo</a>
        <button type="button" className="secondary" onClick={() => copy(main, "main")}>{copied === "main" ? "Enlace copiado" : "Copiar enlace"}</button>
        {level >= 1 && <button type="button" className="secondary" onClick={printConstancia}><Icon name="print" size={18} /> Constancia</button>}
      </div>
      {personal && sameSchool && (
        <p className="caption ts-same">
          ¿Es de tu mismo colegio? Con el enlace de tu espacio entra directo{school ? ` a ${school}` : ""}:{" "}
          <a className="link" href={wa(inviteText(sameSchool))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          {" · "}
          <button type="button" className="link" onClick={() => copy(sameSchool, "same")}>{copied === "same" ? "copiado" : "copiar"}</button>
        </p>
      )}
      {refs?.list?.length > 0 && (
        <details className="ts-list">
          <summary className="caption">{refs.invited} {refs.invited === 1 ? "profe invitado" : "profes invitados"}</summary>
          <ul>{refs.list.map((c, i) => <li key={i}><span>{c.name || "Profe"}</span><span className="caption">{c.students} {c.students === 1 ? "estudiante activo" : "estudiantes activos"}</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
