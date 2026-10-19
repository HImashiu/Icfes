import { Fragment, useEffect, useMemo, useState } from "react";
import { Select } from "../components/Controls.jsx";
import { activityCsv, activityRows, summaryOf } from "../lib/activityReport.js";
import { fmtDuration } from "../lib/studentRun.js";
import { Kpi } from "./Dashboard.jsx";

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");
const FILTERS = [["all", "Todos"], ["late", "Con tareas sin entregar"], ["inactive", "Sin entregar nada"], ["flags", "Con salidas en exámenes"]];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// A student's results over time, against their own earlier work only.
function Progress({ items }) {
  const pts = items.filter((i) => i.pct != null);
  if (pts.length < 2) return <p className="caption">Con dos entregas o más se dibuja su progreso.</p>;
  const w = 320, h = 90, pad = 10;
  const x = (i) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (p) => h - pad - (p / 100) * (h - 2 * pad);
  return (
    <svg className="progress-line" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Resultados en el tiempo" width="100%" style={{ maxWidth: 420 }}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} />
      {pts.map((p, i) => <circle key={p.id} cx={x(i)} cy={y(p.pct)} r="4" fill="var(--accent)"><title>{`${p.title}: ${p.pct} %`}</title></circle>)}
    </svg>
  );
}

// Reportes: actividad y progreso de cada estudiante por espacio de clase, con exportación a CSV.
export default function TeacherReports({ api, courses, assignments, guard }) {
  const [data, setData] = useState(null);
  const [space, setSpace] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
      setData({ members, attempts });
    });
  }, [api, guard]);

  const nameOf = (id) => courses.find((c) => c.id === id)?.name ?? "";
  const rows = useMemo(() => {
    if (!data) return [];
    const ids = space ? [space] : courses.map((c) => c.id);
    return activityRows({ members: data.members.filter((m) => ids.includes(m.course_id)), assignments: assignments.filter((a) => ids.includes(a.course_id)), attempts: data.attempts })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data, space, courses, assignments]);
  const shown = rows.filter((r) => filter === "all" || (filter === "late" ? r.late > 0 : filter === "inactive" ? r.assigned > 0 && r.done === 0 : r.leaves > 0));
  const sum = summaryOf(rows);

  return (
    <>
      <header className="t-head"><div><h1>Reportes</h1><span className="caption">Actividad y progreso de cada estudiante. Cada uno se compara solo con su propio trabajo anterior.</span></div>
        <button type="button" className="secondary" disabled={rows.length === 0} onClick={() => download(`Actividad${space ? ` ${nameOf(space)}` : ""}.csv`, activityCsv(shown, nameOf))}>Exportar CSV</button></header>
      <div className="card t-card">
        <div className="bank-filters">
          <label className="field"><span className="label">Espacio de clase</span>
            <Select value={space} onChange={setSpace} aria-label="Espacio de clase"><option value="">Todos</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
          <label className="field"><span className="label">Mostrar</span>
            <Select value={filter} onChange={setFilter} aria-label="Filtro">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
        </div>
        {!data && <p className="caption">Cargando actividad…</p>}
        {data && (
          <div className="d-kpis">
            <Kpi label="Estudiantes" value={String(sum.students)} />
            <Kpi label="Entregas" value={sum.completion == null ? null : `${sum.completion} %`} hint={`${sum.done} de ${sum.assigned}`} />
            <Kpi label="Promedio" value={sum.avgPct == null ? null : `${sum.avgPct} %`} />
            <Kpi label="Sin entregar" value={String(sum.late)} hint={sum.inactive ? `${sum.inactive} no han entregado nada` : undefined} />
            {sum.leaves > 0 && <Kpi label="Salidas en exámenes" value={String(sum.leaves)} />}
          </div>
        )}
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Estudiante</th><th>Entregas</th><th>Promedio</th><th>Cambio</th><th>Tiempo total</th><th>Última entrega</th><th>Salidas</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{r.name}{!r.joined && <span className="caption"> · sin ingresar</span>}</td>
                    <td>{r.done}/{r.assigned}{r.late > 0 && <span className="badge pending"> {r.late} sin entregar</span>}</td>
                    <td>{r.avgPct == null ? "—" : `${r.avgPct} %`}</td>
                    <td>{r.trend == null ? "—" : `${r.trend > 0 ? "+" : ""}${r.trend} pts`}</td>
                    <td>{r.totalSec ? fmtDuration(r.totalSec) : "—"}</td>
                    <td>{shortDate(r.lastAt)}</td>
                    <td>{r.leaves || "—"}</td>
                    <td><button type="button" className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Cerrar" : "Ver detalle"}</button></td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={8}>
                      <Progress items={r.items} />
                      <ul className="proctor-timeline">
                        {r.items.map((i) => <li key={i.id}><strong>{i.title}</strong> · {i.done ? `${i.pct ?? "—"} % · ${shortDate(i.at)}${i.sec ? ` · ${fmtDuration(i.sec)}` : ""}${i.leaves ? ` · ${i.leaves} salidas` : ""}` : i.late ? "Sin entregar" : `Pendiente · entrega ${shortDate(i.due)}`}</li>)}
                        {r.items.length === 0 && <li className="caption">No tiene asignaciones todavía.</li>}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {data && shown.length === 0 && <tr><td colSpan={8} className="caption">No hay estudiantes con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <span className="caption">Puntajes según la clave preliminar, no oficial. Las salidas son avisos de los exámenes monitoreados.</span>
      </div>
    </>
  );
}
