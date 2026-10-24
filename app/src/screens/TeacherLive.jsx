import { useCallback, useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo.jsx";
import { assignmentState } from "../lib/assignments.js";
import { resolveModel } from "../lib/grading.js";
import { areaColor } from "../lib/brand.js";
import { parseRoster } from "../lib/roster.js";
import { CONSENT_VERSION, GUARDIAN_TEXT, hasGuardianAuth } from "../lib/consent.js";
import AssignBuilder from "./AssignBuilder.jsx";
import AssignmentReport from "./AssignmentReport.jsx";
import Dashboard from "./Dashboard.jsx";
import Paper from "./Paper.jsx";
import Reinforcement from "./Reinforcement.jsx";
import QuestionBuilder from "./QuestionBuilder.jsx";
import { LiveSection } from "./LiveHost.jsx";
import { FilePicker, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import BankEditor from "./BankEditor.jsx";
import TeacherReports from "./TeacherReports.jsx";
import GradingSettings from "./GradingSettings.jsx";
import { GRADES, SUBJECTS, gradeLabel, spaceName } from "../lib/spaces.js";
import { Select } from "../components/Controls.jsx";

const NAV = [
  { group: "Mi clase" },
  { label: "Resumen", section: "home", icon: "home" },
  { label: "Espacios de clase", section: "courses", icon: "users" },
  { label: "Asignaciones", section: "assign", icon: "book" },
  { label: "Reportes", section: "reports", icon: "chart" },
  { label: "Calificación", section: "grading", icon: "pencil" },
  { group: "Contenido" },
  { label: "Banco de preguntas", section: "bank", icon: "school" },
  { label: "Mis preguntas", section: "questions", icon: "pencil" },
  { label: "Papel", section: "paper", icon: "print" },
  { label: "Refuerzo", section: "reinforce", icon: "bolt" },
  { label: "En vivo", section: "live", icon: "play" },
  { group: "Colegio", admin: true },
  { label: "Docentes", section: "staff", admin: true, icon: "shield" },
  { label: "Ajustes", section: "settings", admin: true, icon: "user" },
];
const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const KIND_ICON = { task: "bolt", homework: "book", exam: "clock" };
const STATE_LABEL = { active: "Activa", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };

// Panel docente con cuentas reales: cursos, listas de estudiantes, asignaciones y su avance.
export default function TeacherLive({ auth, exams, fetchExam, onExit }) {
  const { api, profile } = auth;
  const [section, setSection] = useState("home");
  const [focusCourse, setFocusCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [models, setModels] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const guard = useCallback(async (fn) => {
    setError(null);
    try { return await fn(); } catch (e) { setError(e.message); return undefined; }
  }, []);
  const reload = useCallback(
    () => guard(async () => { setCourses(await api.listCourses()); setAssignments(await api.listAssignments()); }),
    [api, guard],
  );
  const reloadModels = useCallback(() => guard(async () => { setModels(await api.gradingModels()); }), [api, guard]);
  useEffect(() => { reload(); reloadModels(); }, [reload, reloadModels]);

  return (
    <div className="teacher">
      <aside className="t-side" aria-label="Navegación docente">
        <strong className="t-logo"><Logo size={30} /> Cóndor</strong>
        <nav>
          {NAV.filter((n) => !n.admin || profile.role === "school_admin").map((n) => n.group ? (
            <span key={n.group} className="t-group">{n.group}</span>
          ) : (
            <button key={n.section} type="button" className={section === n.section ? "t-nav active" : "t-nav"} aria-current={section === n.section ? "page" : undefined} onClick={() => { setSection(n.section); setNotice(null); }}>
              <Icon name={n.icon} size={18} strokeWidth={2.4} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="card plan">
          <span className="label">{profile.full_name || profile.email}</span>
          <span className="caption">{profile.role === "school_admin" ? "Coordinación" : "Docente"} · clave de respuestas preliminar</span>
        </div>
        <button type="button" className="link t-exit" onClick={onExit}>
          <span className="t-exit-long">Volver a la app de estudiante</span>
          <span className="t-exit-short" aria-hidden="true">‹ Estudiante</span>
        </button>
      </aside>
      <main className="t-main">
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {section === "home" && <Dashboard api={api} profile={profile} guard={guard} onOpenCourse={(id) => { setFocusCourse(id); setSection("courses"); }} onReinforce={() => setSection("reinforce")} />}
        {section === "courses" && <Courses api={api} profile={profile} courses={courses} reload={reload} guard={guard} setNotice={setNotice} focus={focusCourse} />}
        {section === "assign" && (
          <Assignments api={api} profile={profile} courses={courses} assignments={assignments} models={models} exams={exams} fetchExam={fetchExam} reload={reload} guard={guard} setNotice={setNotice} />
        )}
        {section === "reports" && <TeacherReports api={api} profile={profile} courses={courses} assignments={assignments} models={models} fetchExam={fetchExam} guard={guard} />}
        {section === "grading" && <GradingSettings api={api} profile={profile} courses={courses} assignments={assignments} models={models} reloadModels={reloadModels} guard={guard} setNotice={setNotice} />}
        {section === "bank" && <BankEditor api={api} profile={profile} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} />}
        {section === "paper" && <Paper api={api} assignments={assignments} fetchExam={fetchExam} guard={guard} setNotice={setNotice} />}
        {section === "reinforce" && <Reinforcement api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} />}
        {section === "questions" && <QuestionBuilder api={api} profile={profile} guard={guard} setNotice={setNotice} />}
        {section === "live" && <LiveSection api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} AssignBuilder={AssignBuilder} />}
        {section === "staff" && <Staff api={api} profile={profile} guard={guard} setNotice={setNotice} />}
        {section === "settings" && <Settings api={api} profile={profile} guard={guard} setNotice={setNotice} />}
      </main>
    </div>
  );
}

function Courses({ api, profile, courses, reload, guard, setNotice, focus }) {
  const [subject, setSubject] = useState("Inglés");
  const [grade, setGrade] = useState("9");
  const [group, setGroup] = useState("A");
  const [custom, setCustom] = useState(null);
  const [open, setOpen] = useState(focus ?? null);
  const name = custom ?? spaceName({ subject, grade, group });

  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    guard(async () => {
      const c = await api.createCourse({ schoolId: profile.school_id, userId: profile.id, name: name.trim(), grade, subject, groupLabel: group.trim() });
      setCustom(null);
      setNotice(`Espacio ${c.name} creado. Ahora agrega a sus estudiantes.`);
      await reload();
      setOpen(c.id);
    });
  };

  return (
    <>
      <header className="t-head"><div><h1>Espacios de clase</h1><span className="caption">Un espacio por materia, grado y grupo (por ejemplo «Inglés 9no A»). Las asignaciones y los reportes se organizan por espacio.</span></div></header>
      <form className="card t-card assign-form" onSubmit={create}>
        <strong>Nuevo espacio</strong>
        <label className="field"><span className="label">Materia</span>
          <Select value={subject} onChange={(v) => { setSubject(v); setCustom(null); }} aria-label="Materia">{SUBJECTS.map((x) => <option key={x}>{x}</option>)}</Select></label>
        <label className="field"><span className="label">Grado</span>
          <Select value={grade} onChange={(v) => { setGrade(v); setCustom(null); }} aria-label="Grado">{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select></label>
        <label className="field"><span className="label">Grupo (A, B, 01…)</span><input value={group} onChange={(e) => { setGroup(e.target.value); setCustom(null); }} /></label>
        <label className="field"><span className="label">Nombre del espacio</span><input value={name} onChange={(e) => setCustom(e.target.value)} /></label>
        <div className="report-actions"><button type="submit" className="primary" disabled={!name.trim()}>Crear espacio</button></div>
      </form>
      {courses.length === 0 && <p className="caption">Todavía no tienes espacios de clase.</p>}
      {courses.map((c) => (
        <div key={c.id} className="card t-card">
          <div className="section-head">
            <strong>{c.name}{c.grade && !c.subject ? ` · Grado ${c.grade}` : ""}</strong>
            <button type="button" className="secondary" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Cerrar" : "Estudiantes"}</button>
          </div>
          {open === c.id && <Roster api={api} course={c} guard={guard} setNotice={setNotice} reload={reload} />}
        </div>
      ))}
    </>
  );
}

function Roster({ api, course, guard, setNotice, reload }) {
  const [members, setMembers] = useState([]);
  const [text, setText] = useState("");
  const load = useCallback(() => guard(async () => setMembers(await api.listMembers(course.id))), [api, course.id, guard]);
  useEffect(() => { load(); }, [load]);

  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  };
  const importRows = () =>
    guard(async () => {
      const n = await api.addStudents(course.id, parsed.rows);
      setText("");
      setNotice(`${n} estudiantes en ${course.name}. Entran cuando inicien sesión con su correo del colegio.`);
      await load();
    });
  const remove = (id) => guard(async () => { await api.removeMember(id); await load(); });
  const del = async () => {
    if (!(await confirmDialog(`¿Borrar el curso ${course.name} con sus tareas y resultados?`, { confirmLabel: "Borrar curso", danger: true }))) return;
    guard(async () => { await api.deleteCourse(course.id); await reload(); });
  };

  const students = members.filter((m) => m.role === "student");
  const teachers = members.filter((m) => m.role === "teacher");
  const [coEmail, setCoEmail] = useState("");
  const addTeacher = (e) => {
    e.preventDefault();
    const email = coEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    guard(async () => { await api.addStudents(course.id, [{ email, fullName: "" }], "teacher"); setCoEmail(""); setNotice(`${email} ahora es docente de ${course.name}.`); await load(); });
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <span className="label">Docentes del curso</span>
        <p className="caption">{teachers.map((t) => t.full_name || t.email).join(" · ") || "—"}</p>
        <form className="b-auto" onSubmit={addTeacher}>
          <input type="email" aria-label="Correo del docente" placeholder="docente@colegio.edu.co" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} />
          <button type="submit" className="secondary" disabled={!coEmail.trim()}>Agregar docente</button>
        </form>
      </div>
      <label className="field">
        <span className="label">Pegar lista o subir CSV (nombre, apellidos, correo)</span>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"nombre,apellidos,correo\nAna,Pérez,ana@colegio.edu.co"} />
      </label>
      <FilePicker accept=".csv,.txt,text/csv" onChange={onFile} aria-label="Subir archivo CSV" label="Subir archivo CSV" hint="o arrástralo aquí" />
      {parsed && (
        <div>
          <p className="caption">{parsed.rows.length} válidos{parsed.errors.length ? `, ${parsed.errors.length} con problema` : ""}.</p>
          {parsed.errors.slice(0, 8).map((er) => <p key={er.line} className="notice error">Línea {er.line}: {er.message}</p>)}
          <div className="report-actions">
            <button type="button" className="secondary" onClick={() => setText("")}>Limpiar</button>
            <button type="button" className="primary" disabled={parsed.rows.length === 0} onClick={importRows}>Agregar {parsed.rows.length}</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="t-table">
          <thead><tr><th>Estudiante</th><th>Correo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {students.map((m) => (
              <tr key={m.id}>
                <td>{m.full_name || "—"}</td><td>{m.email}</td>
                <td>{m.profile_id ? "Ya ingresó" : "Invitado"}</td>
                <td><button type="button" className="link" onClick={() => remove(m.id)} aria-label={`Quitar a ${m.email}`}>Quitar</button></td>
              </tr>
            ))}
            {students.length === 0 && <tr><td colSpan={4} className="caption">Sin estudiantes todavía.</td></tr>}
          </tbody>
        </table>
      </div>
      <button type="button" className="link" onClick={del}>Borrar este curso</button>
    </div>
  );
}

function Assignments({ api, profile, models, courses, assignments, exams, fetchExam, reload, guard, setNotice }) {
  const [composing, setComposing] = useState(false);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("active");
  const [space, setSpace] = useState("");
  const shown = assignments.filter((a) => (!space || a.course_id === space) && (tab === "active" ? ["active", "scheduled"] : ["closed", "draft"]).includes(assignmentState(a)));

  return (
    <>
      <header className="t-head">
        <div><h1>Asignaciones</h1></div>
        <button type="button" className="primary" onClick={() => { setComposing(true); setDetail(null); }} disabled={courses.length === 0}>Nueva asignación</button>
      </header>
      {courses.length === 0 && <p className="caption">Crea un espacio de clase primero.</p>}
      {composing && (
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard}
          onCancel={() => setComposing(false)}
          onSaved={(a, n) => { setComposing(false); setNotice(n > 1 ? `Asignado a ${n} cursos: ${a.title}.` : `Asignado: ${a.title}.`); reload(); }} />
      )}
      <div className="card t-card">
        <div className="section-head">
          <strong>Asignaciones</strong>
          {courses.length > 1 && <Select className="course-filter" aria-label="Espacio de clase" value={space} onChange={setSpace}><option value="">Todos los espacios</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
          <div className="segmented small" role="tablist">
            {[["active", "Activas"], ["closed", "Cerradas"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="caption">No hay asignaciones en esta pestaña.</p>}
        <div className="assign-cards">
          {shown.map((a) => {
            const state = assignmentState(a);
            return (
              <button key={a.id} type="button" className={`assign-card state-${state}`} aria-expanded={detail === a.id} onClick={() => setDetail(detail === a.id ? null : a.id)}>
                <span className="assign-icon" style={{ "--tile": a.scope === "all" ? "var(--accent)" : areaColor(a.scope) }} aria-hidden="true">
                  <Icon name={KIND_ICON[a.kind] ?? "book"} size={22} strokeWidth={2.4} />
                </span>
                <span className="assign-body">
                  <strong>{a.title}</strong>
                  <span className="caption">{a.courses?.name}{a.due_at ? ` · Entrega ${shortDate(a.due_at)}` : ""}</span>
                </span>
                <span className="assign-state">{STATE_LABEL[state]}</span>
                <span className="assign-chevron" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.8} /></span>
              </button>
            );
          })}
        </div>
      </div>
      {detail && assignments.find((a) => a.id === detail) && <AssignmentReport key={detail} api={api} model={resolveModel(models, { assignmentId: detail, courseId: assignments.find((a) => a.id === detail).course_id, schoolId: profile.school_id })} assignment={assignments.find((a) => a.id === detail)} fetchExam={fetchExam} guard={guard} reload={reload} />}
    </>
  );
}

function Staff({ api, profile, guard, setNotice }) {
  const [staff, setStaff] = useState([]);
  const load = useCallback(() => guard(async () => setStaff(await api.listStaff())), [api, guard]);
  useEffect(() => { load(); }, [load]);
  const change = async (p, role) => {
    const verb = role === "school_admin" ? "coordinación" : role === "teacher" ? "docente" : "estudiante";
    if (!(await confirmDialog(`¿Cambiar a ${p.full_name || p.email} a ${verb}?`, { confirmLabel: "Cambiar" }))) return;
    guard(async () => { await api.setRole(p.id, role); setNotice(`${p.full_name || p.email} ahora es ${verb}.`); await load(); });
  };
  const LABEL = { teacher: "Docente", school_admin: "Coordinación" };
  return (
    <>
      <header className="t-head"><div><h1>Docentes</h1><span className="caption">Quién puede crear cursos y asignaciones en el colegio.</span></div></header>
      <div className="card t-card">
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th /></tr></thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name || "—"}</td><td>{p.email}</td><td>{LABEL[p.role] ?? p.role}</td>
                  <td>{p.id !== profile.id && (
                    <>
                      {p.role === "teacher" && <button type="button" className="link" onClick={() => change(p, "school_admin")}>Hacer coordinación</button>}
                      {p.role === "school_admin" && <button type="button" className="link" onClick={() => change(p, "teacher")}>Pasar a docente</button>}
                      {" "}<button type="button" className="link" onClick={() => change(p, "student")}>Quitar permisos</button>
                    </>
                  )}</td>
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={4} className="caption">Todavía no hay docentes.</td></tr>}
            </tbody>
          </table>
        </div>
        <span className="caption">Para sumar un docente nuevo: compártele el código de docente (en Ajustes). Lo escribe la primera vez que ingresa con su correo del colegio.</span>
      </div>
    </>
  );
}

function Settings({ api, profile, guard, setNotice }) {
  const [code, setCode] = useState(null);
  const [school, setSchool] = useState(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { guard(async () => { setCode(await api.teacherCode()); setSchool(await api.schoolConsents()); }); }, [api, guard]);
  const recorded = hasGuardianAuth(school);
  const record = () => guard(async () => {
    await api.recordSchoolConsent(profile.school_id, profile.id, "guardian_authorization", CONSENT_VERSION);
    setSchool(await api.schoolConsents());
    setNotice("Quedó registrada la autorización de acudientes del colegio.");
  });
  return (
    <>
      <header className="t-head"><div><h1>Ajustes del colegio</h1></div></header>
      <div className="card t-card">
        <span className="label">Código de docente</span>
        <strong className="display">{code ?? "…"}</strong>
        <span className="caption">Cada docente lo escribe la primera vez que ingresa. No lo compartas con estudiantes.</span>
      </div>
      <div className="card t-card">
        <span className="label">Autorización de acudientes</span>
        {recorded ? (
          <span className="caption">Registrada. Los estudiantes aceptan además los términos de uso al ingresar.</span>
        ) : (
          <>
            <p className="caption">{GUARDIAN_TEXT}</p>
            <label className="b-check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Lo declaro en nombre del colegio</label>
            <div className="report-actions"><button type="button" className="primary" disabled={!ok || school === null} onClick={record}>Registrar</button></div>
          </>
        )}
        <span className="caption">Textos legales en borrador (versión {CONSENT_VERSION}): deben revisarse con un abogado antes de usar la plataforma con estudiantes reales.</span>
      </div>
    </>
  );
}
