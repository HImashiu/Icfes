import { useState } from "react";
import { DateField, Select, confirmDialog } from "../components/Controls.jsx";
import { BUILTIN_FORMATS, assignmentRow, cleanConfig, configSummary, DEFAULT_CONFIG, questionKeys } from "../lib/lesson.js";

const isoDay = (d) => d.toISOString().slice(0, 10);
const REVEAL = [["after_submit", "Al entregar"], ["after_close", "Cuando cierre la asignación"], ["never", "No mostrar respuestas"]];
const KINDS = [["task", "Práctica (sin nota)"], ["homework", "Tarea para casa"], ["exam", "Examen con tiempo"]];

// Turns a lesson into an assignment: pick a format (built-in or your own), adjust any rule, choose the classes.
// The questions and their order come from the lesson. Formats you save are yours (or shared with the school).
export default function ActivityPanel({ api, profile, lesson, courses, formats, reloadFormats, persist, guard, setNotice, reload }) {
  const [formatId, setFormatId] = useState("homework");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [courseIds, setCourseIds] = useState(courses.length === 1 ? [courses[0].id] : []);
  const [title, setTitle] = useState(lesson.title);
  const [opens, setOpens] = useState(isoDay(new Date()));
  const [due, setDue] = useState(isoDay(new Date(Date.now() + 7 * 864e5)));
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = [...BUILTIN_FORMATS, ...formats.map((f) => ({ id: f.id, name: f.name, help: configSummary(f.config), config: f.config, mine: f.owner_id === profile.id }))];
  const pick = (f) => { setFormatId(f.id); setConfig(cleanConfig(f.config)); };
  const set = (field, value) => { setConfig((c) => cleanConfig({ ...c, [field]: value })); setFormatId(null); };
  const n = questionKeys(lesson.items).length;

  const create = (e) => {
    e.preventDefault();
    setMsg(null);
    if (n === 0) return setMsg("La clase todavía no tiene preguntas.");
    if (courseIds.length === 0) return setMsg("Elige al menos un curso.");
    if (due && due < isoDay(new Date())) return setMsg("La fecha de entrega debe ser hoy o después.");
    if (due && due < opens) return setMsg("La entrega no puede ser antes de la apertura.");
    setBusy(true);
    guard(async () => {
      const saved = await persist();
      for (const courseId of courseIds) await api.createAssignment(assignmentRow({ lesson: saved, courseId, userId: profile.id, title, opens, due, config }));
      setNotice(courseIds.length > 1 ? `Asignado a ${courseIds.length} cursos: ${title.trim() || lesson.title}.` : `Asignado: ${title.trim() || lesson.title}.`);
      reload?.();
    }).finally(() => setBusy(false));
  };

  const saveFormat = () => {
    const name = saveName.trim();
    if (!name) return;
    guard(async () => {
      await api.saveActivityFormat({ school_id: profile.school_id, owner_id: profile.id, name, config: cleanConfig(config) });
      setSaveName("");
      setNotice(`Formato «${name}» guardado. Lo verás aquí en cualquier clase.`);
      await reloadFormats();
    });
  };
  const removeFormat = async (f) => {
    if (!(await confirmDialog(`¿Borrar el formato «${f.name}»?`, { confirmLabel: "Borrar", danger: true }))) return;
    guard(async () => { await api.deleteActivityFormat(f.id); if (formatId === f.id) setFormatId(null); await reloadFormats(); });
  };

  return (
    <form className="card t-card assign-form" onSubmit={create} aria-label="Convertir en actividad">
      <div className="section-head"><strong>Convertir en actividad</strong><span className="muted">{n} preguntas</span></div>
      <p className="caption">Los estudiantes reciben las mismas preguntas, en este orden. Elige un formato y ajusta lo que quieras.</p>
      <div className="les-formats" role="group" aria-label="Formato">
        {all.map((f) => (
          <div key={f.id} style={{ display: "grid" }}>
            <button type="button" className="les-format" aria-pressed={formatId === f.id} onClick={() => pick(f)}>
              <strong>{f.name}</strong><span className="caption">{f.help}</span>
            </button>
            {f.mine && <button type="button" className="link" onClick={() => removeFormat(f)} aria-label={`Borrar el formato ${f.name}`}>Borrar</button>}
          </div>
        ))}
      </div>

      <label className="field"><span className="label">Tipo</span>
        <Select value={config.kind} onChange={(v) => set("kind", v)} aria-label="Tipo">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      {config.kind === "exam" ? (
        <label className="field"><span className="label">Tiempo en minutos (vacío = el estándar)</span>
          <input inputMode="numeric" aria-label="Tiempo en minutos" value={config.limit} onChange={(e) => set("limit", e.target.value.replace(/\D/g, ""))} /></label>
      ) : (
        <>
          <label className="field"><span className="label">Corrección de cada pregunta</span>
            <Select value={config.instant ? "now" : "end"} onChange={(v) => set("instant", v === "now")} aria-label="Corrección">
              <option value="now">Inmediata: ve si acertó al tocar “Comprobar”</option>
              <option value="end">Al final: responde todo y ve los resultados al terminar</option>
            </Select></label>
          <label className="check-row"><input type="checkbox" checked={config.hints} onChange={(e) => set("hints", e.target.checked)} />
            <span>Permitir pistas antes de responder</span></label>
        </>
      )}
      <label className="field"><span className="label">Intentos permitidos</span>
        <Select value={String(config.attempts)} onChange={(v) => set("attempts", v)} aria-label="Intentos">
          <option value="">{config.kind === "exam" ? "Uno (simulacro)" : "Sin límite"}</option>
          {[1, 2, 3, 5].map((k) => <option key={k} value={String(k)}>{k}</option>)}
        </Select></label>
      <label className="field"><span className="label">Mostrar respuestas y explicaciones</span>
        <Select value={config.reveal} onChange={(v) => set("reveal", v)} aria-label="Respuestas">{REVEAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      <label className="check-row"><input type="checkbox" checked={config.proctor} onChange={(e) => set("proctor", e.target.checked)} />
        <span>Monitorear la actividad <span className="caption">(avisarte cuando un estudiante sale de la pestaña)</span></span></label>
      <p className="caption">{configSummary(config)}</p>

      <div className="b-auto">
        <input aria-label="Nombre del formato" placeholder="Guardar estos ajustes como formato…" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        <button type="button" className="secondary" disabled={!saveName.trim()} onClick={saveFormat}>Guardar formato</button>
      </div>

      <hr className="b-sep" />
      <fieldset className="field"><legend className="label">Cursos</legend>
        {courses.map((c) => (
          <label key={c.id} className="b-check"><input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => setCourseIds(courseIds.includes(c.id) ? courseIds.filter((x) => x !== c.id) : [...courseIds, c.id])} /> {c.name}</label>
        ))}
        {courses.length === 0 && <span className="caption">Crea un espacio de clase primero.</span>}
      </fieldset>
      <label className="field"><span className="label">Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título de la actividad" /></label>
      <label className="field"><span className="label">Abre</span><DateField value={opens} onChange={(v) => setOpens(v)} /></label>
      <label className="field"><span className="label">Fecha de entrega</span><DateField value={due} min={isoDay(new Date())} onChange={(v) => setDue(v)} /></label>
      {msg && <p className="notice error" role="alert">{msg}</p>}
      <div className="report-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? "Creando…" : courseIds.length > 1 ? `Asignar a ${courseIds.length} cursos` : "Crear actividad"}</button>
      </div>
    </form>
  );
}
