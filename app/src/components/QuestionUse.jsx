import Icon from "./Icon.jsx";
import { describeUse, kindLabel } from "../lib/questionUse.js";

const LEVEL_CLASS = { block: "qu-badge block", warn: "qu-badge warn", info: "qu-badge info" };

// The one line a bank row shows about a question's past: the worst finding and how many times it was used.
export function UseBadge({ check, count = 0 }) {
  if (!check?.level && !count) return null;
  return (
    <>
      {check?.level && (
        <span className={LEVEL_CLASS[check.level]} title={check.reasons.join(" · ")}>
          <Icon name={check.level === "block" ? "lock" : check.level === "warn" ? "repeat" : "clock"} size={12} strokeWidth={2.6} />
          {check.reasons[0]}
        </span>
      )}
      {count > 0 && !check?.level && <span className="qu-badge info"><Icon name="clock" size={12} strokeWidth={2.6} />Usada {count} {count === 1 ? "vez" : "veces"}</span>}
    </>
  );
}

// Every use of one question, newest first, and its hold.
export function UseHistory({ uses, hold, schoolWide = true }) {
  return (
    <div className="qu-history">
      <strong>Historial de uso</strong>
      {hold && (
        <p className="qu-hold">
          {hold.reserve && <span className="qu-badge warn"><Icon name="lock" size={12} strokeWidth={2.6} />Reservada para simulacro</span>}
          {hold.hide && <span className="qu-badge info"><Icon name="eyeOff" size={12} strokeWidth={2.6} />Oculta de la práctica libre</span>}
          {hold.labels.length > 0 && <span className="caption">{hold.labels.join(", ")}</span>}
        </p>
      )}
      {uses.length === 0 ? <p className="caption">Nadie la ha usado todavía en el colegio.</p> : (
        <ul className="qu-uses">
          {uses.map((u) => (
            <li key={`${u.source}-${u.id}`}>
              <span className={`qu-kind k-${u.kind}`}>{kindLabel(u.kind)}</span>
              <span className="qu-use-body">
                <strong>{u.title || describeUse(u)}</strong>
                <span className="caption">{[u.groupName || u.courseName, u.teacherName, u.at ? new Date(u.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : ""].filter(Boolean).join(" · ")}{u.paper ? " · en papel" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!schoolWide && <p className="caption">Solo ves tus actividades. Con la migración 0021 verás las de todo el colegio.</p>}
    </div>
  );
}
