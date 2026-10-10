import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { SAMPLE_ROSTER, SAMPLE_TEACHER, TEACHER_AREAS } from "../data/mock.js";
import { addAssignment, loadAssignments } from "../lib/local.js";
import { areaColor, fmtInt } from "../lib/brand.js";

// Sample calendar and "today": October 2026, Monday first, today is the 10th (matches the header).
const CAL_YEAR = 2026;
const CAL_MONTH = 9;
const CAL_TODAY = 10;
const TODAY_ISO = "2026-10-10";
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const COURSES = ["11-A", "11-B"];
const FULL_EXAM = "Examen completo";

const NAV = [
  { label: "Panel", section: "panel" },
  { label: "Cursos y estudiantes", section: "students" },
  { label: "Asignaciones", section: "assign" },
  { label: "Banco de preguntas", section: "bank" },
  { label: "Reportes", section: "areas" },
  { label: "Ajustes", section: "settings" },
];

const shortDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
// Activas: started and still open. Programadas: nobody has started it yet. Cerradas: past the due date.
const statusOf = (a) => (a.dueIso < TODAY_ISO ? "Cerradas" : a.done === 0 ? "Programadas" : "Activas");

// Month grid with the due dates of sample and saved assignments (October 2026).
function MonthCalendar({ events }) {
  const offset = (new Date(CAL_YEAR, CAL_MONTH, 1).getDay() + 6) % 7;
  const days = new Date(CAL_YEAR, CAL_MONTH + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const monthName = new Date(CAL_YEAR, CAL_MONTH, 1).toLocaleDateString("es-CO", { month: "long" });
  const title = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${CAL_YEAR}`;
  return (
    <section className="card t-card calendar" aria-label="Calendario de entregas">
      <div className="section-head">
        <strong className="cal-title">{title}</strong>
        <span className="caption">Entregas</span>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="cal-wd" role="columnheader">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} className="cal-cell empty" aria-hidden="true" />;
          const ev = events.find((e) => e.day === day);
          const cls = ["cal-cell", day === CAL_TODAY ? "today" : "", ev ? "event" : ""].join(" ").trim();
          return (
            <span key={day} className={cls} role="gridcell" aria-label={ev ? `${day}, entrega: ${ev.title}` : String(day)} style={ev ? { "--ev": areaColor(ev.area) } : undefined}>
              {day}
            </span>
          );
        })}
      </div>
      <ul className="cal-legend">
        {events.map((e, i) => (
          <li key={`${e.day}-${i}`}><span className="dot" style={{ background: areaColor(e.area) }} />{e.day} · {e.title}</li>
        ))}
      </ul>
    </section>
  );
}

// The assignment form: a simulacro, a course and a due date. Saved in this browser.
function AssignForm({ onSaved, onCancel }) {
  const [scope, setScope] = useState(FULL_EXAM);
  const [course, setCourse] = useState(COURSES[0]);
  const [due, setDue] = useState(addDays(TODAY_ISO, 7));
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (!due || due < TODAY_ISO) {
      setError("La fecha de entrega debe ser hoy o después.");
      return;
    }
    const area = scope === FULL_EXAM ? null : scope;
    const title = area ? `Práctica · ${area}` : "Simulacro completo";
    const saved = addAssignment({ title, scope, area, course, due, done: 0 });
    if (!saved) {
      setError("No se pudo guardar en este navegador.");
      return;
    }
    onSaved(`Asignado a ${course} para el ${shortDate(due)}.`);
  };
  return (
    <form className="card t-card assign-form" onSubmit={submit}>
      <strong>Nueva asignación</strong>
      <label className="field">
        <span className="label">Simulacro</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option>{FULL_EXAM}</option>
          {TEACHER_AREAS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">Curso</span>
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          {COURSES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">Fecha de entrega</span>
        <input type="date" value={due} min={TODAY_ISO} onChange={(e) => setDue(e.target.value)} />
      </label>
      {error && <p className="notice error">{error}</p>}
      <div className="report-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary">Asignar</button>
      </div>
    </form>
  );
}

// Panel docente: a sidebar with real sections (sample data), KPIs, assignments, students and results by area.
export default function Teacher({ onExit }) {
  const [section, setSection] = useState("panel");
  const [tab, setTab] = useState("Activas");
  const [stored, setStored] = useState(() => loadAssignments());
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState(null);
  const [student, setStudent] = useState(null);
  const [course, setCourse] = useState("Todos");

  const assignments = useMemo(
    () => [
      ...SAMPLE_TEACHER.assignments.map((a) => ({ ...a, dueIso: a.dueIso })),
      ...stored.map((a) => ({ title: a.title, course: a.course, dueIso: a.due, done: 0, area: a.area })),
    ],
    [stored],
  );
  const events = useMemo(
    () => [
      ...SAMPLE_TEACHER.events.map((e) => ({ day: e.day, area: e.area, title: e.area })),
      ...stored
        .filter((a) => a.due.startsWith("2026-10-"))
        .map((a) => ({ day: Number(a.due.slice(8)), area: a.area ?? "Examen completo", title: a.title })),
    ],
    [stored],
  );
  const visible = assignments.filter((a) => statusOf(a) === tab);
  const open = assignments.filter((a) => statusOf(a) === "Activas" || statusOf(a) === "Programadas").length;

  const roster = course === "Todos" ? SAMPLE_ROSTER : SAMPLE_ROSTER.filter((s) => s.course === course);
  const average = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
  const classAverage = (area) => average(roster.map((s) => s.mastery[area]));
  const chosen = SAMPLE_ROSTER.find((s) => s.name === student) ?? null;
  const meanStreak = SAMPLE_ROSTER.reduce((sum, s) => sum + s.streak, 0) / SAMPLE_ROSTER.length;

  const openStudent = (name) => {
    setStudent(name);
    setSection("students");
  };
  const saved = (text) => {
    setStored(loadAssignments());
    setComposing(false);
    setMessage(text);
    setTab("Programadas");
  };

  return (
    <div className="teacher">
      <aside className="t-side" aria-label="Navegación docente">
        <strong className="t-logo">Cóndor</strong>
        <nav>
          {NAV.map((item) => {
            const active = section === item.section;
            return (
              <button
                key={item.label}
                type="button"
                className={active ? "t-nav active" : "t-nav"}
                aria-current={active ? "page" : undefined}
                onClick={() => setSection(item.section)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="card plan">
          <span className="label">Plan del colegio</span>
          <span className="caption">Demostración · sin cuentas reales</span>
        </div>
        <button type="button" className="link" onClick={onExit}>Volver a la app de estudiante</button>
      </aside>

      <main className="t-main">
        <header className="t-head">
          <div>
            <h1>Buenos días, docente</h1>
            <span className="caption">Sábado 10 de octubre · Datos de muestra</span>
          </div>
          <button type="button" className="primary" onClick={() => { setSection("assign"); setComposing(true); setMessage(null); }}>Nueva asignación</button>
        </header>

        {section === "panel" && (
          <>
            <div className="kpi-grid">
              <div className="card kpi"><span className="label">Estudiantes (muestra)</span><strong className="display">{fmtInt(SAMPLE_ROSTER.length)}</strong></div>
              <div className="card kpi"><span className="label">Promedio del curso</span><strong className="display">{average(SAMPLE_ROSTER.map((s) => s.last))} %</strong></div>
              <div className="card kpi"><span className="label">Asignaciones abiertas</span><strong className="display">{open}</strong></div>
              <div className="card kpi"><span className="label">Racha media</span><strong className="display">{meanStreak.toFixed(1).replace(".", ",")} días</strong></div>
            </div>

            <div className="t-cols">
              <div className="t-col">
                <div className="card t-card">
                  <div className="section-head">
                    <strong>Asignaciones</strong>
                    <Tabs value={tab} onChange={setTab} />
                  </div>
                  <AssignList items={visible} />
                </div>

                <div className="card t-card">
                  <strong>Estudiantes que necesitan apoyo</strong>
                  <div className="table-wrap">
                    <table className="t-table">
                      <thead>
                        <tr><th>Estudiante</th><th>Área</th><th>Puntaje</th><th>Racha</th></tr>
                      </thead>
                      <tbody>
                        {SAMPLE_TEACHER.atRisk.map((s) => (
                          <tr key={s.name} className="t-row-link" onClick={() => openStudent(s.name)}>
                            <td>{s.name}</td>
                            <td>{s.area}</td>
                            <td>{fmtInt(s.score)} %</td>
                            <td>{s.streak} {s.streak === 1 ? "día" : "días"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="t-col t-col-side">
                <MonthCalendar events={events} />
              </div>
            </div>
          </>
        )}

        {section === "assign" && (
          <div className="t-cols">
            <div className="t-col">
              {composing ? (
                <AssignForm onSaved={saved} onCancel={() => setComposing(false)} />
              ) : (
                <button type="button" className="secondary" onClick={() => setComposing(true)}>Nueva asignación</button>
              )}
              {message && <p className="notice">{message}</p>}
              <div className="card t-card">
                <div className="section-head">
                  <strong>Asignaciones</strong>
                  <Tabs value={tab} onChange={setTab} />
                </div>
                <AssignList items={visible} />
              </div>
            </div>
            <div className="t-col t-col-side">
              <MonthCalendar events={events} />
            </div>
          </div>
        )}

        {section === "students" && (
          <div className="t-cols">
            <div className="t-col">
              <div className="card t-card">
                <div className="section-head">
                  <strong>Estudiantes</strong>
                  <CourseFilter value={course} onChange={setCourse} />
                </div>
                <div className="table-wrap">
                  <table className="t-table">
                    <thead>
                      <tr><th>Estudiante</th><th>Curso</th><th>Último simulacro</th><th>Racha</th><th>XP</th></tr>
                    </thead>
                    <tbody>
                      {roster.map((s) => (
                        <tr key={s.name} className={s.name === student ? "t-row-link selected" : "t-row-link"} onClick={() => setStudent(s.name)}>
                          <td>{s.name}</td>
                          <td>{s.course}</td>
                          <td>{s.last} %</td>
                          <td>{s.streak} {s.streak === 1 ? "día" : "días"}</td>
                          <td>{fmtInt(s.xp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="t-col t-col-side">
              {chosen ? (
                <div className="card t-card">
                  <span className="label">{chosen.name} · {chosen.course}</span>
                  <strong>Dominio por área</strong>
                  {TEACHER_AREAS.map((area) => (
                    <div key={area} className="area-row">
                      <div className="area-row-head">
                        <span><span className="dot" style={{ background: areaColor(area) }} /> {area}</span>
                        <span className="muted">{chosen.mastery[area]} %</span>
                      </div>
                      <div className="progress thin"><span style={{ width: `${chosen.mastery[area]}%`, background: areaColor(area) }} /></div>
                    </div>
                  ))}
                  <span className="caption">Puntaje del último simulacro: {chosen.last} %. Datos de muestra.</span>
                </div>
              ) : (
                <div className="card t-card"><span className="caption">Toca un estudiante para ver su resultado por área.</span></div>
              )}
            </div>
          </div>
        )}

        {section === "areas" && (
          <div className="card t-card">
            <div className="section-head">
              <strong>Resultados por área</strong>
              <CourseFilter value={course} onChange={setCourse} />
            </div>
            <div className="table-wrap">
              <table className="t-table area-table">
                <thead>
                  <tr><th>Estudiante</th>{TEACHER_AREAS.map((a) => <th key={a}>{a}</th>)}</tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.name} className="t-row-link" onClick={() => openStudent(s.name)}>
                      <td>{s.name}</td>
                      {TEACHER_AREAS.map((a) => (
                        <td key={a}><span className="area-cell" style={{ "--cell": areaColor(a), "--pct": `${s.mastery[a]}%` }}>{s.mastery[a]} %</span></td>
                      ))}
                    </tr>
                  ))}
                  <tr className="avg-row">
                    <td>Promedio del curso</td>
                    {TEACHER_AREAS.map((a) => <td key={a}><strong>{classAverage(a)} %</strong></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <span className="caption">Datos de muestra. Toca un estudiante para ver su detalle.</span>
          </div>
        )}

        {(section === "bank" || section === "settings") && (
          <div className="card t-card"><span className="caption">Esta sección llegará con las cuentas de docentes. Por ahora, usa Panel, Cursos y estudiantes, Asignaciones y Reportes.</span></div>
        )}
      </main>
    </div>
  );
}

function Tabs({ value, onChange }) {
  return (
    <div className="segmented small" role="tablist">
      {["Activas", "Programadas", "Cerradas"].map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} className={value === t ? "seg active" : "seg"} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

function CourseFilter({ value, onChange }) {
  return (
    <select className="course-filter" aria-label="Curso" value={value} onChange={(e) => onChange(e.target.value)}>
      {["Todos", ...COURSES].map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}

function AssignList({ items }) {
  if (items.length === 0) return <p className="caption">No hay asignaciones en esta pestaña.</p>;
  return items.map((a) => (
    <div key={`${a.title}-${a.dueIso}-${a.course}`} className="assign-row">
      <span className="assign-tile" style={{ background: areaColor(a.area ?? "") }} />
      <div className="assign-body">
        <strong>{a.title}</strong>
        <span className="caption">{a.course} · Entrega {shortDate(a.dueIso)}</span>
        <div className="progress thin"><span style={{ width: `${a.done}%` }} /></div>
      </div>
      <span className="muted">{a.done} %</span>
    </div>
  ));
}
