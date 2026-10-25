import { Component, useCallback, useEffect, useMemo, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import Test from "./screens/Test.jsx";
import Results from "./screens/Results.jsx";
import Review from "./screens/Review.jsx";
import Profile from "./screens/Profile.jsx";
import Subjects from "./screens/Subjects.jsx";
import Progress from "./screens/Progress.jsx";
import { classesFrom, studentCourses } from "./lib/student.js";
import Teacher from "./screens/Teacher.jsx";
import TeacherLive from "./screens/TeacherLive.jsx";
import Login from "./screens/Login.jsx";
import History from "./screens/History.jsx";
import Reports from "./screens/Reports.jsx";
import FigureCheck from "./screens/FigureCheck.jsx";
import FigureReview from "./screens/FigureReview.jsx";
import Presentation from "./screens/Presentation.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { ExamContext } from "./lib/exam-context.js";
import { parseExam, parseKey, parseKeyNotes, questionsFor, timedSeconds } from "./lib/exam.js";
import { clearAttempt, loadAttempt, saveAttempt } from "./lib/storage.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "./lib/figures.js";
import { applyTheme, currentTheme } from "./lib/theme.js";
import { AuthContext, useAuth } from "./lib/auth.jsx";
import DemoBanner from "./demo/DemoBanner.jsx";
import Consent from "./screens/Consent.jsx";
import FamilyReport from "./screens/FamilyReport.jsx";
import { tokenFromHash } from "./lib/family.js";
import { applyOverrides } from "./lib/overrides.js";
import { TEACHER_SLUG, teacherExam } from "./lib/teacherExam.js";
import LivePlay, { LiveJoin } from "./screens/LivePlay.jsx";
import CustomPractice from "./screens/CustomPractice.jsx";
import { joinCodeFromHash } from "./lib/joinLink.js";
import { CONSENT_VERSION, needsTerms } from "./lib/consent.js";
import { AnnotationProvider } from "./components/Annotations.jsx";
import { GlossaryProvider } from "./components/Glossary.jsx";
import { loadHistory } from "./lib/local.js";
import { demoEnabled } from "./demo/mode.js";
import { pendingMisses, repechajeKeys } from "./lib/repechaje.js";
import { resolveModel, xpFactor } from "./lib/grading.js";
import { attemptForAssignment, attemptRow, attemptsLeft, questionsForAttempt, revealAllowed } from "./lib/assignments.js";

const base = import.meta.env.BASE_URL;

// A screen that throws must never leave a blank page: show a way back instead.
class ScreenBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="frame">
        <div className="card" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
          <strong>Algo salió mal en esta pantalla</strong>
          <span className="caption">Tu avance está guardado en este dispositivo.</span>
          <button type="button" className="primary" onClick={this.props.onHome}>Volver al inicio</button>
        </div>
      </main>
    );
  }
}

async function getJson(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return res.json();
}

// The student's unfinished attempt for this exam, across the whole exam and each area.
function findResumable(slug, exam) {
  const scopes = ["all", ...exam.sections.map((s) => s.name)];
  for (const scope of scopes) {
    const a = loadAttempt(slug, scope);
    if (a && !a.submittedAt) {
      const total = questionsFor(exam, scope).length;
      const left = a.durationSec ? a.durationSec - (Date.now() - a.startedAt) / 1000 : null;
      return { scope, mode: a.mode, answered: Object.keys(a.answers).length, total, left };
    }
  }
  return null;
}

// An assignment's attempt is saved apart from free practice on the same area.
// Ten questions spread over every area of the booklet, for the plan's "mixed areas" day.
const mixedKeys = (exam, n = 10) => {
  const per = Math.max(1, Math.ceil(n / Math.max(1, exam.sections.length)));
  return exam.sections.flatMap((s) => [...s.questions].sort(() => Math.random() - 0.5).slice(0, per).map((q) => q.key)).slice(0, n);
};

const storeScope = (a) => (a.assignmentId ? `asg-${a.assignmentId}` : a.repechaje ? "repechaje" : a.custom ? "custom" : a.scope);

export default function App() {
  const rootAuth = useAuth();
  // Demo mode: the student side is one invented student of 11 A; the teacher side is the school's coordinator.
  const demoStudent = rootAuth.demoStudent;
  const auth = useMemo(() => (demoStudent ? { ...rootAuth, profile: demoStudent.profile, user: { id: demoStudent.profile.id }, api: demoStudent.api } : rootAuth), [rootAuth, demoStudent]);
  const signedIn = auth.status === "ready";
  const [assigned, setAssigned] = useState({ assignments: [], attempts: [], models: [] });
  const [myClasses, setMyClasses] = useState(null);
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // { slug, exam, key, keyStatus, notes, figures }
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);
  // A student who scans a room's QR code lands on the join screen with the code filled in.
  const [joinCode] = useState(() => (typeof window !== "undefined" ? joinCodeFromHash(window.location.hash) : ""));
  const [view, setView] = useState(() => (joinCode ? "liveJoin" : demoEnabled || (typeof window !== "undefined" && window.location.hash.startsWith("#docente")) ? "teacher" : "home"));
  const [reviewStart, setReviewStart] = useState(0);
  const [reviewNumber, setReviewNumber] = useState(null);
  // What the home card asked for (area, mode), so "Reto del día" or "Simulacro completo" open set up that way.
  const [preset, setPreset] = useState(null);
  // Materias (tab "materias" or "tareas", or one subject open) and Progreso (resumen, logros, historial).
  const [subjectTab, setSubjectTab] = useState("materias");
  const [subjectId, setSubjectId] = useState(null);
  const [progressTab, setProgressTab] = useState("resumen");
  const [attempt, setAttempt] = useState(null);
  const [theme, setTheme] = useState(() => currentTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    getJson("exams/index.json")
      .then((data) => setExams(data.exams))
      .catch((err) => {
        setExams([]);
        setLoadError(err.message);
      });
  }, []);

  // The index says whether a key and figures exist, so missing files are never requested.
  const fetchExam = useCallback(async (slug, keys = null) => {
    // Questions written by teachers come from the database, in the order of the assignment's keys.
    if (slug === TEACHER_SLUG) {
      if (!auth.api) throw new Error("Las preguntas de docentes necesitan una cuenta.");
      return teacherExam(keys ? await auth.api.teacherQuestionsByIds(keys) : await auth.api.teacherQuestions(), keys);
    }
    const entry = exams?.find((e) => e.slug === slug);
    if (!entry || entry.status === "proximamente") throw new Error("Ese cuadernillo todavía no está disponible.");
    const [raw, rawKey, rawFigures, rawSidecar, rawEnrich] = await Promise.all([
      getJson(`exams/${slug}.json`),
      entry.hasKey ? getJson(`exams/${slug}.key.json`) : null,
      entry.hasFigures ? getJson(`exams/${slug}.figures.json`) : null,
      entry.hasSidecar ? getJson(`exams/${slug}.sidecar.json`) : null,
      entry.hasEnrich ? getJson(`exams/${slug}.enrich.json`) : null,
    ]);
    const parsed = parseExam(raw);
    const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
    const bundle = {
      slug,
      exam: prepareExam(parsed, figures),
      key: parseKey(rawKey),
      keyStatus: entry.keyStatus ?? null,
      notes: parseKeyNotes(rawSidecar),
      enrich: rawEnrich?.questions ?? null,
      enrichMeta: rawEnrich ? { note: rawEnrich.note, estimated: rawEnrich.estimated } : null,
      figures,
    };
    // The school's own versions of questions (edited by its teachers) are laid over the shared bank.
    let versions = [];
    if (auth.api && auth.status === "ready") { try { versions = await auth.api.questionOverrides(slug); } catch { versions = []; } }
    return applyOverrides(bundle, versions);
  }, [exams, auth.api, auth.status]);

  const openExam = useCallback(async (slug, keys = null) => {
    setOpenError(null);
    const entry = exams?.find((e) => e.slug === slug);
    if (slug !== TEACHER_SLUG && (!entry || entry.status === "proximamente")) return null;
    setOpening(true);
    try {
      const next = await fetchExam(slug, keys);
      setSelected(next);
      return next;
    } catch (err) {
      setOpenError(err.message);
      return null;
    } finally {
      setOpening(false);
    }
  }, [exams, fetchExam]);

  // Coming back from Google the page reloads on Inicio. A first-time account (no profile yet) goes straight to the
  // "Casi listo" form; one that just signed in lands on the profile, so the sign-in is visibly done.
  useEffect(() => {
    if (auth.status === "needs-profile" && view !== "login") { setView("login"); return; }
    if (auth.status === "ready") {
      let pending = false;
      try { pending = sessionStorage.getItem("icfes-login-pending") === "1"; sessionStorage.removeItem("icfes-login-pending"); } catch { /* blocked */ }
      if (pending && view === "home") setView("profile");
    }
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the first exam once the index is known, preferring one that has Inglés (the 1ra booklets have none).
  useEffect(() => {
    const open = exams?.filter((e) => e.status !== "proximamente") ?? [];
    const first = open.find((e) => e.sections?.includes("Inglés")) ?? open[0];
    if (first && !selected && !opening && !openError && !tokenFromHash(window.location.hash)) openExam(first.slug);
  }, [exams, selected, opening, openError, openExam]);

  // Keep an attempt in this browser so a reload does not lose answers.
  // Attempts opened from history or reports are read-only and are never written back.
  useEffect(() => {
    if (attempt && !attempt.readOnly) saveAttempt(attempt.slug, storeScope(attempt), attempt);
  }, [attempt]);

  // Second chance: the questions this student missed before and has not answered right since.
  const pendingKeys = (slug, exam) => {
    const valid = new Set(exam.questions.map((q) => q.key));
    return pendingMisses(loadHistory(), slug).filter((k) => valid.has(k));
  };
  const startRepechaje = (keys) => {
    clearAttempt(selected.slug, "repechaje");
    setAttempt({
      slug: selected.slug, scope: "all", keys: repechajeKeys(keys), repechaje: true, mode: "practice", durationSec: null,
      startedAt: Date.now(), answers: {}, flags: {}, checked: {}, xp: 0, current: 0, submittedAt: null, auto: false,
    });
    setView("test");
  };

  // A practice made of chosen questions: "Práctica a medida", the error notebook or the ones missed in a live game.
  // `opts`: { label, mode, perQuestionSec }. Timed = the booklet's time for those questions, or a fixed time per question.
  const startKeys = async (slug, keys, opts = {}) => {
    const sel = selected?.slug === slug && slug !== TEACHER_SLUG ? selected : await openExam(slug, slug === TEACHER_SLUG ? keys : null);
    if (!sel || keys.length === 0) return;
    const mode = opts.mode === "timed" ? "timed" : "practice";
    const qs = questionsForAttempt(sel.exam, { scope: "all", keys });
    clearAttempt(slug, "custom");
    setAttempt({
      slug, scope: "all", keys, custom: { label: opts.label || "Práctica a medida" }, mode,
      durationSec: mode === "timed" ? (opts.perQuestionSec ? opts.perQuestionSec * qs.length : timedSeconds(qs)) : null,
      startedAt: Date.now(), answers: {}, flags: {}, checked: {}, xp: 0, current: 0, submittedAt: null, auto: false,
    });
    setView("test");
  };

  const startAttempt = (scope, mode, order) => {
    const questions = questionsFor(selected.exam, scope);
    clearAttempt(selected.slug, scope);
    setAttempt({
      slug: selected.slug,
      scope,
      mode,
      durationSec: mode === "timed" ? timedSeconds(questions) : null,
      startedAt: Date.now(),
      order: scope === "all" ? order : undefined,
      answers: {},
      flags: {},
      checked: {},
      xp: 0,
      current: 0,
      submittedAt: null,
      auto: false,
    });
    setView("test");
  };

  // The student's tasks and the attempts they already delivered (only with an account).
  const loadAssigned = useCallback(async () => {
    if (!signedIn) return setAssigned({ assignments: [], attempts: [] });
    try {
      // Roster rows a teacher typed with another spelling of the email are linked to this account (migration 0010).
      await auth.api.linkRoster();
      const [assignments, attempts, models] = await Promise.all([auth.api.listAssignments(), auth.api.myAttempts(), auth.api.gradingModels().catch(() => [])]);
      setAssigned({ assignments, attempts, models });
      auth.api.studentClasses?.().then(setMyClasses, () => setMyClasses(null));
    } catch {
      setAssigned({ assignments: [], attempts: [] });
    }
  }, [signedIn, auth.api]);
  useEffect(() => { loadAssigned(); }, [loadAssigned]);

  // Terms acceptance: with an account, nothing opens until the current version is accepted.
  // null = still asking; a failed read does not lock anyone out (the check repeats on the next sign-in).
  const [live, setLive] = useState(null);
  const [consents, setConsents] = useState(null);
  useEffect(() => {
    if (!signedIn) return setConsents(null);
    auth.api.myConsents().then(setConsents).catch(() => setConsents([{ kind: "terms", version: CONSENT_VERSION }]));
  }, [signedIn, auth.api]);

  const startAssigned = async (a) => {
    if (a.delivery === "paper") return; // answered on the printed sheet, never in the app
    const sel = await openExam(a.exam_slug, a.question_keys);
    if (!sel) return;
    const saved = loadAttempt(a.exam_slug, `asg-${a.id}`);
    if (saved && !saved.submittedAt) {
      setAttempt(saved);
      return setView("test");
    }
    const base = attemptForAssignment(a, [], Date.now());
    const questions = questionsForAttempt(sel.exam, base);
    // The teacher's grading model may lower the XP of repeat attempts (power law); the attempt number is the next one.
    const model = resolveModel(assigned.models, { assignmentId: a.id, courseId: a.course_id, schoolId: auth.profile?.school_id }).model;
    const attemptNo = assigned.attempts.filter((x) => x.assignment_id === a.id && x.submitted_at).length + 1;
    setAttempt({ ...attemptForAssignment(a, questions), attemptNo, xpFactor: xpFactor(model, attemptNo) });
    setView("test");
  };

  // A delivered attempt is saved to the backend once (a retry with the same id replaces it, never duplicates).
  useEffect(() => {
    if (!signedIn || !attempt || attempt.readOnly || !attempt.submittedAt || attempt.synced) return;
    if (!selected || selected.slug !== attempt.slug) return;
    const row = attemptRow(attempt, questionsForAttempt(selected.exam, attempt), selected.key, selected.keyStatus);
    auth.api
      .uploadAttempt(row, auth.profile.id)
      .then(() => {
        setAttempt((a) => (a && a.startedAt === attempt.startedAt ? { ...a, synced: true } : a));
        loadAssigned();
      })
      .catch(() => {});
  }, [signedIn, attempt, selected, auth.api, auth.profile, loadAssigned]);

  const resume = (saved) => {
    setAttempt(saved);
    setView(saved.submittedAt ? "results" : "test");
  };

  const submit = useCallback(({ auto }) => {
    // A late auto-submit (timer) after the student already left must not open an empty results screen.
    setAttempt((a) => (a && !a.submittedAt ? { ...a, submittedAt: Date.now(), auto } : a));
    setView((v) => (v === "test" ? "results" : v));
  }, []);

  // "Mis simulacros": reopen a finished attempt on its results, exactly as it was delivered.
  const openFromHistory = (entry) => {
    if (!entry.snapshot) return;
    setAttempt({ ...entry.snapshot, checked: {}, current: 0, durationSec: null, readOnly: true, from: "history" });
    setReviewNumber(null);
    setView("results");
    openExam(entry.snapshot.slug);
  };

  // "Mis reportes": open the reported question in review. It has no answers, only the key and the explanation.
  const openFromReport = (report) => {
    if (!report.slug) return;
    const now = Date.now();
    setAttempt({
      slug: report.slug, scope: "all", mode: "practice", answers: {}, flags: {}, checked: {}, xp: 0, current: 0,
      startedAt: now, submittedAt: now, auto: false, durationSec: null, readOnly: true, from: "reports",
    });
    setReviewNumber(report.number);
    setView("review");
    openExam(report.slug);
  };

  const goHome = () => {
    setView("home");
    setAttempt(null);
    setLive(null);
  };

  // Presentation for schools (not in the navigation): open the app with #presentacion.
  if (typeof window !== "undefined" && window.location.hash.startsWith("#presentacion")) {
    return <Presentation onExit={() => { window.location.hash = ""; window.location.reload(); }} />;
  }
  // Dev check of the figure engine kinds (not in the navigation): open the app with #figuras.
  if (typeof window !== "undefined" && window.location.hash === "#figuras") return <FigureCheck />;
  // A family opens a report link with no account: only the report is shown, nothing else loads.
  const familyToken = typeof window !== "undefined" ? tokenFromHash(window.location.hash) : null;
  if (familyToken && auth.api) return <FamilyReport api={auth.api} token={familyToken} />;
  // Internal review of every figure spec (not in the student navigation).
  if (typeof window !== "undefined" && window.location.hash === "#revision-figuras") return <FigureReview />;
  if (signedIn && consents === null) return <main className="frame"><p className="muted">Cargando…</p></main>;
  if (signedIn && needsTerms(consents)) {
    return (
      <Consent
        onSignOut={auth.signOut}
        onAccept={async () => {
          await auth.api.acceptConsent(auth.profile.id, "terms", CONSENT_VERSION);
          setConsents([...(consents ?? []), { kind: "terms", version: CONSENT_VERSION }]);
        }}
      />
    );
  }
  if (exams === null) return <main className="frame"><p className="muted">Cargando…</p></main>;
  if (!selected) return <main className="frame"><p className="muted">{opening ? "Cargando cuadernillo…" : "Todavía no hay cuadernillos listos."}</p></main>;

  const questions = selected && attempt ? questionsForAttempt(selected.exam, attempt) : [];
  // Answers of an assigned attempt can be held back by the teacher (until the assignment closes, or for good).
  const assignedOf = attempt?.assignmentId ? assigned.assignments.find((a) => a.id === attempt.assignmentId) : null;
  const locked = Boolean(attempt?.assignmentId) && !revealAllowed(attempt.reveal, assignedOf);
  const usedOf = attempt?.assignmentId ? assigned.attempts.filter((x) => x.assignment_id === attempt.assignmentId && x.submitted_at).length : 0;
  const retryAssigned = assignedOf && attemptsLeft(assignedOf, usedOf) > 0 ? () => startAssigned(assignedOf) : null;
  const scopeTitle = attempt?.custom ? attempt.custom.label : attempt?.repechaje ? "Repechaje" : attempt && attempt.scope !== "all" ? attempt.scope : "Examen completo";
  const examTitle = selected ? `${selected.exam.title} · ${scopeTitle}` : "";
  // The sidebar stays on every screen except the test; results and review belong to Practicar, reports to Perfil.
  const navView = { home: "home", subjects: "subjects", setup: "setup", results: "setup", review: "setup", custom: "setup", history: "progress", progress: "progress", profile: "profile", login: "profile", reports: "profile" }[view] ?? null;
  const course = studentCourses(classesFrom({ classes: myClasses, assignments: signedIn ? assigned.assignments : [] })).join(", ") || null;
  // A simulacro is both sessions of one cuadernillo: open the session that is missing, whole booklet, with time.
  const startSession = async (slug) => {
    const next = await openExam(slug);
    if (!next) return;
    setPreset({ scope: "all", mode: "timed" });
    setView("setup");
  };
  const studentName = signedIn ? (auth.profile.full_name || auth.profile.email).split(" ")[0] : null;
  // Student navigation by name, including the shortcuts the home cards use.
  const go = (to) => {
    if (to === "tasks") { setSubjectTab("tareas"); setSubjectId(null); return setView("subjects"); }
    if (to === "subjects") { setSubjectTab("materias"); setSubjectId(null); return setView("subjects"); }
    if (to === "achievements") { setProgressTab("logros"); return setView("progress"); }
    if (to === "errors" || to === "plan") { setProgressTab(to === "errors" ? "errores" : "plan"); return setView("progress"); }
    if (to === "progress" || to === "history") { setProgressTab(to === "history" ? "historial" : "resumen"); return setView("progress"); }
    if (to === "setup") setPreset(null);
    return setView(to);
  };
  const practiceArea = (area) => { setPreset({ scope: area, mode: "practice" }); setView("setup"); };
  const needsAttempt = view === "test" || view === "results" || view === "review";
  const resumable = selected && view === "home" ? findResumable(selected.slug, selected.exam) : null;

  return (
    <AuthContext.Provider value={auth}>
    <ExamContext.Provider value={selected?.slug ?? null}>
    {demoEnabled && <DemoBanner side={view === "teacher" ? "teacher" : "student"} onSide={(side) => setView(side === "teacher" ? "teacher" : "home")} />}
    <div className={view === "test" || view === "teacher" ? "app wide" : "app"}>
      <ScreenBoundary key={view} onHome={goHome}>
      {loadError && <p className="notice error">{loadError}</p>}
      {openError && <p className="notice error">{openError}</p>}
      {opening && <p className="muted pad">Cargando cuadernillo…</p>}

      {view === "home" && (
        <Home
          exam={selected?.exam}
          slug={selected?.slug}
          classes={myClasses}
          resumable={resumable}
          onContinue={() => {
            const saved = loadAttempt(selected.slug, resumable.scope);
            if (saved) resume(saved);
          }}
          onPractice={() => { setPreset(null); setView("setup"); }}
          onSetup={(p) => { setPreset(p); setView("setup"); }}
          onGo={go}
          course={course}
          exams={exams ?? []}
          onStartSession={startSession}
          onOpenSubject={(id) => { setSubjectId(id); setView("subjects"); }}
          signedOut={auth.status === "signed-out" || auth.status === "guest"}
          assigned={signedIn ? assigned : null}
          onStartAssigned={startAssigned}
          realName={studentName}
          onLive={auth.status !== "demo" && auth.status !== "loading" ? () => setView("liveJoin") : null}
        />
      )}

      {view === "custom" && selected && (
        <CustomPractice key={selected.slug} bundle={selected} slug={selected.slug} preset={preset} onBack={() => setView("setup")}
          onStart={(keys, opts) => startKeys(selected.slug, keys, opts)} />
      )}

      {view === "setup" && selected && (
        <Setup
          onCustom={() => { setPreset(null); setView("custom"); }}
          exam={selected.exam}
          slug={selected.slug}
          exams={exams}
          preset={preset}
          onPickExam={(slug) => openExam(slug)}
          onBack={() => setView("home")}
          onStart={startAttempt}
          pendingKeys={pendingKeys(selected.slug, selected.exam)}
          onRepechaje={() => startRepechaje(pendingKeys(selected.slug, selected.exam))}
        />
      )}

      {view === "test" && attempt && selected && (
        <AnnotationProvider slug={selected.slug} profileId={auth.profile?.id ?? null} api={auth.api}>
        <GlossaryProvider glossary={attempt.glossary}>
        <Test
          title={examTitle}
          examLabel={selected.exam.title}
          questions={questions}
          attempt={attempt}
          onProctorEvent={(ev, a) => { if (auth.api && a.assignmentId) auth.api.proctorSend([{ assignment_id: a.assignmentId, client_id: String(a.startedAt), ...ev }]).catch(() => {}); }}
          answerKey={locked ? null : selected.key}
          onChange={(next) => setAttempt((a) => (a ? (typeof next === "function" ? next(a) : next) : a))}
          onSubmit={submit}
          onExit={goHome}
          figures={selected.figures}
          enrich={selected.enrich}
          enrichMeta={selected.enrichMeta}
        />
        </GlossaryProvider>
        </AnnotationProvider>
      )}

      {view === "results" && attempt && selected && (
        <Results
          title={examTitle}
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          keyStatus={selected.keyStatus}
          onReview={() => { setReviewStart(0); setView("review"); }}
          onReviewAt={(n) => { setReviewStart(n); setView("review"); }}
          onHome={goHome}
          locked={locked}
          lockedNote={attempt?.reveal === "after_close" ? "Tu docente mostrará las respuestas cuando cierre la asignación." : undefined}
          onRetry={attempt.assignmentId ? retryAssigned : attempt.repechaje ? null : attempt.custom ? () => startKeys(attempt.slug, attempt.keys, { label: attempt.custom.label, mode: attempt.mode }) : () => startAttempt(attempt.scope, attempt.mode, attempt.order)}
          onReviewTimes={(n) => { setReviewStart(n); setView("review"); }}
          exams={exams ?? []}
          onStartSession={startSession}
          onRepechaje={startRepechaje}
          grading={assignedOf ? resolveModel(assigned.models, { assignmentId: assignedOf.id, courseId: assignedOf.course_id, schoolId: auth.profile?.school_id }).model : null}
        />
      )}

      {view === "review" && attempt && selected && (
        <AnnotationProvider slug={selected.slug} profileId={auth.profile?.id ?? null} api={auth.api}>
        <GlossaryProvider glossary={attempt.glossary}>
        <Review
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          keyStatus={selected.keyStatus}
          notes={selected.notes}
          enrich={selected.enrich}
          enrichMeta={selected.enrichMeta}
          figures={selected.figures}
          examLabel={selected.exam.title}
          startIndex={reviewStart}
          startNumber={reviewNumber}
          onBack={() => setView(attempt.from === "reports" ? "reports" : "results")}
        />
        </GlossaryProvider>
        </AnnotationProvider>
      )}

      {view === "liveJoin" && <LiveJoin auth={auth} initialCode={joinCode} onBack={() => setView("home")} onJoined={(row, nickname) => { setLive({ row, nickname }); setView("livePlay"); }} />}
      {view === "livePlay" && live && <LivePlay api={auth.api} initial={live.row} nickname={live.nickname} fetchExam={fetchExam} onExit={() => { setLive(null); setView("home"); }}
        onPracticeMissed={(slug, keys) => { setLive(null); startKeys(slug, keys, { label: "Las que fallé en vivo" }); }} />}

      {view === "profile" && <Profile theme={theme} onTheme={setTheme} onTeacher={() => setView("teacher")} onReports={() => setView("reports")} onLogin={() => setView("login")}
        assigned={signedIn ? assigned : null} classes={myClasses} course={course} onGo={go} />}
      {view === "subjects" && <Subjects assigned={signedIn ? assigned : null} classes={myClasses} course={course} tab={subjectTab} subjectId={subjectId}
        onTab={(t) => { setSubjectTab(t); setSubjectId(null); }} onOpenSubject={setSubjectId} onBack={() => setSubjectId(null)}
        onStartAssigned={startAssigned} onPracticeArea={practiceArea} onLogin={() => setView("login")} />}
      {view === "progress" && <Progress tab={progressTab} onTab={setProgressTab} assigned={signedIn ? assigned : null} classes={myClasses}
        onPracticeArea={practiceArea} onNew={() => go("setup")} onOpen={openFromHistory} exams={exams ?? []} onStartSession={startSession}
        fetchExam={fetchExam} onPracticeKeys={startKeys} onGoal={() => go("profile")}
        onSimulacro={() => { setPreset({ scope: "all", mode: "timed" }); setView("setup"); }}
        onMix={() => selected && startKeys(selected.slug, mixedKeys(selected.exam), { label: "Mezcla de áreas", mode: "timed", perQuestionSec: 120 })} />}
      {view === "login" && <Login onBack={() => setView("profile")} />}
      {view === "history" && <History onBack={() => setView("home")} onNew={() => setView("setup")} onOpen={openFromHistory} />}
      {view === "reports" && <Reports onBack={() => setView("profile")} onPractice={() => setView("setup")} onOpen={openFromReport} />}
      {view === "teacher" && (rootAuth.status === "ready" && rootAuth.profile.role !== "student"
        ? <AuthContext.Provider value={rootAuth}><TeacherLive auth={rootAuth} exams={exams} fetchExam={fetchExam} onExit={() => { if (window.location.hash.startsWith("#docente")) history.replaceState(null, "", window.location.pathname + window.location.search); setView("profile"); }} /></AuthContext.Provider>
        : <Teacher onExit={() => setView("profile")} />)}

      {needsAttempt && !attempt && <main className="frame"><p className="muted">Esta actividad ya no está abierta.</p><button type="button" className="primary" onClick={goHome}>Volver al inicio</button></main>}
      </ScreenBoundary>

      {navView && <BottomNav active={navView} onGo={go} name={studentName} course={course} />}
    </div>
    </ExamContext.Provider>
    </AuthContext.Provider>
  );
}
