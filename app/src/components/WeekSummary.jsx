import { Kpi } from "../screens/Dashboard.jsx";
import { fmtDuration } from "../lib/studentRun.js";

const NameList = ({ list, onOpenStudent }) => list.slice(0, 6).map((e, i) => (
  <span key={e.key}>{i > 0 && ", "}{onOpenStudent ? <button type="button" className="link ws-inline" onClick={() => onOpenStudent(e.email)}>{e.name}</button> : e.name}</span>
));

// Resumen semanal: lo que pasó de lunes a hoy frente a la semana pasada, y lo que vence esta semana.
// compact: without the numbers row, for Hoy, whose cards above already give the week's deliveries and average.
export default function WeekSummary({ week, courseName, onOpenStudent, onOpenQueue, compact = false }) {
  const from = new Date(week.from).toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const diff = week.deliveries - week.prevDeliveries;
  return (
    <div className="card t-card ws-week">
      <div className="section-head"><strong>Resumen de la semana</strong><span className="caption">Desde el lunes {from}</span></div>
      {compact ? (
        <span className="caption">{week.deliveries} {week.deliveries === 1 ? "entrega" : "entregas"} ({diff === 0 ? "igual que" : `${diff > 0 ? "+" : ""}${diff} frente a`} la semana pasada) · {week.active} de {week.students} estudiantes activos{week.secs > 0 ? ` · ${fmtDuration(week.secs)} de práctica` : ""}{week.avgPct != null ? ` · promedio ${week.avgPct} %${week.prevAvgPct != null ? ` (antes ${week.prevAvgPct} %)` : ""}` : ""}.</span>
      ) : (
      <div className="d-kpis">
        <Kpi label="Entregas" value={String(week.deliveries)} hint={diff === 0 ? "igual que la semana pasada" : `${diff > 0 ? "+" : ""}${diff} frente a la semana pasada`} />
        <Kpi label="Estudiantes activos" value={`${week.active}/${week.students}`} hint="entregaron algo esta semana" />
        <Kpi label="Promedio" value={week.avgPct == null ? null : `${week.avgPct} %`} hint={week.avgPct == null ? "sin entregas aún" : week.prevAvgPct == null ? undefined : `semana pasada: ${week.prevAvgPct} %`} />
        {week.secs > 0 && <Kpi label="Tiempo de práctica" value={fmtDuration(week.secs)} />}
      </div>
      )}
      {week.due.length > 0 && (
        <>
          <span className="label">Vencen esta semana</span>
          <ul className="b-list">
            {week.due.map((d) => (
              <li key={d.id} className="ws-due-row">
                <span><strong>{d.title}</strong> <span className="muted">· {courseName(d.courseId)} · {new Date(d.due).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })}</span></span>
                <span className="d-bar-track"><span style={{ width: `${d.expected ? Math.max(2, (d.done / d.expected) * 100) : 0}%`, background: "var(--accent)" }} /></span>
                <span className="d-bar-num">{d.done}/{d.expected}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="ws-week-notes">
        {week.quiet.length > 0 && <li><strong>{week.quiet.length}</strong> con trabajo asignado no han entregado nada esta semana{week.quiet.length <= 6 && <>: <NameList list={week.quiet} onOpenStudent={onOpenStudent} /></>}.</li>}
        {week.improved.length > 0 && <li className="ws-up">Mejoraron: <NameList list={week.improved} onOpenStudent={onOpenStudent} />{week.improved.length > 6 ? ` y ${week.improved.length - 6} más` : ""}. ¡Cuéntaselo!</li>}
        {week.worried.length > 0 && <li>Bajaron o tienen promedio bajo: <NameList list={week.worried} onOpenStudent={onOpenStudent} />{week.worried.length > 6 ? ` y ${week.worried.length - 6} más` : ""}.</li>}
        {week.followUpsDue.length > 0 && <li><strong>{week.followUpsDue.length}</strong> seguimientos para esta semana. {onOpenQueue && <button type="button" className="link ws-inline" onClick={onOpenQueue}>Abrir la cola</button>}</li>}
        {week.deliveries === 0 && week.due.length === 0 && <li className="caption">Semana tranquila: nada entregado ni por vencer todavía.</li>}
      </ul>
    </div>
  );
}
