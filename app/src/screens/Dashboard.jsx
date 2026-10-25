import { useEffect, useMemo, useState } from "react";
import { schoolSummary } from "../lib/analytics.js";
import { areaColor } from "../lib/brand.js";
import { hasGuardianAuth } from "../lib/consent.js";
import { CATEGORY_VERSION, cohortProjection, studentSummaries } from "../lib/students.js";
import { alertLabel, buildRoster, weeklySummary } from "../lib/workspace.js";
import { fmtDuration } from "../lib/studentRun.js";
import Icon from "../components/Icon.jsx";
import { areaOf, areaShort, groupOf } from "../lib/teaching.js";

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
  const people = useMemo(() => (data ? studentSummaries(data.members, data.attempts, data.assignments) : []), [data]);
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
  // A student's curso(s) ("11C"), not the list of every class they are in.
  const groupsOf = (ids) => [...new Set(ids.map((id) => data?.courses.find((c) => c.id === id)).filter(Boolean).map((c) => groupOf(c).name))].join(", ");
  const admin = profile.role === "school_admin";
  // One row per curso (11 A), its subject classes as links. Its students are the same in every subject, so they count once.
  const cursos = useMemo(() => {
    const map = new Map();
    for (const c of s?.perCourse ?? []) {
      const course = data.courses.find((x) => x.id === c.id) ?? c;
      const g = groupOf(course);
      if (!map.has(g.key)) map.set(g.key, { key: g.key, name: g.name, classes: [], students: 0, joined: 0, assignments: 0, done: 0, expected: 0, sum: 0, n: 0, lowest: null });
      const x = map.get(g.key);
      const area = areaOf(course);
      x.classes.push({ id: c.id, short: area ? areaShort(area) : course.subject === "Todas las áreas" ? "Simulacros" : course.name });
      x.students = Math.max(x.students, c.students);
      x.joined = Math.max(x.joined, c.joined);
      x.assignments += c.assignments;
      if (c.completion != null) { x.done += (c.completion / 100) * c.students * c.assignments; x.expected += c.students * c.assignments; }
      if (c.avgPct != null) { x.sum += c.avgPct * Math.max(1, c.assignments); x.n += Math.max(1, c.assignments); }
      const low = c.areas?.[0];
      if (low && (!x.lowest || low.pct < x.lowest.pct)) x.lowest = low;
    }
    const list = [...map.values()].map((x) => ({ ...x, completion: x.expected ? Math.round((x.done / x.expected) * 100) : null, avgPct: x.n ? Math.round(x.sum / x.n) : null }))
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    return { active: list.filter((x) => x.students > 0 || x.assignments > 0), empty: list.filter((x) => !x.students && !x.assignments) };
  }, [s, data]);

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

      <div className="d-cols">
        <div className="d-col">
        <div className="card t-card">
          <strong>Resultados por área</strong>
          {s.areas.length === 0 ? <span className="caption">Aún no hay entregas.</span> : (
            <>
              <Bars rows={s.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
              {weakest && <span className="caption">Lo más bajo: {weakest.name} ({weakest.pct} %). Es un buen tema para la próxima asignación.</span>}
            </>
          )}
        </div>
          {!(s.bandCount === 0 && !cohort.category) && (
          <div className="card t-card">
            <strong>Puntaje Saber 11 estimado</strong>
            {s.bandCount === 0 ? (
              <span className="caption">Aparece cuando los estudiantes entreguen un simulacro completo: Sesión 1 y Sesión 2 del mismo cuadernillo.</span>
            ) : (
              <>
                <span className="caption">{s.bandCount} estudiantes con simulacro completo · promedio {s.bandMean} / 500</span>
                <BandHistogram bins={s.bandHistogram} />
                <span className="caption">Estimación con curva provisional: sirve para comparar, no es el puntaje oficial.</span>
              </>
            )}
          </div>
          )}
        </div>
        <div className="d-col">
        <div className="card t-card d-alerts">
          <div className="section-head"><strong>Necesitan atención</strong><span className="caption">{warn.length ? `${warn.length} ${warn.length === 1 ? "estudiante" : "estudiantes"}` : "nadie por ahora"}</span></div>
          {warn.length === 0 ? <span className="caption">Nadie bajó ni tiene promedio bajo. Buen momento para subir la exigencia.</span> : (
            <>
              <ul className="d-alert-list">
                {warn.slice(0, 5).map((e) => {
                  const a = e.alerts.find((x) => x.kind !== "up");
                  return (
                    <li key={e.key}>
                      <span className="d-alert-who">
                        {onOpenStudent ? <button type="button" className="link ws-inline" onClick={() => onOpenStudent(e.email)}>{e.name}</button> : <strong>{e.name}</strong>}
                        <span className="caption">{groupsOf(e.courseIds)}{a.area ? ` · más bajo: ${areaShort(a.area)}` : ""}</span>
                      </span>
                      <span className="ws-alert" title={a.reason}>{alertLabel(a.kind)}</span>
                    </li>
                  );
                })}
              </ul>
              <span className="caption">Sugerencia: hablar con cada uno esta semana y asignarle un refuerzo en su área más baja.{warn.length > 5 ? ` Los otros ${warn.length - 5} están en Estudiantes › «Necesitan atención».` : ""}</span>
            </>
          )}
          <div className="report-actions no-print">
            {onOpenQueue && warn.length > 0 && <button type="button" className="secondary" onClick={onOpenQueue}>Cola de seguimiento</button>}
            {onReinforce && warn.some((e) => e.alerts.some((x) => x.kind === "drop" || x.kind === "low")) && <button type="button" className="secondary" onClick={onReinforce}>Planes de refuerzo</button>}
          </div>
        </div>
          {!(s.bandCount === 0 && !cohort.category) && (
          <div className="card t-card">
            <strong>Categoría proyectada · {cohort.label}</strong>
            {cohort.category ? (
              <>
                <strong className="display">Categoría {cohort.category.id}</strong>
                <span className="caption">
                  Si la prueba real fuera hoy, con el último simulacro completo (Sesión 1 + Sesión 2) de {cohort.n} {cohort.n === 1 ? "estudiante" : "estudiantes"} (promedio {cohort.mean} de 500).
                  {cohort.category.next ? ` Faltan ${cohort.category.toNext} puntos para la categoría ${cohort.category.next}.` : " Ya está en la categoría más alta."}
                </span>
                <span className="caption">Umbrales de ejemplo ({CATEGORY_VERSION}), no los oficiales: el ICFES publica los reales cada año.</span>
              </>
            ) : <span className="caption">Aparece cuando los estudiantes entreguen un simulacro con tiempo.</span>}
          </div>
          )}
        </div>
      </div>
      {s.bandCount === 0 && !cohort.category && (
        <div className="card t-card d-pending">
          <Icon name="clock" size={18} />
          <span><strong>Puntaje Saber 11 estimado y categoría proyectada</strong>
            <span className="caption">Aparecen cuando los estudiantes entreguen un simulacro completo: Sesión 1 y Sesión 2 del mismo cuadernillo, con tiempo. Las prácticas por área y las tareas no dan puntaje.</span></span>
        </div>
      )}

      {week && <WeekCard week={week} courseName={courseName} onOpenStudent={onOpenStudent} onOpenQueue={onOpenQueue} />}

      <div className="card t-card">
        <div className="section-head"><strong>Cursos</strong><span className="caption">Cada curso con sus materias; toca una materia para abrirla</span></div>
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Curso</th><th>Estudiantes</th><th>Ingresaron</th><th>Actividades</th><th>Entregas</th><th>Promedio</th><th>Más bajo</th></tr></thead>
            <tbody>
              {cursos.active.map((g) => (
                <tr key={g.key}>
                  <td><strong>{g.name}</strong>
                    <span className="d-subjects">{g.classes.map((c) => <button key={c.id} type="button" className="link" onClick={() => onOpenCourse?.(c.id)}>{c.short}</button>)}</span></td>
                  <td>{g.students}</td>
                  <td>{g.students ? `${Math.round((g.joined / g.students) * 100)} %` : "—"}</td>
                  <td>{g.assignments}</td>
                  <td>{g.completion == null ? "—" : `${g.completion} %`}</td>
                  <td>{g.avgPct == null ? "—" : `${g.avgPct} %`}</td>
                  <td>{g.lowest ? `${areaShort(g.lowest.name)} (${g.lowest.pct} %)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cursos.empty.length > 0 && <span className="caption">Sin estudiantes todavía: {cursos.empty.map((g) => g.name).join(", ")}. Importa su lista en Colegio › Cursos y materias.</span>}
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
