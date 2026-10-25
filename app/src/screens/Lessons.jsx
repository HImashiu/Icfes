import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { Select } from "../components/Controls.jsx";
import { DEFAULT_SETTINGS, introOf, questionItems, questionKeys } from "../lib/lesson.js";
import LessonCover from "../components/LessonCover.jsx";
import AssignBuilder from "./AssignBuilder.jsx";
import LessonEditor from "./LessonEditor.jsx";
import "./teach.css";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

// Sección “Clases”: presentaciones con las preguntas del banco. Cada clase se proyecta, se juega en vivo,
// se imprime o se convierte en una actividad para los estudiantes.
export default function Lessons({ api, profile, courses, assignments, exams, fetchExam, guard, setNotice, reload }) {
  const [rows, setRows] = useState(undefined); // undefined = loading, null = table missing
  const [view, setView] = useState({ mode: "list" });
  const [from, setFrom] = useState("");

  const load = useCallback(() => guard(async () => setRows(await api.lessons())), [api, guard]);
  useEffect(() => { load(); }, [load]);

  const create = async ({ keys, slug, title }) => {
    if (keys.length === 0) throw new Error("Elige al menos una pregunta.");
    const row = await api.saveLesson({
      school_id: profile.school_id, owner_id: profile.id, title: title || "Clase sin título", exam_slug: slug,
      items: questionItems(keys), settings: DEFAULT_SETTINGS, visibility: "private",
    });
    await load();
    setView({ mode: "open", id: row.id, row });
  };
  const fromAssignment = () => {
    const a = assignments.find((x) => x.id === from);
    if (!a) return;
    const keys = a.question_keys ?? [];
    if (keys.length === 0) { setNotice("Esa asignación usa todo el cuadernillo: elige las preguntas en el banco."); return; }
    guard(() => create({ keys, slug: a.exam_slug, title: a.title }));
  };

  if (view.mode === "new") {
    return (
      <>
        <header className="t-head"><div><h1>Nueva clase</h1><span className="caption">Elige las preguntas del banco; después agregas diapositivas de texto y decides cómo usarla.</span></div></header>
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} onCancel={() => setView({ mode: "list" })}
          lesson={{ label: "Crear clase", onCreate: create }} />
      </>
    );
  }
  if (view.mode === "open") {
    const row = rows?.find((r) => r.id === view.id) ?? view.row;
    return (
      <LessonEditor key={row.id} api={api} profile={profile} row={row} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard}
        setNotice={setNotice} reload={reload} autoPresent={Boolean(view.present)} onBack={() => { setView({ mode: "list" }); load(); }}
        onSaved={() => load()} onDeleted={() => load()} />
    );
  }

  const withKeys = assignments.filter((a) => (a.question_keys ?? []).length > 0 && !a.assignee_id);
  return (
    <>
      <header className="t-head">
        <div><h1>Clases para proyectar</h1><span className="caption">Tu portada, tus diapositivas y las preguntas ICFES del banco. Cada pregunta se revela paso a paso; al proyectar tienes lápiz, conteo de manos, sorteo de quién responde y cronómetro.</span></div>
        <button type="button" className="primary" onClick={() => setView({ mode: "new" })}><Icon name="plus" size={18} />Nueva clase</button>
      </header>
      {rows === null && <p className="notice error">Las clases necesitan la migración 0017 en Supabase (supabase/migrations/0017_lessons_formats.sql). Córrela en el editor SQL y recarga.</p>}
      {withKeys.length > 0 && (
        <div className="card t-card assign-form">
          <strong>Proyectar una asignación que ya tienes</strong>
          <div className="b-auto">
            <Select value={from} onChange={(v) => setFrom(v)} aria-label="Asignación" placeholder="Elegir asignación…">
              {withKeys.map((a) => <option key={a.id} value={a.id}>{a.courses?.name} · {a.title} ({questionKeys(questionItems(a.question_keys)).length})</option>)}
            </Select>
            <button type="button" className="secondary" disabled={!from} onClick={fromAssignment}>Crear clase con estas preguntas</button>
          </div>
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="card t-card empty-card">
          <span className="drop-ico"><Icon name="play" size={26} /></span>
          <strong>Todavía no tienes clases</strong>
          <span className="caption">Elige preguntas del banco, proyéctalas con respuestas controladas y después conviértelas en tarea, quiz o examen.</span>
        </div>
      )}
      <div className="les-grid">
        {(rows ?? []).map((r) => {
          const nq = questionKeys(r.items).length;
          const slides = (r.items ?? []).length;
          return (
            <div key={r.id} className="les-card">
              <button type="button" className="les-card-cover" onClick={() => setView({ mode: "open", id: r.id, row: r })} aria-label={`Abrir ${r.title || "Clase sin título"}`}>
                <LessonCover intro={introOf(r)} count={nq} preview />
              </button>
              <button type="button" className="les-card-open" onClick={() => setView({ mode: "open", id: r.id, row: r })}><strong>{r.title || "Clase sin título"}</strong></button>
              <span className="caption">{nq} {nq === 1 ? "pregunta" : "preguntas"}{slides > nq ? ` · ${slides - nq} de texto` : ""} · {exams.find((e) => e.slug === r.exam_slug)?.title ?? r.exam_slug}</span>
              <span className="chips-row">
                {r.owner_id !== profile.id && <span className="badge pending">De un colega</span>}
                {r.owner_id === profile.id && r.visibility === "school" && <span className="badge">Compartida con el colegio</span>}
                <span className="badge pending">Editada {shortDate(r.updated_at)}</span>
              </span>
              <span className="les-card-actions">
                <button type="button" className="primary" disabled={nq === 0} onClick={() => setView({ mode: "open", id: r.id, row: r, present: true })}><Icon name="play" size={16} />Proyectar</button>
                <button type="button" className="secondary" onClick={() => setView({ mode: "open", id: r.id, row: r })}>Abrir</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
