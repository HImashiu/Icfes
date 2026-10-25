import Icon from "./Icon.jsx";
import Logo from "./Logo.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";

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
export default function BottomNav({ active, onGo, name, course }) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="nav-brand" aria-hidden="true">
        <Logo size={36} />
        <strong>Cóndor</strong>
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
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
        <span className="avatar" aria-hidden="true">{(name ?? "Estudiante")[0]}</span>
        <div>
          <strong>{name ?? "Estudiante"}</strong>
          <span className="caption">{name ? (course ? `Curso ${course}` : "Estudiante") : `${SAMPLE_STUDENT.course} · datos de muestra`}</span>
        </div>
      </div>
    </nav>
  );
}
