import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import AssignmentReport from "../AssignmentReport.jsx";
import Paper from "../Paper.jsx";
import GradingSettings from "../GradingSettings.jsx";
import { assignmentState, scorePct, whoOf } from "../../lib/assignments.js";
import { MODEL_KINDS, resolveModel } from "../../lib/grading.js";
import { areaOf, areaShort, contextColor, groupOf } from "../../lib/teaching.js";
import { TABS } from "../../lib/teacherRoutes.js";

const KIND_LABEL = { task: "Tarea", homework: "Tarea", exam: "Examen" };
const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

// The steps of an activity, with what each one holds now: create, deliver, collect, grade, results.
export function activitySteps({ assignment, students, attempts, paper, model, now = Date.now() }) {
  const state = assignmentState(assignment, now);
  const done = attempts.filter((t) => t.submitted_at);
  const who = new Set(done.map(whoOf).filter(Boolean));
  const pcts = done.map(scorePct).filter((p) => p != null);
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const count = assignment.question_keys?.length;
  const complete = students > 0 && who.size >= students;
  const collecting = state === "active" || (state === "closed" && !complete && who.size > 0);
  return [
    { id: "crear", label: "Crear", value: count ? `${count} preguntas` : "Cuadernillo completo", note: "Clave preliminar", status: "done" },
    { id: "entregar", label: "Entregar", value: paper ? "En papel" : "En línea", note: state === "scheduled" ? `Abre ${shortDate(assignment.opens_at)}` : assignment.due_at ? `${state === "closed" ? "Cerró" : "Hasta"} ${shortDate(assignment.due_at)}` : "Sin fecha de cierre", status: state === "scheduled" ? "now" : "done" },
    { id: "recoger", label: "Recoger", value: `${who.size} de ${students}`, note: complete ? "Completo" : paper ? "Hojas escaneadas" : "Entregas", status: complete ? "done" : collecting ? "now" : "next" },
    { id: "calificar", label: "Calificar", value: MODEL_KINDS.find((k) => k.id === model?.kind)?.label ?? "Porcentaje", note: who.size ? "Se calcula solo" : "Al recoger", status: who.size ? "done" : "next" },
    { id: "resultados", label: "Resultados", value: avg == null ? "Sin entregas" : `${avg} % promedio`, note: complete ? "Listos" : who.size ? "Parciales" : "Aún no", status: complete ? "now" : who.size ? "now" : "next" },
  ];
}

export default function ActivityPage({ api, profile, assignment, course, tab, go, models, reloadModels, fetchExam, guard, setNotice, reload, assignments, courses, onScanned, focusMember, onOpenStudent }) {
  const [info, setInfo] = useState(null);
  const [scanNow, setScanNow] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [members, attempts] = await Promise.all([api.listMembers(assignment.course_id), api.assignmentAttempts(assignment.id)]);
        const seating = await api.getSeating?.(assignment.id).catch(() => null);
        if (alive) setInfo({ students: members.filter((m) => m.role === "student").length, attempts, seating });
      } catch { if (alive) setInfo({ students: 0, attempts: [], seating: null }); }
    })();
    return () => { alive = false; };
  }, [api, assignment.id, assignment.course_id, version]);

  const model = useMemo(() => resolveModel(models, { assignmentId: assignment.id, courseId: assignment.course_id, schoolId: profile.school_id }), [models, assignment.id, assignment.course_id, profile.school_id]);
  const paper = Boolean(info?.seating) || (info?.attempts ?? []).some((t) => String(t.client_id ?? "").startsWith("paper-"));
  const steps = info ? activitySteps({ assignment, students: info.students, attempts: info.attempts, paper, model: model.model }) : null;
  const area = areaOf(course ?? {});
  const tint = contextColor(area ?? "");
  const state = assignmentState(assignment);
  // The same activity sent to other classes (created together: same title, booklet and questions).
  const related = useMemo(() => {
    const sig = (a) => `${a.title}|${a.exam_slug}|${[...(a.question_keys ?? [])].sort().join(",")}`;
    return (assignments ?? []).filter((a) => a.id !== assignment.id && a.course_id !== assignment.course_id && sig(a) === sig(assignment))
      .map((a) => ({ assignment: a, course: (courses ?? []).find((c) => c.id === a.course_id) ?? null }));
  }, [assignments, courses, assignment]);
  const scanned = ({ count, average }) => { setScanNow(false); setVersion((v) => v + 1); onScanned({ assignment, course, count, average }); };

  return (
    <div className="ap" style={{ "--ctx": tint }}>
      <header className="ap-head">
        <div className="ap-title">
          <span className="ap-chips">
            <span className="chip ap-chip"><span className="ctx-dot" style={{ background: tint }} aria-hidden="true" />{area ? areaShort(area) : "Varias áreas"} · {groupOf(course ?? {}).name}</span>
            <span className="chip">{KIND_LABEL[assignment.kind] ?? "Actividad"}</span>
            <span className={`chip state-${state}`}>{{ active: "Abierta", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" }[state]}</span>
          </span>
          <h1>{assignment.title}</h1>
          <span className="caption">{course?.name}{assignment.due_at ? ` · cierra ${shortDate(assignment.due_at)}` : ""}</span>
        </div>
        <div className="ap-actions">
          <button type="button" className="secondary" onClick={() => go({ section: "actividad", id: assignment.id, tab: "papel" })}><Icon name="print" size={18} /> Imprimir</button>
          <button type="button" className="primary" onClick={() => { setScanNow(true); go({ section: "actividad", id: assignment.id, tab: "papel" }); }}><Icon name="camera" size={18} /> Escanear hojas</button>
        </div>
      </header>

      <ol className="ap-steps" aria-label="Recorrido de la actividad">
        {(steps ?? Array.from({ length: 5 }, (_, i) => ({ id: i, label: "…", value: "", note: "", status: "next" }))).map((s) => (
          <li key={s.id} className={`ap-step ${s.status}`}>
            <span className="ap-step-label">{s.status === "done" && <Icon name="check" size={13} strokeWidth={3.4} />}{s.label}</span>
            {s.id === "calificar"
              ? <button type="button" className="link ap-step-link" onClick={() => go({ section: "actividad", id: assignment.id, tab: "calificacion" })}><strong>{s.value}</strong></button>
              : <strong>{s.value}</strong>}
            <span className="caption">{s.id === "calificar" ? "Toca para cambiarla" : s.note}</span>
          </li>
        ))}
      </ol>

      <div className="seg-tabs" role="tablist" aria-label="Secciones de la actividad">
        {TABS.actividad.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => go({ section: "actividad", id: assignment.id, tab: id })}>{label}</button>
        ))}
      </div>

      {tab === "resultados" && (
        <AssignmentReport key={`${assignment.id}-${version}`} api={api} model={model.model} modelSource={model.source} assignment={assignment} course={course} related={related} fetchExam={fetchExam} guard={guard} reload={reload} initialStudent={focusMember}
          onGrading={() => go({ section: "actividad", id: assignment.id, tab: "calificacion" })} onOpenStudent={onOpenStudent} />
      )}
      {tab === "papel" && (
        <Paper key={`${assignment.id}-${scanNow}`} api={api} assignments={[assignment]} fetchExam={fetchExam} guard={guard} setNotice={setNotice} fixedId={assignment.id} embedded initialMode={scanNow ? "scan" : null} onSaved={scanned} />
      )}
      {tab === "calificacion" && (
        <>
          <GradingSettings api={api} profile={profile} courses={courses.filter((c) => c.id === assignment.course_id)} assignments={[assignment]} models={models} reloadModels={reloadModels} guard={guard} setNotice={setNotice} initialTarget={`assignment:${assignment.id}`} embedded fetchExam={fetchExam} />
        </>
      )}
      {!TABS.actividad.some(([id]) => id === tab) && null}
      {assignments.length > 1 && <p className="caption ap-note">Otras actividades de {groupOf(course ?? {}).name}: {assignments.filter((a) => a.course_id === assignment.course_id && a.id !== assignment.id).slice(0, 4).map((a, i) => (
        <span key={a.id}>{i ? " · " : ""}<button type="button" className="link" onClick={() => go({ section: "actividad", id: a.id })}>{a.title}</button></span>
      ))}</p>}
    </div>
  );
}
