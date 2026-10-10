import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { formatClock, questionsFor, timedSeconds } from "../lib/exam.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { WEAKEST_AREA } from "../data/mock.js";

// Nuevo simulacro: booklet, scope (whole exam or one area), mode, and a sticky start button.
// 225 min reads as "3 h 45 min".
function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function Setup({ exam, slug, onStart, onBack, exams, onPickExam }) {
  const [scope, setScope] = useState("all");
  const [mode, setMode] = useState("practice");
  const scoped = questionsFor(exam, scope);
  const minutes = timedSeconds(scoped) / 60;
  const hint = `${mode === "timed" ? `Tiempo: ${formatClock(timedSeconds(scoped))} · ` : ""}+10 XP por acierto · +20 en ${WEAKEST_AREA}`;

  return (
    <section className="setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="left" />
        </button>
        <h1>Nuevo simulacro</h1>
      </header>

      <div className="booklet card">
        <span className="label">Cuadernillo</span>
        {exams.length <= 1 && <strong>{exam.title}</strong>}
        {exams.length > 1 && (
          <select className="booklet-pick" value={slug} onChange={(e) => onPickExam(e.target.value)} aria-label="Cambiar cuadernillo">
            {exams.map((e) => (
              <option key={e.slug} value={e.slug} disabled={e.status === "proximamente"}>
                {e.status === "proximamente" ? `${e.title} · Próximamente` : e.title}
              </option>
            ))}
          </select>
        )}
        <span className="caption">Fuente: ICFES, Saber 11 · {exam.questions.length} preguntas</span>
      </div>

      <div className="segmented" role="tablist" aria-label="Alcance">
        <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "seg active" : "seg"} onClick={() => setScope("all")}>
          Examen completo
        </button>
        <button type="button" role="tab" aria-selected={scope !== "all"} className={scope !== "all" ? "seg active" : "seg"} onClick={() => setScope(exam.sections[0]?.name)}>
          Por área
        </button>
      </div>

      {scope !== "all" && (
        <div className="chips" role="radiogroup" aria-label="Área">
          {exam.sections.map((s) => (
            <button
              key={s.name}
              type="button"
              role="radio"
              aria-checked={scope === s.name}
              className={scope === s.name ? "chip on" : "chip"}
              onClick={() => setScope(s.name)}
            >
              <span className="dot" style={{ background: areaColor(s.name) }} />
              {s.name} <span className="muted">{fmtInt(s.questions.length)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mode-cards" role="radiogroup" aria-label="Modo">
        <button type="button" role="radio" aria-checked={mode === "practice"} className={mode === "practice" ? "mode-card on" : "mode-card"} onClick={() => setMode("practice")}>
          <Icon name="bolt" />
          <strong>Práctica</strong>
          <span className="caption">Respuesta inmediata, sin tiempo</span>
        </button>
        <button type="button" role="radio" aria-checked={mode === "timed"} className={mode === "timed" ? "mode-card on" : "mode-card"} onClick={() => setMode("timed")}>
          <Icon name="clock" />
          <strong>Cronometrado</strong>
          <span className="caption">Resultados al entregar · {formatDuration(minutes)}</span>
        </button>
      </div>

      <div className="tip card">
        <Mascot size={56} />
        <p>Practica unos minutos cada día para mantener tu racha.</p>
      </div>

      <div className="sticky-cta">
        <button type="button" className="primary big" disabled={scoped.length === 0} onClick={() => onStart(scope, mode)}>
          Empezar · {fmtInt(scoped.length)} preguntas
        </button>
        <span className="caption">{hint}</span>
      </div>
    </section>
  );
}
