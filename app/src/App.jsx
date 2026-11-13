import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import Test from "./screens/Test.jsx";
import Results from "./screens/Results.jsx";
import Review from "./screens/Review.jsx";
import Profile from "./screens/Profile.jsx";
import Subjects from "./screens/Subjects.jsx";
import Progress from "./screens/Progress.jsx";
import { classesFrom, studentCourses } from "./lib/student.js";
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
import { AuthContext, claimMessage, pendingTeacherCode, useAuth } from "./lib/auth.jsx";
import { getJson, reveal, withRevealed } from "./lib/data.js";
import { backendConfigured } from "./lib/supabase.js";
import DemoBanner from "./demo/DemoBanner.jsx";
import TeacherCode from "./components/TeacherCode.jsx";
import LaunchNotice from "./components/LaunchNotice.jsx";
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
import Tour, { markTourSeen, tourSeen } from "./components/tour/Tour.jsx";
import { studentTour, studentTourId } from "./lib/tours.jsx";
import { pendingMisses, repechajeKeys } from "./lib/repechaje.js";
import { hiddenFor, withoutHidden } from "./lib/questionUse.js";
import { orderQuestions } from "./lib/order.js";
import { answerChanges, logAnswer, trackVisit } from "./lib/usage.js";
import { clearQuickStart, readQuickArea, readQuickExam, readQuickQuestion, readQuickStart } from "./lib/quickStart.js";
import AdminUsage from "./screens/AdminUsage.jsx";
import { localQuota, spendLocal } from "./lib/practiceQuota.js";
import { drawPractice, randomSeed } from "./lib/practiceDraw.js";
import { resolveModel, xpFactor } from "./lib/grading.js";
import { attemptForAssignment, attemptRow, attemptsLeft, kindMode, questionsForAttempt, revealAllowed } from "./lib/assignments.js";
import { testOf } from "./lib/saber11.js";

// Screens where the public-demo notice shows (never inside an exam, a live game or the school tools).
const LAUNCH_VIEWS = new Set(["home", "subjects", "setup", "progress", "profile", "login", "history", "results"]);

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

const STUDENT_SIDE = "condor:student-side";
const FIRST_PRACTICE = "Primera práctica";
// Screens that cannot show anything without an open booklet.
const BOOKLET_VIEWS = new Set(["setup", "custom", "test", "results", "review"]);

export default function App() {
  const rootAuth = useAuth();
  // Demo mode: the student side is one invented student of 11 A; the teacher side is the school's coordinator.
  const demoStudent = rootAuth.demoStudent;
  const auth = useMemo(() => (demoStudent ? { ...rootAuth, profile: demoStudent.profile, user: { id: demoStudent.profile.id }, api: demoStudent.api } : rootAuth), [rootAuth, demoStudent]);
  const signedIn = auth.status === "ready";
  const [assigned, setAssigned] = useState({ assignments: [], attempts: [], models: [] });
  const [myClasses, setMyClasses] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  // Questions and booklets the school holds back from students' free practice (reserved for a simulacro, migration 0021).
  const [hidden, setHidden] = useState(null);
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // { slug, exam, key, keyStatus, notes, figures }
  const [opening, setOpening] = useState(false);
  // A booklet opened in the background (the first one on entry, or a swap) shows no loader: only an open the
  // person asked for, or a screen that needs the booklet before it has arrived, says "Cargando cuadernillo…".
  const [openingQuiet, setOpeningQuiet] = useState(false);
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
  // Came from the landing's «Practicar gratis» (#empezar): straight into a first short practice once signed in.
  const [quickStart, setQuickStart] = useState(() => readQuickStart());
  const [quickExam] = useState(() => readQuickExam());
  const quickExamTried = useRef(false);
  const [quickArea] = useState(() => readQuickArea());
  const [quickQuestion] = useState(() => readQuickQuestion());
  const quickAreaTried = useRef(false);
  // The owner's «Uso» page (#admin/uso): only accounts in app_admins get data (migration 0037).
  const [adminPage, setAdminPage] = useState(() => typeof window !== "undefined" && window.location.hash.startsWith("#admin"));
  useEffect(() => {
    const on = () => setAdminPage(window.location.hash.startsWith("#admin"));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Today's free-practice allowance (null until read). A run that is starting blocks a second start.
  const [quota, setQuota] = useState(null);
  const startingRef = useRef(false);
  const [theme, setTheme] = useState(() => currentTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Student tutorials: each screen's opens by itself the first time (per account and device) and replays from «?».
  const [studentTourOpen, setStudentTourOpen] = useState(null);
  const tourScreen = studentTourId(view);
  const tourUid = auth.profile?.id ?? null;
  useEffect(() => {
    if (!tourScreen || auth.status === "loading" || tourSeen("estudiante", tourUid, tourScreen)) return undefined;
    // The first practice from the landing goes straight to the question: no tutorial on top of it.
    if (quickStart || attempt?.custom?.label === FIRST_PRACTICE) return undefined;
    const t = setTimeout(() => setStudentTourOpen((cur) => cur ?? tourScreen), 700);
    return () => clearTimeout(t);
  }, [tourScreen, tourUid, auth.status, quickStart, attempt?.custom?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ask = (e) => setStudentTourOpen(e.detail || studentTourId(view) || "inicio");
    window.addEventListener("condor:student-tour", ask);
    return () => window.removeEventListener("condor:student-tour", ask);
  }, [view]);
  const closeStudentTour = useCallback(() => {
    setStudentTourOpen((id) => { if (id) markTourSeen("estudiante", tourUid, id); return null; });
  }, [tourUid]);

  // Teachers and coordinators land in their panel when they sign in, not on the student home. Once they choose
  // «App de estudiante» in this tab, they stay there until the tab closes.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || rootAuth.status !== "ready" || demoEnabled) return;
    landed.current = true;
    let stay = false;
    try { stay = sessionStorage.getItem(STUDENT_SIDE) === "1"; } catch { /* storage blocked */ }
    if (!stay && rootAuth.profile?.role && rootAuth.profile.role !== "student") setView((v) => (v === "home" ? "teacher" : v));
  }, [rootAuth.status, rootAuth.profile?.role]);

  // A student account that came back from Google with a teacher code (typed on the sign-in or from ?codigo=…)
  // becomes a teacher right away (migration 0035); if the code fails, Perfil shows why and lets them fix it.
  const [teacherCodeError, setTeacherCodeError] = useState(null);
  const redeeming = useRef(false);
  useEffect(() => {
    if (redeeming.current || demoEnabled || rootAuth.status !== "ready" || rootAuth.profile?.role !== "student" || !pendingTeacherCode()) return;
    redeeming.current = true;
    rootAuth.redeemTeacherCode(pendingTeacherCode())
      .then(() => setView("teacher"))
      .catch((e) => { setTeacherCodeError(claimMessage(e)); setView("profile"); });
  }, [rootAuth]);

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
    // Students never download the key: answers come from the server one question at a time (lib/data.js reveal),
    // and their delivered attempts are graded there. Teachers and admins get the files (printing, scanning, reports).
    const staff = rootAuth.status === "ready" && rootAuth.profile?.role && rootAuth.profile.role !== "student";
    const optional = (p) => getJson(p).catch(() => null);
    const [raw, rawKey, rawFigures, rawSidecar, rawEnrich] = await Promise.all([
      getJson(`exams/${slug}.json`),
      entry.hasKey && (staff || !backendConfigured) ? optional(`exams/${slug}.key.json`) : null,
      entry.hasFigures ? getJson(`exams/${slug}.figures.json`) : null,
      entry.hasSidecar && (staff || !backendConfigured) ? optional(`exams/${slug}.sidecar.json`) : null,
      entry.hasEnrich ? optional(`exams/${slug}.enrich.json`) : null,
    ]);
    const parsed = parseExam(raw);
    const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
    const serverGraded = Boolean(entry.hasKey) && !rawKey;
    const bundle = {
      slug,
      exam: prepareExam(parsed, figures),
      key: serverGraded ? new Map() : parseKey(rawKey),
      serverGraded,
      keyStatus: entry.keyStatus ?? null,
      notes: parseKeyNotes(rawSidecar) ?? (serverGraded ? new Map() : null),
      enrich: rawEnrich?.questions ?? null,
      enrichMeta: rawEnrich ? { note: rawEnrich.note, estimated: rawEnrich.estimated } : null,
      figures,
    };
    // The school's own versions of questions (edited by its teachers) are laid over the shared bank. For a student
    // the changed answer comes from the server like any other.
    let versions = [];
    if (auth.api && auth.status === "ready") { try { versions = await auth.api.questionOverrides(slug); } catch { versions = []; } }
    if (serverGraded) versions = versions.map((v) => ({ ...v, answer: null, explanation: null }));
    return applyOverrides(bundle, versions);
  }, [exams, auth.api, auth.status, rootAuth.status, rootAuth.profile]);

  const openExam = useCallback(async (slug, keys = null, quiet = false) => {
    setOpenError(null);
    const entry = exams?.find((e) => e.slug === slug);
    if (slug !== TEACHER_SLUG && (!entry || entry.status === "proximamente")) return null;
    setOpening(true);
    setOpeningQuiet(quiet);
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

  // Grading on the server (students): the answers the server reveals are laid over the open booklet.
  const revealKeys = useCallback(async (slug, keys, extra = {}) => {
    const r = await reveal({ slug, keys, ...extra });
    setSelected((b) => (b && b.slug === slug ? withRevealed(b, r) : b));
    return r;
  }, []);
  const revealOne = useCallback(async (k) => {
    if (!selected?.serverGraded) return null;
    const r = await revealKeys(selected.slug, [k]);
    return r.answers?.[k] ?? null;
  }, [selected?.serverGraded, selected?.slug, revealKeys]);

  // Coming back from Google the page reloads on Inicio. A first-time account (no profile yet) goes straight to the
  // "Casi listo" form; one that just signed in lands on the profile, so the sign-in is visibly done.
  useEffect(() => {
    if (auth.status === "needs-profile" && view !== "login") { setView("login"); return; }
    if (auth.status === "ready") {
      let pending = false;
      try { pending = sessionStorage.getItem("icfes-login-pending") === "1"; sessionStorage.removeItem("icfes-login-pending"); } catch { /* blocked */ }
      if (pending && view === "home" && !quickStart) setView("profile");
    }
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the first exam once the index is known, preferring one that has Inglés (the 1ra booklets have none).
  useEffect(() => {
    const open = exams?.filter((e) => e.status !== "proximamente") ?? [];
    const first = open.find((e) => e.sections?.includes("Inglés")) ?? open[0];
    if (first && !selected && !opening && !openError && !tokenFromHash(window.location.hash)) openExam(first.slug, null, true);
  }, [exams, selected, opening, openError, openExam]);

  // A booklet the school hid is not left open for free practice: the first visible one opens instead.
  useEffect(() => {
    if (!hidden || !selected || opening || attempt?.assignmentId || !hidden.slugs.has(selected.slug)) return;
    const next = exams?.find((e) => e.status !== "proximamente" && !hidden.slugs.has(e.slug));
    if (next) openExam(next.slug, null, true);
  }, [hidden, selected, opening, attempt, exams, openExam]);

  // Keep an attempt in this browser so a reload does not lose answers.
  // Attempts opened from history or reports are read-only and are never written back.
  useEffect(() => {
    if (attempt && !attempt.readOnly) saveAttempt(attempt.slug, storeScope(attempt), attempt);
  }, [attempt]);

  // Usage statistics (migration 0037): this visit, and every question answered with an account.
  useEffect(() => { if (!demoEnabled) trackVisit("app"); }, []);
  useEffect(() => { if (signedIn && !demoEnabled) trackVisit("signin"); }, [signedIn]);
  const answersSeen = useRef(new Map());
  useEffect(() => {
    if (!signedIn || demoEnabled || !attempt || attempt.readOnly || !selected || selected.slug !== attempt.slug) return;
    for (const row of answerChanges(attempt, questionsForAttempt(selected.exam, attempt), selected.key, answersSeen.current)) logAnswer(row);
  }, [signedIn, attempt, selected]);

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
    // A practice made of chosen questions counts against today's allowance too (a teacher's assignment does not).
    // It is not trimmed: the student is asked to choose fewer when the day's allowance is short.
    if (slug !== TEACHER_SLUG) {
      const left = await readQuota();
      if (left.remaining < keys.length) {
        return setOpenError(left.remaining > 0 ? `Hoy te quedan ${left.remaining} preguntas de práctica. Elige hasta ${left.remaining}.` : "Hoy ya usaste tus preguntas de práctica. Vuelve mañana.");
      }
      setQuota(await takeQuota(keys.length));
    }
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

  // Today's free-practice allowance: the server's count when signed in, this browser's otherwise (or if it can't be reached).
  const readQuota = useCallback(async () => {
    if (signedIn && auth.api) {
      try { return await auth.api.practiceQuota(); } catch { /* fall back to this browser */ }
    }
    return localQuota();
  }, [signedIn, auth.api]);
  const takeQuota = async (want) => {
    if (signedIn && auth.api) {
      try { return await auth.api.takePracticeQuestions(want); } catch { /* fall back to this browser */ }
    }
    return spendLocal(want);
  };
  useEffect(() => {
    if (view === "setup" || view === "home" || view === "custom") readQuota().then(setQuota).catch(() => null);
  }, [view, readQuota]);

  // Free practice: the questions are drawn at random from the booklet, within today's allowance, and shown in a random
  // order (areas keep the order the student chose). The booklet's name is not shown in the run. A full simulacro
  // (timed, whole booklet) keeps its own questions: its score needs both sessions in full, and it is not counted.
  const startAttempt = async (scope, mode, order) => {
    if (startingRef.current) return;
    const free = withoutHidden(selected.exam, hidden, selected.slug);
    const pool = questionsFor(free, scope);
    if (free.held && pool.length === 0) return setOpenError("Tu colegio reservó estas preguntas para un simulacro. Elige otro cuadernillo.");
    const simulacro = mode === "timed" && scope === "all";
    let drawn = null;
    if (!simulacro) {
      startingRef.current = true;
      try {
        const took = await takeQuota(pool.length);
        if (took.granted === 0) return setOpenError("Hoy ya usaste tus preguntas de práctica. Vuelve mañana.");
        setQuota(took);
        drawn = drawPractice(pool, took.granted, { areaOrder: scope === "all" ? order : null, seed: randomSeed() });
      } finally {
        startingRef.current = false;
      }
    }
    const questions = drawn ? drawn.questions : questionsFor(free, scope);
    clearAttempt(selected.slug, scope);
    setAttempt({
      slug: selected.slug,
      scope,
      // Held-back questions leave the set; a drawn run lists the questions it covers, in the order it shows them.
      ...(drawn || free.held ? { keys: drawn ? drawn.keys : orderQuestions(questions, scope === "all" ? order : null).map((q) => q.key) } : {}),
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
      if (auth.profile?.role === "student") auth.api.hiddenQuestions?.().then((rows) => setHidden(hiddenFor(rows ?? [])), () => setHidden(null));
      auth.api.studentClasses?.().then(setMyClasses, () => setMyClasses(null));
      // Anuncios of the student's classes (migration 0026); none before it runs.
      auth.api.listAnnouncements?.().then((rows) => setAnnouncements(rows ?? []), () => setAnnouncements([]));
    } catch {
      setAssigned({ assignments: [], attempts: [] });
    }
  }, [signedIn, auth.api]);
  useEffect(() => { loadAssigned(); }, [loadAssigned]);

  // Terms acceptance: with an account, nothing opens until the current version is accepted.
  // null = still asking; a failed read does not lock anyone out (the check repeats on the next sign-in).
  const [live, setLive] = useState(null);
  // Live games of the student's classes, open now or programmed (migration 0025). Checked again every 30 s on Inicio,
  // so a programmed game turns into "Entrar" when its time comes.
  const [liveGames, setLiveGames] = useState([]);
  const [liveCode, setLiveCode] = useState("");
  useEffect(() => {
    if (!signedIn || view !== "home" || !auth.api?.studentLiveGames) return undefined;
    let alive = true;
    const load = () => auth.api.studentLiveGames().then((rows) => { if (alive) setLiveGames(rows ?? []); }, () => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [signedIn, view, auth.api]);
  const joinGame = async (g) => {
    const nickname = (auth.profile?.full_name || auth.profile?.email || "Estudiante").split(" ")[0];
    try {
      const row = await auth.api.liveJoin(g.code, nickname);
      setLive({ row, nickname });
      setView("livePlay");
    } catch {
      // The join screen explains what went wrong and lets the student try again.
      setLiveCode(g.code);
      setView("liveJoin");
    }
  };
  const [consents, setConsents] = useState(null);
  useEffect(() => {
    if (!signedIn) return setConsents(null);
    auth.api.myConsents().then(setConsents).catch(() => setConsents([{ kind: "terms", version: CONSENT_VERSION }]));
  }, [signedIn, auth.api]);

  // «Practicar gratis» from the landing: once there is an account, a booklet open and the terms accepted, five
  // questions (one per area) start right away, no menus in between.
  useEffect(() => {
    if (!quickStart || !signedIn || !selected || opening || attempt || consents === null || needsTerms(consents)) return;
    // From a past-exam page: that booklet, ready to present whole with time (if it is in the catalog).
    if (quickExam && (selected.slug === quickExam || !quickExamTried.current) && exams?.some((e) => e.slug === quickExam && e.status !== "proximamente")) {
      if (selected.slug !== quickExam && !quickExamTried.current) { quickExamTried.current = true; openExam(quickExam); return; }
      setQuickStart(false);
      clearQuickStart();
      // A question a friend shared: it first, then four more mixed ones. A question hidden by the school is skipped.
      const open = withoutHidden(selected.exam, hidden, selected.slug);
      if (quickQuestion && open.sections.some((s) => s.questions.some((qq) => qq.key === quickQuestion))) {
        const rest = mixedKeys(open, 6).filter((k) => k !== quickQuestion).slice(0, 4);
        startKeys(selected.slug, [quickQuestion, ...rest], { label: FIRST_PRACTICE, mode: "practice" });
        return;
      }
      // From a past exam's test page (…&area=<slug>): that test of the booklet, with time.
      const areaName = quickArea ? selected.exam.sections.find((s) => testOf(s.name)?.id === quickArea)?.name : null;
      setPreset({ scope: areaName ?? "all", mode: "timed" });
      setView("setup");
      return;
    }
    // From an area card on the landing: five questions of that test. If the open booklet has none (Inglés is only in
    // Sesión 2), a booklet that has it opens first.
    if (quickArea && selected.slug !== TEACHER_SLUG) {
      const hasArea = (names) => (names ?? []).some((n) => testOf(n)?.id === quickArea);
      if (!hasArea(selected.exam.sections.map((s) => s.name)) && !quickAreaTried.current) {
        quickAreaTried.current = true;
        const pool = (exams ?? []).filter((e) => e.status !== "proximamente" && /^S11-/.test(e.slug) && hasArea(e.sections));
        if (pool.length) { openExam(pool[Math.floor(Math.random() * pool.length)].slug); return; }
      }
      const sec = withoutHidden(selected.exam, hidden, selected.slug).sections.find((s) => testOf(s.name)?.id === quickArea);
      const areaKeys = sec ? [...sec.questions].sort(() => Math.random() - 0.5).slice(0, 5).map((q) => q.key) : [];
      if (areaKeys.length) {
        setQuickStart(false);
        clearQuickStart();
        startKeys(selected.slug, areaKeys, { label: FIRST_PRACTICE, mode: "practice" });
        return;
      }
    }
    setQuickStart(false);
    clearQuickStart();
    if (selected.slug === TEACHER_SLUG) return;
    const keys = mixedKeys(withoutHidden(selected.exam, hidden, selected.slug), 5);
    if (keys.length) startKeys(selected.slug, keys, { label: FIRST_PRACTICE, mode: "practice" });
  }, [quickStart, quickExam, quickArea, quickQuestion, exams, signedIn, selected, opening, attempt, consents]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // A delivered assignment opens on its own results (latest attempt), read-only: the report, the review of every
  // question and, if the teacher allows it, the right answers. Nothing is recorded again.
  const openAssignedResult = async (a) => {
    const rows = assigned.attempts.filter((x) => x.assignment_id === a.id && x.submitted_at)
      .sort((x, y) => new Date(x.submitted_at) - new Date(y.submitted_at));
    const r = rows[rows.length - 1];
    if (!r) return;
    const sel = await openExam(a.exam_slug ?? r.exam_slug, a.question_keys);
    if (!sel) return;
    const started = Date.parse(r.started_at ?? r.submitted_at);
    setAttempt({
      ...attemptForAssignment(a, [], started),
      mode: r.mode ?? kindMode(a.kind), answers: r.answers ?? {}, times: r.times ?? {}, hintsUsed: r.activity?.hints ?? {},
      changes: r.activity?.changes ?? {}, submittedAt: Date.parse(r.submitted_at), attemptNo: rows.length,
      readOnly: true, synced: true, from: "assigned",
    });
    setReviewNumber(null);
    setView("results");
  };

  // Server grading of a delivered attempt: the server returns a sealed score (the database keeps only that one) and,
  // for free practice, the answers. An assignment's answers are asked for again once the attempt is saved, so they
  // follow the teacher's rule (after delivering, after closing, never).
  const gradingRef = useRef(null);
  const sameAttempt = (a, started) => a && a.startedAt === started;
  useEffect(() => {
    if (!attempt || attempt.readOnly || !attempt.submittedAt || attempt.receipt || attempt.graded) return;
    if (!selected?.serverGraded || selected.slug !== attempt.slug || gradingRef.current === attempt.startedAt) return;
    gradingRef.current = attempt.startedAt;
    const started = attempt.startedAt;
    const keys = questionsForAttempt(selected.exam, attempt).map((q) => q.key);
    revealKeys(attempt.slug, keys, { answers: attempt.answers, submit: { client_id: String(started), assignment_id: attempt.assignmentId ?? null } })
      .then((r) => setAttempt((a) => (sameAttempt(a, started) ? { ...a, receipt: r.receipt ?? null, graded: !a.assignmentId || !signedIn, gradeFailed: !r.receipt } : a)))
      .catch(() => setAttempt((a) => (sameAttempt(a, started) ? { ...a, graded: true, gradeFailed: true } : a)));
  }, [attempt, selected, revealKeys, signedIn]);

  // A delivered attempt is saved to the backend once (a retry with the same id replaces it, never duplicates).
  useEffect(() => {
    if (!signedIn || !attempt || attempt.readOnly || !attempt.submittedAt || attempt.synced) return;
    if (!selected || selected.slug !== attempt.slug) return;
    if (selected.serverGraded && !attempt.receipt && !attempt.gradeFailed) return;
    const started = attempt.startedAt;
    const row = { ...attemptRow(attempt, questionsForAttempt(selected.exam, attempt), selected.key, selected.keyStatus), receipt: attempt.receipt ?? null };
    const after = () => {
      setAttempt((a) => (sameAttempt(a, started) ? { ...a, synced: true } : a));
      loadAssigned();
      if (selected.serverGraded && attempt.assignmentId && !attempt.graded) {
        const keys = questionsForAttempt(selected.exam, attempt).map((q) => q.key);
        revealKeys(attempt.slug, keys).catch(() => null).finally(() => setAttempt((a) => (sameAttempt(a, started) ? { ...a, graded: true } : a)));
      }
    };
    auth.api
      .uploadAttempt(row, auth.profile.id)
      .then(after)
      .catch(() => setAttempt((a) => (sameAttempt(a, started) ? { ...a, graded: true } : a)));
  }, [signedIn, attempt, selected, auth.api, auth.profile, loadAssigned, revealKeys]);

  // Reopened attempts (history, assigned results, reports): ask the server for the answers of their questions.
  const reviewRef = useRef(null);
  useEffect(() => {
    if (!attempt?.readOnly || !selected?.serverGraded || selected.slug !== attempt.slug) return;
    if (reviewRef.current === `${attempt.slug}:${attempt.startedAt}`) return;
    const keys = questionsForAttempt(selected.exam, attempt).map((q) => q.key).filter((k) => !selected.key?.has(k));
    reviewRef.current = `${attempt.slug}:${attempt.startedAt}`;
    if (keys.length) revealKeys(attempt.slug, keys).catch(() => null);
  }, [attempt, selected, revealKeys]);

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
        personal={!auth.profile?.school_id}
        onSignOut={auth.signOut}
        onAccept={async () => {
          await auth.api.acceptConsent(auth.profile.id, "terms", CONSENT_VERSION);
          setConsents([...(consents ?? []), { kind: "terms", version: CONSENT_VERSION }]);
        }}
      />
    );
  }
  if (adminPage && signedIn && !demoEnabled) return <AdminUsage onExit={() => { history.replaceState(null, "", window.location.pathname); setAdminPage(false); }} />;
  if (exams === null) return <main className="frame"><p className="muted">Cargando…</p></main>;

  const questions = selected && attempt ? questionsForAttempt(selected.exam, attempt) : [];
  // What a student may pick for free practice: booklets the school hid are not offered.
  const studentExams = hidden ? (exams ?? []).filter((e) => !hidden.slugs.has(e.slug)) : exams ?? [];
  const practiceExam = selected ? withoutHidden(selected.exam, hidden, selected.slug) : null;
  // Answers of an assigned attempt can be held back by the teacher (until the assignment closes, or for good).
  const assignedOf = attempt?.assignmentId ? assigned.assignments.find((a) => a.id === attempt.assignmentId) : null;
  const locked = Boolean(attempt?.assignmentId) && !revealAllowed(attempt.reveal, assignedOf);
  const usedOf = attempt?.assignmentId ? assigned.attempts.filter((x) => x.assignment_id === attempt.assignmentId && x.submitted_at).length : 0;
  const retryAssigned = assignedOf && attemptsLeft(assignedOf, usedOf) > 0 ? () => startAssigned(assignedOf) : null;
  const scopeTitle = attempt?.custom ? attempt.custom.label : attempt?.repechaje ? "Repechaje" : attempt && attempt.scope !== "all" ? attempt.scope : "Examen completo";
  // The run is named by its area, not by the booklet it was drawn from.
  const examTitle = selected ? scopeTitle : "";
  // The sidebar stays on every screen except the test; results and review belong to Practicar, reports to Perfil.
  const navView = { home: "home", subjects: "subjects", setup: "setup", results: "setup", review: "setup", custom: "setup", history: "progress", progress: "progress", profile: "profile", login: "profile", reports: "profile" }[view] ?? null;
  // A teacher or coordinator previewing the student app is not "in" the classes they teach: no course label.
  const staffView = signedIn && auth.profile?.role && auth.profile.role !== "student";
  const course = staffView ? null : studentCourses(classesFrom({ classes: myClasses, assignments: signedIn ? assigned.assignments : [] })).join(", ") || null;
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
      {!demoEnabled && auth.status !== "ready" && LAUNCH_VIEWS.has(view) && <LaunchNotice />}
      {loadError && <p className="notice error">{loadError}</p>}
      {openError && <p className="notice error">{openError}</p>}
      {((opening && !openingQuiet) || (!selected && BOOKLET_VIEWS.has(view))) && (
        <p className="muted pad">{opening || exams.some((e) => e.status !== "proximamente") ? "Cargando cuadernillo…" : "Todavía no hay cuadernillos listos."}</p>
      )}

      {view === "home" && (
        <Home
          exam={selected?.exam}
          slug={selected?.slug}
          classes={myClasses}
          announcements={signedIn ? announcements : []}
          resumable={resumable}
          onContinue={() => {
            const saved = loadAttempt(selected.slug, resumable.scope);
            if (saved) resume(saved);
          }}
          onPractice={() => { setPreset(null); setView("setup"); }}
          onSetup={(p) => { setPreset(p); setView("setup"); }}
          onGo={go}
          course={course}
          exams={studentExams}
          onStartSession={startSession}
          onOpenSubject={(id) => { setSubjectId(id); setView("subjects"); }}
          signedOut={auth.status === "signed-out" || auth.status === "guest"}
          assigned={signedIn ? assigned : null}
          onStartAssigned={startAssigned}
          realName={studentName}
          independent={signedIn && !auth.profile?.school_id}
          onLive={auth.status !== "demo" && auth.status !== "loading" ? () => { setLiveCode(""); setView("liveJoin"); } : null}
          liveGames={liveGames}
          onJoinGame={demoEnabled ? null : joinGame}
        />
      )}

      {view === "custom" && selected && (
        <CustomPractice key={selected.slug} bundle={selected} slug={selected.slug} preset={preset} onBack={() => setView("setup")}
          onStart={(keys, opts) => startKeys(selected.slug, keys, opts)} />
      )}

      {view === "setup" && selected && (
        <Setup
          onCustom={() => { setPreset(null); setView("custom"); }}
          exam={practiceExam}
          slug={selected.slug}
          exams={studentExams}
          preset={preset}
          onPickExam={(slug) => openExam(slug)}
          onBack={() => setView("home")}
          onStart={startAttempt}
          quota={quota}
          pendingKeys={pendingKeys(selected.slug, selected.exam)}
          onRepechaje={() => startRepechaje(pendingKeys(selected.slug, selected.exam))}
        />
      )}

      {view === "test" && attempt && selected && (
        <AnnotationProvider slug={selected.slug} profileId={auth.profile?.id ?? null} api={auth.api}>
        <GlossaryProvider glossary={attempt.glossary}>
        <Test
          title={examTitle}
          examLabel={null}
          questions={questions}
          attempt={attempt}
          onProctorEvent={(ev, a) => { if (auth.api && a.assignmentId) auth.api.proctorSend([{ assignment_id: a.assignmentId, client_id: String(a.startedAt), ...ev }]).catch(() => {}); }}
          answerKey={locked ? null : selected.key}
          onReveal={selected.serverGraded && !locked ? revealOne : null}
          onChange={(next) => setAttempt((a) => (a ? (typeof next === "function" ? next(a) : next) : a))}
          onSubmit={submit}
          onExit={goHome}
          figures={selected.figures}
          enrich={selected.enrich}
          enrichMeta={selected.enrichMeta}
          shareSlug={!attempt.assignmentId && !demoEnabled && selected.slug !== TEACHER_SLUG ? selected.slug : null}
        />
        </GlossaryProvider>
        </AnnotationProvider>
      )}

      {view === "results" && attempt && selected && selected.serverGraded && !attempt.readOnly && !attempt.graded && (
        <main className="frame"><p className="muted">Calificando…</p></main>
      )}
      {view === "results" && attempt && selected && !(selected.serverGraded && !attempt.readOnly && !attempt.graded) && (
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
          exams={studentExams}
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
          examLabel={null}
          startIndex={reviewStart}
          startNumber={reviewNumber}
          onBack={() => setView(attempt.from === "reports" ? "reports" : "results")}
        />
        </GlossaryProvider>
        </AnnotationProvider>
      )}

      {view === "liveJoin" && <LiveJoin auth={auth} initialCode={liveCode || joinCode} onBack={() => setView("home")} onJoined={(row, nickname) => { setLive({ row, nickname }); setView("livePlay"); }} />}
      {view === "livePlay" && live && <LivePlay api={auth.api} initial={live.row} nickname={live.nickname} fetchExam={fetchExam} onExit={() => { setLive(null); setView("home"); }}
        onPracticeMissed={(slug, keys) => { setLive(null); startKeys(slug, keys, { label: "Las que fallé en vivo" }); }} />}

      {view === "profile" && <Profile teacherCodeError={teacherCodeError} theme={theme} onTheme={setTheme} onTeacher={() => setView("teacher")} onReports={() => setView("reports")} onLogin={() => setView("login")}
        assigned={signedIn ? assigned : null} classes={myClasses} course={course} onGo={go} />}
      {view === "subjects" && <Subjects independent={signedIn && !auth.profile?.school_id} onOpenAssigned={openAssignedResult} announcements={signedIn ? announcements : []} assigned={signedIn ? assigned : null} classes={myClasses} course={course} tab={subjectTab} subjectId={subjectId}
        onTab={(t) => { setSubjectTab(t); setSubjectId(null); }} onOpenSubject={setSubjectId} onBack={() => setSubjectId(null)}
        onStartAssigned={startAssigned} onPracticeArea={practiceArea} onLogin={() => setView("login")} />}
      {view === "progress" && <Progress tab={progressTab} onTab={setProgressTab} assigned={signedIn ? assigned : null} classes={myClasses}
        onPracticeArea={practiceArea} onNew={() => go("setup")} onOpen={openFromHistory} exams={studentExams} onStartSession={startSession}
        fetchExam={fetchExam} onPracticeKeys={startKeys} onGoal={() => go("profile")}
        onSimulacro={() => { setPreset({ scope: "all", mode: "timed" }); setView("setup"); }}
        onMix={() => selected && startKeys(selected.slug, mixedKeys(selected.exam), { label: "Mezcla de áreas", mode: "timed", perQuestionSec: 120 })} />}
      {view === "login" && <Login onBack={() => setView(quickStart ? "home" : "profile")} />}
      {view === "history" && <History onBack={() => setView("home")} onNew={() => setView("setup")} onOpen={openFromHistory} />}
      {view === "reports" && <Reports onBack={() => setView("profile")} onPractice={() => setView("setup")} onOpen={openFromReport} />}
      {view === "teacher" && (rootAuth.status === "ready" && rootAuth.profile.role !== "student"
        ? <AuthContext.Provider value={rootAuth}><TeacherLive auth={rootAuth} exams={exams} fetchExam={fetchExam} onExit={() => { if (window.location.hash.startsWith("#docente")) history.replaceState(null, "", window.location.pathname + window.location.search); try { sessionStorage.setItem(STUDENT_SIDE, "1"); } catch { /* storage blocked */ } setView("profile"); }} /></AuthContext.Provider>
        // The public site never shows a teacher panel to someone who isn't signed in as staff: a #docente link asks
        // for the school sign-in instead (the full invented school stays available only in ?demo=1).
        : rootAuth.status === "loading" ? <p className="muted pad">Cargando…</p>
        // Signed in as a student: the teacher panel asks for the teacher code instead of a second sign-in.
        : rootAuth.status === "ready" && !demoEnabled ? (
          <main className="frame tc-page">
            <h1>Panel docente</h1>
            <p className="caption">Tu cuenta es de estudiante. Si eres docente, crea tu espacio o escribe el código de tu colegio.</p>
            <TeacherCode open error={teacherCodeError} onDone={() => setView("teacher")} />
            <button type="button" className="link" onClick={() => { if (window.location.hash.startsWith("#docente")) history.replaceState(null, "", window.location.pathname + window.location.search); setView("home"); }}>Volver a la app de estudiante</button>
          </main>
        )
        : <Login onBack={() => setView("home")} />)}

      {needsAttempt && !attempt && <main className="frame"><p className="muted">Esta actividad ya no está abierta.</p><button type="button" className="primary" onClick={goHome}>Volver al inicio</button></main>}
      </ScreenBoundary>

      {studentTourOpen && view !== "teacher" && (() => {
        const t = studentTour(studentTourOpen, { name: studentName, signedIn });
        return <Tour key={studentTourOpen} label={t.label} steps={t.steps} onClose={closeStudentTour} />;
      })()}
      {navView && <BottomNav active={navView} onGo={go} name={studentName} course={course} role={signedIn ? auth.profile?.role : null} />}
    </div>
    </ExamContext.Provider>
    </AuthContext.Provider>
  );
}
