// Question map grouped by area. Phone: a bottom sheet. Desktop: a side panel (see Test.jsx).
// `gradeOf(q)` returns "ok" or "bad" in review, and null otherwise.
export default function Navigator({ questions, answers, flags, current, onGo, gradeOf }) {
  const sections = [];
  questions.forEach((q, index) => {
    let s = sections.find((x) => x.name === q.section);
    if (!s) sections.push((s = { name: q.section, items: [] }));
    s.items.push({ q, index });
  });
  return (
    <nav className="navigator" aria-label="Mapa de preguntas">
      {sections.map((s) => (
        <div key={s.name} className="nav-section">
          <h3>{s.name}</h3>
          <div className="nav-grid">
            {s.items.map(({ q, index }) => {
              const grade = gradeOf?.(q) ?? null;
              const classes = ["nav-btn"];
              if (grade) classes.push(grade);
              else if (answers[q.key]) classes.push("answered");
              if (flags[q.key]) classes.push("flagged");
              if (index === current) classes.push("current");
              const status = grade === "ok" ? "correcta" : grade === "bad" ? "incorrecta" : answers[q.key] ? "respondida" : "sin responder";
              return (
                <button
                  key={q.key}
                  type="button"
                  className={classes.join(" ")}
                  aria-current={index === current ? "step" : undefined}
                  aria-label={`Pregunta ${q.number}, ${status}${flags[q.key] ? ", marcada" : ""}`}
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
