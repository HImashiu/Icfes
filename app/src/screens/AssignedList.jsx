import { assignmentState } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

// "Para mí": the assignments of the student's courses, with a clear next step on each.
export default function AssignedList({ assignments, attempts, onStart }) {
  const done = new Set(attempts.filter((a) => a.submitted_at).map((a) => a.assignment_id));
  const open = assignments.filter((a) => assignmentState(a) === "active" || (assignmentState(a) === "closed" && done.has(a.id)));
  if (open.length === 0) return null;
  return (
    <div className="card">
      <span className="label">Tareas de tu curso</span>
      {open.map((a) => {
        const finished = done.has(a.id);
        const closed = assignmentState(a) === "closed";
        return (
          <div key={a.id} className="assign-row">
            <span className="assign-tile" style={{ background: areaColor(a.scope === "all" ? "" : a.scope) }} />
            <div className="assign-body">
              <strong>{a.title}</strong>
              <span className="caption">
                {a.courses?.name}{a.due_at ? ` · Entrega ${shortDate(a.due_at)}` : ""}
                {a.question_keys ? ` · ${a.question_keys.length} preguntas` : ""}
                {a.kind === "exam" && a.time_limit_min ? ` · ${a.time_limit_min} min` : ""}
              </span>
            </div>
            {finished ? <span className="muted">Entregada</span> : closed ? <span className="muted">Cerrada</span> : (
              <button type="button" className="primary" onClick={() => onStart(a)}>Empezar</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
