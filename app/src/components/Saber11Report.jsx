import { useState } from "react";
import { areaColor } from "../lib/brand.js";
import { NATIONAL_SOURCE, TESTS, testOf } from "../lib/saber11.js";

const AREA_ORDER = TESTS.map((t) => t.name);
const ordered = (areas) => [...areas].sort((a, b) => AREA_ORDER.indexOf(testOf(a.name)?.name) - AREA_ORDER.indexOf(testOf(b.name)?.name));

// The result laid out like the ICFES individual report: global with its national percentile, then each test with
// its 0-100 score, percentile and nivel de desempeño (MCER level for Inglés) and what that level means.
// showGlobal false when the global is already on screen. sim: a complete simulacro from simulacro.js ({ global, low, high, percentile, areas }).
export default function Saber11Report({ sim, showGlobal = true }) {
  const [how, setHow] = useState(false);
  if (!sim?.areas?.length) return null;
  return (
    <div className="s11">
      {showGlobal && sim.global != null && (
        <div className="s11-global">
          <span className="label">Puntaje global</span>
          <strong className="display">{sim.global}<small>/500</small></strong>
          <span className="caption">Rango probable {sim.low}–{sim.high}{sim.percentile != null ? ` · percentil ${sim.percentile}: supera al ${sim.percentile} % de los estudiantes del país` : ""}</span>
        </div>
      )}
      <div className="s11-tests">
        {ordered(sim.areas).filter((a) => a.scale != null).map((a) => {
          const t = testOf(a.name);
          return (
            <div key={a.name} className="s11-test" style={{ "--c": areaColor(a.name) }}>
              <div className="s11-test-head">
                <span className="s11-name">{a.name}</span>
                <span className="s11-score"><b>{a.scale}</b>/100</span>
              </div>
              <div className="s11-chips">
                {a.level && <span className="s11-chip">{t?.mcer ? `Nivel MCER ${a.level.label}` : a.level.label} · {a.level.from}–{a.level.to}</span>}
                {a.percentile != null && <span className="s11-chip soft">Percentil {a.percentile}</span>}
                {t && <span className="s11-chip soft">Peso {t.weight}</span>}
              </div>
              <span className="s11-levels" aria-hidden="true">
                {(t?.levels ?? []).map((l) => (
                  <span key={l.code} className={a.level?.code === l.code ? "on" : ""} style={{ flexGrow: l.to - l.from + 1 }} />
                ))}
              </span>
              {a.level?.desc && <span className="caption">{a.level.desc}</span>}
            </div>
          );
        })}
      </div>
      <button type="button" className="secondary small s11-how-btn" onClick={() => setHow((v) => !v)} aria-expanded={how}>
        {how ? "Ocultar cómo se calcula" : "¿Cómo se calcula, igual que el ICFES?"}
      </button>
      {how && (
        <div className="s11-how">
          <p><b>Reglas oficiales del ICFES que aplicamos tal cual</b></p>
          <ul>
            <li>El puntaje sale del examen completo: Sesión 1 + Sesión 2 del mismo cuadernillo. Lo que se deja en blanco cuenta como incorrecto.</li>
            <li>Cada prueba se califica de 0 a 100 con teoría de respuesta al ítem: importa qué preguntas se aciertan, no solo cuántas.</li>
            <li>Global = (3 × Lectura + 3 × Matemáticas + 3 × Sociales + 3 × Naturales + 1 × Inglés) ÷ 13 × 5, redondeado.</li>
            <li>Niveles de desempeño 1 a 4 con los rangos oficiales de cada prueba, e Inglés por nivel MCER (Pre A1, A1, A2, B1; escala 2025).</li>
            <li>Percentil: qué parte de los estudiantes del país tuvo un puntaje menor.</li>
          </ul>
          <p><b>Lo que es estimado</b></p>
          <ul>
            <li>El ICFES no publica la dificultad ni la discriminación de cada pregunta: usamos valores típicos y, con suficientes entregas del colegio, los calibramos con sus respuestas.</li>
            <li>La escala y los percentiles usan la distribución nacional real : {NATIONAL_SOURCE}, no la del año en que se presente el examen.</li>
            <li>La clave de respuestas es preliminar.</li>
          </ul>
          <p className="caption">Por eso es un estimado con rango probable, no el resultado oficial del ICFES.</p>
        </div>
      )}
    </div>
  );
}
