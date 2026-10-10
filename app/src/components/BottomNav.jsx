import Icon from "./Icon.jsx";

const ITEMS = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "setup", label: "Practicar", icon: "book" },
  { id: "league", label: "Liga", icon: "trophy" },
  { id: "profile", label: "Perfil", icon: "user" },
];

// Student bottom navigation for phone widths. The active item uses the accent ink color.
export default function BottomNav({ active, onGo }) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === active ? "nav-item active" : "nav-item"}
          aria-current={item.id === active ? "page" : undefined}
          onClick={() => onGo(item.id)}
        >
          <Icon name={item.icon} size={24} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
