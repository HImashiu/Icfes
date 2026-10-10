import { useState } from "react";
import { addReport } from "../lib/local.js";

// "Reportar error" on a question. Saves the question id, the exam and a short note in this browser.
export default function ReportError({ question, examLabel }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(null);
  const id = `report-${question.key}`;

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const saved = addReport({ question: question.key, number: question.number, exam: examLabel ?? "", note: text.trim() });
    setStatus(saved ? "saved" : "unsaved");
    setOpen(false);
    setText("");
  };

  if (status === "saved") return <p className="caption report-status">Gracias. Tu reporte de la pregunta {question.number} quedó guardado en este navegador.</p>;
  if (!open) {
    return (
      <button type="button" className="link report-link" onClick={() => setOpen(true)}>Reportar error</button>
    );
  }
  return (
    <form className="report-form" onSubmit={submit}>
      <label className="label" htmlFor={id}>Qué está mal en la pregunta {question.number}</label>
      <textarea id={id} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="report-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="primary" disabled={!text.trim()}>Guardar reporte</button>
      </div>
    </form>
  );
}
