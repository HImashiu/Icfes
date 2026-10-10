import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { loadReports } from "../lib/local.js";

// Mis reportes: the error reports saved in this browser. There is no review team behind them yet.
export default function Reports({ onBack, onPractice, onOpen }) {
  const reports = loadReports().slice().reverse();
  return (
    <section className="reports">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="left" />
        </button>
        <h1>Mis reportes</h1>
      </header>
      {reports.length === 0 ? (
        <div className="card empty-state">
          <Mascot size={72} />
          <p>No has reportado preguntas. Si encuentras un error en una pregunta, usa “Reportar error” debajo de ella.</p>
          <button type="button" className="secondary" onClick={onPractice}>Ir a practicar</button>
        </div>
      ) : (
        <ul className="report-list">
          {reports.map((r) => (
            <li key={r.at + r.question}>
              <button type="button" className="card report-item" onClick={() => onOpen(r)} disabled={!r.slug} aria-label={`Ver la pregunta ${r.number}`}>
                <div className="section-head">
                  <strong>{r.exam} · Pregunta {r.number}</strong>
                  <span className="caption">{new Date(r.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <p>{r.note}</p>
                <span className="chip-status">Guardado en este navegador{r.slug ? " · Ver pregunta ›" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="caption">Se guardan solo en este navegador. Aún no se envían a un equipo de revisión.</span>
    </section>
  );
}
