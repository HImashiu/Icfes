import { useCallback, useEffect, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import Test from "./screens/Test.jsx";
import Results from "./screens/Results.jsx";
import Review from "./screens/Review.jsx";
import Profile from "./screens/Profile.jsx";
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
import { useAuth } from "./lib/auth.jsx";
import Consent from "./screens/Consent.jsx";
import FamilyReport from "./screens/FamilyReport.jsx";
import { tokenFromHash } from "./lib/family.js";
import { TEACHER_SLUG, teacherExam } from "./lib/teacherExam.js";
import LivePlay, { LiveJoin } from "./screens/LivePlay.jsx";
import { joinCodeFromHash } from "./lib/joinLink.js";
import { CONSENT_VERSION, needsTerms } from "./lib/consent.js";
import { AnnotationProvider } from "./components/Annotations.jsx";
import { GlossaryProvider } from "./components/Glossary.jsx";
import { loadHistory } from "./lib/local.js";
import { pendingMisses, repechajeKeys } from "./lib/repechaje.js";
import { attemptForAssignment, attemptRow, attemptsLeft, questionsForAttempt, revealAllowed } from "./lib/assignments.js";

const base = import.meta.env.BASE_URL;

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
const storeScope = (a) => (a.assignmentId ? `asg-${a.assignmentId}` : a.repechaje ? "repechaje" : a.scope);

export default function App() {
  const auth = useAuth();
  const signedIn = auth.status === "ready";
  const [assigned, setAssigned] = useState({ assignments: [], attempts: [] });
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // { slug, exam, key, keyStatus, notes, figures }
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);
  // A student who scans a room's QR code lands on the join screen with the code filled in.
  const [joinCode] = useState(() => (typeof window !== "undefined" ? joinCodeFromHash(window.location.hash) : ""));
  const [view, setView] = useState(() => (joinCode ? "liveJoin" : "home"));
  const [reviewStart, setReviewStart] = useState(0);
  const [reviewNumber, setReviewNumber] = useState(null);
  // What the home card asked for (area, mode), so "Reto del día" or "Simulacro completo" open set up that way.
  const [preset, setPreset] = useState(null);
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
    return {
      slug,
      exam: prepareExam(parsed, figures),
      key: parseKey(rawKey),
      keyStatus: entry.keyStatus ?? null,
      notes: parseKeyNotes(rawSidecar),
      enrich: rawEnrich?.questions ?? null,
      enrichMeta: rawEnrich ? { note: rawEnrich.note, estimated: rawEnrich.estimated } : null,
      figures,
    };
  }, [exams, auth.api]);

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
      const [assignments, attempts] = await Promise.all([auth.api.listAssignments(), auth.api.myAttempts()]);
      setAssigned({ assignments, attempts });
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
    const sel = await openExam(a.exam_slug, a.question_keys);
    if (!sel) return;
    const saved = loadAttempt(a.exam_slug, `asg-${a.id}`);
    if (saved && !saved.submittedAt) {
      setAttempt(saved);
      return setView("test");
    }
    const base = attemptForAssignment(a, [], Date.now());
    const questions = questionsForAttempt(sel.exam, base);
    setAttempt(attemptForAssignment(a, questions));
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
    setAttempt((a) => (a && !a.submittedAt ? { ...a, submittedAt: Date.now(), auto } : a));
    setView("results");
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
  const scopeTitle = attempt && attempt.scope !== "all" ? attempt.scope : "Examen completo";
  const examTitle = selected ? `${selected.exam.title} · ${scopeTitle}` : "";
  // The sidebar stays on every screen except the test; results and review belong to Practicar, reports to Perfil.
  const navView = { home: "home", setup: "setup", results: "setup", review: "setup", history: "history", profile: "profile", login: "profile", reports: "profile" }[view] ?? null;
  const resumable = selected && view === "home" ? findResumable(selected.slug, selected.exam) : null;

  return (
    <ExamContext.Provider value={selected?.slug ?? null}>
    <div className={view === "test" || view === "teacher" ? "app wide" : "app"}>
      {loadError && <p className="notice error">{loadError}</p>}
      {openError && <p className="notice error">{openError}</p>}
      {opening && <p className="muted pad">Cargando cuadernillo…</p>}

      {view === "home" && (
        <Home
          exam={selected?.exam}
          resumable={resumable}
          onContinue={() => {
            const saved = loadAttempt(selected.slug, resumable.scope);
            if (saved) resume(saved);
          }}
          onPractice={() => { setPreset(null); setView("setup"); }}
          onSetup={(p) => { setPreset(p); setView("setup"); }}
          onGo={setView}
          assigned={assigned}
          onStartAssigned={startAssigned}
          realName={signedIn ? (auth.profile.full_name || auth.profile.email).split(" ")[0] : null}
          onLive={auth.status !== "demo" && auth.status !== "loading" ? () => setView("liveJoin") : null}
        />
      )}

      {view === "setup" && selected && (
        <Setup
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
          answerKey={locked ? null : selected.key}
          onChange={setAttempt}
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
          onRetry={attempt.assignmentId ? retryAssigned : attempt.repechaje ? null : () => startAttempt(attempt.scope, attempt.mode, attempt.order)}
          onReviewTimes={(n) => { setReviewStart(n); setView("review"); }}
          onRepechaje={startRepechaje}
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
      {view === "livePlay" && live && <LivePlay api={auth.api} initial={live.row} nickname={live.nickname} fetchExam={fetchExam} onExit={() => { setLive(null); setView("home"); }} />}

      {view === "profile" && <Profile theme={theme} onTheme={setTheme} onTeacher={() => setView("teacher")} onReports={() => setView("reports")} onLogin={() => setView("login")} />}
      {view === "login" && <Login onBack={() => setView("profile")} />}
      {view === "history" && <History onBack={() => setView("home")} onNew={() => setView("setup")} onOpen={openFromHistory} />}
      {view === "reports" && <Reports onBack={() => setView("profile")} onPractice={() => setView("setup")} onOpen={openFromReport} />}
      {view === "teacher" && (auth.status === "ready" && auth.profile.role !== "student"
        ? <TeacherLive auth={auth} exams={exams} fetchExam={fetchExam} onExit={() => setView("profile")} />
        : <Teacher onExit={() => setView("profile")} />)}

      {navView && <BottomNav active={navView} onGo={(v) => { if (v === "setup") setPreset(null); setView(v); }} />}
    </div>
    </ExamContext.Provider>
  );
}
