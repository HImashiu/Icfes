import Icon from "./Icon.jsx";
import Mascot from "./Mascot.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";

const ITEMS = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "setup", label: "Practicar", icon: "book" },
  { id: "history", label: "Mis simulacros", short: "Simulacros", icon: "clock" },
  { id: "league", label: "Liga", icon: "trophy" },
  { id: "profile", label: "Perfil", icon: "user" },
];

// Student navigation: bottom nav on phone, icon rail on tablet, labelled sidebar on desktop.
// "Practicar" opens the setup screen; "Mis simulacros" lists finished attempts.
// The active item uses the accent ink color.
export default function BottomNav({ active, onGo }) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="nav-brand" aria-hidden="true">
        <Mascot size={36} />
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
        <span className="avatar" aria-hidden="true">E</span>
        <div>
          <strong>Estudiante</strong>
          <span className="caption">{SAMPLE_STUDENT.course} · datos de muestra</span>
        </div>
      </div>
    </nav>
  );
}
