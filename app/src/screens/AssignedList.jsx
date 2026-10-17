import { assignmentState, attemptsLeft, effectiveMax } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

// "Para mí": the assignments of the student's courses, with a clear next step on each.
export default function AssignedList({ assignments, attempts, onStart }) {
  const used = new Map();
  for (const a of attempts) if (a.submitted_at) used.set(a.assignment_id, (used.get(a.assignment_id) ?? 0) + 1);
  const done = new Set(used.keys());
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
            {closed ? <span className="muted">{finished ? "Entregada" : "Cerrada"}</span>
              : !finished ? <button type="button" className="primary" onClick={() => onStart(a)}>Empezar</button>
              : attemptsLeft(a, used.get(a.id)) > 0 ? (
                <span className="b-auto"><span className="muted">Entregada</span>
                  <button type="button" className="secondary" onClick={() => onStart(a)}>
                    {effectiveMax(a) ? `Otro intento (${used.get(a.id)} de ${effectiveMax(a)})` : "Repetir"}
                  </button></span>
              ) : <span className="muted">Entregada</span>}
          </div>
        );
      })}
    </div>
  );
}
