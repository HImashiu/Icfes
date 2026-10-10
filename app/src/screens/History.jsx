import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { loadHistory } from "../lib/local.js";
import { areaColor, fmtInt, fmtPct } from "../lib/brand.js";

const MODE = { practice: "Práctica", timed: "Cronometrado" };

// Share of one area that was right (only meaningful when the attempt has a key).
const areaShare = (a) => (a.answered ? (a.correct / a.answered) * 100 : 0);

// Mis simulacros: finished attempts with their score and date, stored in this browser.
export default function History({ onBack, onNew, onOpen }) {
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
        <div className="card empty-state">
          <Mascot size={72} />
          <p>Aún no tienes simulacros. Empieza uno y aquí verás tu progreso.</p>
          <button type="button" className="primary" onClick={onNew}>Nuevo simulacro</button>
        </div>
      ) : (
        <ul className="history-list">
          {rows.map((r) => (
            <li key={r.id}>
            <button type="button" className="card history-item" onClick={() => onOpen(r)} disabled={!r.snapshot} aria-label={`Ver resultados: ${r.title}`}>
              <div className="history-main">
                <div className="history-top">
                  <strong>{r.title}</strong>
                  <span className="chip-mode">{MODE[r.mode] ?? r.mode}</span>
                </div>
                <span className="caption">
                  {new Date(r.at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                  {r.xp ? ` · +${fmtInt(r.xp)} XP` : ""}
                </span>
                {r.perArea?.length > 0 && (
                  <div className="area-segments" aria-label="Puntaje por área">
                    {r.perArea.map((a) => (
                      <span key={a.name} className={a.answered ? "seg-track" : "seg-track empty"} title={a.answered ? `${a.name}: ${a.correct ?? 0} de ${a.answered}` : `${a.name}: sin respuestas`}>
                        <span style={{ width: `${r.keyed ? areaShare(a) : (a.answered / a.total) * 100}%`, background: areaColor(a.name) }} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="history-score">
                {r.keyed ? (
                  <>
                    <strong className="score-pct">{fmtPct(r.percent)}</strong>
                    <span className="caption">{fmtInt(r.correct)} de {fmtInt(r.answered)} correctas</span>
                  </>
                ) : (
                  <>
                    <strong className="score-pct">{fmtInt(r.answered)}</strong>
                    <span className="caption">respondidas, sin clave</span>
                  </>
                )}
                {r.snapshot && <span className="history-chevron" aria-hidden="true">›</span>}
              </div>
            </button>
            </li>
          ))}
        </ul>
      )}
      <span className="caption">Guardado en este navegador. Clave preliminar, no oficial.</span>
    </section>
  );
}
