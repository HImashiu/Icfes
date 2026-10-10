import Icon from "../components/Icon.jsx";
import { loadHistory } from "../lib/local.js";
import { fmtInt, fmtPct } from "../lib/brand.js";

const MODE = { practice: "Práctica", timed: "Cronometrado" };

// Mis simulacros: finished attempts with their score and date, stored in this browser.
export default function History({ onBack }) {
  const rows = loadHistory();
  return (
    <section className="history">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="left" />
        </button>
        <h1>Mis simulacros</h1>
      </header>
      {rows.length === 0 ? (
        <p className="card muted">Aún no has entregado un simulacro. Cuando lo hagas, aparecerá aquí con su puntaje.</p>
      ) : (
        <ul className="history-list">
          {rows.map((r) => (
            <li key={r.id} className="card history-item">
              <div className="history-main">
                <strong>{r.title}</strong>
                <span className="caption">
                  {new Date(r.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })} · {MODE[r.mode] ?? r.mode}
                </span>
              </div>
              <div className="history-score">
                {r.keyed ? (
                  <>
                    <strong className="display">{fmtPct(r.percent)}</strong>
                    <span className="caption">{fmtInt(r.correct)} de {fmtInt(r.answered)} correctas</span>
                  </>
                ) : (
                  <>
                    <strong className="display">{fmtInt(r.answered)}</strong>
                    <span className="caption">respondidas, sin clave</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <span className="caption">Guardado en este navegador. Clave preliminar, no oficial.</span>
    </section>
  );
}
