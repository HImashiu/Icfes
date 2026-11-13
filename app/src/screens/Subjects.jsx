import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import TaskRow, { dueText } from "../components/TaskRow.jsx";
import { Select } from "../components/Controls.jsx";
import { StudentAnnouncements } from "../components/Announcements.jsx";
import { activeAnnouncements } from "../lib/announcements.js";
import { loadHistory } from "../lib/local.js";
import { practiceInsights, studentSubjects, studentTasks, teacherLabel } from "../lib/student.js";
import { areaShort, contextColor } from "../lib/teaching.js";
import { mergeTasks } from "../lib/condorTeacher.js";
import { daysUntil } from "../lib/goal.js";

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendientes" },
  { id: "delivered", label: "Entregadas" },
  { id: "missed", label: "No entregadas" },
];
const GROUP_TITLE = { pending: "Pendientes", paper: "En papel, en el salón", scheduled: "Próximas", delivered: "Entregadas", missed: "Cerradas sin entregar" };
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Materias: one card per subject (with its teacher) and every task of every subject, with filters. A subject opens
// its own page. `tab` is "materias" or "tareas"; `subjectId` opens one subject.
export default function Subjects({ condor = null, onGoal, announcements = [], independent = false, assigned, classes, course, tab, subjectId, onTab, onOpenSubject, onBack, onStartAssigned, onOpenAssigned, onPracticeArea, onLogin }) {
  const now = Date.now();
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [assigned, classes]); // eslint-disable-line react-hooks/exhaustive-deps
  const teacherTasks = useMemo(() => (assigned ? studentTasks({ subjects, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [subjects, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  // A student with no teacher: Profesor Cóndor's tasks join the list (lib/condorTeacher.js).
  const tasks = condor ? mergeTasks(teacherTasks, condor.rows) : teacherTasks;
  const ins = useMemo(() => practiceInsights(loadHistory(), now), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!assigned) {
    return (
      <section className="subjects">
        <header className="screen-head"><h1>Materias</h1></header>
        <div className="card sh-allclear">
          <Mascot size={64} />
          <div><strong>Tus materias aparecen al iniciar sesión</strong><span className="caption">Con tu cuenta ves cada materia, tu práctica por área y, si un docente te agrega a su clase, sus tareas y tus notas.</span></div>
          {onLogin && <button type="button" className="primary" onClick={onLogin}>Iniciar sesión</button>}
        </div>
      </section>
    );
  }

  // Tasks only exist when a teacher has the student in a class. Without any (a student practising on their own, or
  // one whose school hasn't added them yet) the page is just the subjects: no Tareas tab, no course tile.
  const hasClass = Boolean(classes?.length) || tasks.length > 0 || Boolean(condor);
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : null;
  if (subject) return <SubjectPage independent={independent} announcements={activeAnnouncements(announcements, { courseIds: subject.courseIds })} subject={subject} tasks={tasks.filter((t) => t.subject?.id === subject.id)} ins={ins} now={now} onBack={onBack} onStartAssigned={onStartAssigned} onOpenAssigned={onOpenAssigned} onPracticeArea={onPracticeArea} />;

  return (
    <section className="subjects">
      <header className="screen-head">
        <h1>Materias</h1>
        {course && <span className="sj-course">Curso {course}</span>}
      </header>
      {hasClass && <div className="segmented sj-tabs" role="tablist" aria-label="Materias o tareas">
        <button type="button" role="tab" aria-selected={tab !== "tareas"} className={tab !== "tareas" ? "seg active" : "seg"} onClick={() => onTab("materias")}>Mis materias <span className="muted">{subjects.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "tareas"} className={tab === "tareas" ? "seg active" : "seg"} onClick={() => onTab("tareas")}>Tareas <span className="muted">{tasks.filter((t) => t.status === "pending").length} pendientes</span></button>
      </div>}
      {hasClass && tab === "tareas"
        ? <TaskList condor={condor} onGoal={onGoal} tasks={tasks} subjects={subjects} now={now} onStartAssigned={onStartAssigned} onOpenAssigned={onOpenAssigned} />
        : <SubjectGrid subjects={subjects} tasks={tasks} course={course} independent={independent} hasClass={hasClass} ins={ins} now={now} onOpenSubject={onOpenSubject} onTasks={() => onTab("tareas")} />}
    </section>
  );
}

function SubjectGrid({ subjects, tasks, course, independent, hasClass, ins, now, onOpenSubject, onTasks }) {
  if (!subjects.length) {
    return (
      <div className="card sh-allclear">
        <Mascot size={56} />
        <div><strong>Aún no tienes materias</strong><span className="caption">Aparecen cuando tu colegio te agrega a sus clases. Si ya debería estar, pídele a tu docente que revise que tu correo esté en la lista.</span></div>
      </div>
    );
  }
  const practice = Object.fromEntries(ins.areas.map((a) => [a.name, a]));
  return (
    <div className="sj-grid">
      {subjects.map((s) => {
        const mine = s.area ? practice[s.area] : null;
        return (
          <button key={s.id} type="button" className="card sj-card" style={{ "--c": s.color }} onClick={() => onOpenSubject(s.id)}>
            <span className="sj-band" aria-hidden="true" />
            <span className="sj-head">
              <strong>{s.name}</strong>
              <span className="sj-avg"><b>{s.last == null ? "—" : `${s.last} %`}</b><span className="caption">última actividad</span></span>
            </span>
            <span className="sj-teacher">
              <span className="sj-avatar" aria-hidden="true">{s.teacher ? initials(s.teacher.split(",")[0]) : "?"}</span>
              <span><span className="caption">{s.teacher || s.courseTeacher ? "Docente" : hasClass ? "Sin clase propia" : "Tu práctica"}</span><b>{teacherLabel(s, { independent })}</b></span>
            </span>
            <span className="td-spark sj-spark" aria-hidden="true">{(s.series.length ? s.series : [0]).map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: s.color, opacity: i === s.series.length - 1 ? 1 : 0.45 }} />)}</span>
            <span className="sj-foot">
              {s.next ? <span className="sh-due">{s.pending} pendiente{s.pending === 1 ? "" : "s"} · {dueText(s.next.due_at, now).toLowerCase()}</span> : <span className="caption">{s.total ? `Al día · ${s.done}/${s.total} entregadas` : s.avg != null ? "Nota según tus simulacros" : hasClass ? "Sin tareas aún" : mine ? "Según tu práctica" : "Toca para practicar"}</span>}
              {mine && <span className="caption">Tu práctica: {mine.pct} %</span>}
            </span>
          </button>
        );
      })}
      {hasClass && <CourseCard tasks={tasks} course={course} now={now} onTasks={onTasks} />}
    </div>
  );
}

// The last tile of the grid: the whole course at a glance (all subjects together) and the way to every task.
function CourseCard({ tasks, course, now, onTasks }) {
  const pending = tasks.filter((t) => t.status === "pending");
  const scored = tasks.filter((t) => t.pct != null);
  const week = pending.filter((t) => t.a.due_at && new Date(t.a.due_at) - now < 7 * 864e5).length;
  return (
    <button type="button" className="card sj-card sj-course-card" onClick={onTasks}>
      <span className="sj-head"><strong>{course ? `Curso ${course}` : "Todas tus materias"}</strong><Icon name="right" /></span>
      <span className="sj-course-stats">
        <span><b>{pending.length}</b><span className="caption">pendientes</span></span>
        <span><b>{week}</b><span className="caption">cierran esta semana</span></span>
        <span><b>{scored.length ? `${Math.round(scored.reduce((a, t) => a + t.pct, 0) / scored.length)} %` : "—"}</b><span className="caption">promedio</span></span>
      </span>
      <span className="caption">Ver todas las tareas, con filtros por materia</span>
    </button>
  );
}

function TaskList({ condor, onGoal, tasks, subjects, now, onStartAssigned, onOpenAssigned }) {
  const [filter, setFilter] = useState("all");
  const [subject, setSubject] = useState("");
  const shown = tasks.filter((t) => (filter === "all" || t.status === filter || (filter === "pending" && (t.status === "scheduled" || t.status === "paper"))) && (!subject || t.subject?.id === subject));
  const groups = ["pending", "paper", "scheduled", "delivered", "missed"].map((g) => [g, shown.filter((t) => t.status === g)]).filter(([, l]) => l.length);
  const done = tasks.filter((t) => t.status === "delivered");
  const lastScored = done.find((t) => t.pct != null);
  return (
    <>
      {condor && <CondorCard condor={condor} now={now} onGoal={onGoal} />}
      <div className="sj-summary">
        <span className="card"><b>{tasks.filter((t) => t.status === "pending").length}</b><span className="caption">pendientes</span></span>
        <span className="card"><b>{done.length}</b><span className="caption">entregadas</span></span>
        <span className="card"><b>{lastScored ? `${lastScored.pct} %` : "—"}</b><span className="caption">última entrega</span></span>
      </div>
      <div className="sj-filters">
        <div className="chips" role="radiogroup" aria-label="Filtrar tareas">
          {FILTERS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={filter === f.id ? "chip on" : "chip"} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
        <Select value={subject} onChange={setSubject} aria-label="Materia">
          <option value="">Todas las materias</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      {groups.length === 0 && <div className="card"><span className="caption">No hay tareas con ese filtro.</span></div>}
      {groups.map(([g, list]) => (
        <div key={g} className="card sh-card">
          <div className="section-head"><span className="label">{GROUP_TITLE[g]}</span><span className="caption">{list.length}</span></div>
          {list.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} onOpen={onOpenAssigned} now={now} />)}
        </div>
      ))}
    </>
  );
}

// Who Profesor Cóndor is and how it decides, in one card above the list: the goal it plans for, the phase, and the
// rules in plain words (no model behind it, the same answers always give the same tasks).
function CondorCard({ condor, now, onGoal }) {
  const [open, setOpen] = useState(false);
  const left = daysUntil(condor.goal.examDate, now);
  const weak = condor.needs.filter((n) => n.gap != null && n.gap > 0).sort((a, b) => b.gap - a.gap)[0];
  const diag = condor.needs.filter((n) => n.diagnostic);
  return (
    <div className="card condor-card">
      <Mascot size={64} pose="happy" idle />
      <div className="condor-main">
        <span className="label">Profesor Cóndor</span>
        <strong>{condor.rest ? "Hoy descansas: no hay tareas nuevas." : `Hoy te dejo ${condor.tasks.length} ${condor.tasks.length === 1 ? "tarea" : "tareas"}.`}</strong>
        <span className="caption">
          {`Meta: ${condor.goal.target} puntos · ${condor.perDay} preguntas al día`}
          {left == null ? " · sin fecha de examen" : left >= 0 ? ` · faltan ${left} ${left === 1 ? "día" : "días"} (${condor.label.toLowerCase()})` : ""}
        </span>
        {open && (
          <ul className="condor-rules caption">
            <li>{diag.length ? `Primero mido ${diag.map((n) => areaShort(n.name)).join(", ")}: necesito al menos 10 respuestas tuyas en cada área.` : weak ? `Tu área con más distancia a la meta es ${areaShort(weak.name)} (${weak.pct} %, la meta pide ${weak.goalPct} %): aparece más días.` : "Vas cerca de tu meta en todas las áreas: subo el nivel de las preguntas."}</li>
            <li>Las preguntas nuevas van a tu nivel: si aciertas poco, empiezo por las fáciles; si aciertas mucho, por las difíciles.</li>
            <li>Cada pregunta que fallas vuelve a los 1, 3, 7 y 14 días hasta que la aciertes cuatro veces.</li>
            <li>{condor.help}</li>
            <li>Las tareas usan tus preguntas de práctica del día. Lo que no hagas hoy no se acumula.</li>
          </ul>
        )}
        <span className="condor-actions">
          <button type="button" className="link" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar" : "Cómo decido tus tareas"}</button>
          {onGoal && <button type="button" className="link" onClick={onGoal}>Cambiar mi meta</button>}
        </span>
      </div>
    </div>
  );
}

function SubjectPage({ independent, announcements, subject: s, tasks, ins, now, onBack, onStartAssigned, onOpenAssigned, onPracticeArea }) {
  const pending = tasks.filter((t) => t.status === "pending" || t.status === "scheduled" || t.status === "paper");
  const done = tasks.filter((t) => t.status === "delivered" || t.status === "missed");
  const areas = s.area ? ins.areas.filter((a) => a.name === s.area) : [...ins.areas].reverse();
  const area = s.area ? areas[0] : null;
  const scored = done.filter((t) => t.pct != null).reverse();
  return (
    <section className="subjects sp-page" style={{ "--c": s.color }}>
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver a materias"><Icon name="left" /></button>
        <h1>{s.name}</h1>
      </header>

      <div className="card sjp-hero">
        <span className="sjp-band" aria-hidden="true" />
        <div className="sjp-who">
          <span className="sj-avatar big" aria-hidden="true">{s.teacher ? initials(s.teacher.split(",")[0]) : "?"}</span>
          <span><span className="caption">{s.teacher || s.courseTeacher ? "Docente" : s.total ? "Sin clase propia" : "Tu práctica"}{s.group ? ` · ${s.group}` : ""}</span><strong>{teacherLabel(s, { independent })}</strong></span>
        </div>
        <div className="sjp-kpis">
          <span><b>{s.last == null ? "—" : `${s.last} %`}</b><span className="caption">última actividad</span></span>
          <span><b>{s.done}/{s.total}</b><span className="caption">entregadas</span></span>
          <span><b>{area ? `${area.pct} %` : "—"}</b><span className="caption">{s.area ? "tu práctica" : "práctica"}</span></span>
        </div>
        {s.area && <button type="button" className="primary" onClick={() => onPracticeArea(s.area)}>Practicar {areaShort(s.area)}</button>}
      </div>

      <div className="sh-grid">
        <div className="sh-col">
          <StudentAnnouncements rows={announcements} title="Anuncios de la materia" />
          <div className="card sh-card">
            <div className="section-head"><span className="label">Por hacer</span><span className="caption">{pending.length}</span></div>
            {pending.length ? pending.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} onOpen={onOpenAssigned} now={now} showSubject={false} />)
              : <span className="caption">Nada pendiente en {s.name}.</span>}
          </div>
          <div className="card sh-card">
            <div className="section-head"><span className="label">Entregadas y cerradas</span><span className="caption">{done.length}</span></div>
            {done.length ? done.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} onOpen={onOpenAssigned} now={now} showSubject={false} />)
              : <span className="caption">Todavía no has entregado tareas de esta materia.</span>}
          </div>
        </div>
        <div className="sh-col">
          {scored.length > 1 && (
            <div className="card sh-card">
              <div className="section-head"><span className="label">Tus notas en orden</span><span className="caption">de la primera a la última</span></div>
              <div className="sjp-bars">
                {scored.map((t) => <span key={t.a.id} title={`${t.a.title}: ${t.pct} %`} style={{ height: `${Math.max(6, t.pct)}%` }}><i>{t.pct}</i></span>)}
              </div>
            </div>
          )}
          <div className="card sh-card">
            <div className="section-head"><span className="label">{s.area ? `Tu práctica en ${areaShort(s.area)}` : "Tu práctica por área"}</span></div>
            {areas.length === 0 && <span className="caption">Cuando practiques {s.area ? areaShort(s.area) : "un área"}, aquí ves tus aciertos y cómo vas cambiando.</span>}
            {areas.map((a) => (
              <button key={a.name} type="button" className="sjp-area" onClick={() => onPracticeArea(a.name)}>
                <span className="dot" style={{ background: contextColor(a.name) }} />
                <span className="sjp-area-main"><strong>{areaShort(a.name)}</strong><span className="caption">{a.answered} preguntas · {a.sessions} {a.sessions === 1 ? "vez" : "veces"}</span></span>
                <span className="td-spark" aria-hidden="true">{a.series.map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: a.color, opacity: i === a.series.length - 1 ? 1 : 0.45 }} />)}</span>
                <b>{a.pct} %</b>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
