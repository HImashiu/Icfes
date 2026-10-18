import { useEffect, useMemo, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import { DIFFICULTY_LABEL } from "../lib/bank.js";
import { draftFromRow, draftToRow, emptyDraft, rowToQuestion, shrinkImage, TEACHER_AREAS, validateDraft } from "../lib/teacherExam.js";
import { confirmDialog, FilePicker, Select } from "../components/Controls.jsx";

const LETTERS = ["A", "B", "C", "D"];

// “Mis preguntas”: los docentes escriben las suyas. Nunca se mezclan con el banco ICFES ni con la banda estimada.
export default function QuestionBuilder({ api, profile, guard, setNotice }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState("");
  const load = () => guard(async () => setRows(await api.teacherQuestions()));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rows.filter((r) => `${r.question_json?.stem_md ?? ""} ${r.area} ${r.tema ?? ""} ${r.competencia ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const remove = async (r) => {
    if (!(await confirmDialog("¿Borrar esta pregunta? Las asignaciones que ya la usan dejarán de mostrarla.", { confirmLabel: "Borrar", danger: true }))) return;
    guard(async () => { await api.deleteTeacherQuestion(r.id); await load(); });
  };

  if (draft) {
    return <Editor api={api} profile={profile} guard={guard} draft={draft} onCancel={() => setDraft(null)}
      onSaved={async (saved) => { setDraft(null); setNotice(saved ? "Pregunta guardada." : ""); await load(); }} />;
  }
  const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return (
    <>
      <header className="t-head">
        <div><h1>Mis preguntas</h1><span className="caption">Escribe tus propias preguntas y úsalas en asignaciones y juegos en vivo.</span></div>
        <button type="button" className="primary" onClick={() => setDraft(emptyDraft())}>Nueva pregunta</button>
      </header>
      <div className="card t-card">
        {rows.length > 4 && <input type="search" placeholder="Buscar" aria-label="Buscar mis preguntas" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        {shown.length === 0 && <p className="caption">{rows.length === 0 ? "Todavía no has escrito preguntas. Crea la primera: enunciado, cuatro opciones y la respuesta correcta." : "Ninguna coincide."}</p>}
        <ul className="b-list">
          {shown.map((r) => (
            <li key={r.id} className="b-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <div className="b-body">
                <strong>{r.area || "Otra"}{r.tema ? ` · ${r.tema}` : ""}</strong>
                <span className="b-text">{plain(r.question_json?.stem_md).slice(0, 160)}</span>
                <span className="chips-row">
                  <span className="badge pending">{r.visibility === "school" ? "Compartida con el colegio" : "Solo tuya"}</span>
                  {r.dificultad && <span className="badge pending">{DIFFICULTY_LABEL[r.dificultad]}</span>}
                  {r.owner_id !== profile.id && <span className="badge pending">De otro docente</span>}
                </span>
              </div>
              <span>
                {r.owner_id === profile.id
                  ? <><button type="button" className="link" onClick={() => setDraft(draftFromRow(r))}>Editar</button>{" "}<button type="button" className="link" onClick={() => remove(r)}>Borrar</button></>
                  : <button type="button" className="link" onClick={() => setDraft({ ...draftFromRow(r), id: undefined, visibility: "private" })}>Copiar y editar</button>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Editor({ api, profile, guard, draft: initial, onCancel, onSaved }) {
  const [d, setD] = useState(initial);
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (f, v) => setD((cur) => ({ ...cur, [f]: v }));
  const setOpt = (i, v) => setD((cur) => ({ ...cur, options: cur.options.map((o, j) => (j === i ? v : o)) }));

  const previewQ = useMemo(() => {
    const row = draftToRow(d, { schoolId: profile.school_id, ownerId: profile.id });
    return { ...rowToQuestion({ ...row, id: "preview" }, 1) };
  }, [d, profile]);

  const onImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { set("image", await shrinkImage(file)); } catch { setMsgs(["No se pudo leer esa imagen."]); }
  };
  const save = (e) => {
    e.preventDefault();
    const problems = validateDraft(d);
    setMsgs(problems);
    if (problems.length) return;
    setBusy(true);
    guard(async () => {
      await api.saveTeacherQuestion(draftToRow(d, { schoolId: profile.school_id, ownerId: profile.id }), d.id ?? null);
      await onSaved(true);
    }).finally(() => setBusy(false));
  };

  return (
    <>
      <header className="t-head"><div><h1>{d.id ? "Editar pregunta" : "Nueva pregunta"}</h1></div></header>
      <div className="b-grid" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
        <form className="card t-card assign-form" onSubmit={save}>
          <label className="field"><span className="label">Área</span>
            <Select value={d.area} onChange={(v) => set("area", v)}>{TEACHER_AREAS.map((a) => <option key={a}>{a}</option>)}</Select></label>
          <label className="field"><span className="label">Competencia (opcional)</span><input value={d.competencia} onChange={(e) => set("competencia", e.target.value)} placeholder="Ej. Razonamiento y argumentación" /></label>
          <label className="field"><span className="label">Tema (opcional)</span><input value={d.tema} onChange={(e) => set("tema", e.target.value)} placeholder="Ej. Proporcionalidad" /></label>
          <label className="field"><span className="label">Dificultad</span>
            <Select value={d.dificultad} onChange={(v) => set("dificultad", v)}>
              <option value="">Sin indicar</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {DIFFICULTY_LABEL[n]}</option>)}
            </Select></label>
          <label className="field"><span className="label">Texto de apoyo (opcional: lectura, datos…)</span>
            <textarea rows={4} value={d.stimulus} onChange={(e) => set("stimulus", e.target.value)} /></label>
          <label className="field"><span className="label">Enunciado</span>
            <textarea rows={3} value={d.stem} onChange={(e) => set("stem", e.target.value)} />
            <span className="caption">Fórmulas entre signos de dólar, por ejemplo $\frac{"{1}{2}"}$ o $x^2+1$. Negrita con **texto**. Deja una línea en blanco para un párrafo nuevo.</span></label>
          <div className="field"><span className="label">Imagen o gráfica (opcional)</span>
            <FilePicker accept="image/*" aria-label="Subir imagen" onChange={onImage} label="Subir imagen" hint="o arrástrala aquí" />
            {d.image && <><img src={d.image} alt="Vista de la imagen" style={{ maxWidth: 220, borderRadius: 8 }} /><button type="button" className="link" onClick={() => set("image", null)}>Quitar imagen</button></>}</div>
          <fieldset className="field"><legend className="label">Opciones (marca la correcta)</legend>
            {LETTERS.map((l, i) => (
              <div key={l} className="b-check">
                <input type="radio" name="answer" aria-label={`Opción ${l} es la correcta`} checked={d.answer === l} onChange={() => set("answer", l)} />
                <strong>{l}</strong>
                <input style={{ flex: 1 }} aria-label={`Texto de la opción ${l}`} value={d.options[i]} onChange={(e) => setOpt(i, e.target.value)} />
              </div>
            ))}
          </fieldset>
          <label className="field"><span className="label">Explicación (opcional, la ven los estudiantes al revisar)</span>
            <textarea rows={3} value={d.explanation} onChange={(e) => set("explanation", e.target.value)} /></label>
          <label className="field"><span className="label">Quién puede usarla</span>
            <Select value={d.visibility} onChange={(v) => set("visibility", v)}>
              <option value="private">Solo yo</option>
              <option value="school">Docentes de mi colegio</option>
            </Select></label>
          <p className="caption">Sube solo material propio o que tengas derecho a usar, sin datos de estudiantes.</p>
          {msgs.length > 0 && <div role="alert" className="notice error">{msgs.map((m) => <div key={m}>{m}</div>)}</div>}
          <div className="report-actions">
            <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
        <div className="card t-card b-mine" aria-label="Vista previa">
          <span className="label">Así la verán los estudiantes</span>
          <QuestionView question={previewQ} answer={null} figures={null} report={false} examLabel="" />
        </div>
      </div>
    </>
  );
}
