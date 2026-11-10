import { useContext, useEffect, useState } from "react";
import { REPORT_REASONS, sendFeedback } from "../lib/publicFeedback.js";
import { ExamContext } from "../lib/exam-context.js";
import { Select } from "./Controls.jsx";

// "Reportar un error" on a question: the student picks what is wrong (formatting, key, figure, options, other) and can add
// a note. It reaches the owner's backend when one is configured (public_feedback, category + exam_slug, migration 0033),
// and is kept in this browser either way.
export default function ReportError({ question, examLabel }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("format");
  const [text, setText] = useState("");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = `report-${question.key}`;
  const slug = useContext(ExamContext);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await sendFeedback({
      kind: "question",
      category,
      message: text,
      exam: examLabel || slug || "",
      questionKey: question.key,
      questionNumber: question.number,
      slug,
    });
    setBusy(false);
    setToast(result.stored === "server" ? "Gracias. Revisaremos esta pregunta." : "Guardado en este navegador. Gracias.");
    setOpen(false);
    setText("");
    setCategory("format");
  };

  // The confirmation is a toast that leaves on its own after 4 s, so the buttons never move.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const toastNode = toast && (
    <div className="toast" role="status">
      <span className="toast-check" aria-hidden="true">✓</span> {toast}
    </div>
  );

  if (!open) {
    return (
      <>
        <button type="button" className="link report-link" onClick={() => setOpen(true)}>Reportar un error</button>
        {toastNode}
      </>
    );
  }
  return (
    <>
    <form className="report-form" onSubmit={submit}>
      <span className="label">¿Qué tiene mal la pregunta {question.number}?</span>
      <Select value={category} onChange={setCategory} aria-label="Motivo del reporte" options={REPORT_REASONS.map((r) => ({ value: r.id, label: r.label }))} />
      <label className="label" htmlFor={id}>Cuéntanos más (opcional)</label>
      <textarea id={id} rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Por ejemplo: en la opción B la palabra está cortada" />
      <div className="report-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Enviando…" : "Enviar reporte"}</button>
      </div>
    </form>
    {toastNode}
    </>
  );
}
