import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { FilePicker, Select, confirmDialog } from "../../components/Controls.jsx";
import { parseRoster } from "../../lib/roster.js";
import { areaColor } from "../../lib/brand.js";
import { GRADES, SUBJECTS, gradeLabel, spaceName } from "../../lib/spaces.js";
import { ACCESS_LABEL } from "../../lib/colegio.js";
import { areaOf, classLabel, groupOf } from "../../lib/teaching.js";
import "./colegio.css";

// Estudiantes › Listas de clase: the classes this person sees, grouped by curso (11 A) and named by subject, each
// with its roster and teachers. Classes they only read show their lists without the editing controls.
export default function ClassLists({ api, profile, courses, readOnlyIds = [], settings, reload, guard, setNotice, focus, onImported, log }) {
  const admin = profile.role === "school_admin";
  const canCreate = admin || settings?.teachers_create_classes !== false;
  const [open, setOpen] = useState(focus ?? null);
  const [creating, setCreating] = useState(false);
  const ro = new Set(readOnlyIds);
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of courses) {
      const g = groupOf(c);
      if (!map.has(g.key)) map.set(g.key, { ...g, classes: [] });
      map.get(g.key).classes.push(c);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  }, [courses]);

  return (
    <>
      <div className="cm2-head">
        <p className="caption tl-lead" style={{ margin: 0 }}>Un curso (11 A) tiene una clase por materia. Las actividades y los resultados se organizan por clase.</p>
        {canCreate && <button type="button" className="secondary" onClick={() => setCreating(!creating)}><Icon name="plus" size={16} strokeWidth={2.8} /> Nueva clase</button>}
      </div>
      {creating && <NewClass api={api} profile={profile} guard={guard} setNotice={setNotice} reload={reload} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {courses.length === 0 && <p className="cg-empty">Todavía no tienes clases.{canCreate ? "" : " Coordinación te las asigna."}</p>}
      {groups.map((g) => (
        <section key={g.key} className="card t-card">
          <div className="section-head"><h2>{g.name}</h2><span className="caption">{g.classes.length} {g.classes.length === 1 ? "clase" : "clases"}</span></div>
          {g.classes.map((c) => {
            const area = areaOf(c);
            const readOnly = ro.has(c.id);
            return (
              <div key={c.id} className="cg-block" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="cg-row">
                  <span className="cg-dot" style={{ background: area ? areaColor(area) : "var(--accent)" }} />
                  <strong style={{ flex: 1, minWidth: 0 }}>{classLabel(c)}</strong>
                  {readOnly && <span className="cg-badge view">{ACCESS_LABEL.view}</span>}
                  <button type="button" className="secondary" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Cerrar" : "Ver lista"}</button>
                </div>
                {open === c.id && <Roster api={api} course={c} readOnly={readOnly} coAccess={settings?.coteacher_access === "view" ? "view" : "edit"} guard={guard} setNotice={setNotice} reload={reload} onImported={onImported} log={log} />}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

function NewClass({ api, profile, guard, setNotice, reload, onCreated }) {
  const [subject, setSubject] = useState("Matemáticas");
  const [grade, setGrade] = useState("11");
  const [group, setGroup] = useState("A");
  const [custom, setCustom] = useState(null);
  const name = custom ?? spaceName({ subject, grade, group });
  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    guard(async () => {
      const c = await api.createCourse({ schoolId: profile.school_id, userId: profile.id, name: name.trim(), grade, subject, groupLabel: group.trim().toUpperCase() });
      setNotice(`Clase ${classLabel(c)} creada. Ahora agrega a sus estudiantes.`);
      await reload();
      onCreated(c.id);
    });
  };
  return (
    <form className="card t-card assign-form" onSubmit={create}>
      <strong>Nueva clase</strong>
      <label className="field"><span className="label">Materia</span>
        <Select value={subject} onChange={(v) => { setSubject(v); setCustom(null); }} aria-label="Materia">{SUBJECTS.map((x) => <option key={x}>{x}</option>)}</Select></label>
      <label className="field"><span className="label">Grado</span>
        <Select value={grade} onChange={(v) => { setGrade(v); setCustom(null); }} aria-label="Grado">{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select></label>
      <label className="field"><span className="label">Grupo (A, B, 01…)</span><input value={group} onChange={(e) => { setGroup(e.target.value); setCustom(null); }} /></label>
      <label className="field"><span className="label">Nombre de la clase</span><input value={name} onChange={(e) => setCustom(e.target.value)} /></label>
      <div className="report-actions"><button type="submit" className="primary" disabled={!name.trim()}>Crear clase</button></div>
    </form>
  );
}

function Roster({ api, course, readOnly, coAccess, guard, setNotice, reload, onImported, log }) {
  const [members, setMembers] = useState([]);
  const [text, setText] = useState("");
  const [coEmail, setCoEmail] = useState("");
  const load = useCallback(() => guard(async () => setMembers(await api.listMembers(course.id))), [api, course.id, guard]);
  useEffect(() => { load(); }, [load]);
  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  };
  const importRows = () => guard(async () => {
    const n = await api.addStudents(course.id, parsed.rows);
    setText("");
    log?.("roster", { count: n, where: classLabel(course) });
    if (onImported) onImported(course, n);
    else setNotice(`${n} estudiantes en ${classLabel(course)}. Entran cuando inicien sesión con su correo del colegio.`);
    await load();
    reload();
  });
  const remove = (id) => guard(async () => { await api.removeMember(id); await load(); });
  const del = async () => {
    if (!(await confirmDialog(`¿Borrar la clase ${classLabel(course)} con sus actividades y resultados?`, { confirmLabel: "Borrar clase", danger: true }))) return;
    guard(async () => { await api.deleteCourse(course.id); await reload(); });
  };
  const students = members.filter((m) => m.role === "student");
  const teachers = members.filter((m) => m.role === "teacher");
  const addTeacher = (e) => {
    e.preventDefault();
    const email = coEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    guard(async () => {
      await api.addStudents(course.id, [{ email, fullName: "" }], "teacher", coAccess);
      log?.("class_teacher", { course: course.id, email, access: coAccess });
      setCoEmail("");
      setNotice(`${email} ahora ${coAccess === "view" ? "puede ver" : "es docente de"} ${classLabel(course)}.`);
      await load();
      reload();
    });
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="cg-block">
        <span className="label">Docentes de la clase</span>
        <div className="cg-chips">
          {teachers.map((t) => <span key={t.id} className={`cg-badge ${t.access ?? "edit"}`}>{t.full_name || t.email} · {ACCESS_LABEL[t.access ?? "edit"]}</span>)}
          {teachers.length === 0 && <span className="caption">—</span>}
        </div>
        {!readOnly && (
          <form className="b-auto" onSubmit={addTeacher}>
            <input type="email" aria-label="Correo del docente" placeholder="docente@colegio.edu.co" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} />
            <button type="submit" className="secondary" disabled={!coEmail.trim()}>Agregar docente</button>
          </form>
        )}
      </div>
      {!readOnly && (
        <>
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
        </>
      )}
      <div className="table-wrap">
        <table className="t-table">
          <thead><tr><th>Estudiante</th><th>Correo</th><th>Estado</th>{!readOnly && <th />}</tr></thead>
          <tbody>
            {students.map((m) => (
              <tr key={m.id}>
                <td>{m.full_name || "—"}</td><td>{m.email}</td>
                <td>{m.profile_id ? "Ya ingresó" : "Invitado"}</td>
                {!readOnly && <td><button type="button" className="link" onClick={() => remove(m.id)} aria-label={`Quitar a ${m.email}`}>Quitar</button></td>}
              </tr>
            ))}
            {students.length === 0 && <tr><td colSpan={4} className="caption">Sin estudiantes todavía.</td></tr>}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" className="link" onClick={del}>Borrar esta clase</button>}
    </div>
  );
}
