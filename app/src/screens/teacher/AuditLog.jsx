import { useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select } from "../../components/Controls.jsx";
import { ago, buildFeed } from "../../lib/colegio.js";
import "./colegio.css";

const KINDS = [["", "Todo"], ["admin", "Coordinación"], ["activity", "Actividades"], ["class", "Clases"], ["question", "Preguntas"], ["lesson", "Para proyectar"]];
const ICON = { admin: "shield", activity: "book", class: "users", question: "pencil", lesson: "school" };
const dayOf = (ms) => new Date(ms).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

// Colegio › Quién hizo qué: permissions, invitations and settings changed by coordination, and the activities,
// classes and questions each teacher created, in one timeline.
export default function AuditLog({ audit, authorship, staff, courses, onOpenAssignment }) {
  const [kind, setKind] = useState("");
  const [who, setWho] = useState("");
  const [limit, setLimit] = useState(60);
  const feed = useMemo(() => buildFeed({ audit: audit ?? [], authorship, staff, courses }), [audit, authorship, staff, courses]);
  const list = feed.filter((e) => (!kind || e.kind === kind) && (!who || e.actor === who));
  const page = list.slice(0, limit);
  let lastDay = "";
  return (
    <section className="card t-card">
      <div className="cm2-head">
        <div><h2>Quién hizo qué</h2><span className="caption">{list.length} {list.length === 1 ? "registro" : "registros"}</span></div>
        <Select className="course-filter" value={who} onChange={setWho} aria-label="Persona">
          <option value="">Todo el equipo</option>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </Select>
      </div>
      <div className="cg-chips scroll" role="tablist" aria-label="Tipo">
        {KINDS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={kind === id} className={kind === id ? "cg-chip on" : "cg-chip"} onClick={() => setKind(id)}>{label}</button>)}
      </div>
      {audit === null && <p className="cg-help">Los cambios de permisos, invitaciones y ajustes se registran cuando se ejecute la migración 0020. Lo que cada docente crea ya aparece aquí.</p>}
      {list.length === 0 ? <p className="cg-empty">Nada registrado con estos filtros.</p> : (
        <div className="au-list">
          {page.map((e) => {
            const day = dayOf(e.at);
            const head = day !== lastDay;
            lastDay = day;
            return (
              <div key={e.id}>
                {head && <div className="au-day">{day}</div>}
                <div className="au-row">
                  <span className={e.kind === "admin" ? "au-icon admin" : "au-icon"}><Icon name={ICON[e.kind] ?? "shield"} size={15} /></span>
                  <span className="au-text"><strong>{e.who}</strong> {e.assignmentId && onOpenAssignment ? <button type="button" className="link" onClick={() => onOpenAssignment(e.assignmentId)}>{e.text}</button> : e.text}</span>
                  <span className="au-when">{new Date(e.at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })} · {ago(e.at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {list.length > limit && <button type="button" className="secondary" onClick={() => setLimit(limit + 100)}>Ver más</button>}
    </section>
  );
}
