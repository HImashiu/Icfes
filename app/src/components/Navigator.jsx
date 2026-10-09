// Question map: one button per question, grouped by area. Shows answered, flagged and current state.
export default function Navigator({ questions, answers, flags, current, onGo }) {
  const sections = [];
  for (const q of questions) {
    let s = sections.find((x) => x.name === q.section);
    if (!s) sections.push((s = { name: q.section, items: [] }));
    s.items.push({ q, index: questions.indexOf(q) });
  }
  return (
    <nav className="navigator" aria-label="Mapa de preguntas">
      {sections.map((s) => (
        <div key={s.name} className="nav-section">
          <h3>{s.name}</h3>
          <div className="nav-grid">
            {s.items.map(({ q, index }) => {
              const classes = ["nav-btn"];
              if (answers[q.key]) classes.push("answered");
              if (flags[q.key]) classes.push("flagged");
              if (index === current) classes.push("current");
              return (
                <button
                  key={q.key}
                  type="button"
                  className={classes.join(" ")}
                  aria-current={index === current ? "step" : undefined}
                  aria-label={`Pregunta ${q.number}${answers[q.key] ? ", respondida" : ", sin responder"}${flags[q.key] ? ", marcada" : ""}`}
                  onClick={() => onGo(index)}
                >
                  {q.number}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <ul className="legend">
        <li><span className="nav-btn answered" /> Respondida</li>
        <li><span className="nav-btn flagged" /> Marcada</li>
        <li><span className="nav-btn" /> Sin responder</li>
      </ul>
    </nav>
  );
}
