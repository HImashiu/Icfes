import { useCallback, useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo.jsx";
import { assignmentState, scorePct, whoOf } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";
import { parseRoster } from "../lib/roster.js";
import { CONSENT_VERSION, GUARDIAN_TEXT, hasGuardianAuth } from "../lib/consent.js";
import AssignBuilder from "./AssignBuilder.jsx";
import Dashboard from "./Dashboard.jsx";
import Reinforcement from "./Reinforcement.jsx";
import QuestionBuilder from "./QuestionBuilder.jsx";
import { LiveSection } from "./LiveHost.jsx";
import { FilePicker, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import BankEditor from "./BankEditor.jsx";
import ChartBuilder from "./ChartBuilder.jsx";
import GradingSettings from "./GradingSettings.jsx";
import Lessons from "./Lessons.jsx";
import Students from "./Students.jsx";
import TeacherReports from "./TeacherReports.jsx";
import Today from "./teacher/Today.jsx";
import ActivityPage from "./teacher/ActivityPage.jsx";
import ClassMatrix from "./teacher/ClassMatrix.jsx";
import ContextSwitcher from "../components/ContextSwitcher.jsx";
import Receipt, { Novedades } from "../components/Receipt.jsx";
import { createWorkspaceStore } from "../lib/workspaceStore.js";
import { GRADES, SUBJECTS, gradeLabel, spaceName } from "../lib/spaces.js";
import { Select } from "../components/Controls.jsx";
import { ADMIN_NAV, HIDDEN_TABS, NAV, TABS, crumbs, navSection, normalize, parseRoute, routeHash } from "../lib/teacherRoutes.js";
import { areaOf, areaShort, buildContexts, contextColor, contextCourseIds, contextLabel, groupOf, scopeApi, validContext } from "../lib/teaching.js";
import { assignmentReceipt, loadReceipts, markSeen, reinforcementReceipt, rosterReceipt, saveReceipt, scanReceipt } from "../lib/receipts.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const KIND_ICON = { task: "bolt", homework: "book", exam: "clock" };
const STATE_LABEL = { active: "Abierta", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };
// Extra reads that older databases (or a missing migration) may refuse: they fall back to nothing.
const soft = (fn) => Promise.resolve().then(fn).then((v) => v ?? []).catch(() => []);
const ctxKey = (uid) => `condor:ctx:${uid}`;
const readCtx = (uid) => { try { return JSON.parse(localStorage.getItem(ctxKey(uid)) ?? "null"); } catch { return null; } };

// The teacher panel: five destinations (Hoy, Actividades, Estudiantes, Resultados, Biblioteca), plus Colegio for
// coordination. Everything is seen through a context (a subject and, optionally, one class), every page has an
// address in the URL hash, and every save ends in a receipt that says where the data went.
export default function TeacherLive({ auth, exams, fetchExam, onExit }) {
  const { api: baseApi, profile } = auth;
  const admin = profile.role === "school_admin";
  const [route, setRoute] = useState(() => parseRoute(typeof location !== "undefined" ? location.hash : ""));
  const [ctx, setCtx] = useState(() => readCtx(profile.id));
  const [allCourses, setAllCourses] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [members, setMembers] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [models, setModels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [focusStudent, setFocusStudent] = useState(null);
  const [focusMember, setFocusMember] = useState(null);
  const [receipts, setReceipts] = useState(() => loadReceipts(profile.id));
  const [shownReceipt, setShownReceipt] = useState(null);
  const [bell, setBell] = useState(false);
  // Statuses, groups, follow-up, notes and saved views (migration 0014; this browser until it runs).
  const [ws, setWs] = useState(null);
  const store = useMemo(
    () => createWorkspaceStore({ api: baseApi, schoolId: profile.school_id, userId: profile.id, userName: profile.full_name || profile.email, onChange: setWs }),
    [baseApi, profile.school_id, profile.id, profile.full_name, profile.email],
  );

  const guard = useCallback(async (fn) => {
    setError(null);
    try { return await fn(); } catch (e) { setError(e.message); return undefined; }
  }, []);
  const reload = useCallback(() => guard(async () => {
    const [c, a, m, d] = await Promise.all([baseApi.listCourses(), baseApi.listAssignments(), soft(() => baseApi.allMembers()), soft(() => baseApi.groupDirectors())]);
    setAllCourses(c); setAllAssignments(a); setMembers(m); setDirectors(d ?? []); setLoaded(true);
  }), [baseApi, guard]);
  const reloadModels = useCallback(() => guard(async () => { setModels(await baseApi.gradingModels()); }), [baseApi, guard]);
  useEffect(() => { reload(); reloadModels(); }, [reload, reloadModels]);
  useEffect(() => { guard(() => store.load()); }, [guard, store]);

  // Addresses: pushState on every move, popstate for the browser's back button.
  const go = useCallback((next) => {
    const r = normalize(next);
    const hash = routeHash(r);
    if (typeof location !== "undefined" && location.hash !== hash) history.pushState(null, "", hash);
    setRoute(r); setNotice(null); setBell(false); setShownReceipt(null);
    if (typeof window !== "undefined" && window.scrollTo) try { window.scrollTo(0, 0); } catch { /* jsdom */ }
  }, []);
  useEffect(() => {
    const pop = () => setRoute(parseRoute(location.hash));
    window.addEventListener("popstate", pop);
    if (!location.hash.startsWith("#docente")) history.replaceState(null, "", routeHash(route));
    return () => window.removeEventListener("popstate", pop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Context: what subject and class everything shows.
  const contexts = useMemo(() => buildContexts({ courses: allCourses, members, profile, directors }), [allCourses, members, profile, directors]);
  const context = validContext(contexts, ctx);
  const pickContext = (next) => { setCtx(next); try { localStorage.setItem(ctxKey(profile.id), JSON.stringify(next)); } catch { /* blocked */ } };
  const ids = contextCourseIds(contexts, context);
  const idsKey = ids.join(",");
  const narrow = !(admin && !context.subject);
  const api = useMemo(() => (narrow ? scopeApi(baseApi, ids) : baseApi), [baseApi, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const courses = useMemo(() => (narrow ? allCourses.filter((c) => ids.includes(c.id)) : allCourses), [allCourses, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => (narrow ? allAssignments.filter((a) => ids.includes(a.course_id)) : allAssignments), [allAssignments, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const contextName = contextLabel(contexts, context);
  const tint = context.subject ? contextColor(context.subject) : "var(--accent)";
  const viewKey = `${context.subject ?? "all"}|${context.courseId ?? ""}`;

  const showReceipt = (r) => { const { row, list } = saveReceipt(profile.id, r); setReceipts(list); setShownReceipt(row); };
  const openReceipt = (r) => { setReceipts(markSeen(profile.id)); setShownReceipt(r); setBell(false); };
  const openStudent = (email) => { setFocusStudent(email); go({ section: "estudiantes", tab: "lista" }); };
  const openAssignment = (id, memberId) => { setFocusMember(memberId ?? null); go({ section: "actividad", id, tab: "resultados" }); };

  const r = route.section === "colegio" && !admin ? normalize({ section: "hoy" }) : route;
  const activity = r.section === "actividad" ? allAssignments.find((a) => a.id === r.id) : null;
  const activityCourse = activity ? allCourses.find((c) => c.id === activity.course_id) : null;
  const trail = crumbs(r, { activityTitle: activity?.title });
  const current = navSection(r);
  const tabs = r.section === "actividad" ? [] : (TABS[r.section] ?? []).filter(([id]) => !HIDDEN_TABS.has(id));

  return (
    <div className="teacher tl" style={{ "--ctx": tint }}>
      <aside className="t-side" aria-label="Navegación docente">
        <strong className="t-logo"><Logo size={30} /> Cóndor</strong>
        <nav>
          {NAV.map((n) => (
            <button key={n.section} type="button" className={current === n.section ? "t-nav active" : "t-nav"} aria-current={current === n.section ? "page" : undefined} onClick={() => go({ section: n.section })}>
              <Icon name={n.icon} size={18} strokeWidth={2.4} /><span>{n.label}</span>
            </button>
          ))}
          {admin && <span className="t-group">Colegio</span>}
          {admin && ADMIN_NAV.map((n) => {
            const on = r.section === "colegio" && r.tab === n.tab;
            return (
              <button key={n.tab} type="button" className={on ? "t-nav active" : "t-nav"} aria-current={on ? "page" : undefined} onClick={() => go({ section: "colegio", tab: n.tab })}>
                <Icon name={n.icon} size={18} strokeWidth={2.4} /><span>{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="card plan">
          <span className="label">{profile.full_name || profile.email}</span>
          <span className="caption">{admin ? "Coordinación" : "Docente"} · clave de respuestas preliminar</span>
        </div>
        <button type="button" className="link t-exit" onClick={onExit}>
          <span className="t-exit-long">Volver a la app de estudiante</span>
          <span className="t-exit-short" aria-hidden="true">‹ Estudiante</span>
        </button>
      </aside>

      <main className="t-main">
        <header className="tl-top">
          <button type="button" className="icon-btn tl-exit" aria-label="Volver a la app de estudiante" onClick={onExit}><Logo size={26} /></button>
          <ContextSwitcher contexts={contexts} value={context} onChange={pickContext} />
          <nav className="tl-crumbs" aria-label="Estás en">
            {trail.map((c, i) => (
              <span key={`${c.label}-${i}`} className="tl-crumb">
                {i > 0 && <Icon name="right" size={12} strokeWidth={3} />}
                {c.route && i < trail.length - 1 ? <button type="button" className="link" onClick={() => go(c.route)}>{c.label}</button> : <strong aria-current="page">{c.label}</strong>}
              </span>
            ))}
          </nav>
          <span className="tl-spacer" />
          <button type="button" className="tl-live" onClick={() => go({ section: "actividades", tab: "vivo" })} aria-label="Juego en vivo">
            <Icon name="bolt" size={15} /><span>Juego en vivo</span>
          </button>
          <button type="button" className="primary tl-new" onClick={() => go({ section: "actividades", tab: "nueva" })} disabled={loaded && allCourses.length === 0} aria-label="Nueva actividad">
            <Icon name="plus" size={17} strokeWidth={2.8} /><span>Nueva actividad</span>
          </button>
          <Novedades receipts={receipts} open={bell} onToggle={(v) => { setBell(v); if (v) setReceipts(markSeen(profile.id)); }} onOpen={openReceipt} />
        </header>

        {r.section === "actividad" && activity && (
          <button type="button" className="tl-back" onClick={() => go({ section: "actividades" })}><Icon name="left" size={16} strokeWidth={3} /> Actividades</button>
        )}
        {tabs.length > 1 && (
          <div className="seg-tabs tl-tabs" role="tablist" aria-label="Pestañas">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={r.tab === id} className={r.tab === id ? "on" : ""} onClick={() => go({ section: r.section, tab: id })}>{label}</button>
            ))}
          </div>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <div className="tl-page" key={viewKey}>
          {r.section === "hoy" && (
            <Today api={api} profile={profile} courses={courses} assignments={assignments} ws={ws} receipts={receipts} subject={context.subject} contextName={contextName}
              go={go} onOpenStudent={openStudent} onOpenReceipt={openReceipt} onReinforce={() => go({ section: "actividades", tab: "refuerzo" })} />
          )}

          {r.section === "actividades" && r.tab === "lista" && <ActivityList courses={courses} assignments={assignments} contextName={contextName} go={go} loaded={loaded} />}
          {r.section === "actividades" && r.tab === "nueva" && (
            courses.length === 0 ? <p className="caption">Primero necesitas una clase (Estudiantes › Listas de clase).</p> : (
              <AssignBuilder api={baseApi} courses={courses.filter((c) => !contexts.subjects.some((s) => s.classes.some((k) => k.id === c.id && k.readOnly)))} exams={exams} fetchExam={fetchExam} guard={guard}
                onCancel={() => go({ section: "actividades" })}
                onSaved={async (a, n) => { await reload(); go({ section: "actividad", id: a.id }); showReceipt(assignmentReceipt({ assignment: a, classes: n })); }} />
            )
          )}
          {r.section === "actividades" && r.tab === "vivo" && <LiveSection api={baseApi} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} AssignBuilder={AssignBuilder} />}
          {r.section === "actividades" && r.tab === "refuerzo" && (
            <Reinforcement api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} onSaved={(count) => { reload(); showReceipt(reinforcementReceipt({ count })); }} />
          )}

          {r.section === "actividad" && !activity && <p className="caption">{loaded ? "Esta actividad no existe o no tienes acceso a ella." : "Cargando…"}</p>}
          {r.section === "actividad" && activity && (
            <ActivityPage key={activity.id} api={baseApi} profile={profile} assignment={activity} course={activityCourse} tab={r.tab} go={go} models={models} reloadModels={reloadModels}
              fetchExam={fetchExam} guard={guard} setNotice={setNotice} reload={reload} assignments={allAssignments} courses={allCourses} focusMember={focusMember}
              onScanned={(info) => { reload(); showReceipt(scanReceipt(info)); }} />
          )}

          {r.section === "estudiantes" && r.tab === "lista" && (
            <Students api={api} profile={profile} courses={courses} assignments={assignments} guard={guard} setNotice={setNotice} ws={ws} store={store}
              focus={focusStudent} onFocusDone={() => setFocusStudent(null)} onOpenAssignment={openAssignment} onReinforce={() => go({ section: "actividades", tab: "refuerzo" })} />
          )}
          {r.section === "estudiantes" && r.tab === "clases" && (
            <Courses api={baseApi} profile={profile} courses={courses} reload={reload} guard={guard} setNotice={setNotice} onImported={(course, count) => showReceipt(rosterReceipt({ course, count }))} />
          )}

          {r.section === "resultados" && r.tab === "resumen" && (
            <>
              <Dashboard api={api} profile={profile} guard={guard} ws={ws} onOpenStudent={openStudent} onOpenQueue={() => openStudent("#queue")} onOpenCourse={() => go({ section: "estudiantes", tab: "clases" })} onReinforce={() => go({ section: "actividades", tab: "refuerzo" })} />
              <TeacherReports api={api} profile={profile} courses={courses} assignments={assignments} models={models} fetchExam={fetchExam} guard={guard} onOpenStudent={openStudent} />
            </>
          )}
          {r.section === "resultados" && r.tab === "actividades" && <ResultsByActivity api={api} courses={courses} assignments={assignments} go={go} contextName={contextName} />}
          {r.section === "resultados" && r.tab === "grafica" && <ChartBuilder api={api} profile={profile} courses={courses} assignments={assignments} fetchExam={fetchExam} guard={guard} />}

          {r.section === "biblioteca" && r.tab === "banco" && <BankEditor api={baseApi} profile={profile} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} />}
          {r.section === "biblioteca" && r.tab === "preguntas" && <QuestionBuilder api={baseApi} profile={profile} guard={guard} setNotice={setNotice} />}
          {r.section === "biblioteca" && r.tab === "clases" && <Lessons api={baseApi} profile={profile} courses={courses} assignments={assignments} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} reload={reload} />}

          {r.section === "colegio" && r.tab === "docentes" && (
            <>
              <ClassMatrix api={baseApi} profile={profile} courses={allCourses} members={members} directors={directors} guard={guard} setNotice={setNotice} reload={reload}
                onOpenClass={(id) => { const c = allCourses.find((x) => x.id === id); pickContext({ subject: areaOf(c) ?? contexts.subjects.find((s) => s.classes.some((k) => k.id === id))?.key ?? null, courseId: id }); go({ section: "hoy" }); }} />
              <Staff api={baseApi} profile={profile} guard={guard} setNotice={setNotice} />
            </>
          )}
          {r.section === "colegio" && r.tab === "calificacion" && <GradingSettings api={baseApi} profile={profile} courses={allCourses} assignments={allAssignments} models={models} reloadModels={reloadModels} guard={guard} setNotice={setNotice} />}
          {r.section === "colegio" && r.tab === "ajustes" && <Settings api={baseApi} profile={profile} guard={guard} setNotice={setNotice} />}
        </div>
      </main>

      <nav className="tl-bottom" aria-label="Secciones">
        {NAV.map((n) => (
          <button key={n.section} type="button" className={current === n.section ? "on" : ""} aria-current={current === n.section ? "page" : undefined} onClick={() => go({ section: n.section })}>
            <Icon name={n.icon} size={21} /><span>{n.label}</span>
          </button>
        ))}
        {admin && (
          <button type="button" className={current === "colegio" ? "on" : ""} onClick={() => go({ section: "colegio" })}>
            <Icon name="shield" size={21} /><span>Colegio</span>
          </button>
        )}
      </nav>

      {shownReceipt && <Receipt receipt={shownReceipt} onGo={(to) => go(to)} onClose={() => setShownReceipt(null)} />}
    </div>
  );
}

// Actividades › Todas: grouped by what needs doing, each card opens the activity page.
function ActivityList({ courses, assignments, contextName, go, loaded }) {
  const [tab, setTab] = useState("open");
  const [space, setSpace] = useState("");
  const list = assignments.filter((a) => !space || a.course_id === space);
  const open = list.filter((a) => ["active", "scheduled"].includes(assignmentState(a)));
  const closed = list.filter((a) => ["closed", "draft"].includes(assignmentState(a)));
  const shown = tab === "open" ? open : closed;
  const byCourse = Object.fromEntries(courses.map((c) => [c.id, c]));
  return (
    <section className="card t-card al">
      <div className="section-head">
        <div className="segmented small" role="tablist" aria-label="Estado">
          {[["open", `Abiertas · ${open.length}`], ["closed", `Cerradas · ${closed.length}`]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {courses.length > 1 && <Select className="course-filter" aria-label="Clase" value={space} onChange={setSpace}><option value="">Todas las clases</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </div>
      {loaded && shown.length === 0 && (
        <p className="caption">{tab === "open" ? `No hay actividades abiertas en ${contextName}.` : "Todavía no hay actividades cerradas."} <button type="button" className="link" onClick={() => go({ section: "actividades", tab: "nueva" })}>Crear una</button></p>
      )}
      <div className="assign-cards">
        {shown.map((a) => {
          const state = assignmentState(a);
          const c = byCourse[a.course_id];
          const area = c ? areaOf(c) : null;
          return (
            <button key={a.id} type="button" className={`assign-card state-${state}`} onClick={() => go({ section: "actividad", id: a.id })}>
              <span className="assign-icon" style={{ "--tile": area ? areaColor(area) : a.scope === "all" ? "var(--accent)" : areaColor(a.scope) }} aria-hidden="true">
                <Icon name={KIND_ICON[a.kind] ?? "book"} size={22} strokeWidth={2.4} />
              </span>
              <span className="assign-body">
                <strong>{a.title}</strong>
                <span className="caption">{c ? `${area ? areaShort(area) : "Varias áreas"} · ${groupOf(c).name}` : a.courses?.name}{a.due_at ? ` · ${state === "closed" ? "cerró" : "cierra"} ${shortDate(a.due_at)}` : ""}</span>
              </span>
              <span className="assign-state">{STATE_LABEL[state]}</span>
              <span className="assign-chevron" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.8} /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Resultados › Por actividad: one row per activity with deliveries and average; each opens its page.
function ResultsByActivity({ api, courses, assignments, go, contextName }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [attempts, members] = await Promise.all([api.reportAttempts ? api.reportAttempts() : api.allAttempts(), api.allMembers().catch(() => [])]);
      const students = (id) => members.filter((m) => m.course_id === id && m.role === "student").length;
      const out = assignments.map((a) => {
        const done = attempts.filter((t) => t.assignment_id === a.id && t.submitted_at);
        const who = new Set(done.map(whoOf).filter(Boolean)).size;
        const pcts = done.map(scorePct).filter((p) => p != null);
        return { a, who, of: a.assignee_id ? 1 : students(a.course_id), avg: pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null };
      });
      if (alive) setRows(out);
    })().catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [api, assignments]);
  const byCourse = Object.fromEntries(courses.map((c) => [c.id, c]));
  return (
    <section className="card t-card">
      <div className="section-head"><h2>Todas las actividades</h2><span className="caption">{contextName}</span></div>
      <div className="ra-list">
        {(rows ?? []).map(({ a, who, of, avg }) => {
          const c = byCourse[a.course_id];
          const area = c ? areaOf(c) : null;
          return (
            <button key={a.id} type="button" className="ra-row" onClick={() => go({ section: "actividad", id: a.id, tab: "resultados" })}>
              <span className="ctx-dot" style={{ background: area ? areaColor(area) : "var(--accent)" }} aria-hidden="true" />
              <span className="ra-main"><strong>{a.title}</strong><span className="caption">{c ? groupOf(c).name : a.courses?.name} · {STATE_LABEL[assignmentState(a)]} · {who} de {of} entregas</span></span>
              <span className="ra-avg">{avg == null ? <span className="caption">—</span> : <><span className="td-track"><span style={{ width: `${avg}%`, background: avg < 50 ? "var(--flame)" : area ? areaColor(area) : "var(--accent)" }} /></span><b>{avg} %</b></>}</span>
              <Icon name="right" size={16} strokeWidth={3} />
            </button>
          );
        })}
        {rows && rows.length === 0 && <p className="caption">Sin actividades en {contextName}.</p>}
        {!rows && <p className="caption">Cargando…</p>}
      </div>
    </section>
  );
}

function Courses({ api, profile, courses, reload, guard, setNotice, focus, onImported }) {
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
      setNotice(`Clase ${c.name} creada. Ahora agrega a sus estudiantes.`);
      await reload();
      setOpen(c.id);
    });
  };

  return (
    <>
      <p className="caption tl-lead">Una clase es un grupo con una materia (por ejemplo «Inglés 11A»). Las actividades y los resultados se organizan por clase.</p>
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
      {courses.length === 0 && <p className="caption">Todavía no tienes clases.</p>}
      {courses.map((c) => (
        <div key={c.id} className="card t-card">
          <div className="section-head">
            <strong>{c.name}{c.grade && !c.subject ? ` · Grado ${c.grade}` : ""}</strong>
            <button type="button" className="secondary" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Cerrar" : "Ver lista"}</button>
          </div>
          {open === c.id && <Roster api={api} course={c} guard={guard} setNotice={setNotice} reload={reload} onImported={onImported} />}
        </div>
      ))}
    </>
  );
}

function Roster({ api, course, guard, setNotice, reload, onImported }) {
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
      if (onImported) onImported(course, n);
      else setNotice(`${n} estudiantes en ${course.name}. Entran cuando inicien sesión con su correo del colegio.`);
      await load();
      reload();
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
      <div className="card t-card">
        <div className="section-head"><h2>Roles</h2><span className="caption">Quién es docente y quién es coordinación.</span></div>
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
