import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

const WHERE_ICON = { actividad: "book", estudiantes: "users", resultados: "chart", hoy: "home", actividades: "book" };

// "Saved, and here is where it went": shown after every action that stores data in the teacher panel.
export default function Receipt({ receipt, onGo, onClose }) {
  const primaryRef = useRef(null);
  useEffect(() => {
    primaryRef.current?.focus();
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="rc-scrim" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rc-card" role="dialog" aria-modal="true" aria-labelledby="rc-title">
        <span className="rc-ok pop" aria-hidden="true"><Icon name="check" size={34} strokeWidth={3} /></span>
        <h2 id="rc-title" className="rc-title">{receipt.title}</h2>
        {receipt.detail && <p className="rc-detail">{receipt.detail}</p>}
        <span className="rc-label">Ya aparece en</span>
        <ul className="rc-list">
          {receipt.where.map((w) => (
            <li key={w.label}>
              {w.route ? (
                <button type="button" className="rc-dest" onClick={() => onGo(w.route)}>
                  <span className="rc-ico" aria-hidden="true"><Icon name={WHERE_ICON[w.route.section] ?? "right"} size={18} /></span>
                  <span className="rc-text"><strong>{w.label}</strong><span>{w.detail}</span></span>
                  <Icon name="right" size={16} strokeWidth={3} className="rc-go" />
                </button>
              ) : (
                <div className="rc-dest static">
                  <span className="rc-ico" aria-hidden="true"><Icon name="check" size={18} /></span>
                  <span className="rc-text"><strong>{w.label}</strong><span>{w.detail}</span></span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="rc-actions">
          <button type="button" className="secondary" onClick={onClose}>Seguir aquí</button>
          <button type="button" className="primary" ref={primaryRef} onClick={() => onGo(receipt.primary.route)}>{receipt.primary.label}</button>
        </div>
      </div>
    </div>
  );
}

const ago = (iso, now = Date.now()) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};

// The bell: the last week of receipts, each one reopenable.
export function Novedades({ receipts, open, onToggle, onOpen }) {
  const ref = useRef(null);
  const unseen = receipts.filter((r) => !r.seen).length;
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) onToggle(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, onToggle]);
  return (
    <div className="nv" ref={ref}>
      <button type="button" className="icon-btn nv-btn" aria-label={unseen ? `Novedades: ${unseen} nuevas` : "Novedades"} aria-expanded={open} onClick={() => onToggle(!open)}>
        <Icon name="bell" size={19} />
        {unseen > 0 && <span className="nv-dot" aria-hidden="true">{unseen}</span>}
      </button>
      {open && (
        <div className="nv-panel" role="dialog" aria-label="Novedades">
          <strong>Novedades</strong>
          {receipts.length === 0 && <p className="caption">Aquí aparece todo lo que guardes (hojas escaneadas, actividades, listas) con el lugar donde quedó. Se guarda una semana.</p>}
          <ul>
            {receipts.map((r) => (
              <li key={r.id}>
                <button type="button" className="nv-item" onClick={() => onOpen(r)}>
                  <span className={r.seen ? "nv-mark" : "nv-mark new"} aria-hidden="true" />
                  <span className="rc-text"><strong>{r.title}</strong><span>{r.detail}</span></span>
                  <span className="caption">{ago(r.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
