import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import TaskRow, { dueText } from "../components/TaskRow.jsx";
import { Select } from "../components/Controls.jsx";
import { loadHistory } from "../lib/local.js";
import { practiceInsights, studentSubjects, studentTasks, teacherLabel } from "../lib/student.js";
import { areaShort, contextColor } from "../lib/teaching.js";

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
export default function Subjects({ assigned, classes, course, tab, subjectId, onTab, onOpenSubject, onBack, onStartAssigned, onPracticeArea, onLogin }) {
  const now = Date.now();
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [assigned, classes]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => (assigned ? studentTasks({ subjects, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [subjects, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  const ins = useMemo(() => practiceInsights(loadHistory(), now), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!assigned) {
    return (
      <section className="subjects">
        <header className="screen-head"><h1>Materias</h1></header>
        <div className="card sh-allclear">
          <Mascot size={64} />
          <div><strong>Tus materias aparecen al iniciar sesión</strong><span className="caption">Con la cuenta del colegio ves cada materia con su docente, las tareas que te asignan y tus notas.</span></div>
          {onLogin && <button type="button" className="primary" onClick={onLogin}>Iniciar sesión</button>}
        </div>
      </section>
    );
  }

  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : null;
  if (subject) return <SubjectPage subject={subject} tasks={tasks.filter((t) => t.subject?.id === subject.id)} ins={ins} now={now} onBack={onBack} onStartAssigned={onStartAssigned} onPracticeArea={onPracticeArea} />;

  return (
    <section className="subjects">
      <header className="screen-head">
        <h1>Materias</h1>
        {course && <span className="sj-course">Curso {course}</span>}
      </header>
      <div className="segmented sj-tabs" role="tablist" aria-label="Materias o tareas">
        <button type="button" role="tab" aria-selected={tab !== "tareas"} className={tab !== "tareas" ? "seg active" : "seg"} onClick={() => onTab("materias")}>Mis materias <span className="muted">{subjects.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "tareas"} className={tab === "tareas" ? "seg active" : "seg"} onClick={() => onTab("tareas")}>Tareas <span className="muted">{tasks.filter((t) => t.status === "pending").length} pendientes</span></button>
      </div>
      {tab === "tareas"
        ? <TaskList tasks={tasks} subjects={subjects} now={now} onStartAssigned={onStartAssigned} />
        : <SubjectGrid subjects={subjects} tasks={tasks} course={course} ins={ins} now={now} onOpenSubject={onOpenSubject} onTasks={() => onTab("tareas")} />}
    </section>
  );
}

function SubjectGrid({ subjects, tasks, course, ins, now, onOpenSubject, onTasks }) {
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
              <span className="sj-avg"><b>{s.avg == null ? "—" : `${s.avg} %`}</b><span className="caption">en tareas</span></span>
            </span>
            <span className="sj-teacher">
              <span className="sj-avatar" aria-hidden="true">{s.teacher ? initials(s.teacher.split(",")[0]) : "?"}</span>
              <span><span className="caption">{s.teacher ? "Docente" : s.noClass ? "Sin clase propia" : "Docente"}</span><b>{teacherLabel(s)}</b></span>
            </span>
            <span className="td-spark sj-spark" aria-hidden="true">{(s.series.length ? s.series : [0]).map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: s.color, opacity: i === s.series.length - 1 ? 1 : 0.45 }} />)}</span>
            <span className="sj-foot">
              {s.next ? <span className="sh-due">{s.pending} pendiente{s.pending === 1 ? "" : "s"} · {dueText(s.next.due_at, now).toLowerCase()}</span> : <span className="caption">{s.total ? `Al día · ${s.done}/${s.total} entregadas` : s.avg != null ? "Nota según tus simulacros" : "Sin tareas aún"}</span>}
              {mine && <span className="caption">Tu práctica: {mine.pct} %</span>}
            </span>
          </button>
        );
      })}
      <CourseCard tasks={tasks} course={course} now={now} onTasks={onTasks} />
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

function TaskList({ tasks, subjects, now, onStartAssigned }) {
  const [filter, setFilter] = useState("all");
  const [subject, setSubject] = useState("");
  const shown = tasks.filter((t) => (filter === "all" || t.status === filter || (filter === "pending" && (t.status === "scheduled" || t.status === "paper"))) && (!subject || t.subject?.id === subject));
  const groups = ["pending", "paper", "scheduled", "delivered", "missed"].map((g) => [g, shown.filter((t) => t.status === g)]).filter(([, l]) => l.length);
  const done = tasks.filter((t) => t.status === "delivered");
  const avg = done.filter((t) => t.pct != null);
  return (
    <>
      <div className="sj-summary">
        <span className="card"><b>{tasks.filter((t) => t.status === "pending").length}</b><span className="caption">pendientes</span></span>
        <span className="card"><b>{done.length}</b><span className="caption">entregadas</span></span>
        <span className="card"><b>{avg.length ? `${Math.round(avg.reduce((a, t) => a + t.pct, 0) / avg.length)} %` : "—"}</b><span className="caption">tu promedio</span></span>
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
          {list.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} now={now} />)}
        </div>
      ))}
    </>
  );
}

function SubjectPage({ subject: s, tasks, ins, now, onBack, onStartAssigned, onPracticeArea }) {
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
          <span><span className="caption">{s.teacher ? "Docente" : "Sin clase propia"}{s.group ? ` · ${s.group}` : ""}</span><strong>{teacherLabel(s)}</strong></span>
        </div>
        <div className="sjp-kpis">
          <span><b>{s.avg == null ? "—" : `${s.avg} %`}</b><span className="caption">promedio en tareas</span></span>
          <span><b>{s.done}/{s.total}</b><span className="caption">entregadas</span></span>
          <span><b>{area ? `${area.pct} %` : "—"}</b><span className="caption">{s.area ? "tu práctica" : "práctica"}</span></span>
        </div>
        {s.area && <button type="button" className="primary" onClick={() => onPracticeArea(s.area)}>Practicar {areaShort(s.area)}</button>}
      </div>

      <div className="sh-grid">
        <div className="sh-col">
          <div className="card sh-card">
            <div className="section-head"><span className="label">Por hacer</span><span className="caption">{pending.length}</span></div>
            {pending.length ? pending.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} now={now} showSubject={false} />)
              : <span className="caption">Nada pendiente en {s.name}.</span>}
          </div>
          <div className="card sh-card">
            <div className="section-head"><span className="label">Entregadas y cerradas</span><span className="caption">{done.length}</span></div>
            {done.length ? done.map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} now={now} showSubject={false} />)
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
