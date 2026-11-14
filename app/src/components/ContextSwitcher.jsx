import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { contextColor, contextLabel } from "../lib/teaching.js";

// The subject and class the teacher panel is showing. A popover on a computer, a sheet from the bottom on a phone.
// A teacher only finds the subjects they teach; coordination also has "Todo el colegio".
export default function ContextSwitcher({ contexts, value, onChange }) {
  const [open, setOpen] = useState(false);
  const groups = contexts.groups ?? [];
  const byCourse = groups.length > 1;
  const [mode, setMode] = useState(() => (value?.group ? "curso" : "materia"));
  const ref = useRef(null);
  const panel = useRef(null);
  // The panel lives in <body>: the top bar's blur would otherwise trap a fixed sheet inside the bar (it showed cut off behind the page).
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const phone = window.matchMedia("(max-width: 800px)").matches;
      const r = ref.current?.getBoundingClientRect();
      setAt(phone || !r ? null : { top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - 392)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target) && !panel.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const pick = (next) => { onChange(next); setOpen(false); };
  const dot = value?.subject ? contextColor(value.subject) : "var(--accent)";
  const showCurso = byCourse && mode === "curso";
  const allLabel = contexts.admin ? "Todo el colegio" : "Todas mis clases";
  const single = contexts.subjects.length === 1 && contexts.subjects[0].classes.length === 1 && !contexts.admin;

  return (
    <div className="ctx" ref={ref}>
      <button type="button" className="ctx-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} disabled={single}>
        <span className="ctx-dot" style={{ background: dot }} aria-hidden="true" />
        <span className="ctx-label">{contextLabel(contexts, value)}</span>
        {!single && <Icon name="right" size={14} strokeWidth={3} className="ctx-caret" />}
      </button>
      {open && createPortal(
        <>
          <div className="ctx-scrim" aria-hidden="true" />
          <div className="ctx-panel cx-ctx" ref={panel} role="listbox" aria-label="Materia y curso" style={at ? { position: "fixed", top: at.top, left: at.left } : undefined}>
            <span className="ctx-grab" aria-hidden="true" />
            <strong className="ctx-title">¿Qué quieres <em>ver?</em></strong>
            {byCourse && (
              <div className="cg-seg ctx-mode" role="tablist" aria-label="Organizar por">
                <button type="button" role="tab" aria-selected={mode === "materia"} className={mode === "materia" ? "on" : ""} onClick={() => setMode("materia")}>Por materia</button>
                <button type="button" role="tab" aria-selected={mode === "curso"} className={mode === "curso" ? "on" : ""} onClick={() => setMode("curso")}>Por curso</button>
              </div>
            )}
            <button type="button" role="option" aria-selected={!value?.subject && !value?.group} className={!value?.subject && !value?.group ? "ctx-opt on" : "ctx-opt"} onClick={() => pick({ subject: null, courseId: null })}>
              <span className="ctx-dot" style={{ background: "var(--accent)" }} aria-hidden="true" />{allLabel}
              <span className="ctx-meta">{contexts.all.length} {contexts.all.length === 1 ? "clase" : "clases"}</span>
            </button>
            {showCurso && groups.map((g) => (
              <div key={g.key} className="ctx-group">
                <button type="button" role="option" aria-selected={value?.group === g.key && !value?.courseId} className={value?.group === g.key && !value?.courseId ? "ctx-opt on" : "ctx-opt"} onClick={() => pick({ subject: null, courseId: null, group: g.key })}>
                  <span className="ctx-dot" style={{ background: "var(--accent)" }} aria-hidden="true" />{g.name}
                  <span className="ctx-meta">{g.classes.length} {g.classes.length === 1 ? "materia" : "materias"}</span>
                </button>
                <div className="ctx-classes">
                  {g.classes.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={value?.courseId === c.id} className={value?.courseId === c.id ? "ctx-chip on" : "ctx-chip"} onClick={() => pick({ subject: c.area, courseId: c.id })} style={{ boxShadow: `inset 3px 0 0 ${c.color}` }}>
                      {value?.courseId === c.id && <Icon name="check" size={13} strokeWidth={3.2} />}{c.name}{c.readOnly && <span className="ctx-ro"> · solo ve</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!showCurso && contexts.subjects.map((s) => (
              <div key={s.key} className="ctx-group">
                <button type="button" role="option" aria-selected={value?.subject === s.key && !value?.courseId} className={value?.subject === s.key && !value?.courseId ? "ctx-opt on" : "ctx-opt"} onClick={() => pick({ subject: s.key, courseId: null })}>
                  <span className="ctx-dot" style={{ background: s.color }} aria-hidden="true" />{s.label}
                  <span className="ctx-meta">{s.classes.length} {s.classes.length === 1 ? "clase" : "clases"}</span>
                </button>
                <div className="ctx-classes">
                  {s.classes.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={value?.courseId === c.id} className={value?.courseId === c.id ? "ctx-chip on" : "ctx-chip"} onClick={() => pick({ subject: s.key, courseId: c.id })} title={c.full}>
                      {value?.courseId === c.id && <Icon name="check" size={13} strokeWidth={3.2} />}{c.name}{c.readOnly && <span className="ctx-ro"> · solo ve</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!contexts.admin && <span className="caption ctx-note">Solo ves tus materias. Coordinación asigna las clases.</span>}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
