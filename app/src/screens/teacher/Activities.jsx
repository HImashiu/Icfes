import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select } from "../../components/Controls.jsx";
import { assignmentState } from "../../lib/assignments.js";
import { areaColor } from "../../lib/brand.js";
import { PRESETS } from "../../lib/teacherRoutes.js";
import { areaOf, areaShort, groupOf } from "../../lib/teaching.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const KIND_ICON = { task: "pencil", homework: "book", exam: "clock" };
export const KIND_NAME = { task: "Práctica en clase", homework: "Tarea", exam: "Simulacro" };
const STATE_LABEL = { active: "Abierta", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };
const MIXED = "Varias áreas";

// The tabs of Actividades that list one kind, with what that kind is for and the preset its "Nueva" button opens.
export const KIND_TABS = {
  tareas: { kind: "homework", title: "Tareas", help: "Para resolver en casa antes de la fecha de entrega. Corrección inmediata y pistas si las permites.", preset: "tarea", cta: "Nueva tarea" },
  practicas: { kind: "task", title: "Prácticas en clase", help: "Para resolver en el salón, en el celular o el computador, mientras explicas. No cuentan como simulacro.", preset: "practica", cta: "Nueva práctica" },
  simulacros: { kind: "exam", title: "Simulacros", help: "Con tiempo y un solo intento, en línea o en papel. Son los que más se parecen al examen real.", preset: "simulacro", cta: "Nuevo simulacro" },
};

export const isPaper = (a) => a?.delivery === "paper";
const subjectOf = (a, byCourse) => {
  const c = byCourse[a.course_id];
  return (c && areaOf(c)) || (a.scope && a.scope !== "all" ? a.scope : MIXED);
};

// Actividades › Todas / Tareas / Prácticas / Simulacros: grouped by subject so it is always clear what belongs where;
// each card opens the activity page.
export function ActivityList({ courses, assignments, contextName, go, loaded, kind = null }) {
  const [tab, setTab] = useState("open");
  const [space, setSpace] = useState("");
  const [subject, setSubject] = useState("");
  const info = kind ? Object.values(KIND_TABS).find((k) => k.kind === kind) : null;
  const byCourse = Object.fromEntries(courses.map((c) => [c.id, c]));
  const ofKind = assignments.filter((a) => !kind || a.kind === kind || (kind === "homework" && !a.kind));
  const subjects = [...new Set(ofKind.map((a) => subjectOf(a, byCourse)))].sort((x, y) => (x === MIXED) - (y === MIXED) || x.localeCompare(y, "es"));
  const list = ofKind.filter((a) => (!space || a.course_id === space) && (!subject || subjectOf(a, byCourse) === subject));
  const open = list.filter((a) => ["active", "scheduled"].includes(assignmentState(a)));
  const closed = list.filter((a) => ["closed", "draft"].includes(assignmentState(a)));
  const shown = tab === "open" ? open : closed;
  const groups = subjects.map((s) => [s, shown.filter((a) => subjectOf(a, byCourse) === s)]).filter(([, rows]) => rows.length);
  const many = groups.length > 1;

  return (
    <section className="card t-card al">
      {info && (
        <div className="al-kind">
          <span><strong>{info.title}</strong><span className="caption">{info.help}</span></span>
          <button type="button" className="primary" onClick={() => go({ section: "actividades", tab: "nueva", preset: info.preset })}><Icon name="plus" size={16} strokeWidth={2.8} />{info.cta}</button>
        </div>
      )}
      <div className="section-head">
        <div className="segmented small" role="tablist" aria-label="Estado">
          {[["open", `Abiertas · ${open.length}`], ["closed", `Cerradas · ${closed.length}`]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {courses.length > 1 && <Select className="course-filter" aria-label="Clase" value={space} onChange={setSpace}><option value="">Todas las clases</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </div>
      {subjects.length > 1 && (
        <div className="chips-row al-subjects" role="group" aria-label="Materia">
          <button type="button" className={subject ? "chip" : "chip on"} aria-pressed={!subject} onClick={() => setSubject("")}>Todas las materias</button>
          {subjects.map((s) => (
            <button key={s} type="button" className={subject === s ? "chip on" : "chip"} aria-pressed={subject === s} onClick={() => setSubject(subject === s ? "" : s)}>
              <span className="ctx-dot" style={{ background: s === MIXED ? "var(--accent)" : areaColor(s) }} aria-hidden="true" />{areaShort(s)}
            </button>
          ))}
        </div>
      )}
      {loaded && shown.length === 0 && (
        <p className="caption">{tab === "open" ? `No hay ${info ? info.title.toLowerCase() : "actividades"} abiertas en ${contextName}.` : "Todavía no hay actividades cerradas."}{" "}
          <button type="button" className="link" onClick={() => go({ section: "actividades", tab: "nueva", ...(info ? { preset: info.preset } : {}) })}>Crear una</button></p>
      )}
      {groups.map(([s, rows]) => (
        <div key={s} className="al-group" style={{ "--subj": s === MIXED ? "var(--accent)" : areaColor(s) }}>
          {many && <h3 className="al-group-head"><span className="ctx-dot" aria-hidden="true" />{s}<span className="caption">{rows.length}</span></h3>}
          <div className="assign-cards">
            {rows.map((a) => <ActivityCard key={a.id} a={a} course={byCourse[a.course_id]} go={go} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

function ActivityCard({ a, course, go }) {
  const state = assignmentState(a);
  const area = course ? areaOf(course) : null;
  const subj = area ?? (a.scope && a.scope !== "all" ? a.scope : null);
  return (
    <button type="button" className={`assign-card state-${state}`} onClick={() => go({ section: "actividad", id: a.id })}>
      <span className="assign-icon" style={{ "--tile": subj ? areaColor(subj) : "var(--accent)" }} aria-hidden="true">
        <Icon name={isPaper(a) ? "print" : KIND_ICON[a.kind] ?? "book"} size={22} strokeWidth={2.4} />
      </span>
      <span className="assign-body">
        <strong>{a.title}</strong>
        <span className="al-meta">
          <span className="al-subj" style={{ "--subj": subj ? areaColor(subj) : "var(--accent)" }}>{subj ? areaShort(subj) : MIXED}</span>
          <span className="caption">{course ? groupOf(course).name : a.courses?.name} · {KIND_NAME[a.kind] ?? "Actividad"}{isPaper(a) ? " en papel" : ""}{a.due_at ? ` · ${state === "closed" ? "cerró" : "cierra"} ${shortDate(a.due_at)}` : ""}</span>
        </span>
      </span>
      <span className="assign-state">{STATE_LABEL[state]}</span>
      <span className="assign-chevron" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.8} /></span>
    </button>
  );
}

// "Nueva actividad" in the top bar: one tap shows every kind of activity there is, each with what it is for.
const EXTRA = [
  { id: "vivo", label: "Juego en vivo", note: "Preguntas proyectadas, responden desde el celular", icon: "bolt", to: { section: "actividades", tab: "vivo" } },
  { id: "refuerzo", label: "Refuerzo", note: "Práctica personal según lo que falló cada estudiante", icon: "flag", to: { section: "actividades", tab: "refuerzo" } },
  { id: "proyectar", label: "Clase para proyectar", note: "Diapositivas con tu portada y preguntas ICFES", icon: "play", to: { section: "biblioteca", tab: "clases" } },
];
export function NewActivityMenu({ go, disabled, onLive }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null); // desktop: where the dropdown sits; phone: null (bottom sheet)
  const [drag, setDrag] = useState(0); // phone: how far the sheet is pulled down
  const root = useRef(null);
  const menu = useRef(null);
  const phone = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches;
  // Desktop: aligned to the button's right edge, kept inside the window, scrolls when taller than the space below.
  const place = () => {
    if (phone()) { setBox(null); return; }
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    const top = r.bottom + 8;
    setBox({ left, top, width: w, maxHeight: Math.max(200, window.innerHeight - top - 12) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    const re = () => place();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", re);
    window.addEventListener("scroll", re, true);
    const body = document.body.style.overflow;
    if (phone()) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true);
      document.body.style.overflow = body;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) setDrag(0); }, [open]);
  const pick = (to) => { setOpen(false); if (to.tab === "vivo") onLive?.(); go(to); };
  // Phone: pull the sheet down from its handle (or from the list when it is scrolled to the top) to close it.
  const startDrag = (e) => {
    if (box || (e.target.closest(".na-list") && menu.current?.querySelector(".na-list")?.scrollTop > 0)) return;
    const y0 = e.clientY;
    let dy = 0;
    const move = (ev) => { dy = Math.max(0, ev.clientY - y0); setDrag(dy); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); if (dy > 90) setOpen(false); else setDrag(0); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const items = (
    <>
      {Object.entries(PRESETS).map(([id, p]) => (
        <button key={id} type="button" role="menuitem" className="na-item" onClick={() => pick({ section: "actividades", tab: "nueva", preset: id })}>
          <span className="na-ico" aria-hidden="true"><Icon name={p.icon} size={18} /></span>
          <span><strong>{p.label}</strong><span className="caption">{p.note}</span></span>
        </button>
      ))}
      <span className="na-sep" aria-hidden="true" />
      {EXTRA.map((x) => (
        <button key={x.id} type="button" role="menuitem" className="na-item" onClick={() => pick(x.to)}>
          <span className="na-ico" aria-hidden="true"><Icon name={x.icon} size={18} /></span>
          <span><strong>{x.label}</strong><span className="caption">{x.note}</span></span>
        </button>
      ))}
    </>
  );
  return (
    <span className="na-wrap" ref={root}>
      <button type="button" className="primary tl-new" onClick={() => setOpen(!open)} disabled={disabled} aria-label="Nueva actividad" aria-haspopup="menu" aria-expanded={open}>
        <Icon name="plus" size={17} strokeWidth={2.8} /><span>Nueva actividad</span>
      </button>
      {open && createPortal(
        box ? (
          <div ref={menu} className="na-menu" role="menu" aria-label="Qué quieres crear" style={box}>{items}</div>
        ) : (
          <div className="na-sheet-wrap">
            <div className="na-backdrop" onClick={() => setOpen(false)} style={{ opacity: Math.max(0, 1 - drag / 300) }} />
            <div ref={menu} className="na-sheet" role="menu" aria-label="Qué quieres crear" onPointerDown={startDrag}
              style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}>
              <div className="na-grab" aria-hidden="true" />
              <div className="na-sheet-head"><strong>Nueva actividad</strong><button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div>
              <div className="na-list">{items}</div>
            </div>
          </div>
        ),
        document.body,
      )}
    </span>
  );
}
