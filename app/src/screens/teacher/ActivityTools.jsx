import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import Popup from "../../components/Popup.jsx";
import { DateField } from "../../components/Controls.jsx";
import { assignmentState } from "../../lib/assignments.js";
import { areaOf, areaShort, groupOf } from "../../lib/teaching.js";
import {
  addDays, copyRows, datesError, datesPatch, extendChoices, isoDay, missingStudents, reminderText, repeatsIn, whatsappShare,
} from "../../lib/teacherTime.js";
import "./time.css";

const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

// Hoy can ask the activity page to open one of these tools as it loads («Recordar» on an activity about to close).
const TOOL_KEY = "condor:activity-tool";
export function openActivityTool(id, tool) {
  try { sessionStorage.setItem(TOOL_KEY, JSON.stringify({ id, tool, at: Date.now() })); } catch { /* storage blocked */ }
}
function takeActivityTool(id) {
  try {
    const v = JSON.parse(sessionStorage.getItem(TOOL_KEY) ?? "null");
    if (!v || v.id !== id || Date.now() - v.at > 60000) return null;
    sessionStorage.removeItem(TOOL_KEY);
    return v.tool;
  } catch { return null; }
}

// The everyday chores of one activity, one tap each from its page: give more time (or reopen it), remind whoever has
// not delivered, and reuse it in another class. Read-only classes see nothing here.
export default function ActivityTools({ api, profile, assignment, course, courses, assignments, members, attempts, guard, reload, setNotice, go, log, schoolMembers = [] }) {
  const [open, setOpen] = useState(() => takeActivityTool(assignment.id)); // "dates" | "remind" | "copy"
  const state = assignmentState(assignment);
  const missing = useMemo(() => (members && attempts ? missingStudents(members, attempts, assignment.course_id) : null), [members, attempts, assignment.course_id]);
  const total = members ? members.filter((m) => m.role === "student" && m.course_id === assignment.course_id).length : 0;
  const close = () => setOpen(null);
  return (
    <>
      <div className="atl" role="group" aria-label="Gestionar la actividad" data-tour="ap-tools">
        <button type="button" className="atl-btn" onClick={() => setOpen("dates")}>
          <Icon name="clock" size={17} />
          <span><strong>{state === "closed" ? "Reabrir" : "Dar más tiempo"}</strong><span className="caption">{state === "closed" ? "Con una nueva fecha de cierre" : assignment.due_at ? `Cierra ${longDay(isoDay(assignment.due_at))}` : "Sin fecha de cierre"}</span></span>
        </button>
        <button type="button" className="atl-btn" onClick={() => setOpen("remind")} disabled={!missing || total === 0}>
          <Icon name="bell" size={17} />
          <span><strong>Recordar a quienes faltan</strong><span className="caption">{missing == null ? "Contando…" : total === 0 ? "La clase no tiene estudiantes" : missing.length ? `${missing.length} de ${total} sin entregar` : "Todos entregaron"}</span></span>
        </button>
        <button type="button" className="atl-btn" onClick={() => setOpen("copy")}>
          <Icon name="repeat" size={17} />
          <span><strong>Usar en otra clase</strong><span className="caption">Mismas preguntas, otras fechas</span></span>
        </button>
      </div>
      {open === "dates" && <DatesDialog {...{ api, assignment, guard, reload, setNotice, log, onClose: close }} />}
      {open === "remind" && missing && <RemindDialog {...{ api, profile, assignment, course, missing, total, guard, setNotice, log, onClose: close }} />}
      {open === "copy" && <CopyDialog {...{ api, profile, assignment, course, courses, assignments, guard, reload, setNotice, go, log, schoolMembers, onClose: close }} />}
    </>
  );
}

function DatesDialog({ api, assignment, guard, reload, setNotice, log, onClose }) {
  const today = isoDay(Date.now());
  const [opens, setOpens] = useState(assignment.opens_at ? isoDay(assignment.opens_at) : today);
  const [due, setDue] = useState(assignment.due_at ? isoDay(assignment.due_at) : addDays(today, 7));
  const [busy, setBusy] = useState(false);
  const err = datesError({ opens, due }, today);
  const closed = assignmentState(assignment) === "closed";
  const save = () => {
    if (err) return;
    setBusy(true);
    guard(async () => {
      await api.updateAssignment(assignment.id, datesPatch(assignment, { opens, due }));
      log?.("assignment_dates", { id: assignment.id, title: assignment.title, opens, due });
      await reload?.();
      setNotice?.(`«${assignment.title}»: ${closed ? "reabierta, " : ""}${due ? `cierra el ${longDay(due)}` : "sin fecha de cierre"}.`);
      onClose();
    }).finally(() => setBusy(false));
  };
  return (
    <Popup title={closed ? "Reabrir la actividad" : "Cambiar las fechas"} subtitle={assignment.title} onClose={onClose}>
      <div className="atl-form">
        <div className="field"><span className="label">Más tiempo</span>
          <div className="chips-row">
            {extendChoices(assignment, today).map((c) => (
              <button key={c.label} type="button" className={due === c.due ? "chip on" : "chip"} aria-pressed={due === c.due} onClick={() => setDue(c.due)}>{c.label}<span className="caption"> · {longDay(c.due)}</span></button>
            ))}
          </div>
        </div>
        <div className="atl-dates">
          <label className="field"><span className="label">Abre</span><DateField value={opens} onChange={(v) => setOpens(v || today)} clearable={false} /></label>
          <label className="field"><span className="label">Cierra (11:59 p. m.)</span><DateField value={due} onChange={setDue} min={today} placeholder="Sin fecha de cierre" /></label>
        </div>
        <p className="caption">Los estudiantes ven la nueva fecha de inmediato. Lo que ya entregaron se queda igual{closed ? "; quienes no alcanzaron pueden entregar hasta la nueva fecha" : ""}.</p>
        {err && <p className="notice error">{err}</p>}
        <div className="report-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={busy || Boolean(err)} onClick={save}>{busy ? "Guardando…" : closed ? "Reabrir" : "Guardar fechas"}</button>
        </div>
      </div>
    </Popup>
  );
}

function RemindDialog({ api, profile, assignment, course, missing, total, guard, setNotice, log, onClose }) {
  const className = course ? groupOf(course).name : "";
  const [withNames, setWithNames] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(reminderText({ assignment, className, missing, total, withNames })); }, [assignment, className, missing, total, withNames]);
  const copy = async (what, value) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked */ }
  };
  const announce = () => {
    setBusy(true);
    guard(async () => {
      await api.postAnnouncement({ courseIds: [assignment.course_id], title: `Recordatorio: ${assignment.title}`, body: text, pinned: false,
        expiresAt: assignment.due_at ?? new Date(Date.now() + 3 * 864e5).toISOString(), authorName: profile.full_name || profile.email });
      log?.("assignment_reminder", { id: assignment.id, title: assignment.title, missing: missing.length });
      setNotice?.(`Recordatorio publicado en ${className || "la clase"}: lo ven en Inicio quienes entren.`);
      onClose();
    }).finally(() => setBusy(false));
  };
  if (!missing.length) {
    return <Popup title="Todos entregaron" subtitle={assignment.title} onClose={onClose}><p>Los {total} estudiantes de {className || "la clase"} ya entregaron. No hay a quién recordar.</p></Popup>;
  }
  const never = missing.filter((m) => !m.joined).length;
  return (
    <Popup title="Recordar a quienes faltan" subtitle={`${assignment.title} · ${missing.length} de ${total} sin entregar`} onClose={onClose} wide>
      <div className="atl-form">
        <div className="atl-who">
          <span className="label">Sin entregar</span>
          <ul className="atl-names">
            {missing.map((m) => <li key={m.id}>{m.name}{!m.joined && <span className="caption"> · nunca ha entrado</span>}</li>)}
          </ul>
          {never > 0 && <p className="caption">{never === 1 ? "Uno no ha entrado nunca" : `${never} no han entrado nunca`} a Cóndor: el anuncio no les llega hasta que entren; el mensaje de WhatsApp sí.</p>}
          <button type="button" className="link" onClick={() => copy("names", missing.map((m) => m.name).join("\n"))}>{copied === "names" ? "Lista copiada" : "Copiar la lista de nombres"}</button>
        </div>
        <label className="field"><span className="label">Mensaje</span>
          <textarea className="atl-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="check-row"><input type="checkbox" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} /> Incluir los nombres de quienes faltan</label>
        <div className="report-actions">
          <button type="button" className="secondary" onClick={() => copy("text", text)}>{copied === "text" ? "Copiado" : "Copiar mensaje"}</button>
          <a className="button secondary" href={whatsappShare(text)} target="_blank" rel="noreferrer" onClick={() => log?.("assignment_reminder_wa", { id: assignment.id })}>WhatsApp</a>
          <button type="button" className="primary" disabled={busy || !text.trim()} onClick={announce}>{busy ? "Publicando…" : "Publicar en la clase"}</button>
        </div>
        <p className="caption">«Publicar en la clase» lo deja como anuncio en el Inicio de cada estudiante de {className || "la clase"} hasta que cierre la actividad.</p>
      </div>
    </Popup>
  );
}

function CopyDialog({ api, profile, assignment, course, courses, assignments, guard, reload, setNotice, go, log, schoolMembers, onClose }) {
  const today = isoDay(Date.now());
  const area = course ? areaOf(course) : null;
  // Classes of the same subject first (the usual case: 11A to 11B); any class the teacher can edit is allowed.
  const counts = useMemo(() => { const n = new Map(); for (const m of schoolMembers) if (m.role === "student") n.set(m.course_id, (n.get(m.course_id) ?? 0) + 1); return n; }, [schoolMembers]);
  const options = useMemo(() => courses.filter((c) => c.id !== assignment.course_id)
    .sort((x, y) => (areaOf(y) === area) - (areaOf(x) === area) || x.name.localeCompare(y.name, "es")), [courses, assignment.course_id, area]);
  const same = options.filter((c) => areaOf(c) === area);
  const [all, setAll] = useState(false);
  const shown = all || same.length === 0 ? options : same;
  const [ids, setIds] = useState([]);
  const span = assignment.due_at && assignment.opens_at ? Math.max(1, Math.round((new Date(assignment.due_at) - new Date(assignment.opens_at)) / 864e5)) : 7;
  const [opens, setOpens] = useState(today);
  const [due, setDue] = useState(addDays(today, span));
  const [title, setTitle] = useState(assignment.title);
  const [busy, setBusy] = useState(false);
  const err = ids.length === 0 ? null : datesError({ opens, due }, today);
  const repeats = repeatsIn(assignment, assignments, ids);
  const toggle = (id) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const save = () => {
    if (!ids.length || err) return;
    setBusy(true);
    guard(async () => {
      const rows = copyRows(assignment, ids, { opens, due, title }, profile.id);
      const made = [];
      for (const row of rows) made.push(await api.createAssignment(row));
      log?.("assignment_copy", { from: assignment.id, title: assignment.title, to: ids });
      await reload?.();
      setNotice?.(`«${title.trim() || assignment.title}» quedó en ${ids.length === 1 ? "1 clase" : `${ids.length} clases`}: ${ids.map((id) => courses.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}.`);
      onClose();
      if (made.length === 1 && made[0]?.id) go({ section: "actividad", id: made[0].id });
    }).finally(() => setBusy(false));
  };
  return (
    <Popup title="Usar en otra clase" subtitle={`${assignment.title} · ${assignment.question_keys?.length ? `${assignment.question_keys.length} preguntas` : "cuadernillo completo"}`} onClose={onClose} wide>
      <div className="atl-form">
        <div className="field"><span className="label">¿En qué clases?</span>
          {options.length === 0 ? <p className="caption">No tienes otra clase donde puedas crear actividades.</p> : (
            <div className="atl-classes">
              {shown.map((c) => (
                <label key={c.id} className={ids.includes(c.id) ? "atl-class on" : "atl-class"}>
                  <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span><strong>{groupOf(c).name}</strong><span className="caption">{areaOf(c) ? areaShort(areaOf(c)) : "Varias áreas"}{schoolMembers.length ? ` · ${counts.get(c.id) ?? 0} est.` : ""}</span></span>
                </label>
              ))}
            </div>
          )}
          {!all && same.length > 0 && options.length > same.length && <button type="button" className="link atl-more" onClick={() => setAll(true)}>Ver clases de otras materias ({options.length - same.length})</button>}
        </div>
        <label className="field atl-title"><span className="label">Título</span><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="atl-dates">
          <label className="field"><span className="label">Abre</span><DateField value={opens} onChange={(v) => setOpens(v || today)} clearable={false} /></label>
          <label className="field"><span className="label">Cierra (11:59 p. m.)</span><DateField value={due} onChange={setDue} min={today} placeholder="Sin fecha de cierre" /></label>
        </div>
        <p className="caption">Se copian las preguntas, el tipo, el tiempo, los intentos, las pistas y cuándo se ven las respuestas. Cada clase tiene su propia actividad y sus propios resultados.</p>
        {repeats.length > 0 && <p className="notice">{repeats.map((id) => courses.find((c) => c.id === id)?.name).filter(Boolean).join(", ")} ya {repeats.length === 1 ? "tuvo" : "tuvieron"} una actividad con algunas de estas preguntas. Puedes usarla igual o elegir otra clase.</p>}
        {err && <p className="notice error">{err}</p>}
        <div className="report-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={busy || !ids.length || Boolean(err)} onClick={save}>{busy ? "Creando…" : ids.length > 1 ? `Crear en ${ids.length} clases` : "Crear"}</button>
        </div>
      </div>
    </Popup>
  );
}
