import Icon from "./Icon.jsx";
import Logo from "./Logo.jsx";
import Wordmark from "./Wordmark.jsx";
import { BetaPill } from "./Beta.jsx";
import { TourButton } from "./tour/Tour.jsx";

const ITEMS = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "subjects", label: "Materias", icon: "book" },
  { id: "setup", label: "Practicar", icon: "pencil" },
  { id: "progress", label: "Progreso", icon: "chart" },
  { id: "profile", label: "Perfil", icon: "user" },
];

// Student navigation: bottom nav on phone, icon rail on tablet, labelled sidebar on desktop.
// Materias holds each subject and every task; Practicar opens the setup screen; Progreso has the analysis, logros
// and finished attempts.
// The active item uses the accent ink color.
// Under the name: a student's curso; a teacher or coordinator who opens the student app sees their role, not the
// list of every class they teach.
function meLine(name, course, role) {
  if (!name) return "Sin cuenta";
  if (role === "school_admin") return "Coordinación · vista de estudiante";
  if (role === "teacher") return "Docente · vista de estudiante";
  if (!course) return "Estudiante";
  const list = course.split(/,\s*/).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return list.length > 1 ? `Cursos ${list.join(", ")}` : `Curso ${list[0]}`;
}

export default function BottomNav({ active, onGo, name, course, role = null }) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="nav-brand">
        <span aria-hidden="true" className="nav-brand-mark"><Logo size={36} /><Wordmark height={20} /></span>
        <BetaPill />
        <TourButton label="Tutorial de esta pantalla" onClick={() => window.dispatchEvent(new CustomEvent("condor:student-tour"))} />
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-tour={`snav-${item.id}`}
          className={item.id === active ? "nav-item active" : "nav-item"}
          aria-current={item.id === active ? "page" : undefined}
          aria-label={item.label}
          title={item.label}
          onClick={() => onGo(item.id)}
        >
          <Icon name={item.icon} size={24} />
          {item.short ? (
            <>
              <span className="nav-short">{item.short}</span>
              <span className="nav-long">{item.label}</span>
            </>
          ) : (
            <span>{item.label}</span>
          )}
        </button>
      ))}
      <div className="nav-me" aria-label="Estudiante">
        <span className="avatar" aria-hidden="true">{name ? name[0] : <Icon name="user" size={20} />}</span>
        <div>
          <strong>{name ?? "Visitante"}</strong>
          <span className="caption">{meLine(name, course, role)}</span>
        </div>
      </div>
    </nav>
  );
}
