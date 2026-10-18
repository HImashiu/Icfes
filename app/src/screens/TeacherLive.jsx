import { useCallback, useEffect, useMemo, useState } from "react";
import { assignmentState } from "../lib/assignments.js";
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

const NAV = [
  { label: "Resumen", section: "home" },
  { label: "Cursos y estudiantes", section: "courses" },
  { label: "Asignaciones", section: "assign" },
  { label: "Mis preguntas", section: "questions" },
  { label: "Papel", section: "paper" },
  { label: "Refuerzo", section: "reinforce" },
  { label: "En vivo", section: "live" },
  { label: "Docentes", section: "staff", admin: true },
  { label: "Ajustes", section: "settings", admin: true },
];
const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const STATE_LABEL = { active: "Activa", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };

// Panel docente con cuentas reales: cursos, listas de estudiantes, asignaciones y su avance.
export default function TeacherLive({ auth, exams, fetchExam, onExit }) {
  const { api, profile } = auth;
  const [section, setSection] = useState("home");
  const [focusCourse, setFocusCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
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
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="teacher">
      <aside className="t-side" aria-label="Navegación docente">
        <strong className="t-logo">Cóndor</strong>
        <nav>
          {NAV.filter((n) => !n.admin || profile.role === "school_admin").map((n) => (
            <button key={n.section} type="button" className={section === n.section ? "t-nav active" : "t-nav"} aria-current={section === n.section ? "page" : undefined} onClick={() => { setSection(n.section); setNotice(null); }}>
              {n.label}
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
          <Assignments api={api} courses={courses} assignments={assignments} exams={exams} fetchExam={fetchExam} reload={reload} guard={guard} setNotice={setNotice} />
        )}
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
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("11");
  const [open, setOpen] = useState(focus ?? null);

  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    guard(async () => {
      const c = await api.createCourse({ schoolId: profile.school_id, userId: profile.id, name: name.trim(), grade });
      setName("");
      setNotice(`Curso ${c.name} creado. Ahora agrega a sus estudiantes.`);
      await reload();
      setOpen(c.id);
    });
  };

  return (
    <>
      <header className="t-head"><div><h1>Cursos y estudiantes</h1></div></header>
      <form className="card t-card assign-form" onSubmit={create}>
        <strong>Nuevo curso</strong>
        <label className="field"><span className="label">Nombre (por ejemplo 11-A)</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span className="label">Grado</span><input value={grade} onChange={(e) => setGrade(e.target.value)} /></label>
        <div className="report-actions"><button type="submit" className="primary" disabled={!name.trim()}>Crear curso</button></div>
      </form>
      {courses.length === 0 && <p className="caption">Todavía no tienes cursos.</p>}
      {courses.map((c) => (
        <div key={c.id} className="card t-card">
          <div className="section-head">
            <strong>{c.name}{c.grade ? ` · Grado ${c.grade}` : ""}</strong>
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
  const del = () => {
    if (!window.confirm(`¿Borrar el curso ${course.name} con sus tareas y resultados?`)) return;
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
      <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} aria-label="Subir archivo CSV" />
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

function Assignments({ api, courses, assignments, exams, fetchExam, reload, guard, setNotice }) {
  const [composing, setComposing] = useState(false);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("active");
  const shown = assignments.filter((a) => (tab === "active" ? ["active", "scheduled"] : ["closed", "draft"]).includes(assignmentState(a)));

  return (
    <>
      <header className="t-head">
        <div><h1>Asignaciones</h1></div>
        <button type="button" className="primary" onClick={() => { setComposing(true); setDetail(null); }} disabled={courses.length === 0}>Nueva asignación</button>
      </header>
      {courses.length === 0 && <p className="caption">Crea un curso primero.</p>}
      {composing && (
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard}
          onCancel={() => setComposing(false)}
          onSaved={(a, n) => { setComposing(false); setNotice(n > 1 ? `Asignado a ${n} cursos: ${a.title}.` : `Asignado: ${a.title}.`); reload(); }} />
      )}
      <div className="card t-card">
        <div className="section-head">
          <strong>Asignaciones</strong>
          <div className="segmented small" role="tablist">
            {[["active", "Activas"], ["closed", "Cerradas"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="caption">No hay asignaciones en esta pestaña.</p>}
        {shown.map((a) => (
          <button key={a.id} type="button" className={`assign-row${detail === a.id ? " on" : ""}${assignmentState(a) === "closed" ? " closed" : ""}`} onClick={() => setDetail(detail === a.id ? null : a.id)}>
            <span className="assign-tile" style={{ background: areaColor(a.scope === "all" ? "" : a.scope) }} />
            <div className="assign-body">
              <strong>{a.title}</strong>
              <span className="caption">{a.courses?.name} · {STATE_LABEL[assignmentState(a)]}{a.due_at ? ` · Entrega ${shortDate(a.due_at)}` : ""}</span>
            </div>
          </button>
        ))}
      </div>
      {detail && assignments.find((a) => a.id === detail) && <AssignmentReport key={detail} api={api} assignment={assignments.find((a) => a.id === detail)} fetchExam={fetchExam} guard={guard} reload={reload} />}
    </>
  );
}

function Staff({ api, profile, guard, setNotice }) {
  const [staff, setStaff] = useState([]);
  const load = useCallback(() => guard(async () => setStaff(await api.listStaff())), [api, guard]);
  useEffect(() => { load(); }, [load]);
  const change = (p, role) => {
    const verb = role === "school_admin" ? "coordinación" : role === "teacher" ? "docente" : "estudiante";
    if (!window.confirm(`¿Cambiar a ${p.full_name || p.email} a ${verb}?`)) return;
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
