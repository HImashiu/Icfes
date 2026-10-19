import { Fragment, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { usePoll } from "../lib/poll.js";
import { awayNow, eventsByStudent, KIND_LABEL, summarizeProctor } from "../lib/proctor.js";
import { assignmentState } from "../lib/assignments.js";
import { fmtDuration } from "../lib/studentRun.js";

const clock = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", second: "2-digit" });

// Vigilancia de un examen: quién está fuera de la pestaña ahora, y por estudiante cuántas veces salió, cuánto tiempo
// estuvo fuera, cuántas veces el cursor salió de la ventana y cuánto estuvo inactivo. Se actualiza solo mientras está abierta.
export default function ProctorPanel({ api, assignment, members }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const live = assignmentState(assignment) === "active";
  usePoll(async () => setRows(await api.proctorEvents(assignment.id)), 8000, live);
  usePoll(async () => setRows(await api.proctorEvents(assignment.id)), 1e9, !live);

  const names = useMemo(() => new Map(members.filter((m) => m.profile_id).map((m) => [m.profile_id, m.full_name || m.email])), [members]);
  const per = useMemo(() => [...eventsByStudent(rows)].map(([id, list]) => ({ id, list, ...summarizeProctor(list) })).sort((a, b) => b.leaves - a.leaves), [rows]);
  const away = live ? awayNow(rows) : [];

  return (
    <div className="card t-card proctor-panel">
      <div className="section-head"><strong><Icon name="shield" size={18} /> Vigilancia del examen</strong><span className="caption">{live ? "En vivo · se actualiza cada 8 s" : "Examen cerrado"}</span></div>
      {away.length > 0 && (
        <div className="notice proctor-alert" role="alert">
          <strong>Fuera de la pestaña ahora:</strong> {away.map((a) => `${names.get(a.id) ?? "Estudiante"} (desde ${clock(a.since)})`).join(" · ")}
        </div>
      )}
      {per.length === 0 ? <p className="caption">Todavía no hay salidas registradas. Se registra cuando un estudiante cambia de pestaña o ventana, y cuando el cursor sale del examen.</p> : (
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Estudiante</th><th>Salidas</th><th>Tiempo fuera</th><th>Cursor fuera</th><th>Inactivo</th><th /></tr></thead>
            <tbody>
              {per.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td>{names.get(p.id) ?? "Estudiante"}</td><td>{p.leaves}</td><td>{fmtDuration(p.awaySec)}</td><td>{p.pointerOuts}</td><td>{fmtDuration(p.idleSec)}</td>
                    <td><button type="button" className="link" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Ocultar" : "Ver línea de tiempo"}</button></td>
                  </tr>
                  {open === p.id && (
                    <tr><td colSpan={6}>
                      <ul className="proctor-timeline">
                        {p.list.map((e) => <li key={e.id}><span className="muted">{clock(e.at)}</span> {KIND_LABEL[e.kind]}{e.secs != null ? ` · ${fmtDuration(e.secs)}` : ""}{e.question_key ? ` · pregunta ${e.question_key}` : ""}</li>)}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="caption">Es un aviso, no una prueba: una salida puede ser una notificación o un fallo de conexión. «Cursor fuera» y «Inactivo» solo cuentan cuando el cursor sale de la ventana o pasa un minuto sin tocar nada.</span>
    </div>
  );
}
