import { useEffect, useMemo, useState } from "react";
import { schoolSummary } from "../lib/analytics.js";
import { areaColor } from "../lib/brand.js";
import { hasGuardianAuth } from "../lib/consent.js";
import { CATEGORY_VERSION, cohortProjection, studentSummaries } from "../lib/students.js";
import { alertLabel, buildRoster, weeklySummary } from "../lib/workspace.js";
import { fmtDuration } from "../lib/studentRun.js";

// Horizontal bars for a share (0-100) per row. Colour only carries the area; the number is always written.
export function Bars({ rows, unit = " %" }) {
  return (
    <div className="d-bars">
      {rows.map((r) => (
        <div key={r.label} className="d-bar-row">
          <span className="d-bar-label">{r.label}</span>
          <span className="d-bar-track"><span style={{ width: `${Math.max(2, r.value ?? 0)}%`, background: r.color ?? "var(--accent)" }} /></span>
          <span className="d-bar-num">{r.value == null ? "—" : `${r.value}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

// Columns for a distribution (counts per bin).
export function Histogram({ bins, format = (b) => `${Math.round(b.from)}` }) {
  const max = Math.max(1, ...bins.map((b) => b.n));
  return (
    <div className="d-hist" role="img" aria-label={`Distribución: ${bins.map((b) => `${format(b)}: ${b.n}`).join(", ")}`}>
      {bins.map((b) => (
        <div key={b.from} className="d-hist-col">
          <span className="d-hist-n">{b.n || ""}</span>
          <span className="d-hist-bar" style={{ height: `${(b.n / max) * 100}%` }} />
          <span className="d-hist-x">{format(b)}</span>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ label, value, hint }) {
  return (
    <div className="card d-kpi">
      <span className="label">{label}</span>
      <strong className="display">{value ?? "—"}</strong>
      {hint && <span className="caption">{hint}</span>}
    </div>
  );
}

// Panel de resumen. La coordinación ve todo el colegio; un docente ve sus cursos (la base de datos ya filtra).
export default function Dashboard({ api, profile, guard, ws, onOpenCourse, onReinforce, onOpenStudent, onOpenQueue }) {
  const [data, setData] = useState(null);
  const [guardian, setGuardian] = useState(true);
  useEffect(() => {
    guard(async () => {
      const [courses, members, assignments, attempts] = await Promise.all([api.listCourses(), api.allMembers(), api.listAssignments(), api.allAttempts()]);
      setData({ courses, members, assignments, attempts });
      if (profile.role === "school_admin") setGuardian(hasGuardianAuth(await api.schoolConsents()));
    });
  }, [api, guard, profile.role]);
  const s = useMemo(() => (data ? schoolSummary(data) : null), [data]);
  const people = useMemo(() => (data ? studentSummaries(data.members, data.attempts) : []), [data]);
  // One entry per student (by email) with alerts, status and follow-up: the same data as the Estudiantes workspace.
  const roster = useMemo(() => (data ? buildRoster({ members: data.members, assignments: data.assignments, attempts: data.attempts, ws: ws ?? {} }) : []), [data, ws]);
  const warn = useMemo(() => roster.filter((e) => e.severity > 0).sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name, "es")), [roster]);
  const week = useMemo(() => (data ? weeklySummary(roster, data.assignments) : null), [roster, data]);
  // The grade 11 cohort when courses say so; otherwise every course.
  const cohort = useMemo(() => {
    if (!data) return null;
    const g11 = new Set(data.courses.filter((c) => String(c.grade) === "11").map((c) => c.id));
    const pool = g11.size ? people.filter((p) => g11.has(p.courseId)) : people;
    return { ...cohortProjection(pool), label: g11.size ? "grado 11" : "el colegio" };
  }, [data, people]);
  const courseName = (id) => data?.courses.find((c) => c.id === id)?.name ?? "";
  const admin = profile.role === "school_admin";

  if (!s) return <p className="caption">Cargando resumen…</p>;
  if (data.courses.length === 0) {
    return (
      <>
        <header className="t-head"><div><h1>Resumen</h1></div></header>
        <div className="card t-card"><strong>Empieza creando un curso</strong><span className="caption">En “Cursos y estudiantes” crea el primer curso y pega la lista de sus estudiantes. Cuando asignes trabajo y entreguen, aquí verás los resultados.</span></div>
      </>
    );
  }
  const weakest = s.areas[0];
  return (
    <>
      {admin && !guardian && <p className="notice">Falta registrar la autorización de acudientes del colegio (Ajustes) antes de que entren estudiantes menores de edad.</p>}
      <header className="t-head">
        <div><h1>{admin ? "Resumen del colegio" : "Resumen de mis cursos"}</h1><span className="caption">Puntajes según la clave preliminar, no oficial.</span></div>
        <button type="button" className="secondary no-print" onClick={() => window.print()}>Imprimir o guardar PDF</button>
      </header>
      <div className="d-kpis">
        <Kpi label="Estudiantes" value={s.students} hint={`${s.joined} ya ingresaron`} />
        <Kpi label="Docentes" value={s.teachers} />
        <Kpi label="Asignaciones" value={s.assignments} hint={`${s.deliveries} entregas`} />
        <Kpi label="Promedio" value={s.avgPct == null ? null : `${s.avgPct} %`} hint="de aciertos en lo entregado" />
      </div>

      <div className="d-two">
        <div className="card t-card">
          <strong>Resultados por área</strong>
          {s.areas.length === 0 ? <span className="caption">Aún no hay entregas.</span> : (
            <>
              <Bars rows={s.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
              {weakest && <span className="caption">Lo más bajo: {weakest.name} ({weakest.pct} %). Es un buen tema para la próxima asignación.</span>}
            </>
          )}
        </div>
        <div className="card t-card">
          <strong>Banda global estimada</strong>
          {s.bandCount === 0 ? (
            <span className="caption">Aparece cuando los estudiantes entreguen un simulacro con tiempo. Las prácticas y tareas no entran a la banda.</span>
          ) : (
            <>
              <span className="caption">{s.bandCount} simulacros · promedio {s.bandMean} / 500</span>
              <BandHistogram bins={s.bandHistogram} />
              <span className="caption">Estimación con curva provisional: sirve para comparar, no es el puntaje oficial.</span>
            </>
          )}
        </div>
      </div>

      <div className="d-two">
        <div className="card t-card">
          <strong>Categoría proyectada · {cohort.label}</strong>
          {cohort.category ? (
            <>
              <strong className="display">Categoría {cohort.category.id}</strong>
              <span className="caption">
                Si la prueba real fuera hoy, con el último simulacro con tiempo de {cohort.n} {cohort.n === 1 ? "estudiante" : "estudiantes"} (promedio {cohort.mean} de 500).
                {cohort.category.next ? ` Faltan ${cohort.category.toNext} puntos para la categoría ${cohort.category.next}.` : " Ya está en la categoría más alta."}
              </span>
              <span className="caption">Umbrales de ejemplo ({CATEGORY_VERSION}), no los oficiales: el ICFES publica los reales cada año.</span>
            </>
          ) : <span className="caption">Aparece cuando los estudiantes entreguen un simulacro con tiempo.</span>}
        </div>
        <div className="card t-card">
          <div className="section-head"><strong>Alertas</strong>{onOpenStudent && warn.length > 0 && <span className="caption">Toca un nombre para ver su perfil</span>}</div>
          {warn.length === 0 ? <span className="caption">Nadie en riesgo por ahora.</span> : (
            <ul className="b-list">
              {warn.slice(0, 8).map((e) => {
                const a = e.alerts.find((x) => x.kind !== "up");
                return (
                  <li key={e.key} className="b-row" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="b-body">
                      <strong>{onOpenStudent ? <button type="button" className="link ws-inline" onClick={() => onOpenStudent(e.email)}>{e.name}</button> : e.name} <span className="muted">· {e.courseIds.map(courseName).join(", ")}</span> <span className="ws-alert">{alertLabel(a.kind)}</span>{e.followUp && <span className="ws-follow">En seguimiento</span>}</strong>
                      <span className="b-text">{a.reason}{a.area ? ` Más bajo: ${a.area}.` : ""}</span>
                      <span className="caption">{a.action}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {warn.length > 8 && <span className="caption">Y {warn.length - 8} más en Estudiantes (filtro «Necesitan atención»).</span>}
          <div className="report-actions no-print">
            {onOpenQueue && warn.length > 0 && <button type="button" className="secondary" onClick={onOpenQueue}>Ir a la cola de seguimiento</button>}
            {onReinforce && warn.some((e) => e.alerts.some((a) => a.kind === "drop" || a.kind === "low")) && <button type="button" className="secondary" onClick={onReinforce}>Preparar planes de refuerzo</button>}
          </div>
        </div>
      </div>

      {week && <WeekCard week={week} courseName={courseName} onOpenStudent={onOpenStudent} onOpenQueue={onOpenQueue} />}

      <div className="card t-card">
        <strong>Cursos</strong>
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Curso</th><th>Estudiantes</th><th>Ingresaron</th><th>Asignaciones</th><th>Entregas</th><th>Promedio</th><th>Más bajo</th></tr></thead>
            <tbody>
              {s.perCourse.map((c) => (
                <tr key={c.id}>
                  <td><button type="button" className="link" onClick={() => onOpenCourse?.(c.id)}>{c.name}{c.grade ? ` · ${c.grade}` : ""}</button></td>
                  <td>{c.students}</td>
                  <td>{c.students ? `${Math.round((c.joined / c.students) * 100)} %` : "—"}</td>
                  <td>{c.assignments}</td>
                  <td>{c.completion == null ? "—" : `${c.completion} %`}</td>
                  <td>{c.avgPct == null ? "—" : `${c.avgPct} %`}</td>
                  <td>{c.areas[0] ? `${c.areas[0].name} (${c.areas[0].pct} %)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="caption">“Entregas” es lo entregado sobre lo esperado (estudiantes × asignaciones).</span>
      </div>
    </>
  );
}

function BandHistogram({ bins }) {
  return <Histogram bins={bins} format={(b) => `${Math.round(b.from)}`} />;
}

const NameList = ({ list, onOpenStudent }) => list.slice(0, 6).map((e, i) => (
  <span key={e.key}>{i > 0 && ", "}{onOpenStudent ? <button type="button" className="link ws-inline" onClick={() => onOpenStudent(e.email)}>{e.name}</button> : e.name}</span>
));

// Resumen semanal: lo que pasó de lunes a hoy frente a la semana pasada, y lo que vence esta semana.
function WeekCard({ week, courseName, onOpenStudent, onOpenQueue }) {
  const from = new Date(week.from).toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const diff = week.deliveries - week.prevDeliveries;
  return (
    <div className="card t-card ws-week">
      <div className="section-head"><strong>Resumen de la semana</strong><span className="caption">Desde el lunes {from}</span></div>
      <div className="d-kpis">
        <Kpi label="Entregas" value={String(week.deliveries)} hint={diff === 0 ? "igual que la semana pasada" : `${diff > 0 ? "+" : ""}${diff} frente a la semana pasada`} />
        <Kpi label="Estudiantes activos" value={`${week.active}/${week.students}`} hint="entregaron algo esta semana" />
        <Kpi label="Promedio" value={week.avgPct == null ? null : `${week.avgPct} %`} hint={week.avgPct == null ? "sin entregas aún" : week.prevAvgPct == null ? undefined : `semana pasada: ${week.prevAvgPct} %`} />
        {week.secs > 0 && <Kpi label="Tiempo de práctica" value={fmtDuration(week.secs)} />}
      </div>
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
