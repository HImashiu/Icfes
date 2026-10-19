import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { formatClock, questionsFor, timedSeconds } from "../lib/exam.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { WEAKEST_AREA } from "../data/mock.js";
import { Select } from "../components/Controls.jsx";
import { loadOrder, moveArea, normalizeOrder, saveOrder } from "../lib/order.js";

// Nuevo simulacro: booklet, scope (whole exam or one area), mode, and a sticky start button.
// 225 min reads as "3 h 45 min".
function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// `preset` comes from a home card: { scope: "all" | "area" | <area name>, mode }. "area" opens the first area.
function initialScope(exam, preset) {
  const want = preset?.scope;
  if (!want || want === "all") return "all";
  if (exam.sections.some((s) => s.name === want)) return want;
  return exam.sections[0]?.name ?? "all";
}

export default function Setup({ exam, slug, onStart, onBack, exams, onPickExam, preset, pendingKeys = [], onRepechaje }) {
  const [scope, setScope] = useState(() => initialScope(exam, preset));
  const [mode, setMode] = useState(preset?.mode ?? "practice");
  // Switching booklets can drop the chosen area (1ra booklets have no Inglés): fall back to the whole booklet.
  const scopeOk = scope === "all" || exam.sections.some((s) => s.name === scope);
  if (!scopeOk) setScope("all");
  const areas = exam.sections.map((s) => s.name);
  const [order, setOrder] = useState(() => loadOrder(areas));
  const shown = normalizeOrder(order, areas);
  const move = (i, dir) => { const next = moveArea(shown, i, dir); setOrder(next); saveOrder(next); };
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
          <Select className="booklet-select" value={slug} onChange={(v) => onPickExam(v)} aria-label="Cambiar cuadernillo">
            {exams.map((e) => (
              <option key={e.slug} value={e.slug} disabled={e.status === "proximamente"}>
                {e.status === "proximamente" ? `${e.title} · Próximamente` : e.title}
              </option>
            ))}
          </Select>
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
      {!exam.sections.some((s) => s.name === "Inglés") && (
        <p className="footnote">Este cuadernillo es de la sesión 1 y no incluye Inglés. Inglés está en los cuadernillos de la sesión 2.</p>
      )}

      {scope === "all" && shown.length > 1 && (
        <div className="card order-card">
          <span className="label">Orden de las áreas</span>
          <ol className="order-list">
            {shown.map((name, i) => (
              <li key={name} className="order-row">
                <span className="n">{i + 1}</span>
                <span className="dot" style={{ background: areaColor(name) }} />
                <strong>{name}</strong>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${name}`}>▲</button>
                <button type="button" disabled={i === shown.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${name}`}>▼</button>
              </li>
            ))}
          </ol>
          <span className="caption">Empieza por la que prefieras, por ejemplo Inglés y luego Lectura crítica.</span>
        </div>
      )}

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

      {pendingKeys.length > 0 && onRepechaje && (
        <div className="card repechaje-card">
          <Mascot size={48} />
          <div>
            <strong>Repechaje</strong>
            <span className="caption">{pendingKeys.length} {pendingKeys.length === 1 ? "pregunta que fallaste" : "preguntas que fallaste"} te esperan para una segunda oportunidad.</span>
          </div>
          <button type="button" className="primary" onClick={onRepechaje}>Practicar</button>
        </div>
      )}

      <div className="tip card">
        <Mascot size={56} />
        <p>Practica unos minutos cada día para mantener tu racha.</p>
      </div>

      <div className="sticky-cta">
        <button type="button" className="primary big" disabled={scoped.length === 0} onClick={() => onStart(scope, mode, shown)}>
          Empezar · {fmtInt(scoped.length)} preguntas
        </button>
        <span className="caption">{hint}</span>
      </div>
    </section>
  );
}
