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
import ClassLists from "./teacher/ClassLists.jsx";
import StaffList from "./teacher/Staff.jsx";
import AuditLog from "./teacher/AuditLog.jsx";
import { MyAccount, SchoolSettings } from "./teacher/Settings.jsx";
import "./teacher/colegio.css";
import { ActivityList, KIND_TABS, NewActivityMenu } from "./teacher/Activities.jsx";
import ContextSwitcher from "../components/ContextSwitcher.jsx";
import Receipt, { Novedades } from "../components/Receipt.jsx";
import { createWorkspaceStore } from "../lib/workspaceStore.js";
import { GRADES, SUBJECTS, gradeLabel, spaceName } from "../lib/spaces.js";
import { Select } from "../components/Controls.jsx";
import { ADMIN_NAV, HIDDEN_TABS, NAV, PRESETS, TABS, crumbs, navSection, normalize, parseRoute, routeHash } from "../lib/teacherRoutes.js";
import { schoolGrades } from "../lib/colegio.js";
import { areaOf, areaShort, buildContexts, contextColor, contextCourseIds, contextLabel, groupOf, scopeApi, validContext } from "../lib/teaching.js";
import { assignmentReceipt, loadReceipts, markSeen, reinforcementReceipt, rosterReceipt, saveReceipt, scanReceipt } from "../lib/receipts.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
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
  // Colegio (migration 0020): cursos, subject grants and school settings. null means the migration has not run.
  const [groupRecords, setGroupRecords] = useState([]);
  const [grants, setGrants] = useState([]);
  const [settings, setSettings] = useState({});
  const [colegio, setColegio] = useState(null); // staff, invites, audit, authorship, attempts: read when Colegio opens
  const [menu, setMenu] = useState(false);
  const [models, setModels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [focusStudent, setFocusStudent] = useState(null);
  const [focusMember, setFocusMember] = useState(null);
  const [liveNew, setLiveNew] = useState(0); // bumped by "Nueva actividad › Juego en vivo" to open the room form
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
    const optional = (fn) => Promise.resolve().then(fn).catch(() => null);
    const [c, a, m, d, g, sa, st] = await Promise.all([baseApi.listCourses(), baseApi.listAssignments(), soft(() => baseApi.allMembers()), soft(() => baseApi.groupDirectors()),
      optional(() => baseApi.schoolGroups?.()), optional(() => baseApi.subjectAccess?.()), optional(() => baseApi.schoolSettings?.())]);
    setAllCourses(c); setAllAssignments(a); setMembers(m); setDirectors(d ?? []);
    setGroupRecords(g ?? null); setGrants(sa ?? null); setSettings(st ?? null); setLoaded(true);
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
  const contexts = useMemo(() => buildContexts({ courses: allCourses, members, profile, directors, grants: grants ?? [] }), [allCourses, members, profile, directors, grants]);
  const context = validContext(contexts, ctx);
  const pickContext = (next) => { setCtx(next); try { localStorage.setItem(ctxKey(profile.id), JSON.stringify(next)); } catch { /* blocked */ } };
  const ids = contextCourseIds(contexts, context);
  const idsKey = ids.join(",");
  const narrow = !(admin && !context.subject && !context.group);
  const api = useMemo(() => (narrow ? scopeApi(baseApi, ids) : baseApi), [baseApi, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const courses = useMemo(() => (narrow ? allCourses.filter((c) => ids.includes(c.id)) : allCourses), [allCourses, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => (narrow ? allAssignments.filter((a) => ids.includes(a.course_id)) : allAssignments), [allAssignments, narrow, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const contextName = contextLabel(contexts, context);
  const tint = context.subject ? contextColor(context.subject) : "var(--accent)";
  const viewKey = `${context.subject ?? "all"}|${context.courseId ?? ""}|${context.group ?? ""}`;
  const grades = schoolGrades(settings, groupRecords ?? [], allCourses);
  // Writes one line to Colegio › Quién hizo qué (best effort: never blocks the action).
  const log = useCallback((action, detail) => baseApi.logAction?.(profile.school_id, profile.id, action, detail), [baseApi, profile.school_id, profile.id]);
  const loadColegio = useCallback(() => guard(async () => {
    const optional = (fn) => Promise.resolve().then(fn).catch(() => null);
    const [staff, invites, audit, authorship, attempts, school] = await Promise.all([baseApi.listStaff(), optional(() => baseApi.staffInvites()), optional(() => baseApi.auditLog()),
      optional(() => baseApi.authorship()), soft(() => baseApi.allAttempts()), optional(() => baseApi.schoolInfo())]);
    setColegio({ staff, invites, audit, authorship: authorship ?? {}, attempts, school });
  }), [baseApi, guard]);
  const colegioOpen = admin && (route.section === "colegio" || route.section === "cuenta");
  useEffect(() => { if (colegioOpen) loadColegio(); }, [colegioOpen, loadColegio]);
  const reloadAll = useCallback(async () => { await reload(); if (admin) await loadColegio(); }, [reload, loadColegio, admin]);
  useEffect(() => {
    if (!menu) return undefined;
    const down = (e) => { if (!e.target.closest?.(".tl-menu-wrap")) setMenu(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [menu]);
  const openGroup = (key) => { pickContext({ subject: null, courseId: null, group: key }); go({ section: "hoy" }); };

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
        <button type="button" className={r.section === "cuenta" ? "card plan tl-me on" : "card plan tl-me"} onClick={() => go({ section: "cuenta" })} aria-label="Mi cuenta">
          <span className="label">{profile.full_name || profile.email}</span>
          <span className="caption">{admin ? "Coordinación" : "Docente"} · Mi cuenta y permisos</span>
        </button>
        <button type="button" className="link t-exit" onClick={onExit}>
          <span className="t-exit-long">Volver a la app de estudiante</span>
          <span className="t-exit-short" aria-hidden="true">‹ Estudiante</span>
        </button>
      </aside>

      <main className="t-main">
        <header className="tl-top">
          <span className="tl-menu-wrap">
            <button type="button" className="icon-btn tl-exit" aria-label="Menú de la cuenta" aria-expanded={menu} onClick={() => setMenu(!menu)}><Logo size={26} /></button>
            {menu && (
              <span className="tl-menu" role="menu">
                <strong>{profile.full_name || profile.email}</strong>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); go({ section: "cuenta" }); }}><Icon name="user" size={16} /> Mi cuenta y permisos</button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onExit(); }}><Icon name="left" size={16} /> App de estudiante</button>
              </span>
            )}
          </span>
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
          <NewActivityMenu go={go} disabled={loaded && allCourses.length === 0} onLive={() => setLiveNew((n) => n + 1)} />
          <Novedades receipts={receipts} open={bell} onToggle={(v) => { setBell(v); if (v) setReceipts(markSeen(profile.id)); }} onOpen={openReceipt} />
        </header>

        {r.section === "actividad" && activity && (
          <button type="button" className="tl-back" onClick={() => go({ section: "actividades" })}><Icon name="left" size={16} strokeWidth={3} /> Actividades</button>
        )}
        {tabs.length > 1 && (
          <div className="seg-tabs tl-tabs" role="tablist" aria-label="Pestañas">
            {tabs.map(([id, label, short]) => (
              <button key={id} type="button" role="tab" aria-label={short ? label : undefined} aria-selected={r.tab === id} className={r.tab === id ? "on" : ""} onClick={() => go({ section: r.section, tab: id })}>
                {short ? <><span className="tab-long">{label}</span><span className="tab-short" aria-hidden="true">{short}</span></> : label}
              </button>
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
          {r.section === "actividades" && KIND_TABS[r.tab] && <ActivityList key={r.tab} kind={KIND_TABS[r.tab].kind} courses={courses} assignments={assignments} contextName={contextName} go={go} loaded={loaded} />}
          {r.section === "actividades" && r.tab === "nueva" && (
            courses.length === 0 ? <p className="caption">Primero necesitas una clase (Estudiantes › Listas de clase).</p> : (
              <AssignBuilder key={r.preset ?? "any"} preset={PRESETS[r.preset] ?? null} api={baseApi} courses={courses.filter((c) => !contexts.subjects.some((s) => s.classes.some((k) => k.id === c.id && k.readOnly)))} exams={exams} fetchExam={fetchExam} guard={guard}
                onCancel={() => go({ section: "actividades" })} grading={{ models, profile, onChange: reloadModels }}
                onSaved={async (a, n) => { await reload(); go({ section: "actividad", id: a.id, tab: a.delivery === "paper" ? "papel" : "resultados" }); showReceipt(assignmentReceipt({ assignment: a, classes: n })); }} />
            )
          )}
          {r.section === "actividades" && r.tab === "vivo" && <LiveSection key={liveNew} startCreating={liveNew > 0} api={baseApi} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} AssignBuilder={AssignBuilder} />}
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
            <ClassLists api={baseApi} profile={profile} courses={courses} readOnlyIds={contexts.readOnly} settings={settings} reload={reload} guard={guard} setNotice={setNotice} log={log}
              onImported={(course, count) => showReceipt(rosterReceipt({ course, count }))} />
          )}

          {r.section === "resultados" && r.tab === "resumen" && (
            <>
              <Dashboard api={api} profile={profile} guard={guard} ws={ws} onOpenStudent={openStudent} onOpenQueue={() => openStudent("#queue")} onOpenCourse={() => go({ section: "estudiantes", tab: "clases" })} onReinforce={() => go({ section: "actividades", tab: "refuerzo" })} />
              <TeacherReports api={api} profile={profile} courses={courses} assignments={assignments} models={models} fetchExam={fetchExam} guard={guard} onOpenStudent={openStudent} />
            </>
          )}
          {r.section === "resultados" && r.tab === "actividades" && <ResultsByActivity api={api} courses={courses} assignments={assignments} go={go} contextName={contextName} />}
          {r.section === "resultados" && r.tab === "calificacion" && (
            <GradingSettings api={baseApi} profile={profile} courses={courses} assignments={assignments} models={models} reloadModels={reloadModels} guard={guard} setNotice={setNotice} />
          )}
          {r.section === "resultados" && r.tab === "grafica" && <ChartBuilder api={api} profile={profile} courses={courses} assignments={assignments} fetchExam={fetchExam} guard={guard} ws={ws} />}

          {r.section === "biblioteca" && r.tab === "banco" && <BankEditor api={baseApi} profile={profile} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} />}
          {r.section === "biblioteca" && r.tab === "preguntas" && <QuestionBuilder api={baseApi} profile={profile} guard={guard} setNotice={setNotice} />}
          {r.section === "biblioteca" && r.tab === "clases" && <Lessons api={baseApi} profile={profile} courses={courses} assignments={assignments} exams={exams} fetchExam={fetchExam} guard={guard} setNotice={setNotice} reload={reload} />}

          {r.section === "colegio" && r.tab === "cursos" && (
            <ClassMatrix api={baseApi} profile={profile} courses={allCourses} members={members} directors={directors} records={groupRecords} grades={grades} staff={colegio?.staff ?? []}
              guard={guard} setNotice={setNotice} reload={reloadAll} log={log} onOpenGroup={openGroup}
              onOpenClass={(id) => { const c = allCourses.find((x) => x.id === id); pickContext({ subject: areaOf(c) ?? contexts.subjects.find((s) => s.classes.some((k) => k.id === id))?.key ?? null, courseId: id }); go({ section: "hoy" }); }} />
          )}
          {r.section === "colegio" && r.tab === "docentes" && (
            !colegio ? <p className="caption">Cargando…</p> : (
              <StaffList api={baseApi} profile={profile} staff={colegio.staff} invites={colegio.invites} courses={allCourses} members={members} grants={grants} authorship={colegio.authorship}
                attempts={colegio.attempts} audit={colegio.audit} grades={grades} guard={guard} setNotice={setNotice} reload={reloadAll} log={log}
                onOpenAssignment={(id) => go({ section: "actividad", id, tab: "resultados" })} />
            )
          )}
          {r.section === "colegio" && r.tab === "registro" && (
            !colegio ? <p className="caption">Cargando…</p> : <AuditLog audit={colegio.audit} authorship={colegio.authorship} staff={colegio.staff} courses={allCourses} onOpenAssignment={(id) => go({ section: "actividad", id, tab: "resultados" })} />
          )}
          {r.section === "colegio" && r.tab === "calificacion" && <GradingSettings api={baseApi} profile={profile} courses={allCourses} assignments={allAssignments} models={models} reloadModels={reloadModels} guard={guard} setNotice={setNotice} />}
          {r.section === "colegio" && r.tab === "ajustes" && <SchoolSettings api={baseApi} profile={profile} settings={settings} school={colegio?.school} guard={guard} setNotice={setNotice} reload={reloadAll} log={log} />}
          {r.section === "cuenta" && <MyAccount api={baseApi} profile={profile} courses={allCourses} members={members} grants={grants} guard={guard} setNotice={setNotice} onExit={onExit} />}
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
