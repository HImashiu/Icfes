import Icon from "./Icon.jsx";
import { KINDS, effectiveMax } from "../lib/assignments.js";

const KIND_ICON = { task: "pencil", homework: "book", exam: "clock" };
const kindLabel = (k) => KINDS.find((x) => x.id === k)?.label ?? "Tarea";
const day = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

// When a task closes, said the way a student says it.
export function dueText(iso, now = Date.now()) {
  if (!iso) return "Sin fecha de cierre";
  const ms = new Date(iso) - now;
  const days = Math.ceil(ms / 864e5);
  if (ms < 0) return `Cerró ${day(iso)}`;
  if (ms < 864e5 && new Date(iso).getDate() === new Date(now).getDate()) return "Cierra hoy";
  if (days <= 1) return "Cierra mañana";
  if (days <= 6) return `Cierra en ${days} días`;
  return `Cierra ${day(iso)}`;
}

// One task as the student sees it: subject color and kind, who assigned it, when it closes or how it went, and the
// one thing to do next. t: a studentTasks() row.
export default function TaskRow({ t, onStart, now = Date.now(), showSubject = true }) {
  const { a, subject, status, pct, used, left } = t;
  const color = subject?.color ?? "var(--accent)";
  const urgent = status === "pending" && a.due_at && new Date(a.due_at) - now < 2 * 864e5;
  const meta = [
    kindLabel(a.kind),
    a.question_keys ? `${a.question_keys.length} preguntas` : null,
    a.kind === "exam" && a.time_limit_min ? `${a.time_limit_min} min` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className={`task-row is-${status}`} style={{ "--c": color }}>
      <span className="task-tile" aria-hidden="true"><Icon name={KIND_ICON[a.kind] ?? "pencil"} size={20} /></span>
      <span className="task-main">
        <strong>{a.title}</strong>
        <span className="caption">
          {showSubject && subject ? <><b className="task-subject">{subject.name}</b>{subject.teacher ? ` · ${subject.teacher}` : ""} · </> : null}{meta}
        </span>
      </span>
      <span className="task-side">
        {status === "pending" && <span className={urgent ? "task-pill hot" : "task-pill"}>{dueText(a.due_at, now)}</span>}
        {status === "scheduled" && <span className="task-pill soft">Abre {day(a.opens_at)}</span>}
        {status === "missed" && <span className="task-pill bad">No entregada</span>}
        {status === "delivered" && (
          <span className="task-score">
            <b>{pct == null ? "Entregada" : `${pct} %`}</b>
            {pct != null && <span className="td-track"><span style={{ width: `${pct}%`, background: color }} /></span>}
          </span>
        )}
      </span>
      {status === "pending" && onStart && <button type="button" className="primary small task-go" onClick={() => onStart(a)}>Empezar</button>}
      {status === "delivered" && onStart && left > 0 && t.state === "active" && (
        <button type="button" className="secondary small task-go" onClick={() => onStart(a)}>{effectiveMax(a) ? `Otro intento (${used}/${effectiveMax(a)})` : "Repetir"}</button>
      )}
    </div>
  );
}
