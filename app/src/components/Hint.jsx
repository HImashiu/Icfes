import { useState } from "react";
import Icon from "./Icon.jsx";

// The AI hint, offered before the student answers: a nudge toward the method, never the letter. It is preliminary.
// Teachers can switch it off per assignment (Test.jsx decides whether to show it).
export default function Hint({ text, onOpen }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className={open ? "hint open" : "hint"}>
      <button type="button" className="hint-btn" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>
        <Icon name="bulb" size={18} className="hint-ico" />
        <span>{open ? "Ocultar pista" : "Pista"}</span>
      </button>
      {open && (
        <div className="hint-text">
          <p>{text}</p>
          <span className="caption">Pista generada con IA · preliminar</span>
        </div>
      )}
    </div>
  );
}
