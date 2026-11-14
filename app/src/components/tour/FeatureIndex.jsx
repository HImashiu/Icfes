import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon.jsx";
import { OwlPeek } from "../Mascot.jsx";

// «Ayuda»: the list of every function, by section, opened only when someone asks for it (the «?» button or Ayuda
// in the menu). Nothing pops up on its own. Tapping a function takes you to its screen and shows it there with a
// short guide; the section you are on comes first. A search box finds a function by any word of its guide.
const fold = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function FeatureIndex({ sections, here = null, seen = () => false, onPick, onClose, who = "docente" }) {
  const card = useRef(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const ordered = here ? [...sections.filter((s) => s.id === here), ...sections.filter((s) => s.id !== here)] : sections;
    if (!words.length) return ordered;
    return ordered
      .map((s) => ({ ...s, items: s.items.filter((it) => { const hay = fold(`${s.title} ${it.title} ${it.find ?? ""}`); return words.every((w) => hay.includes(w)); }) }))
      .filter((s) => s.items.length);
  }, [sections, here, q]);
  const current = !q && here ? shown.find((s) => s.id === here) : null;

  const Section = ({ s, featured = false }) => (
    <section className={featured ? "fi-sec fi-here" : "fi-sec"}>
      <button type="button" className="fi-sec-head" onClick={() => onPick(s.id, 0)}>
        <span className="fi-ico"><Icon name={s.icon} size={18} strokeWidth={2.4} /></span>
        <span className="fi-sec-name">{featured && <span className="fi-tag">Estás aquí</span>}<b>{s.title}</b></span>
        {seen(s.id) && <span className="fi-seen" title="Ya viste esta guía"><Icon name="check" size={12} strokeWidth={3.4} /></span>}
        <span className="fi-all">{featured ? "Mostrarme esta pantalla" : "Ver todo"}<Icon name="right" size={13} strokeWidth={3} /></span>
      </button>
      <ul>
        {s.items.map((it) => (
          <li key={it.key ?? it.start}><button type="button" onClick={() => onPick(s.id, it.start, it)}><span>{it.title}</span><Icon name="right" size={14} strokeWidth={2.6} /></button></li>
        ))}
      </ul>
    </section>
  );

  return createPortal(
    <div className="ob-tour dim fi-wrap" role="dialog" aria-modal="true" aria-labelledby="fi-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fi-box">
      <OwlPeek className="fi-owl" width={92} happy />
      <div ref={card} tabIndex={-1} className="ob-index">
        <header className="fi-head">
          <div>
            <span className="caption ob-count">Ayuda · {total} funciones</span>
            <h2 id="fi-title">¿Qué quieres ver?</h2>
            <p>Toca una función: te llevamos a su pantalla y te la mostramos ahí mismo.</p>
          </div>
          <button type="button" className="icon-btn fi-x" aria-label="Cerrar la ayuda" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <label className="fi-search">
          <Icon name="search" size={17} strokeWidth={2.6} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={who === "docente" ? "Busca: calificar, imprimir, juego en vivo…" : "Busca: simulacro, meta, errores…"} aria-label="Buscar una función" />
          {q && <button type="button" className="icon-btn" aria-label="Borrar la búsqueda" onClick={() => setQ("")}><Icon name="x" size={14} /></button>}
        </label>
        {current && <Section s={current} featured />}
        <div className="fi-grid">
          {shown.filter((s) => s !== current).map((s) => <Section key={s.id} s={s} />)}
        </div>
        {!shown.length && <p className="fi-none">Nada con «{q}». Prueba con otra palabra.</p>}
      </div>
      </div>
    </div>,
    document.body,
  );
}
