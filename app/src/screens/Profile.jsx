import Icon from "../components/Icon.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";

// Perfil: theme choice (dark is the default) and the teacher view entry.
export default function Profile({ theme, onTheme, onTeacher }) {
  return (
    <section className="profile">
      <header className="screen-head"><h1>Perfil</h1></header>
      <div className="card profile-card">
        <div className="avatar big" aria-hidden="true">E</div>
        <div>
          <strong>{SAMPLE_STUDENT.name}</strong>
          <span className="caption">{SAMPLE_STUDENT.course}</span>
        </div>
      </div>

      <div className="card">
        <span className="label">Tema</span>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          <button type="button" role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "seg active" : "seg"} onClick={() => onTheme("dark")}>Oscuro</button>
          <button type="button" role="radio" aria-checked={theme === "light"} className={theme === "light" ? "seg active" : "seg"} onClick={() => onTheme("light")}>Claro</button>
        </div>
      </div>

      <button type="button" className="card quick-row" onClick={onTeacher}>
        <Icon name="user" />
        <span>Vista de docente (datos de muestra)</span>
        <Icon name="right" />
      </button>
    </section>
  );
}
