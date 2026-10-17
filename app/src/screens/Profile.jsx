import Icon from "../components/Icon.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { useAuth } from "../lib/auth.jsx";

// Perfil: theme choice (dark is the default) and the teacher view entry.
export default function Profile({ theme, onTheme, onTeacher, onReports, onLogin }) {
  const auth = useAuth();
  const staff = auth.status === "ready" && auth.profile.role !== "student";
  return (
    <section className="profile">
      <header className="screen-head"><h1>Perfil</h1></header>
      <div className="card profile-card">
        <div className="avatar big" aria-hidden="true">E</div>
        <div className="profile-name">
          <strong>{auth.status === "ready" ? auth.profile.full_name || auth.profile.email : SAMPLE_STUDENT.name}</strong>
          <span className="caption">{auth.status === "ready" ? auth.profile.email : `${SAMPLE_STUDENT.course} · datos de muestra`}</span>
        </div>
      </div>

      <div className="card">
        <span className="label">Tema</span>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          <button type="button" role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "seg active" : "seg"} onClick={() => onTheme("dark")}>Oscuro</button>
          <button type="button" role="radio" aria-checked={theme === "light"} className={theme === "light" ? "seg active" : "seg"} onClick={() => onTheme("light")}>Claro</button>
        </div>
      </div>

      {auth.status !== "demo" && (
        auth.status === "ready" ? (
          <button type="button" className="card quick-row" onClick={auth.signOut}>
            <Icon name="user" />
            <span>Cerrar sesión</span>
            <Icon name="right" />
          </button>
        ) : (
          <button type="button" className="card quick-row" onClick={onLogin} disabled={auth.status === "loading"}>
            <Icon name="user" />
            <span>Ingresar con la cuenta del colegio</span>
            <Icon name="right" />
          </button>
        )
      )}

      <button type="button" className="card quick-row" onClick={onReports}>
        <Icon name="flag" />
        <span>Mis reportes de errores</span>
        <Icon name="right" />
      </button>

      <button type="button" className="card quick-row" onClick={onTeacher}>
        <Icon name="user" />
        <span>{staff ? "Panel docente" : "Vista de docente (datos de muestra)"}</span>
        <Icon name="right" />
      </button>
    </section>
  );
}
