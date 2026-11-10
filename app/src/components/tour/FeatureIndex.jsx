import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon.jsx";
import Mascot from "../Mascot.jsx";

// «Todas las funciones»: the list of everything the school gets, by section. A function opens its section's
// tutorial right on that screen, so nobody gets lost in one long tour. `seen(id)` ticks the sections already toured.
export default function FeatureIndex({ sections, seen = () => false, onPick, onClose }) {
  const card = useRef(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  return createPortal(
    <div className="ob-tour dim" role="dialog" aria-modal="true" aria-labelledby="fi-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={card} tabIndex={-1} className="ob-index">
        <button type="button" className="icon-btn ob-x" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={16} /></button>
        <header className="fi-head">
          <Mascot pose="happy" size={56} />
          <div>
            <span className="caption ob-count">Todas las funciones · {total}</span>
            <h2 id="fi-title">Todo lo que incluye Cóndor</h2>
            <p>Toca una función: te llevamos a su pantalla y te la mostramos ahí mismo.</p>
          </div>
        </header>
        <div className="fi-grid">
          {sections.map((s) => (
            <section key={s.id} className="fi-sec">
              <button type="button" className="fi-sec-head" onClick={() => onPick(s.id, 0)}>
                <span className="fi-ico"><Icon name={s.icon} size={18} strokeWidth={2.4} /></span>
                <b>{s.title}</b>
                {seen(s.id) && <span className="fi-seen" title="Ya viste este tutorial"><Icon name="check" size={12} strokeWidth={3.4} /></span>}
                <span className="fi-all">Ver todo</span>
              </button>
              <ul>
                {s.items.map((it) => (
                  <li key={it.start}><button type="button" onClick={() => onPick(s.id, it.start)}><span>{it.title}</span><Icon name="right" size={14} strokeWidth={2.6} /></button></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
