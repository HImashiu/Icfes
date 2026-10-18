import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// A choice list drawn by the app instead of the browser's native <select>.
// options: [{ value, label }]; value is the chosen value ("" for none).
export default function Picker({ options, value, onChange, placeholder = "Elegir…", label, className = "" }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const chosen = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className={`picker ${className}`} ref={root}>
      <button type="button" className={chosen ? "picker-btn" : "picker-btn empty"} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>
        <span>{chosen ? chosen.label : placeholder}</span>
        <Icon name="right" size={16} className={open ? "picker-caret open" : "picker-caret"} />
      </button>
      {open && (
        <ul className="picker-list" role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" className={o.value === value ? "on" : ""} onClick={() => { onChange(o.value); setOpen(false); }}>
                <span>{o.label}</span>
                {o.value === value && <Icon name="check" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
