import { useCallback, useEffect, useMemo, useState } from "react";
import { assignmentState, KINDS, pickQuestionKeys, progressRows, resultsCsv } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";
import { questionsFor } from "../lib/exam.js";
import { parseRoster } from "../lib/roster.js";

const NAV = [
  { label: "Cursos y estudiantes", section: "courses" },
  { label: "Asignaciones", section: "assign" },
  { label: "Ajustes", section: "settings" },
];
const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const isoDay = (d) => d.toISOString().slice(0, 10);
const STATE_LABEL = { active: "Activa", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Panel docente con cuentas reales: cursos, listas de estudiantes, asignaciones y su avance.
export default function TeacherLive({ auth, exams, fetchExam, onExit }) {
  const { api, profile } = auth;
  const [section, setSection] = useState("courses");
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
          {NAV.filter((n) => n.section !== "settings" || profile.role === "school_admin").map((n) => (
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
        {section === "courses" && <Courses api={api} profile={profile} courses={courses} reload={reload} guard={guard} setNotice={setNotice} />}
        {section === "assign" && (
          <Assignments api={api} courses={courses} assignments={assignments} exams={exams} fetchExam={fetchExam} reload={reload} guard={guard} setNotice={setNotice} />
        )}
        {section === "settings" && <Settings api={api} guard={guard} />}
      </main>
    </div>
  );
}

function Courses({ api, profile, courses, reload, guard, setNotice }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("11");
  const [open, setOpen] = useState(null);

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
  return (
    <div style={{ display: "grid", gap: 12 }}>
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
        <AssignForm api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard}
          onCancel={() => setComposing(false)}
          onSaved={(a) => { setComposing(false); setNotice(`Asignado: ${a.title}.`); reload(); }} />
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
          <button key={a.id} type="button" className="assign-row" style={{ width: "100%", textAlign: "left" }} onClick={() => setDetail(detail === a.id ? null : a.id)}>
            <span className="assign-tile" style={{ background: areaColor(a.scope === "all" ? "" : a.scope) }} />
            <div className="assign-body">
              <strong>{a.title}</strong>
              <span className="caption">{a.courses?.name} · {STATE_LABEL[assignmentState(a)]}{a.due_at ? ` · Entrega ${shortDate(a.due_at)}` : ""}</span>
            </div>
          </button>
        ))}
      </div>
      {detail && <Progress key={detail} api={api} assignment={assignments.find((a) => a.id === detail)} guard={guard} reload={reload} />}
    </>
  );
}

function AssignForm({ api, courses, exams, fetchExam, guard, onCancel, onSaved }) {
  const ready = exams.filter((e) => e.status !== "proximamente");
  const [courseId, setCourseId] = useState(courses[0].id);
  const [kind, setKind] = useState("homework");
  const [slug, setSlug] = useState(ready[0]?.slug ?? "");
  const [scope, setScope] = useState("all");
  const [count, setCount] = useState("");
  const [due, setDue] = useState(isoDay(new Date(Date.now() + 7 * 864e5)));
  const [limit, setLimit] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const entry = ready.find((e) => e.slug === slug);

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    if (due < isoDay(new Date())) return setMsg("La fecha de entrega debe ser hoy o después.");
    setBusy(true);
    guard(async () => {
      const exam = await fetchExam(slug);
      const pool = questionsFor(exam.exam, scope);
      if (pool.length === 0) throw new Error("Esa área no tiene preguntas disponibles en este cuadernillo.");
      const keys = pickQuestionKeys(pool, count);
      const kindLabel = KINDS.find((k) => k.id === kind).label;
      const auto = `${kindLabel} · ${scope === "all" ? "Examen completo" : scope} · ${exam.exam.title}`;
      const saved = await api.createAssignment({
        course_id: courseId, created_by: (await api.getProfile()).id, kind, title: title.trim() || auto,
        exam_slug: slug, scope, question_keys: keys,
        due_at: new Date(`${due}T23:59:00`).toISOString(),
        time_limit_min: kind === "exam" && limit ? Number(limit) : null, status: "active",
      });
      onSaved(saved);
    }).finally(() => setBusy(false));
  };

  return (
    <form className="card t-card assign-form" onSubmit={submit}>
      <strong>Nueva asignación</strong>
      <label className="field"><span className="label">Curso</span>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field"><span className="label">Tipo</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
      <label className="field"><span className="label">Cuadernillo</span>
        <select value={slug} onChange={(e) => { setSlug(e.target.value); setScope("all"); }}>{ready.map((x) => <option key={x.slug} value={x.slug}>{x.slug}</option>)}</select></label>
      <label className="field"><span className="label">Área</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Examen completo</option>
          {(entry?.sections ?? []).map((s) => <option key={s}>{s}</option>)}
        </select></label>
      <label className="field"><span className="label">Cantidad de preguntas (vacío = todas)</span>
        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} /></label>
      {kind === "exam" && (
        <label className="field"><span className="label">Tiempo en minutos (vacío = el estándar)</span>
          <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} /></label>
      )}
      <label className="field"><span className="label">Fecha de entrega</span>
        <input type="date" value={due} min={isoDay(new Date())} onChange={(e) => setDue(e.target.value)} /></label>
      <label className="field"><span className="label">Título (opcional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      {msg && <p className="notice error">{msg}</p>}
      <div className="report-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy || !slug}>{busy ? "Guardando…" : "Asignar"}</button>
      </div>
    </form>
  );
}

function Progress({ api, assignment, guard, reload }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.listMembers(assignment.course_id), api.assignmentAttempts(assignment.id)]);
      setData(progressRows(members, attempts));
    });
  }, [api, assignment, guard]);
  if (!data) return <p className="caption">Cargando avance…</p>;
  const closeNow = () => guard(async () => { await api.setAssignmentStatus(assignment.id, "closed"); await reload(); });
  const remove = () => {
    if (window.confirm("¿Borrar esta asignación? Los intentos de los estudiantes se conservan.")) guard(async () => { await api.deleteAssignment(assignment.id); await reload(); });
  };
  return (
    <div className="card t-card">
      <div className="section-head">
        <strong>{assignment.title}</strong>
        <span className="muted">{data.done} de {data.total} entregaron ({data.completion} %)</span>
      </div>
      <div className="progress thin"><span style={{ width: `${data.completion}%` }} /></div>
      <div className="table-wrap">
        <table className="t-table">
          <thead><tr><th>Estudiante</th><th>Estado</th><th>Puntaje</th><th>Entregado</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.done ? "Entregado" : r.joined ? "Pendiente" : "Sin ingresar"}</td>
                <td>{r.pct == null ? "—" : `${r.pct} %`}</td>
                <td>{r.at ? shortDate(r.at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="caption">Puntaje según la clave preliminar, no oficial.</span>
      <div className="report-actions">
        <button type="button" className="secondary" onClick={() => download(`${assignment.title}.csv`, resultsCsv(assignment.title, data.rows))}>Exportar CSV</button>
        {assignmentState(assignment) !== "closed" && <button type="button" className="secondary" onClick={closeNow}>Cerrar ahora</button>}
        <button type="button" className="link" onClick={remove}>Borrar</button>
      </div>
    </div>
  );
}

function Settings({ api, guard }) {
  const [code, setCode] = useState(null);
  useEffect(() => { guard(async () => setCode(await api.teacherCode())); }, [api, guard]);
  return (
    <>
      <header className="t-head"><div><h1>Ajustes del colegio</h1></div></header>
      <div className="card t-card">
        <span className="label">Código de docente</span>
        <strong className="display">{code ?? "…"}</strong>
        <span className="caption">Cada docente lo escribe la primera vez que ingresa. No lo compartas con estudiantes.</span>
      </div>
    </>
  );
}
