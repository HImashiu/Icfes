import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// A window over the page (details of a student, of a question…). Esc or the X closes it; on a phone it fills the screen.
export default function Popup({ title, subtitle, onClose, children, wide = false, actions = null, label }) {
  const card = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    card.current?.focus?.();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="pp-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={card} tabIndex={-1} className={wide ? "pp-card wide" : "pp-card"} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : "Detalle")}>
        <header className="pp-head">
          <div className="pp-title"><strong>{title}</strong>{subtitle && <span className="caption">{subtitle}</span>}</div>
          {actions}
          <button type="button" className="icon-btn pp-x" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={18} strokeWidth={2.6} /></button>
        </header>
        <div className="pp-body">{children}</div>
      </div>
    </div>
  );
}
