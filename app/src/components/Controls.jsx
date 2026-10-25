// App-styled form controls that replace the browser's own: a dropdown (Select), a calendar (DateField),
// a file drop zone (FilePicker) and a confirm dialog (confirmDialog). Checkboxes, radios and text fields keep
// their native elements and are drawn entirely by styles.css ("Form controls"), so they need no component.
//
// Select and DateField are drop-in: Select takes <option> children (or an `options` array) and calls
// onChange with the chosen value as a string, like e.target.value; DateField uses "YYYY-MM-DD" strings like
// <input type="date">. FilePicker hands its onChange the same event shape as <input type="file">.
import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Icon from "./Icon.jsx";

/* ---------- Popover: a floating panel under (or above) its anchor, closed by outside clicks ---------- */

function usePopover(anchorRef, open, onClose) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = panelRef.current;
      if (!a || !p) return;
      const h = p.offsetHeight;
      const w = Math.max(p.offsetWidth, a.width);
      const below = window.innerHeight - a.bottom - 8;
      const up = below < h && a.top - 8 > below;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
      setPos({ top: up ? a.top - h - 6 : a.bottom + 6, left, minWidth: a.width, up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, anchorRef, onClose]);

  const style = pos
    ? { top: pos.top, left: pos.left, minWidth: pos.minWidth }
    : { top: 0, left: 0, visibility: "hidden" };
  return { panelRef, style, up: pos?.up };
}

/* ---------- Select ---------- */

const textOf = (node) => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
};

function readOptions(options, children) {
  if (options) {
    return options.map((o) => (typeof o === "object" && o !== null
      ? { value: String(o.value), label: o.label ?? String(o.value), disabled: Boolean(o.disabled) }
      : { value: String(o), label: String(o), disabled: false }));
  }
  const out = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === "optgroup" || c.type === Fragment) { out.push(...readOptions(null, c.props.children)); return; }
    const text = textOf(c.props.children);
    out.push({ value: String(c.props.value ?? text), label: c.props.children ?? text, disabled: Boolean(c.props.disabled) });
  });
  return out;
}

export function Select({ value, onChange, options, children, placeholder = "Elegir…", disabled, className = "", id, ...aria }) {
  const items = readOptions(options, children);
  const current = String(value ?? "");
  const selected = items.findIndex((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const anchorRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();
  const close = () => setOpen(false);
  const { panelRef, style, up } = usePopover(anchorRef, open, close);

  const enabled = (i) => i >= 0 && i < items.length && !items[i].disabled;
  const step = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (enabled(i)) return i;
    return from;
  };
  const show = () => {
    if (disabled) return;
    setActive(enabled(selected) ? selected : step(-1, 1));
    setOpen(true);
  };
  const choose = (i) => {
    if (!enabled(i)) return;
    setOpen(false);
    anchorRef.current?.focus();
    if (items[i].value !== current) onChange?.(items[i].value);
  };

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e) => {
    const k = e.key;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); show(); }
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (k === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (k === "Home") { e.preventDefault(); setActive(step(-1, 1)); }
    else if (k === "End") { e.preventDefault(); setActive(step(items.length, -1)); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); choose(active); }
    else if (k === "Escape") { e.preventDefault(); close(); }
    else if (k === "Tab") close();
    else if (k.length === 1) {
      const now = Date.now();
      const t = typed.current;
      t.text = (now - t.at > 700 ? "" : t.text) + k.toLowerCase();
      t.at = now;
      const hit = items.findIndex((o, i) => enabled(i) && textOf(o.label).toLowerCase().startsWith(t.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button type="button" ref={anchorRef} id={id} className={`ui-select ${open ? "open" : ""} ${className}`}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined}
        disabled={disabled} onClick={() => (open ? close() : show())} onKeyDown={onKeyDown} {...aria}>
        <span className={selected < 0 || current === "" ? "ui-select-value placeholder" : "ui-select-value"}>
          {selected < 0 ? placeholder : items[selected].label}
        </span>
        <span className="ui-chevron" aria-hidden="true"><Icon name="right" size={16} strokeWidth={2.8} /></span>
      </button>
      {open && createPortal(
        <div ref={panelRef} className={`ui-pop ${up ? "up" : ""}`} style={style}>
          <ul ref={listRef} id={`${uid}-list`} role="listbox" className="ui-list" aria-label={aria["aria-label"]}>
            {items.map((o, i) => (
              <li key={`${o.value}-${i}`} id={`${uid}-${i}`} data-i={i} role="option"
                aria-selected={i === selected} aria-disabled={o.disabled || undefined}
                className={`ui-option${i === active ? " active" : ""}${i === selected ? " selected" : ""}`}
                onPointerDown={(e) => e.preventDefault()} onPointerMove={() => enabled(i) && setActive(i)}
                onClick={() => choose(i)}>
                <span>{o.label}</span>
                {i === selected && <Icon name="check" size={16} strokeWidth={3} />}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- DateField ---------- */

const pad = (n) => String(n).padStart(2, "0");
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const longDate = (d) => d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const monthTitle = (d) => {
  const t = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function DateField({ value, onChange, min, max, placeholder = "Elegir fecha", clearable = true, disabled, className = "", id, ...aria }) {
  const picked = fromIso(value);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(() => picked ?? new Date());
  const anchorRef = useRef(null);
  const gridRef = useRef(null);
  const uid = useId();
  const close = () => setOpen(false);
  const { panelRef, style, up } = usePopover(anchorRef, open, close);
  const today = toIso(new Date());

  const allowed = (d) => (!min || toIso(d) >= min) && (!max || toIso(d) <= max);
  const show = () => {
    if (disabled) return;
    let start = picked ?? new Date();
    if (min && toIso(start) < min) start = fromIso(min);
    if (max && toIso(start) > max) start = fromIso(max);
    setFocus(start);
    setOpen(true);
  };
  const pick = (iso) => {
    setOpen(false);
    anchorRef.current?.focus();
    if (iso !== (value ?? "")) onChange?.(iso);
  };

  // Keep keyboard focus on the focused day while the calendar is open.
  useEffect(() => {
    if (open) gridRef.current?.querySelector(`[data-iso="${toIso(focus)}"]`)?.focus({ preventScroll: true });
  }, [open, focus]);

  const onGridKey = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key]) { e.preventDefault(); setFocus((f) => addDays(f, moves[e.key])); }
    else if (e.key === "PageUp") { e.preventDefault(); setFocus((f) => addMonths(f, -1)); }
    else if (e.key === "PageDown") { e.preventDefault(); setFocus((f) => addMonths(f, 1)); }
    else if (e.key === "Escape") { e.preventDefault(); close(); anchorRef.current?.focus(); }
  };

  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const focusIso = toIso(focus);

  return (
    <>
      <button type="button" ref={anchorRef} id={id} className={`ui-select ui-date ${open ? "open" : ""} ${className}`}
        aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); } }} {...aria}>
        <span className={picked ? "ui-select-value" : "ui-select-value placeholder"}>{picked ? longDate(picked) : placeholder}</span>
        <span className="ui-chevron cal" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5.5" width="16" height="14.5" rx="3" fill="currentColor" fillOpacity="0.16" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
          </svg>
        </span>
      </button>
      {open && createPortal(
        <div ref={panelRef} className={`ui-pop ui-cal ${up ? "up" : ""}`} style={style} role="dialog" aria-label={aria["aria-label"] ?? "Elegir fecha"}
          onBlur={(e) => { const to = e.relatedTarget; if (to && !e.currentTarget.contains(to) && !anchorRef.current?.contains(to)) close(); }}>
          <div className="ui-cal-head">
            <button type="button" className="ui-icon-btn" aria-label="Mes anterior" onClick={() => setFocus((f) => addMonths(f, -1))}><Icon name="left" size={18} strokeWidth={2.8} /></button>
            <strong id={`${uid}-month`} aria-live="polite">{monthTitle(focus)}</strong>
            <button type="button" className="ui-icon-btn" aria-label="Mes siguiente" onClick={() => setFocus((f) => addMonths(f, 1))}><Icon name="right" size={18} strokeWidth={2.8} /></button>
          </div>
          <div ref={gridRef} className="ui-cal-grid" role="grid" aria-labelledby={`${uid}-month`} onKeyDown={onGridKey}>
            {WEEKDAYS.map((w) => <span key={w} className="ui-cal-wd" aria-hidden="true">{w}</span>)}
            {days.map((d) => {
              const iso = toIso(d);
              const off = d.getMonth() !== focus.getMonth();
              const ok = allowed(d);
              return (
                <button key={iso} type="button" data-iso={iso} tabIndex={iso === focusIso ? 0 : -1} disabled={!ok}
                  aria-pressed={iso === value} aria-label={longDate(d)}
                  className={`ui-day${off ? " off" : ""}${iso === today ? " today" : ""}${iso === value ? " on" : ""}`}
                  onClick={() => pick(iso)}>{d.getDate()}</button>
              );
            })}
          </div>
          <div className="ui-cal-foot">
            {allowed(new Date()) ? <button type="button" className="ui-text-btn" onClick={() => pick(today)}>Hoy</button> : <span />}
            {clearable && value ? <button type="button" className="ui-text-btn" onClick={() => pick("")}>Borrar</button> : null}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- FilePicker: a drop zone; tap opens the file chooser (or the camera on phones) ---------- */

export function FilePicker({ accept, multiple, capture, disabled, onChange, label, hint, className = "", inputRef, ...aria }) {
  const ownRef = useRef(null);
  const ref = inputRef ?? ownRef;
  const [over, setOver] = useState(false);
  const drop = (e) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    onChange?.({ target: { files: multiple ? files : files.slice(0, 1), value: "" }, currentTarget: null });
  };
  return (
    <div className={`ui-drop${over ? " over" : ""}${disabled ? " disabled" : ""} ${className}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input ref={ref} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept={accept} multiple={multiple}
        capture={capture} disabled={disabled} onChange={onChange} />
      <button type="button" className="ui-drop-btn" disabled={disabled} onClick={() => ref.current?.click()} {...aria}>
        <span className="ui-drop-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
          </svg>
        </span>
        <span className="ui-drop-text">
          <strong>{label ?? (multiple ? "Elegir archivos" : "Elegir archivo")}</strong>
          <span className="caption">{hint ?? "o arrástralos aquí"}</span>
        </span>
      </button>
    </div>
  );
}

/* ---------- confirmDialog: an app-styled replacement for window.confirm, resolving to true or false ---------- */

function ConfirmBox({ message, confirmLabel, cancelLabel, danger, done }) {
  const cancelRef = useRef(null);
  const okRef = useRef(null);
  useEffect(() => { (danger ? cancelRef : okRef).current?.focus(); }, [danger]);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); done(false); }
    if (e.key === "Tab") { // keep focus inside the two buttons
      e.preventDefault();
      (document.activeElement === okRef.current ? cancelRef : okRef).current?.focus();
    }
  };
  return (
    <div className="ui-dialog-back" onPointerDown={(e) => { if (e.target === e.currentTarget) done(false); }} onKeyDown={onKey}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-label={message}>
        <p>{message}</p>
        <div className="ui-dialog-actions">
          <button type="button" ref={cancelRef} className="secondary" onClick={() => done(false)}>{cancelLabel}</button>
          <button type="button" ref={okRef} className={danger ? "primary danger" : "primary"} onClick={() => done(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(message, { confirmLabel = "Aceptar", cancelLabel = "Cancelar", danger = false } = {}) {
  return new Promise((resolve) => {
    const back = document.activeElement;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (ok) => {
      root.unmount();
      host.remove();
      back?.focus?.();
      resolve(ok);
    };
    root.render(<ConfirmBox message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel} danger={danger} done={done} />);
  });
}
