import { useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "../../components/Icon.jsx";
import "./colegio.css";

// A panel over the page: centered on a computer, a sheet from the bottom on a phone. Escape or the scrim closes it.
export default function Sheet({ title, sub, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="cg-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? "cg-sheet wide" : "cg-sheet"} role="dialog" aria-modal="true" aria-label={title}>
        <span className="cg-grip" aria-hidden="true" />
        <header className="cg-sheet-head">
          <div><h2>{title}</h2>{sub && <span className="caption">{sub}</span>}</div>
          <button type="button" className="icon-btn cg-close" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={18} strokeWidth={2.8} /></button>
        </header>
        <div className="cg-sheet-body">{children}</div>
        {footer && <footer className="cg-sheet-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
