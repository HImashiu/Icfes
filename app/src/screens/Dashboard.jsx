import { useEffect, useMemo, useState } from "react";
import { schoolSummary } from "../lib/analytics.js";
import { areaColor } from "../lib/brand.js";
import { hasGuardianAuth } from "../lib/consent.js";
import { alerts as buildAlerts, CATEGORY_VERSION, cohortProjection, studentSummaries } from "../lib/students.js";

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
export default function Dashboard({ api, profile, guard, onOpenCourse, onReinforce }) {
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
  const warn = useMemo(() => buildAlerts(people), [people]);
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
          <strong>Alertas de la semana</strong>
          {warn.length === 0 ? <span className="caption">Nadie en riesgo por ahora.</span> : (
            <ul className="b-list">
              {warn.slice(0, 8).map((a) => (
                <li key={`${a.courseId}-${a.email}`} className="b-row" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="b-body">
                    <strong>{a.name} <span className="muted">· {courseName(a.courseId)}</span></strong>
                    <span className="b-text">{a.reason}{a.area ? ` Más bajo: ${a.area}.` : ""}</span>
                    <span className="caption">{a.action}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {warn.length > 8 && <span className="caption">Y {warn.length - 8} más.</span>}
          {onReinforce && warn.some((a) => a.kind === "drop" || a.kind === "low") && <div className="report-actions no-print"><button type="button" className="secondary" onClick={onReinforce}>Preparar planes de refuerzo</button></div>}
        </div>
      </div>

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
