import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Popup from "../../components/Popup.jsx";
import { whoOf } from "../../lib/assignments.js";
import { reportCard, suggestedComment } from "../../lib/teacherTime.js";
import "./time.css";

const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "");
const store = (courseId) => `condor:rc:${courseId}`;
const readSaved = (courseId) => { try { return JSON.parse(localStorage.getItem(store(courseId)) ?? "{}"); } catch { return {}; } };
const writeSaved = (courseId, v) => { try { localStorage.setItem(store(courseId), JSON.stringify(v)); } catch { /* storage blocked */ } };

// Informes para la entrega de notas: one printed page per student of a class with the period's grade, its desempeño,
// every activity, results by area and the teacher's comment. The comments start as a suggestion, the teacher edits
// them, and they stay in this browser for the next time this class's cards are printed.
export default function ReportCards({ api, course, teacherName, book, members, attempts, scale, onClose }) {
  const [saved] = useState(() => readSaved(course.id));
  const [period, setPeriod] = useState(saved.period ?? "");
  const [school, setSchool] = useState({ name: "", logo: null });
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [info, settings] = await Promise.all([api.schoolInfo?.() ?? null, api.schoolSettings?.() ?? null]);
        if (live) setSchool({ name: settings?.print_school_name || info?.name || "", logo: settings?.print_logo || null });
      } catch { /* demo or offline: no header */ }
    })();
    return () => { live = false; };
  }, [api]);

  const cards = useMemo(() => {
    const ids = new Set(book.columns.map((c) => c.id));
    const byMember = new Map(members.map((m) => [m.id, m]));
    return book.rows.map((row) => {
      const m = byMember.get(row.id);
      const who = new Set([row.id, m?.profile_id].filter(Boolean));
      const mine = attempts.filter((t) => ids.has(t.assignment_id) && who.has(whoOf(t)));
      return { id: row.id, ...reportCard({ row, columns: book.columns, attempts: mine, scale }) };
    });
  }, [book, members, attempts, scale]);
  const [comments, setComments] = useState(() => ({ ...saved.comments }));
  const commentOf = (c) => comments[c.id] ?? suggestedComment(c);
  useEffect(() => { writeSaved(course.id, { period, comments }); }, [course.id, period, comments]);

  const print = () => {
    setPrinting(true);
    document.body.classList.add("rc-printing");
    const done = () => { document.body.classList.remove("rc-printing"); setPrinting(false); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    // Cleaned up on afterprint. Where that never fires the pages stay mounted but hidden on screen, which is harmless.
    setTimeout(() => window.print(), 120);
  };

  return (
    <Popup title="Informes para la entrega de notas" subtitle={`${course.name} · ${cards.length} estudiantes · una página por estudiante`} onClose={onClose} wide
      actions={<button type="button" className="primary" onClick={print} disabled={!cards.length}>Imprimir {cards.length}</button>}>
      <div className="rc-edit">
        <label className="field rc-period"><span className="label">Periodo (sale en cada página)</span>
          <input type="text" value={period} placeholder="Por ejemplo: Tercer periodo 2026" onChange={(e) => setPeriod(e.target.value)} /></label>
        <p className="caption">Cada informe trae la nota final{scale ? " con su desempeño" : ""}, las actividades del periodo, los aciertos por área y una observación. La observación empieza con una sugerencia: cámbiala si quieres; queda guardada en este navegador. «Imprimir» también permite guardar un PDF.</p>
        <div>
          {cards.map((c) => (
            <div key={c.id} className="rc-row">
              <span><strong>{c.name}</strong><span className="caption">{c.final ?? "Sin nota"}{c.level ? ` · ${c.level}` : ""} · {c.delivered} de {book.columns.length} entregadas</span></span>
              <textarea aria-label={`Observación para ${c.name}`} value={commentOf(c)} onChange={(e) => setComments({ ...comments, [c.id]: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
      {printing && createPortal(
        <div className="rc-print-root">
          {cards.map((c) => (
            <section key={c.id} className="rc-page rc-print">
              <header>
                <div>
                  <span className="rc-sub">{school.name}{school.name ? " · " : ""}Preparación Saber 11</span>
                  <h1>Informe de {c.name}</h1>
                  <span className="rc-sub">{course.name}{period ? ` · ${period}` : ""}{teacherName ? ` · Docente: ${teacherName}` : ""}</span>
                </div>
                {school.logo && <img className="rc-logo" src={school.logo} alt="" />}
              </header>
              <div className="rc-big">
                <div><span>Nota final</span><b>{c.final ?? "—"}</b>{c.level && <span>Desempeño {c.level}</span>}</div>
                <div><span>Actividades entregadas</span><b>{c.delivered} de {book.columns.length}</b><span>{c.missing ? `${c.missing} sin entregar` : "Al día"}</span></div>
                <div><span>Aciertos promedio</span><b>{c.avgPct == null ? "—" : `${c.avgPct} %`}</b><span>Clave preliminar</span></div>
              </div>
              <h2>Actividades del periodo</h2>
              <table>
                <thead><tr><th>Actividad</th><th>Fecha</th><th className="r">Resultado</th></tr></thead>
                <tbody>{c.activities.map((a, i) => <tr key={i}><td>{a.title}</td><td>{fmtDay(a.due)}</td><td className={a.low ? "r low" : "r"}>{a.value}</td></tr>)}</tbody>
              </table>
              {c.areas.length > 0 && (
                <>
                  <h2>Aciertos por área</h2>
                  <table>
                    <tbody>{c.areas.map((a) => <tr key={a.name}><td>{a.name}</td><td><span className="rc-bar" style={{ width: `${Math.max(2, a.pct)}px` }} /></td><td className="r">{a.pct} % ({a.correct} de {a.total})</td></tr>)}</tbody>
                  </table>
                </>
              )}
              <h2>Observaciones</h2>
              <div className="rc-comment">{commentOf(c)}</div>
              <div className="rc-sign"><span>Docente</span><span>Acudiente</span></div>
              <p className="rc-note">Resultados de práctica con una clave de respuestas preliminar; no son el puntaje oficial del ICFES. Generado con Cóndor.</p>
            </section>
          ))}
        </div>,
        document.body,
      )}
    </Popup>
  );
}
