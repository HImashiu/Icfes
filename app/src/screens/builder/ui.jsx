import { useEffect, useRef, useState } from "react";

// Small app-styled controls for the question builder (no native selects, checkboxes or file buttons).

// A dropdown: a button that opens a list of choices. `options` are { value, label }.
export function Pick({ value, options, onChange, label, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`qb-pick ${className}`} ref={ref}>
      <button type="button" className="qb-pick-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <span>{current?.label ?? "Elegir"}</span><span className="qb-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="qb-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={String(o.value) === String(value)} className={String(o.value) === String(value) ? "on" : ""}
                onClick={() => { onChange(o.value); setOpen(false); }}>{o.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// An on/off switch drawn as a pill.
export function Toggle({ on, onChange, children }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={on ? "qb-toggle on" : "qb-toggle"} onClick={() => onChange(!on)}>
      <span className="qb-knob" aria-hidden="true" />{children}
    </button>
  );
}

// Choose files with an app button; the browser's own file control stays hidden.
export function FileButton({ accept, multiple = false, onFiles, className = "secondary", children, label }) {
  const input = useRef(null);
  return (
    <>
      <button type="button" className={className} aria-label={label} onClick={() => input.current?.click()}>{children}</button>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} data-testid={label}
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onFiles(files); }} />
    </>
  );
}

// Two to four choices side by side.
export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="qb-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// A modal panel over the builder. Escape closes it.
export function Dialog({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="qb-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? "qb-dialog wide" : "qb-dialog"} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" className="qb-icon" aria-label="Cerrar" onClick={onClose}>✕</button></header>
        {children}
      </div>
    </div>
  );
}
