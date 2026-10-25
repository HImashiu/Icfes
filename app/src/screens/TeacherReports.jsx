import { Fragment, useEffect, useMemo, useState } from "react";
import { Select } from "../components/Controls.jsx";
import { activityCsv, activityRows, summaryOf } from "../lib/activityReport.js";
import { fmtDuration } from "../lib/studentRun.js";
import { Kpi } from "./Dashboard.jsx";
import { questionsForAttempt } from "../lib/assignments.js";
import { formatValue, gradeMany, isAdjusted, itemFromRow, resolveModel } from "../lib/grading.js";
import { groupRows } from "../lib/resultsAnalysis.js";
import { groupOf } from "../lib/teaching.js";
import Icon from "../components/Icon.jsx";
import "./results.css";

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

export default function TeacherReports({ api, profile, courses, assignments, models = [], fetchExam, guard, onOpenStudent }) {
  const [data, setData] = useState(null);
  const [space, setSpace] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());

  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
      setData({ members, attempts });
    });
  }, [api, guard]);

  // The booklets behind the assignments, so partial credit and curves can be applied with the real questions and key.
  const [bundles, setBundles] = useState({});
  useEffect(() => {
    if (!fetchExam) return undefined;
    let live = true;
    Promise.all(assignments.filter((a) => a.status !== "draft").map(async (a) => {
      try { return [a.id, await fetchExam(a.exam_slug, a.question_keys)]; } catch { return null; }
    })).then((list) => { if (live) setBundles(Object.fromEntries(list.filter(Boolean))); });
    return () => { live = false; };
  }, [assignments, fetchExam]);

  const nameOf = (id) => courses.find((c) => c.id === id)?.name ?? "";
  const rows = useMemo(() => {
    if (!data) return [];
    const ids = space ? [space] : courses.map((c) => c.id);
    return activityRows({ members: data.members.filter((m) => ids.includes(m.course_id)), assignments: assignments.filter((a) => ids.includes(a.course_id)), attempts: data.attempts })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data, space, courses, assignments]);
  // Each assignment is graded with its own model (assignment, then class space, then school), the whole group at once.
  const graded = useMemo(() => {
    const byAssignment = new Map();
    for (const r of rows) for (const i of r.items) if (i.attempt) byAssignment.set(i.id, [...(byAssignment.get(i.id) ?? []), i]);
    const grade = new Map();
    for (const [id, list] of byAssignment) {
      const a = assignments.find((x) => x.id === id);
      const { model } = resolveModel(models, { assignmentId: id, courseId: a?.course_id, schoolId: profile?.school_id });
      const b = bundles[id];
      const ctx = b ? { questions: questionsForAttempt(b.exam, { scope: a.scope, keys: a.question_keys }), key: b.key } : {};
      const out = gradeMany(list.map((i) => itemFromRow(i.attempt)), model, ctx);
      list.forEach((i, k) => grade.set(i, { ...out[k], model }));
    }
    return rows.map((r) => {
      const items = r.items.map((i) => ({ ...i, grade: grade.get(i) ?? null }));
      const g = items.map((i) => i.grade).filter((x) => x?.ok);
      // An average only means something when every result uses the same model.
      const sig = new Set(g.map((x) => JSON.stringify([x.model.kind, x.model.scale, x.model.formula])));
      const avgGrade = g.length && sig.size === 1 ? g.reduce((n, x) => n + x.value, 0) / g.length : null;
      return { ...r, items, avgGrade, gradeModel: g[0]?.model ?? null };
    });
  }, [rows, models, bundles, assignments, profile]);
  const anyModel = graded.some((r) => r.gradeModel && (r.gradeModel.kind !== "percent" || isAdjusted(r.gradeModel)));
  const shown = graded.filter((r) => filter === "all" || (filter === "late" ? r.late > 0 : filter === "inactive" ? r.assigned > 0 && r.done === 0 : r.leaves > 0));
  const sum = summaryOf(rows);
  // Grouped by course (11 A, 11 B…), each folded until the teacher opens it.
  const groupName = (courseId) => { const c = courses.find((x) => x.id === courseId); return c ? groupOf(c).name : "Sin curso"; };
  const groups = groupRows(shown, (r) => groupName(r.courseId)).map((g) => ({ ...g, late: g.rows.filter((r) => r.late > 0).length }));
  const isOpen = (name) => groups.length === 1 || openGroups.has(name);
  const toggle = (name) => setOpenGroups((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const allOpen = groups.every((g) => openGroups.has(g.name));

  return (
    <>
      <header className="t-head"><div><h2>Actividad por estudiante</h2><span className="caption">Actividad y progreso de cada estudiante. Cada uno se compara solo con su propio trabajo anterior.</span></div>
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
        {groups.map((g) => (
        <div key={g.name} className="ar2-group">
        <button type="button" className="ar2-group-head" aria-expanded={isOpen(g.name)} onClick={() => toggle(g.name)}>
          <span className="chev"><Icon name="right" size={14} strokeWidth={3} /></span>
          <strong>{g.name}</strong>
          <span className="caption">{g.n} estudiantes{g.avg != null ? ` · promedio ${g.avg} %` : ""}{g.late ? ` · ${g.late} con tareas sin entregar` : ""}</span>
        </button>
        {isOpen(g.name) && <div className="table-wrap">
          <table className="t-table m-cards">
            <thead><tr><th>Estudiante</th><th>Entregas</th><th>{anyModel ? "Nota media" : "Promedio"}</th><th>Cambio</th><th>Tiempo total</th><th>Última entrega</th><th>Salidas</th><th /></tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="m-main">{r.name}{!r.joined && <span className="caption"> · sin ingresar</span>}</td>
                    <td data-l="Entregas">{r.done}/{r.assigned}{r.late > 0 && <span className="badge pending"> {r.late} sin entregar</span>}</td>
                    <td data-l={anyModel ? "Nota media" : "Promedio"}>{r.avgGrade != null && r.gradeModel ? formatValue(r.gradeModel, r.avgGrade) : r.avgPct == null ? "—" : `${r.avgPct} %`}</td>
                    <td data-l="Cambio" className={r.trend == null ? "m-hide" : ""}>{r.trend == null ? "—" : `${r.trend > 0 ? "+" : ""}${r.trend} pts`}</td>
                    <td data-l="Tiempo" className={r.totalSec ? "" : "m-hide"}>{r.totalSec ? fmtDuration(r.totalSec) : "—"}</td>
                    <td data-l="Última" className={r.lastAt ? "" : "m-hide"}>{shortDate(r.lastAt)}</td>
                    <td data-l="Salidas" className={r.leaves ? "" : "m-hide"}>{r.leaves || "—"}</td>
                    <td>{onOpenStudent
                      ? <button type="button" className="link" onClick={() => onOpenStudent(r.email)}>Ver perfil</button>
                      : <button type="button" className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Cerrar" : "Ver detalle"}</button>}</td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={8}>
                      <Progress items={r.items} />
                      <ul className="proctor-timeline">
                        {r.items.map((i) => <li key={i.id}><strong>{i.title}</strong> · {i.done ? `${i.grade?.ok ? i.grade.display : `${i.pct ?? "—"} %`} · ${shortDate(i.at)}${i.sec ? ` · ${fmtDuration(i.sec)}` : ""}${i.leaves ? ` · ${i.leaves} salidas` : ""}` : i.late ? "Sin entregar" : `Pendiente · entrega ${shortDate(i.due)}`}</li>)}
                        {r.items.length === 0 && <li className="caption">No tiene asignaciones todavía.</li>}
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>}
        </div>
        ))}
        {data && shown.length === 0 && <p className="caption">No hay estudiantes con ese filtro.</p>}
        {groups.length > 1 && <button type="button" className="link" onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.name)))}>{allOpen ? "Cerrar todos los cursos" : "Abrir todos los cursos"}</button>}
        <span className="caption">Puntajes según la clave preliminar, no oficial.{anyModel ? " La nota usa el modelo de calificación de cada asignación (ver «Calificación»); el cambio se mide en puntos de aciertos." : ""} Las salidas son avisos de los exámenes monitoreados.</span>
      </div>
    </>
  );
}
