import { useState } from "react";

// The AI hint, offered before the student answers: a nudge toward the method, never the letter. It is preliminary.
export default function Hint({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className={open ? "hint open" : "hint"}>
      <button type="button" className="hint-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">💡</span> {open ? "Ocultar pista" : "Ver pista"}
      </button>
      {open && (
        <p className="hint-text">
          {text}
          <span className="caption"> · Pista generada con IA</span>
        </p>
      )}
    </div>
  );
}
