import { useContext, useEffect, useState } from "react";
import { sendFeedback } from "../lib/publicFeedback.js";
import { ExamContext } from "../lib/exam-context.js";

// "Marcar para revisar" on a question: the student says what needs fixing. It reaches the owner's backend when one
// is configured, and is kept in this browser either way.
export default function ReportError({ question, examLabel }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = `report-${question.key}`;
  const slug = useContext(ExamContext);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const result = await sendFeedback({
      kind: "question",
      message: text,
      exam: examLabel || slug || "",
      questionKey: question.key,
      questionNumber: question.number,
    });
    setBusy(false);
    setToast(result.stored === "server" ? "Gracias. Revisaremos esta pregunta." : "Guardado en este navegador. Gracias.");
    setOpen(false);
    setText("");
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
        <button type="button" className="link report-link" onClick={() => setOpen(true)}>Marcar para revisar</button>
        {toastNode}
      </>
    );
  }
  return (
    <>
    <form className="report-form" onSubmit={submit}>
      <label className="label" htmlFor={id}>¿Qué hay que arreglar en la pregunta {question.number}?</label>
      <textarea id={id} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Por ejemplo: la respuesta correcta no coincide, falta una figura, el texto está mal escrito" />
      <div className="report-actions">
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button>
        <button type="submit" className="primary" disabled={!text.trim() || busy}>{busy ? "Enviando…" : "Enviar"}</button>
      </div>
    </form>
    {toastNode}
    </>
  );
}
