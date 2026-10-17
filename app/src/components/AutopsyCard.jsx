import { autopsy } from "../lib/analytics.js";
import { Bars } from "../screens/Dashboard.jsx";

// Qué respondió el grupo y por qué: la distribución, la opción incorrecta más elegida con la explicación de la IA
// (solo si la clave está confirmada) y una idea para volver a explicar. Se proyecta en clase o se lee en el informe.
export default function AutopsyCard({ counts, correct, enrichRow, meta }) {
  const a = autopsy(counts, correct, enrichRow);
  if (a.answered === 0) return <p className="caption">Nadie respondió esta pregunta.</p>;
  return (
    <div className="autopsy" style={{ display: "grid", gap: 10 }}>
      <Bars unit=" %" rows={Object.entries(counts).map(([l, n]) => ({ label: `${l}${correct.includes(l) ? " ✓" : ""}`, value: Math.round((n / a.answered) * 100), color: correct.includes(l) ? "var(--ok)" : undefined }))} />
      <span className="caption">{a.rightPct} % acertó · {a.answered} respuestas</span>
      {a.topWrong && (
        <div className="notice">
          <strong>Lo que más eligieron: {a.topWrong.letter} ({a.topWrong.pct} %)</strong>
          {a.topWrong.note ? <p style={{ margin: "4px 0 0" }}>{a.topWrong.note}</p> : <p className="caption" style={{ margin: "4px 0 0" }}>No hay explicación confirmada de esta opción.</p>}
        </div>
      )}
      {(a.tema || a.competencia) && <span className="caption">Tema: {[a.tema, a.competencia].filter(Boolean).join(" · ")}</span>}
      {a.idea && <p className="caption"><strong>Idea para volver a explicar:</strong> {a.idea}</p>}
      {enrichRow && <span className="caption">{meta?.estimated ? "Análisis con IA, estimado y preliminar." : "Análisis con IA, preliminar."}</span>}
    </div>
  );
}
