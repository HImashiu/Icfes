// The AI enrichment for one question, shown after a finished attempt. It is generated and preliminary.
// Until the key is settled and matches the model's blind answer, its explanation is not shown: only the skills and the difficulty are.
export default function AiAnalysis({ row, correctLetter, meta }) {
  if (!row) return null;
  const wrong = Object.entries(row.distractores ?? {}).filter(([letter]) => letter !== correctLetter);
  return (
    <div className="card ai-analysis">
      <span className="label">Análisis con IA · preliminar</span>
      <div className="chips-row">
        {row.competencia && <span className="badge">{row.competencia}</span>}
        {row.componente && <span className="badge">{row.componente}</span>}
        {row.dificultad && <span className="badge">Dificultad {meta?.estimated ? "estimada " : ""}{row.dificultad}/5</span>}
        {row.nivel_desempeno && <span className="badge">Nivel de desempeño {row.nivel_desempeno}</span>}
      </div>
      {row.afirmacion && <p className="caption">{row.afirmacion}</p>}
      {row.hidden ? (
        <p className="notice">Su explicación queda oculta: la clave de esta pregunta aún no está confirmada o no coincide con la IA.</p>
      ) : (
        <>
          {row.explicacion && <p>{row.explicacion}</p>}
          {wrong.length > 0 && (
            <ul className="ai-wrong">
              {wrong.map(([letter, text]) => (
                <li key={letter}><strong>{letter}.</strong> {text}</li>
              ))}
            </ul>
          )}
          {row.pista && (
            <details className="ai-hint">
              <summary>Pista</summary>
              <p>{row.pista}</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
