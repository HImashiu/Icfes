// Question map grouped by area. Phone: a bottom sheet. Desktop: a side panel (see Test.jsx).
// `gradeOf(q)` returns "ok" or "bad" in review, and null otherwise.
import { useState } from "react";

export default function Navigator({ questions, answers, flags, current, onGo, gradeOf }) {
  const [openArea, setOpenArea] = useState(null);
  const currentArea = questions[current]?.section ?? null;
  const sections = [];
  questions.forEach((q, index) => {
    let s = sections.find((x) => x.name === q.section);
    if (!s) sections.push((s = { name: q.section, items: [] }));
    s.items.push({ q, index });
  });
  return (
    <nav className="navigator" aria-label="Mapa de preguntas">
      {sections.map((s) => {
        const open = s.name === currentArea || s.name === openArea;
        const done = s.items.filter(({ q }) => answers[q.key]).length;
        if (!open) {
          return (
            <button key={s.name} type="button" className="nav-collapsed" onClick={() => setOpenArea(s.name)} aria-expanded="false">
              <span>{s.name}</span>
              <span className="caption">{done} de {s.items.length}</span>
              <span className="nav-bar"><span style={{ width: `${(done / s.items.length) * 100}%` }} /></span>
            </button>
          );
        }
        return (
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
        );
      })}
      <div className="legend">
        <span><i className="sw sw-answered" /> Respondida</span>
        <span><i className="sw sw-flagged" /> Marcada</span>
        <span><i className="sw" /> Sin responder</span>
      </div>
    </nav>
  );
}
