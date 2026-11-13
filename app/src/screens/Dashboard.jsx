import { useEffect, useMemo, useState } from "react";
import { schoolSummary } from "../lib/analytics.js";
import { areaColor } from "../lib/brand.js";
import { hasGuardianAuth } from "../lib/consent.js";
import { cohortProjection, studentSummaries } from "../lib/students.js";
import Icon from "../components/Icon.jsx";
import Loading from "../components/Loading.jsx";

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

// Resultados › Resumen, first block: the Saber 11 estimate and the projected school category. The day-to-day overview
// (alerts, the week, each class, who needs support) lives in Hoy, and every student's detail in Estudiantes, so this
// screen does not repeat them. La coordinación ve todo el colegio; un docente ve sus cursos (la base de datos filtra).
export default function Dashboard({ api, profile, guard }) {
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
  // The grade 11 cohort when courses say so; otherwise every course.
  const cohort = useMemo(() => {
    if (!data) return null;
    const g11 = new Set(data.courses.filter((c) => String(c.grade) === "11").map((c) => c.id));
    const pool = g11.size ? people.filter((p) => g11.has(p.courseId)) : people;
    return { ...cohortProjection(pool), label: g11.size ? "grado 11" : "el colegio" };
  }, [data, people]);
  const admin = profile.role === "school_admin";

  if (!s) return <Loading label="Cargando resumen…" />;
  if (data.courses.length === 0) {
    return (
      <>
        <header className="t-head"><div><h1>Resumen</h1></div></header>
        <div className="card t-card"><strong>Empieza creando un curso</strong><span className="caption">En “Cursos y estudiantes” crea el primer curso y pega la lista de sus estudiantes. Cuando asignes trabajo y entreguen, aquí verás los resultados.</span></div>
      </>
    );
  }
  const pending = s.bandCount === 0 && !cohort.category;
  return (
    <>
      {admin && !guardian && <p className="notice">Falta registrar la autorización de acudientes del colegio (Ajustes) antes de que entren estudiantes menores de edad.</p>}
      <header className="t-head">
        <div><h1>{admin ? "Resumen del colegio" : "Resumen de mis cursos"}</h1><span className="caption">{s.students} estudiantes · {s.assignments} actividades · {s.deliveries} entregas · promedio {s.avgPct == null ? "—" : `${s.avgPct} %`}. Puntajes según la clave preliminar, no oficial.</span></div>
        <button type="button" className="secondary no-print" onClick={() => window.print()}>Imprimir o guardar PDF</button>
      </header>
      {pending ? (
        <div className="card t-card d-pending">
          <Icon name="clock" size={18} />
          <span><strong>Puntaje Saber 11 estimado y categoría proyectada</strong>
            <span className="caption">Aparecen cuando los estudiantes entreguen un simulacro completo: Sesión 1 y Sesión 2 del mismo cuadernillo, con tiempo. Las prácticas por área y las tareas no dan puntaje.</span></span>
        </div>
      ) : (
        <div className="d-cols">
          <div className="d-col">
            <div className="card t-card">
              <strong>Puntaje Saber 11 estimado</strong>
              {s.bandCount === 0 ? (
                <span className="caption">Aparece cuando los estudiantes entreguen un simulacro completo: Sesión 1 y Sesión 2 del mismo cuadernillo.</span>
              ) : (
                <>
                  <span className="caption">{s.bandCount} estudiantes con simulacro completo · promedio {s.bandMean} / 500{s.bandPercentile != null ? ` (percentil ${s.bandPercentile} del país)` : ""}</span>
                  <BandHistogram bins={s.bandHistogram} />
                  {s.levels?.length > 0 && <LevelTable rows={s.levels} />}
                  <span className="caption">Calculado como el ICFES con dificultad de preguntas estimada: sirve para orientar, no es el puntaje oficial.</span>
                </>
              )}
            </div>
          </div>
          <div className="d-col">
            <div className="card t-card">
              <strong>Categoría proyectada · {cohort.label}</strong>
              {cohort.category ? (
                <>
                  <strong className="display">Categoría {cohort.category.id}</strong>
                  <span className="caption">
                    Índice {String(cohort.category.index).replace(".", ",")} con el método del ICFES (Res. 677/2021): por prueba, el 80 % más alto de {cohort.n} estudiantes con simulacro completo, ponderado 3-3-3-3-1. Promedio global {cohort.mean}/500.
                    {cohort.category.next ? ` Para ${cohort.category.next}: unos ${cohort.category.toNext} ${cohort.category.toNext === 1 ? "punto" : "puntos"} más por prueba en promedio.` : " Ya está en la categoría más alta."}
                  </span>
                  <span className="caption">El ICFES usa los resultados de tres años; esto es una proyección con clave preliminar.</span>
                </>
              ) : <span className="caption">{cohort.n} de 9 estudiantes con simulacro completo: el ICFES clasifica con 9 o más.</span>}
            </div>
            {s.areas.length > 0 && (
              <div className="card t-card">
                <strong>Aciertos por área</strong>
                <Bars rows={s.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
                <span className="caption">En todo lo entregado: tareas, prácticas y simulacros.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Share of students per nivel de desempeño (MCER for Inglés) and the average per test, like the ICFES school report.
function LevelTable({ rows }) {
  return (
    <div className="s11-group">
      <span className="label">Niveles de desempeño por prueba</span>
      {rows.map((r) => (
        <div key={r.name} className="s11-group-row" style={{ "--c": areaColor(r.name) }}>
          <span className="s11-group-name">{r.name}<small> · promedio {r.mean}</small></span>
          <span className="s11-group-bar">
            {r.levels.map((l, i) => (
              <span key={l.label} title={`${l.label}: ${l.n} (${l.pct} %)`} style={{ flexGrow: Math.max(l.pct, 0.0001), background: `color-mix(in srgb, var(--c) ${Math.round(30 + (70 * i) / Math.max(1, r.levels.length - 1))}%, var(--surface-2))` }}>{l.pct >= 12 ? `${l.label.replace("Nivel ", "N")} ${l.pct} %` : ""}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function BandHistogram({ bins }) {
  return <Histogram bins={bins} format={(b) => `${Math.round(b.from)}`} />;
}

