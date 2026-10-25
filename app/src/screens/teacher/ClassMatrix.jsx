import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select, confirmDialog } from "../../components/Controls.jsx";
import { parseRoster } from "../../lib/roster.js";
import { gradeLabel } from "../../lib/spaces.js";
import { ACCESS_LABEL, completeCurso, parseLabels } from "../../lib/colegio.js";
import { MIXED, areaOf, areaShort, classMatrix, contextColor, groupOf } from "../../lib/teaching.js";
import Sheet from "./Sheet.jsx";
import "./colegio.css";

const fold = (s) => String(s ?? "").trim().toLowerCase();
const GRADE_KEY = "condor:cm-grade";
const readGrade = () => { try { return localStorage.getItem(GRADE_KEY) ?? ""; } catch { return ""; } };

// Colegio › Cursos y materias: every curso (11 A) against the five areas, with who teaches each one and who only
// reads it. Coordination filters by grade, creates cursos (with their five subjects at once), fills a cell by picking
// a teacher with edit or view-only access, names a group director, and imports a curso's list once into all its
// classes.
export default function ClassMatrix({ api, profile, courses, members, directors, records, grades, staff, guard, setNotice, reload, onOpenClass, onOpenGroup, log }) {
  const [grade, setGrade] = useState(readGrade);
  const [creating, setCreating] = useState(false);
  const [cellOpen, setCellOpen] = useState(null); // { group, area }
  const [importing, setImporting] = useState(null);
  const staffRoles = useMemo(() => Object.fromEntries(staff.map((p) => [p.id, p.role])), [staff]);
  const m = useMemo(() => classMatrix({ courses, members, staffRoles, directors, records: records ?? [] }), [courses, members, staffRoles, directors, records]);
  const teachers = staff.filter((p) => p.role === "teacher" || p.role === "school_admin");
  const pickGrade = (g) => { setGrade(g); try { localStorage.setItem(GRADE_KEY, g); } catch { /* blocked */ } };
  const countIn = (g) => m.groups.filter((x) => x.grade === g).length;
  const shown = m.groups.filter((g) => !grade || g.grade === grade);
  const missing = shown.reduce((n, g) => n + m.missingIn(g), 0);
  const subjectsIn = (groupKey) => m.areas.filter((a) => a !== MIXED && m.cell(groupKey, a).length).length;
  const classesOf = useCallback((groupKey) => m.areas.flatMap((a) => m.cell(groupKey, a).map((x) => x.course)), [m]);

  // A cell without its class: the curso gets its missing subjects (and its students in them), then the cell's class.
  const ensureClass = async (group, area) => {
    const existing = m.cell(group.key, area)[0]?.course;
    if (existing) return existing;
    await completeCurso(api, { profile, grade: group.grade, label: group.label });
    const made = (await api.listCourses()).find((c) => groupOf(c).key === group.key && areaOf(c) === area);
    if (!made) throw new Error(`No se pudo crear ${areaShort(area)} ${group.name}.`);
    return made;
  };

  // Cursos missing subjects (made before every curso had its five): completed in one go.
  const incomplete = shown.filter((g) => g.grade && g.label && m.missingClasses(g) > 0);
  const completeAll = () => guard(async () => {
    let made = 0;
    for (const g of incomplete) made += await completeCurso(api, { profile, grade: g.grade, label: g.label });
    await log("group_complete", { groups: incomplete.map((g) => g.name), made });
    setNotice(`${made} ${made === 1 ? "materia creada" : "materias creadas"}. Cada curso tiene ya sus cinco materias, con sus estudiantes en todas.`);
    await reload();
  });

  const assign = ({ group, area, person, access }) => guard(async () => {
    const course = await ensureClass(group, area);
    const rows = await api.listMembers(course.id);
    const already = rows.find((x) => x.role === "teacher" && fold(x.email) === fold(person.email));
    if (already) { if ((already.access ?? "edit") !== access) await api.setMemberAccess(already.id, access); } else await api.addStudents(course.id, [{ email: person.email, fullName: person.full_name ?? "" }], "teacher", access);
    // The coordinator's own creator row goes once someone else teaches the class.
    if (person.id !== profile.id && access === "edit") {
      const own = rows.find((x) => x.role === "teacher" && x.profile_id === profile.id);
      if (own) await api.removeMember(own.id);
    }
    await log("class_teacher", { course: course.id, class: `${areaShort(area)} ${group.name}`, profile: person.id, email: person.email, access });
    setCellOpen(null);
    setNotice(`${person.full_name || person.email} ${access === "edit" ? "dicta" : "puede ver (sin editar)"} ${areaShort(area)} en ${group.name}.`);
    await reload();
  });

  const unassign = async (t, group, area) => {
    if (!(await confirmDialog(`¿Quitar a ${t.name} de ${areaShort(area)} ${group.name}? La clase y sus resultados se quedan.`, { confirmLabel: "Quitar" }))) return;
    guard(async () => {
      await api.removeMember(t.memberId);
      await log("class_remove", { course: t.courseId, profile: t.profileId, email: t.email });
      setNotice(`${t.name} ya no está en ${areaShort(area)} ${group.name}.`);
      await reload();
    });
  };

  const toggleAccess = (t, group, area) => guard(async () => {
    const next = t.access === "edit" ? "view" : "edit";
    await api.setMemberAccess(t.memberId, next);
    await log("access", { course: t.courseId, profile: t.profileId, email: t.email, access: next });
    setNotice(`${t.name} en ${areaShort(area)} ${group.name}: ${ACCESS_LABEL[next].toLowerCase()}.`);
    await reload();
  });

  const setDirector = (group, profileId) => guard(async () => {
    await api.setGroupDirector({ schoolId: profile.school_id, grade: group.grade, groupLabel: group.label, profileId: profileId || null });
    await log("director", { group: group.name, profile: profileId || null });
    const p = staff.find((x) => x.id === profileId);
    setNotice(p ? `${p.full_name || p.email} es director(a) de ${group.name}: ve todas sus materias, sin editarlas.` : `${group.name} quedó sin director de grupo.`);
    await reload();
  });

  const removeGroup = async (group) => {
    if (!(await confirmDialog(`¿Borrar el curso ${group.name}? No tiene clases todavía.`, { confirmLabel: "Borrar curso", danger: true }))) return;
    guard(async () => { await api.deleteGroup(group.record.id); await log("group_delete", { group: group.name }); await reload(); });
  };

  return (
    <section className="card t-card cm2">
      <div className="cm2-head">
        <div>
          <h2>Cursos y materias</h2>
          <span className="caption">{shown.length} {shown.length === 1 ? "curso" : "cursos"}{grade ? ` de ${gradeLabel(grade)}` : ""} · {missing ? `${missing} ${missing === 1 ? "materia" : "materias"} sin docente` : "todo asignado"}</span>
        </div>
        <button type="button" className="primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} strokeWidth={2.8} /> Nuevo curso</button>
      </div>
      <div className="cm2-filter">
        <div className="cg-chips scroll" role="tablist" aria-label="Grado">
          <button type="button" role="tab" aria-selected={!grade} className={!grade ? "cg-chip on" : "cg-chip"} onClick={() => pickGrade("")}>Todos <span className="n">{m.groups.length}</span></button>
          {grades.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={grade === g} className={grade === g ? "cg-chip on" : "cg-chip"} onClick={() => pickGrade(g)}>
              {gradeLabel(g)} <span className="n">{countIn(g)}</span>
            </button>
          ))}
        </div>
        <span className="cm2-legend"><span className="cg-badge edit">Edita</span> dicta la materia <span className="cg-badge view">Solo ve</span> lee sin cambiar nada</span>
      </div>

      {incomplete.length > 0 && (
        <div className="notice cm2-incomplete" role="status">
          <span>{incomplete.length === 1 ? `${incomplete[0].name} no tiene todas sus materias.` : `${incomplete.length} cursos no tienen todas sus materias (${incomplete.map((g) => g.name).join(", ")}).`} Cada curso necesita las cinco del ICFES, con sus estudiantes en todas.</span>
          <button type="button" className="primary" onClick={completeAll}>Completar materias</button>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="cg-empty cm2-nogroup">
          {grade ? `Todavía no hay cursos de ${gradeLabel(grade)}.` : "Todavía no hay cursos."} <button type="button" className="link" onClick={() => setCreating(true)}>Crear {grade ? `cursos de ${gradeLabel(grade)}` : "el primero"}</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="cm2-table">
            <thead>
              <tr>
                <th>Curso</th>
                {m.areas.map((a) => <th key={a}><span className="ctx-dot" style={{ background: contextColor(a) }} aria-hidden="true" /> {a === MIXED ? "Varias" : areaShort(a)}</th>)}
                <th>Director de grupo</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const n = classesOf(g.key).length;
                return (
                  <tr key={g.key}>
                    <th scope="row" className="cm2-group">
                      <span><strong>{g.name}</strong><span className="caption">{g.students} est. · {subjectsIn(g.key)} de 5 materias</span></span>
                      <span className="cm2-group-actions">
                        {n > 0 && onOpenGroup && <button type="button" className="link" onClick={() => onOpenGroup(g.key)}>Ver curso</button>}
                        <button type="button" className="link" onClick={() => setImporting(g)}>Importar lista</button>
                        {n === 0 && g.record && <button type="button" className="link" onClick={() => removeGroup(g)}>Borrar</button>}
                      </span>
                    </th>
                    {m.areas.map((a) => {
                      const cell = m.cell(g.key, a);
                      const people = cell.flatMap((x) => x.teachers.map((t) => ({ ...t, courseId: x.course.id })));
                      if (a === MIXED && !cell.length) return <td key={a} className="cm2-cell none" style={{ "--cm": "transparent" }} />;
                      const editors = people.filter((t) => t.access === "edit");
                      return (
                        <td key={a} className={editors.length ? "cm2-cell" : "cm2-cell empty"} style={{ "--cm": contextColor(a) }}>
                          <span className="cm2-cell-label"><span className="cg-dot" style={{ background: contextColor(a) }} />{a === MIXED ? "Varias" : areaShort(a)}</span>
                          <span className="cm2-cell-body">
                            {people.map((t) => (
                              <span key={`${t.courseId}-${t.email}`} className={`cm2-person ${t.access}`}>
                                <button type="button" className="link" onClick={() => onOpenClass(t.courseId)} title="Abrir esta clase">{t.name}</button>
                                {t.memberId && <button type="button" className={`cg-badge ${t.access}`} onClick={() => toggleAccess(t, g, a)} title={t.access === "edit" ? "Cambiar a solo ver" : "Cambiar a editar"}>{ACCESS_LABEL[t.access]}</button>}
                                {t.memberId && <button type="button" className="cm-x" aria-label={`Quitar a ${t.name}`} onClick={() => unassign(t, g, a)}><Icon name="x" size={12} strokeWidth={3} /></button>}
                              </span>
                            ))}
                            {a !== MIXED && (
                              <button type="button" className="cm2-add" onClick={() => setCellOpen({ group: g, area: a })}>
                                <Icon name="plus" size={13} strokeWidth={3} /> {editors.length ? "Otro" : "Asignar"}
                              </button>
                            )}
                          </span>
                        </td>
                      );
                    })}
                    <td className="cm2-dir">
                      <Select value={g.director?.profile_id ?? ""} onChange={(v) => setDirector(g, v)} aria-label={`Director de grupo de ${g.name}`}>
                        <option value="">Sin director</option>
                        {teachers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cg-help">Cada docente ve solo sus materias. «Solo ve» deja revisar actividades y resultados sin cambiarlos. El director de grupo lee todas las materias de su curso. Coordinación ve y edita todo.</p>

      {creating && <NewGroups api={api} profile={profile} grades={grades} initialGrade={grade || grades[grades.length - 1] || "11"} existing={m.groups} guard={guard} log={log} setNotice={setNotice} reload={reload} onDone={(g) => { setCreating(false); if (g) pickGrade(g); }} />}
      {cellOpen && <AssignSheet {...cellOpen} teachers={teachers} cell={m.cell(cellOpen.group.key, cellOpen.area)} courses={courses} members={members} onAssign={assign} onClose={() => setCellOpen(null)} />}
      {importing && <ImportSheet group={importing} targets={classesOf(importing.key)} api={api} guard={guard} log={log} setNotice={setNotice} reload={reload} onClose={() => setImporting(null)} />}
    </section>
  );
}

// Nuevo curso: a grade and one or more letters. Each curso is created with its five subjects (without a teacher yet).
function NewGroups({ api, profile, grades, initialGrade, existing, guard, log, setNotice, reload, onDone }) {
  const [grade, setGrade] = useState(initialGrade);
  const [letters, setLetters] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = parseLabels(letters);
  const taken = new Set(existing.filter((g) => g.grade === grade).map((g) => g.label));
  const fresh = labels.filter((l) => !taken.has(l));
  const create = () => guard(async () => {
    setBusy(true);
    try {
      await api.createGroups(fresh.map((label) => ({ grade, label }))).catch(() => null);
      for (const label of fresh) await completeCurso(api, { profile, grade, label });
      await log("group_create", { groups: fresh.map((l) => `${grade}${l}`) });
      setNotice(`${fresh.length === 1 ? "Curso" : "Cursos"} ${fresh.map((l) => `${grade}${l}`).join(", ")} ${fresh.length === 1 ? "creado" : "creados"} con sus cinco materias. Ahora asigna los docentes.`);
      await reload();
      onDone(grade);
    } finally { setBusy(false); }
  });
  return (
    <Sheet title="Nuevo curso" sub="Un curso es un grupo de estudiantes, por ejemplo 11 A. Se crea con sus cinco materias del ICFES: Lectura crítica, Matemáticas, Sociales, Naturales e Inglés." onClose={() => onDone(null)}
      footer={<><button type="button" className="secondary" onClick={() => onDone(null)}>Cancelar</button><button type="button" className="primary" disabled={!fresh.length || busy} onClick={create}>{busy ? "Creando…" : `Crear ${fresh.length > 1 ? `${fresh.length} cursos` : "curso"}`}</button></>}>
      <div className="cg-block">
        <span className="label">Grado</span>
        <div className="cg-chips" role="radiogroup" aria-label="Grado">
          {grades.map((g) => <button key={g} type="button" role="radio" aria-checked={grade === g} className={grade === g ? "cg-chip on" : "cg-chip"} onClick={() => setGrade(g)}>{gradeLabel(g)}</button>)}
        </div>
      </div>
      <label className="cg-block">
        <span className="label">Grupos</span>
        <input value={letters} onChange={(e) => setLetters(e.target.value)} placeholder="A, B, C   o   A-D" aria-label="Letras de los grupos" autoFocus />
        <span className="caption">Varios a la vez separados por comas, o un rango como A-D.</span>
      </label>
      {labels.length > 0 && (
        <div className="cm2-preview">
          {labels.map((l) => <span key={l} className={taken.has(l) ? "cg-badge" : "cg-badge edit"}>{grade}{l}{taken.has(l) ? " · ya existe" : ""}</span>)}
        </div>
      )}
    </Sheet>
  );
}

// Asignar docente: who, with what access. Shows what each person already teaches so the choice is informed.
function AssignSheet({ group, area, teachers, cell, courses, members, onAssign, onClose }) {
  const [pick, setPick] = useState(null);
  const [access, setAccess] = useState("edit");
  const [q, setQ] = useState("");
  const inCell = new Set(cell.flatMap((x) => x.teachers.map((t) => fold(t.email))));
  const teaches = (p) => {
    const ids = new Set(members.filter((mm) => mm.role === "teacher" && (mm.access ?? "edit") === "edit" && (mm.profile_id === p.id || fold(mm.email) === fold(p.email))).map((mm) => mm.course_id));
    return courses.filter((c) => ids.has(c.id)).length;
  };
  const list = teachers.filter((p) => !q || fold(`${p.full_name} ${p.email}`).includes(fold(q)));
  const person = teachers.find((p) => p.id === pick);
  return (
    <Sheet title={`${areaShort(area)} · ${group.name}`} sub={cell.length ? "Agrega otro docente a esta materia." : "Esta materia todavía no tiene docente."} onClose={onClose}
      footer={<><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={!person} onClick={() => onAssign({ group, area, person, access })}>{access === "edit" ? "Asignar" : "Dar acceso de lectura"}</button></>}>
      <div className="cg-block">
        <span className="label">Permiso</span>
        <div className="cg-seg" role="radiogroup" aria-label="Permiso">
          <button type="button" role="radio" aria-checked={access === "edit"} className={access === "edit" ? "on" : ""} onClick={() => setAccess("edit")}>Edita · dicta la materia</button>
          <button type="button" role="radio" aria-checked={access === "view"} className={access === "view" ? "on" : ""} onClick={() => setAccess("view")}>Solo ve</button>
        </div>
      </div>
      <div className="cg-block">
        <span className="label">Docente</span>
        {teachers.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar docente" />}
        <div className="cm2-pick-list" role="listbox" aria-label="Docentes">
          {list.map((p) => {
            const n = teaches(p);
            const here = inCell.has(fold(p.email));
            return (
              <button key={p.id} type="button" role="option" aria-selected={pick === p.id} className={pick === p.id ? "cm2-pick on" : "cm2-pick"} onClick={() => setPick(p.id)}>
                <span><strong>{p.full_name || p.email}</strong><span className="caption">{here ? "Ya está en esta materia · " : ""}{n ? `dicta ${n} ${n === 1 ? "clase" : "clases"}` : "sin clases todavía"}{p.role === "school_admin" ? " · coordinación" : ""}</span></span>
              </button>
            );
          })}
          {teachers.length === 0 && <p className="cg-empty">Todavía no hay docentes. Invítalos en Colegio › Docentes.</p>}
        </div>
      </div>
    </Sheet>
  );
}

// Importar lista: one list for every class of the curso.
function ImportSheet({ group, targets, api, guard, log, setNotice, reload, onClose }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);
  useEffect(() => { setText(""); }, [group.key]);
  const run = () => guard(async () => {
    for (const c of targets) await api.addStudents(c.id, parsed.rows);
    await log("roster", { count: parsed.rows.length, where: group.name });
    setNotice(`${parsed.rows.length} estudiantes en ${targets.length} ${targets.length === 1 ? "clase" : "clases"} de ${group.name}.`);
    onClose();
    await reload();
  });
  const n = targets.length;
  return (
    <Sheet title={`Lista de ${group.name}`} sub={n ? `Se agrega una sola vez a sus ${n} ${n === 1 ? "clase" : "clases"}.` : "Primero crea al menos una materia del curso."} onClose={onClose}
      footer={<><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={!parsed?.rows.length || !n} onClick={run}>Agregar {parsed?.rows.length || ""}</button></>}>
      <label className="cg-block">
        <span className="label">Pegar lista (nombre, apellidos, correo)</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"nombre,apellidos,correo\nAna,Pérez,ana@colegio.edu.co"} aria-label={`Lista de estudiantes de ${group.name}`} />
      </label>
      {parsed && <span className="caption">{parsed.rows.length} válidos{parsed.errors.length ? `, ${parsed.errors.length} con problema` : ""}.</span>}
    </Sheet>
  );
}
