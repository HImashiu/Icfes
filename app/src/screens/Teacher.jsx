import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { SAMPLE_TEACHER } from "../data/mock.js";

// Sample calendar: October 2026, Monday first, today is the 10th.
const CAL_YEAR = 2026;
const CAL_MONTH = 9;
const CAL_TODAY = 10;
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function MonthCalendar() {
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
        <span className="caption">Datos de muestra</span>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <span key={d} className="cal-wd" role="columnheader">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} className="cal-cell empty" aria-hidden="true" />;
          const ev = SAMPLE_TEACHER.events.find((e) => e.day === day);
          const cls = ["cal-cell", day === CAL_TODAY ? "today" : "", ev ? "event" : ""].join(" ").trim();
          return (
            <span key={day} className={cls} role="gridcell" aria-label={ev ? `${day}, entrega de ${ev.area}` : String(day)} style={ev ? { "--ev": areaColor(ev.area) } : undefined}>
              {day}
            </span>
          );
        })}
      </div>
      <ul className="cal-legend">
        {SAMPLE_TEACHER.events.map((e) => (
          <li key={e.day}><span className="dot" style={{ background: areaColor(e.area) }} />{e.day} · {e.area}</li>
        ))}
      </ul>
    </section>
  );
}
import { areaColor, fmtInt } from "../lib/brand.js";

const NAV = ["Panel", "Cursos y estudiantes", "Asignaciones", "Banco de preguntas", "Reportes", "Ajustes"];

// Panel docente: a sidebar, KPIs, assignments and students needing support. All values are sample data.
export default function Teacher({ onExit }) {
  const [tab, setTab] = useState("Activas");
  return (
    <div className="teacher">
      <aside className="t-side" aria-label="Navegación docente">
        <strong className="t-logo">Cóndor</strong>
        <nav>
          {NAV.map((item, i) => (
            <button key={item} type="button" className={i === 0 ? "t-nav active" : "t-nav"} aria-current={i === 0 ? "page" : undefined}>
              {item}
            </button>
          ))}
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
          <button type="button" className="primary">Nueva asignación</button>
        </header>

        <div className="kpi-grid">
          {SAMPLE_TEACHER.kpis.map((k) => (
            <div key={k.label} className="card kpi">
              <span className="label">{k.label}</span>
              <strong className="display">{k.value}</strong>
            </div>
          ))}
        </div>

        <div className="t-cols">
          <div className="t-col">
          <div className="card t-card">
            <div className="section-head">
              <strong>Asignaciones</strong>
              <div className="segmented small" role="tablist">
                {["Activas", "Programadas", "Cerradas"].map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "seg active" : "seg"} onClick={() => setTab(t)}>{t}</button>
                ))}
              </div>
            </div>
            {SAMPLE_TEACHER.assignments.map((a) => (
              <div key={a.title} className="assign-row">
                <span className="assign-tile" style={{ background: areaColor(a.title.includes("Matemáticas") ? "Matemáticas" : a.title.includes("Inglés") ? "Inglés" : "Ciencias naturales") }} />
                <div className="assign-body">
                  <strong>{a.title}</strong>
                  <span className="caption">Entrega {a.due}</span>
                  <div className="progress thin"><span style={{ width: `${a.done}%` }} /></div>
                </div>
                <span className="muted">{a.done} %</span>
              </div>
            ))}
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
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.area}</td>
                      <td>{fmtInt(s.score)} %</td>
                      <td>{s.streak} días</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
          <div className="t-col t-col-side">
            <MonthCalendar />
          </div>
        </div>
      </main>
    </div>
  );
}
