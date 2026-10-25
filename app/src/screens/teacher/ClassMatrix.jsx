import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select } from "../../components/Controls.jsx";
import { parseRoster } from "../../lib/roster.js";
import { GRADES, gradeLabel } from "../../lib/spaces.js";
import { AREA_SUBJECT, MIXED, areaShort, classMatrix, contextColor } from "../../lib/teaching.js";

const fold = (s) => String(s ?? "").trim().toLowerCase();

// Colegio › Docentes y clases: every group against the five areas, with who teaches each one. Coordination fills a
// cell by picking a teacher (the class is created if it does not exist, with the group's students), names a group
// director, and imports a group's list once into every class of the group.
export default function ClassMatrix({ api, profile, courses, members, directors, guard, setNotice, reload, onOpenClass }) {
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null); // { groupKey, area }
  const [pick, setPick] = useState("");
  const [extra, setExtra] = useState([]); // groups added here that have no class yet
  const [newGrade, setNewGrade] = useState("11");
  const [newLabel, setNewLabel] = useState("");
  const [importing, setImporting] = useState(null);
  const [text, setText] = useState("");
  useEffect(() => { guard(async () => setStaff(await api.listStaff())); }, [api, guard]);
  const staffRoles = useMemo(() => Object.fromEntries(staff.map((p) => [p.id, p.role])), [staff]);
  const m = useMemo(() => classMatrix({ courses, members, staffRoles, directors }), [courses, members, staffRoles, directors]);
  const groups = [...m.groups, ...extra.filter((g) => !m.groups.some((x) => x.key === g.key)).map((g) => ({ ...g, students: 0, director: null }))];
  const teachers = staff.filter((p) => p.role === "teacher" || p.role === "school_admin");
  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);

  const classesOf = useCallback((groupKey) => courses.filter((c) => m.groups.some((g) => g.key === groupKey) && m.areas.some((a) => m.cell(groupKey, a).some((x) => x.course.id === c.id))), [courses, m]);

  const assign = (group, area) => guard(async () => {
    const person = staff.find((p) => p.id === pick);
    if (!person) return;
    let cell = m.cell(group.key, area);
    let course = cell[0]?.course;
    if (!course) {
      const subject = AREA_SUBJECT[area] ?? area;
      course = await api.createCourse({ schoolId: profile.school_id, userId: profile.id, name: `${subject} ${group.grade}${group.label}`.trim(), grade: group.grade, subject, groupLabel: group.label });
      // The new class starts with the group's students, copied from a sibling class of the same group.
      const sibling = classesOf(group.key)[0];
      if (sibling) {
        const list = (await api.listMembers(sibling.id)).filter((x) => x.role === "student").map((x) => ({ email: x.email, fullName: x.full_name ?? "" }));
        if (list.length) await api.addStudents(course.id, list);
      }
    }
    await api.addStudents(course.id, [{ email: person.email, fullName: person.full_name ?? "" }], "teacher");
    if (person.id !== profile.id) {
      const own = (await api.listMembers(course.id)).find((x) => x.role === "teacher" && x.profile_id === profile.id);
      if (own) await api.removeMember(own.id);
    }
    setEditing(null); setPick("");
    setNotice(`${person.full_name || person.email} dicta ${areaShort(area)} en ${group.name}. Ya lo ve en su panel.`);
    await reload();
  });

  const unassign = (member, group, area) => guard(async () => {
    await api.removeMember(member);
    setNotice(`Quitado de ${areaShort(area)} ${group.name}. La clase y sus resultados siguen ahí.`);
    await reload();
  });

  const setDirector = (group, profileId) => guard(async () => {
    await api.setGroupDirector({ schoolId: profile.school_id, grade: group.grade, groupLabel: group.label, profileId: profileId || null });
    const p = staff.find((x) => x.id === profileId);
    setNotice(p ? `${p.full_name || p.email} es director(a) de ${group.name}: ve todas sus materias, sin editarlas.` : `${group.name} quedó sin director de grupo.`);
    await reload();
  });

  const importGroup = (group) => guard(async () => {
    const targets = classesOf(group.key);
    for (const c of targets) await api.addStudents(c.id, parsed.rows);
    setText(""); setImporting(null);
    setNotice(`${parsed.rows.length} estudiantes en ${targets.length} ${targets.length === 1 ? "clase" : "clases"} de ${group.name}.`);
    await reload();
  });

  const addGroup = (e) => {
    e.preventDefault();
    const label = newLabel.trim().toUpperCase();
    if (!label) return;
    setExtra([...extra, { key: `${newGrade}|${label}`, name: `${newGrade}${label}`, grade: newGrade, label }]);
    setNewLabel("");
  };

  return (
    <section className="card t-card cm">
      <div className="section-head">
        <div><h2>Quién dicta qué</h2><span className="caption">Toca una celda para asignar docente. {m.missing ? `${m.missing} sin docente.` : "Todo asignado."}</span></div>
        <form className="cm-add" onSubmit={addGroup}>
          <Select value={newGrade} onChange={setNewGrade} aria-label="Grado del grupo nuevo">{GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</Select>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Grupo (A, B…)" aria-label="Letra del grupo nuevo" maxLength={4} />
          <button type="submit" className="secondary" disabled={!newLabel.trim()}><Icon name="plus" size={16} strokeWidth={2.8} /> Grupo</button>
        </form>
      </div>
      <div className="table-wrap cm-wrap">
        <table className="t-table cm-table">
          <thead>
            <tr>
              <th>Grupo</th>
              {m.areas.map((a) => <th key={a}><span className="ctx-dot" style={{ background: contextColor(a) }} aria-hidden="true" />{a === MIXED ? "Varias" : areaShort(a)}</th>)}
              <th>Director de grupo</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <th scope="row">
                  <strong>{g.name}</strong>
                  <span className="caption">{g.students} est.</span>
                  <button type="button" className="link cm-import" onClick={() => setImporting(importing === g.key ? null : g.key)}>Importar lista</button>
                </th>
                {m.areas.map((a) => {
                  const cell = m.cell(g.key, a);
                  const people = cell.flatMap((x) => x.teachers.map((t) => ({ ...t, courseId: x.course.id, member: members.find((mm) => mm.course_id === x.course.id && mm.role === "teacher" && fold(mm.email) === fold(t.email))?.id })));
                  const open = editing?.groupKey === g.key && editing?.area === a;
                  if (a === MIXED && !cell.length) return <td key={a} className="cm-cell none" />;
                  return (
                    <td key={a} className={people.length ? "cm-cell" : "cm-cell empty"} style={{ "--cm": contextColor(a) }}>
                      {people.map((t) => (
                        <span key={`${t.courseId}-${t.email}`} className="cm-person">
                          <button type="button" className="link" onClick={() => onOpenClass(t.courseId)} title="Ver esta clase">{t.name}</button>
                          {t.member && <button type="button" className="cm-x" aria-label={`Quitar a ${t.name}`} onClick={() => unassign(t.member, g, a)}><Icon name="x" size={12} strokeWidth={3} /></button>}
                        </span>
                      ))}
                      {open ? (
                        <span className="cm-pick">
                          <Select value={pick} onChange={setPick} aria-label={`Docente de ${areaShort(a)} ${g.name}`}>
                            <option value="">Elegir docente…</option>
                            {teachers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                          </Select>
                          <button type="button" className="primary small" disabled={!pick} onClick={() => assign(g, a)}>Asignar</button>
                          <button type="button" className="link" onClick={() => setEditing(null)}>Cancelar</button>
                        </span>
                      ) : a !== MIXED && (
                        <button type="button" className="cm-assign" onClick={() => { setEditing({ groupKey: g.key, area: a }); setPick(""); }}>
                          <Icon name="plus" size={13} strokeWidth={3} /> {people.length ? "Otro" : "Asignar"}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="cm-dir">
                  {g.grade && g.label ? (
                    <Select value={g.director?.profile_id ?? ""} onChange={(v) => setDirector(g, v)} aria-label={`Director de grupo de ${g.name}`}>
                      <option value="">Sin director</option>
                      {teachers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                    </Select>
                  ) : <span className="caption">Falta grado y grupo</span>}
                </td>
              </tr>
            ))}
            {groups.length === 0 && <tr><td colSpan={m.areas.length + 2} className="caption">Agrega el primer grupo (por ejemplo 11 A) y asigna sus materias.</td></tr>}
          </tbody>
        </table>
      </div>
      {importing && (() => {
        const g = groups.find((x) => x.key === importing);
        const n = classesOf(importing).length;
        return (
          <div className="cm-importer">
            <strong>Lista de {g?.name}</strong>
            <span className="caption">Se agrega una vez a {n ? `sus ${n} clases` : "sus clases (asigna al menos una materia primero)"}. Formato: nombre, apellidos, correo.</span>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"nombre,apellidos,correo\nAna,Pérez,ana@colegio.edu.co"} aria-label={`Lista de estudiantes de ${g?.name}`} />
            {parsed && <span className="caption">{parsed.rows.length} válidos{parsed.errors.length ? `, ${parsed.errors.length} con problema` : ""}.</span>}
            <div className="report-actions">
              <button type="button" className="secondary" onClick={() => { setImporting(null); setText(""); }}>Cancelar</button>
              <button type="button" className="primary" disabled={!parsed?.rows.length || !n} onClick={() => importGroup(g)}>Agregar a {n} {n === 1 ? "clase" : "clases"}</button>
            </div>
          </div>
        );
      })()}
      <p className="caption">Cada docente ve solo sus materias. El director de grupo lee todas las materias de su grupo, sin editarlas. Coordinación ve todo.</p>
    </section>
  );
}
