import { useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { Select, confirmDialog } from "../../components/Controls.jsx";
import { areaColor } from "../../lib/brand.js";
import { gradeLabel } from "../../lib/spaces.js";
import { ACCESS_LABEL, ROLE_LABEL, ago, buildFeed, grantText, parseInvites, teacherStats } from "../../lib/colegio.js";
import { AREAS, areaOf, areaShort, classLabel } from "../../lib/teaching.js";
import Sheet from "./Sheet.jsx";
import "./colegio.css";

const fold = (s) => String(s ?? "").trim().toLowerCase();

// Colegio › Docentes: everyone on staff with what they teach and what they have done, pending invitations, and the
// way in for new teachers. Tapping a person opens their profile: classes with edit or view-only access, subject-wide
// permissions, role, figures and recent work. Figures describe each teacher's own work; nobody is ranked.
export default function Staff({ api, profile, staff, invites, courses, members, grants, authorship, attempts, audit, grades, guard, setNotice, reload, log, onOpenAssignment, teacherCode }) {
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState("");
  const stats = useMemo(() => teacherStats({ staff, courses, members, grants: grants ?? [], authorship, attempts }), [staff, courses, members, grants, authorship, attempts]);
  const shown = stats.filter((s) => !q || fold(`${s.person.full_name} ${s.person.email}`).includes(fold(q)));
  const pending = (invites ?? []).filter((i) => !i.accepted_at && !staff.some((p) => fold(p.email) === i.email));
  const open = stats.find((s) => s.person.id === openId);

  const cancelInvite = async (i) => {
    if (!(await confirmDialog(`¿Cancelar la invitación de ${i.email}?`, { confirmLabel: "Cancelar invitación" }))) return;
    guard(async () => { await api.deleteInvite(i.id); await reload(); });
  };

  return (
    <>
      <section className="card t-card">
        <div className="cm2-head">
          <div><h2>Docentes</h2><span className="caption">{staff.length} en el equipo{pending.length ? ` · ${pending.length} ${pending.length === 1 ? "invitación pendiente" : "invitaciones pendientes"}` : ""}</span></div>
          <button type="button" className="primary" onClick={() => setInviting(true)}><Icon name="plus" size={16} strokeWidth={2.8} /> Invitar docentes</button>
        </div>
        {staff.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar docente" aria-label="Buscar docente" />}
        <div className="st-head" aria-hidden="true"><span>Docente</span><span>Clases</span><span>Estudiantes</span><span>Actividades</span><span>Última vez</span><span /></div>
        <div className="st-list">
          {shown.map((s) => (
            <button key={s.person.id} type="button" className="st-row" onClick={() => setOpenId(s.person.id)}>
              <span className="st-who">
                <strong>{s.person.full_name || s.person.email}{s.person.id === profile.id && <span className="cg-badge">Tú</span>}{s.person.role === "school_admin" && <span className="cg-badge edit">Coordinación</span>}</strong>
                <span className="st-areas">
                  {s.areas.map((a) => <span key={a} className="cg-badge" style={{ boxShadow: `inset 3px 0 0 ${areaColor(a)}` }}>{areaShort(a)}</span>)}
                  {s.viewOnly > 0 && <span className="cg-badge view">Solo ve {s.viewOnly}</span>}
                  {!s.areas.length && !s.viewOnly && <span className="caption">Sin clases asignadas</span>}
                </span>
              </span>
              <span className="st-num"><b>{s.classes}</b><span>clases</span></span>
              <span className="st-num"><b>{s.students}</b><span>estudiantes</span></span>
              <span className="st-num"><b>{s.activities}</b><span>{s.recent ? `${s.recent} este mes` : "actividades"}</span></span>
              <span className="st-num"><b>{s.lastAt ? ago(s.lastAt) : "—"}</b><span>creó algo</span></span>
              <Icon name="right" size={16} strokeWidth={3} className="chev" />
            </button>
          ))}
          {pending.map((i) => (
            <div key={i.id} className="st-row" style={{ cursor: "default" }}>
              <span className="st-who">
                <strong>{i.full_name || i.email} <span className="cg-badge pending">Invitado</span>{i.role === "school_admin" && <span className="cg-badge edit">Coordinación</span>}</strong>
                <span className="caption">{i.email} · entra con ese correo, sin código</span>
              </span>
              <span className="st-num"><b>—</b><span>clases</span></span>
              <span className="st-num"><b>—</b><span>estudiantes</span></span>
              <span className="st-num"><b>—</b><span>actividades</span></span>
              <span className="st-num"><button type="button" className="link" onClick={() => cancelInvite(i)}>Cancelar</button></span>
              <span />
            </div>
          ))}
          {staff.length === 0 && pending.length === 0 && <p className="cg-empty">Todavía no hay docentes. Invítalos con su correo: entran sin código.</p>}
        </div>
        <p className="cg-help">Las cifras muestran el trabajo de cada docente para acompañarlo, no para compararlo con otros. Toca a alguien para ver y cambiar sus permisos.</p>
      </section>

      {inviting && <InviteSheet api={api} courses={courses} teacherCode={teacherCode} guard={guard} setNotice={setNotice} reload={reload} onClose={() => setInviting(false)} />}
      {open && <TeacherProfile s={open} api={api} profile={profile} courses={courses} grants={grants} audit={audit} authorship={authorship} staff={staff} grades={grades}
        guard={guard} setNotice={setNotice} reload={reload} log={log} onOpenAssignment={onOpenAssignment} onClose={() => setOpenId(null)} />}
    </>
  );
}

// Invitar: paste emails (with names if you have them), pick a role, done. Invited people enter with that email and
// get the role without the teacher code, even with a personal Gmail.
function InviteSheet({ api, courses, teacherCode, guard, setNotice, reload, onClose }) {
  const [text, setText] = useState("");
  const [role, setRole] = useState("teacher");
  const [result, setResult] = useState(null);
  const parsed = useMemo(() => parseInvites(text), [text]);
  const link = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "";
  const message = `Te invito a Cóndor, la plataforma de preparación Saber 11 del colegio. Entra en ${link} con este mismo correo; tu cuenta de ${role === "school_admin" ? "coordinación" : "docente"} ya está lista.`;
  const send = () => guard(async () => {
    const out = await api.inviteStaff(parsed.rows.map((r) => ({ email: r.email, name: r.name, role })));
    setResult(out);
    const n = out.filter((r) => r.status !== "skipped").length;
    setNotice(`${n} ${n === 1 ? "persona invitada" : "personas invitadas"}. Comparte el enlace de entrada.`);
    await reload();
  });
  const copy = async () => { try { await navigator.clipboard.writeText(message); setNotice("Mensaje copiado. Pégalo en un correo o chat."); } catch { /* blocked */ } };
  return (
    <Sheet title="Invitar docentes" sub="Entran con su correo y quedan como docentes sin escribir el código." onClose={onClose}
      footer={result ? <><button type="button" className="secondary" onClick={copy}>Copiar mensaje de invitación</button><button type="button" className="primary" onClick={onClose}>Listo</button></>
        : <><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={!parsed.rows.length} onClick={send}>Invitar {parsed.rows.length || ""}</button></>}>
      {result ? (
        <div className="st-results">
          {result.map((r) => <span key={r.email}>{r.status === "invited" ? "✓ Invitado" : r.status === "updated" ? "✓ Ya tenía cuenta: rol actualizado" : "✕ No se pudo"} · {r.email}</span>)}
          <p className="cg-help">Ahora asígnales sus materias en Cursos y materias. Puedes hacerlo antes de que entren: verán sus clases desde el primer ingreso.</p>
          <p className="cg-help">{message}</p>
        </div>
      ) : (
        <>
          <label className="cg-block st-invite">
            <span className="label">Correos, uno por línea</span>
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"ana.perez@colegio.edu.co, Ana Pérez\nCarlos Ruiz <carlos.ruiz@gmail.com>"} aria-label="Correos de los docentes" autoFocus />
            <span className="caption">{parsed.rows.length} {parsed.rows.length === 1 ? "correo válido" : "correos válidos"}{parsed.bad.length ? ` · revisa: ${parsed.bad.slice(0, 3).join(" · ")}` : ""}</span>
          </label>
          <div className="cg-block">
            <span className="label">Entran como</span>
            <div className="cg-seg" role="radiogroup" aria-label="Rol">
              <button type="button" role="radio" aria-checked={role === "teacher"} className={role === "teacher" ? "on" : ""} onClick={() => setRole("teacher")}>Docente</button>
              <button type="button" role="radio" aria-checked={role === "school_admin"} className={role === "school_admin" ? "on" : ""} onClick={() => setRole("school_admin")}>Coordinación</button>
            </div>
          </div>
          {teacherCode && <p className="cg-help">También pueden entrar con el código de docente <strong>{teacherCode}</strong> (Ajustes), pero la invitación es más fácil y no se puede filtrar.</p>}
        </>
      )}
    </Sheet>
  );
}

// One teacher: figures, classes with their access, subject permissions, role and recent work.
function TeacherProfile({ s, api, profile, courses, grants, audit, authorship, staff, grades, guard, setNotice, reload, log, onOpenAssignment, onClose }) {
  const p = s.person;
  const [area, setArea] = useState(AREAS[0]);
  const [grade, setGrade] = useState("");
  const [level, setLevel] = useState("view");
  const mine = (grants ?? []).filter((g) => g.profile_id === p.id);
  const feed = useMemo(() => buildFeed({ audit: (audit ?? []).filter((r) => r.actor === p.id), authorship: {
    assignments: s.made, courses: [], questions: (authorship.questions ?? []).filter((x) => x.owner_id === p.id), lessons: (authorship.lessons ?? []).filter((x) => x.owner_id === p.id),
  }, staff, courses }).slice(0, 12), [audit, authorship, s.made, p.id, staff, courses]);
  const self = p.id === profile.id;

  const setAccess = (a, next) => guard(async () => {
    if (!a.memberId) { setNotice("Ese acceso viene de un permiso por materia: cámbialo abajo."); return; }
    await api.setMemberAccess(a.memberId, next);
    await log("access", { course: a.course.id, profile: p.id, email: p.email, access: next });
    await reload();
  });
  const removeClass = async (a) => {
    if (!a.memberId) return;
    if (!(await confirmDialog(`¿Quitar a ${p.full_name || p.email} de ${classLabel(a.course)}?`, { confirmLabel: "Quitar" }))) return;
    guard(async () => { await api.removeMember(a.memberId); await log("class_remove", { course: a.course.id, profile: p.id, email: p.email }); await reload(); });
  };
  const addGrant = () => guard(async () => {
    await api.saveSubjectAccess({ profileId: p.id, area, grade, access: level });
    await log("grant", { profile: p.id, area, grade: grade || null, access: level });
    setNotice(`${p.full_name || p.email}: ${ACCESS_LABEL[level].toLowerCase()} ${grantText({ area, grade })}.`);
    await reload();
  });
  const dropGrant = (g) => guard(async () => { await api.deleteSubjectAccess(g.id); await log("grant_remove", { profile: p.id, area: g.area, grade: g.grade }); await reload(); });
  const flipGrant = (g) => guard(async () => { const next = g.access === "edit" ? "view" : "edit"; await api.updateSubjectAccess(g.id, next); await log("grant", { profile: p.id, area: g.area, grade: g.grade, access: next }); await reload(); });
  const changeRole = async (role) => {
    if (!(await confirmDialog(`¿Cambiar a ${p.full_name || p.email} a ${ROLE_LABEL[role].toLowerCase()}?${role === "student" ? " Pierde el acceso al panel docente." : ""}`, { confirmLabel: "Cambiar", danger: role === "student" }))) return;
    guard(async () => { await api.setRole(p.id, role); await log("role", { profile: p.id, role }); setNotice(`${p.full_name || p.email} ahora es ${ROLE_LABEL[role].toLowerCase()}.`); await reload(); if (role === "student") onClose(); });
  };

  return (
    <Sheet wide title={p.full_name || p.email} sub={`${p.email} · ${ROLE_LABEL[p.role] ?? p.role}${s.lastAt ? ` · creó algo ${ago(s.lastAt)}` : ""}`} onClose={onClose}>
      <div className="st-kpis">
        <span className="st-kpi"><b>{s.classes}</b><span>clases que dicta{s.viewOnly ? ` · ${s.viewOnly} solo ve` : ""}</span></span>
        <span className="st-kpi"><b>{s.students}</b><span>estudiantes</span></span>
        <span className="st-kpi"><b>{s.activities}</b><span>actividades · {s.recent} en 30 días</span></span>
        <span className="st-kpi"><b>{s.completion == null ? "—" : `${s.completion} %`}</b><span>entregado de lo que asignó</span></span>
        <span className="st-kpi"><b>{s.avgPct == null ? "—" : `${s.avgPct} %`}</b><span>aciertos en sus actividades</span></span>
        <span className="st-kpi"><b>{s.questions}</b><span>preguntas propias</span></span>
        <span className="st-kpi"><b>{s.lessons}</b><span>clases para proyectar</span></span>
        <span className="st-kpi"><b>{s.areas.length ? s.areas.map(areaShort).join(", ") : "—"}</b><span>materias</span></span>
      </div>

      <div className="cg-block">
        <span className="label">Clases y permisos</span>
        {s.access.length === 0 && <p className="cg-empty">Sin clases. Asígnale materias en Cursos y materias o dale un permiso por materia aquí abajo.</p>}
        {s.access.map((a) => {
          const ar = areaOf(a.course);
          return (
            <div key={a.course.id} className="st-class">
              <span className="cg-dot" style={{ background: ar ? areaColor(ar) : "var(--accent)" }} />
              <span><strong>{classLabel(a.course)}</strong><span className="caption">{a.via === "subject" ? "Por permiso de materia" : "Asignado en el curso"}</span></span>
              <div className="cg-seg" role="radiogroup" aria-label={`Permiso en ${classLabel(a.course)}`}>
                {["edit", "view"].map((k) => <button key={k} type="button" role="radio" aria-checked={a.access === k} className={a.access === k ? "on" : ""} disabled={a.via === "subject"} onClick={() => a.access !== k && setAccess(a, k)}>{ACCESS_LABEL[k]}</button>)}
              </div>
              {a.memberId && <button type="button" className="cm-x" aria-label={`Quitar de ${classLabel(a.course)}`} onClick={() => removeClass(a)}><Icon name="x" size={12} strokeWidth={3} /></button>}
            </div>
          );
        })}
      </div>

      <div className="cg-block">
        <span className="label">Permisos por materia</span>
        <p className="cg-help">Para quien acompaña una materia en todo el colegio (jefe de área, coordinador académico): ve o edita todas sus clases, también las que se creen después.</p>
        {mine.map((g) => (
          <div key={g.id} className="st-class">
            <span className="cg-dot" style={{ background: g.area === "*" ? "var(--accent)" : areaColor(g.area) }} />
            <span><strong>{grantText(g)}</strong></span>
            <button type="button" className={`cg-badge ${g.access}`} onClick={() => flipGrant(g)} title="Cambiar">{ACCESS_LABEL[g.access]}</button>
            <button type="button" className="cm-x" aria-label={`Quitar ${grantText(g)}`} onClick={() => dropGrant(g)}><Icon name="x" size={12} strokeWidth={3} /></button>
          </div>
        ))}
        {grants === null ? <p className="caption">Disponible cuando se ejecute la migración 0020 en Supabase.</p> : (
          <div className="st-grant-form">
            <Select value={area} onChange={setArea} aria-label="Materia">
              {AREAS.map((a) => <option key={a} value={a}>{areaShort(a)}</option>)}
              <option value="*">Todas las áreas</option>
            </Select>
            <Select value={grade} onChange={setGrade} aria-label="Grado">
              <option value="">Todos los grados</option>
              {grades.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
            </Select>
            <div className="cg-seg" role="radiogroup" aria-label="Nivel">
              {["view", "edit"].map((k) => <button key={k} type="button" role="radio" aria-checked={level === k} className={level === k ? "on" : ""} onClick={() => setLevel(k)}>{ACCESS_LABEL[k]}</button>)}
            </div>
            <button type="button" className="secondary" onClick={addGrant}>Agregar</button>
          </div>
        )}
      </div>

      <div className="cg-block">
        <span className="label">Rol</span>
        {self ? <p className="caption">No puedes cambiar tu propio rol.</p> : (
          <div className="cg-row">
            <span>{ROLE_LABEL[p.role]}</span>
            {p.role === "teacher" && <button type="button" className="link" onClick={() => changeRole("school_admin")}>Hacer coordinación</button>}
            {p.role === "school_admin" && <button type="button" className="link" onClick={() => changeRole("teacher")}>Pasar a docente</button>}
            <button type="button" className="link" onClick={() => changeRole("student")}>Quitar acceso docente</button>
          </div>
        )}
      </div>

      <div className="cg-block">
        <span className="label">Lo último que hizo</span>
        {feed.length === 0 ? <p className="caption">Nada todavía.</p> : (
          <div className="au-list">
            {feed.map((e) => (
              <div key={e.id} className="au-row">
                <span className={e.kind === "admin" ? "au-icon admin" : "au-icon"}><Icon name={e.kind === "activity" ? "book" : e.kind === "question" ? "pencil" : e.kind === "lesson" ? "school" : "shield"} size={15} /></span>
                <span className="au-text">{e.assignmentId && onOpenAssignment ? <button type="button" className="link" onClick={() => { onClose(); onOpenAssignment(e.assignmentId); }}>{e.text}</button> : e.text}</span>
                <span className="au-when">{ago(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
