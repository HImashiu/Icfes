import { useCallback, useEffect, useState } from "react";
import Home from "./screens/Home.jsx";
import Setup from "./screens/Setup.jsx";
import Test from "./screens/Test.jsx";
import Results from "./screens/Results.jsx";
import Review from "./screens/Review.jsx";
import League from "./screens/League.jsx";
import Profile from "./screens/Profile.jsx";
import Teacher from "./screens/Teacher.jsx";
import History from "./screens/History.jsx";
import Reports from "./screens/Reports.jsx";
import FigureCheck from "./screens/FigureCheck.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { ExamContext } from "./lib/exam-context.js";
import { parseExam, parseKey, parseKeyNotes, questionsFor, timedSeconds } from "./lib/exam.js";
import { clearAttempt, loadAttempt, saveAttempt } from "./lib/storage.js";
import { parseFigureSpecs, prepareExam } from "./lib/figures.js";
import { applyTheme, currentTheme } from "./lib/theme.js";

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

export default function App() {
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // { slug, exam, key, keyStatus, notes, figures }
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);
  const [view, setView] = useState("home");
  const [reviewStart, setReviewStart] = useState(0);
  const [reviewNumber, setReviewNumber] = useState(null);
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
  const openExam = useCallback(async (slug) => {
    setOpenError(null);
    const entry = exams?.find((e) => e.slug === slug);
    if (!entry) return;
    setOpening(true);
    try {
      const [raw, rawKey, rawFigures, rawSidecar] = await Promise.all([
        getJson(`exams/${slug}.json`),
        entry.hasKey ? getJson(`exams/${slug}.key.json`) : null,
        entry.hasFigures ? getJson(`exams/${slug}.figures.json`) : null,
        entry.hasSidecar ? getJson(`exams/${slug}.sidecar.json`) : null,
      ]);
      const figures = parseFigureSpecs(rawFigures);
      setSelected({
        slug,
        exam: prepareExam(parseExam(raw), figures),
        key: parseKey(rawKey),
        keyStatus: entry.keyStatus ?? null,
        notes: parseKeyNotes(rawSidecar),
        figures,
      });
    } catch (err) {
      setOpenError(err.message);
    } finally {
      setOpening(false);
    }
  }, [exams]);

  // Open the first exam once the index is known.
  useEffect(() => {
    if (exams?.length && !selected && !opening) openExam(exams[0].slug);
  }, [exams, selected, opening, openExam]);

  // Keep an attempt in this browser so a reload does not lose answers.
  // Attempts opened from history or reports are read-only and are never written back.
  useEffect(() => {
    if (attempt && !attempt.readOnly) saveAttempt(attempt.slug, attempt.scope, attempt);
  }, [attempt]);

  const startAttempt = (scope, mode) => {
    const questions = questionsFor(selected.exam, scope);
    clearAttempt(selected.slug, scope);
    setAttempt({
      slug: selected.slug,
      scope,
      mode,
      durationSec: mode === "timed" ? timedSeconds(questions) : null,
      startedAt: Date.now(),
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

  // Dev check of the figure engine kinds (not in the navigation): open the app with #figuras.
  if (typeof window !== "undefined" && window.location.hash === "#figuras") return <FigureCheck />;
  if (exams === null) return <main className="frame"><p className="muted">Cargando…</p></main>;

  const questions = selected && attempt ? questionsFor(selected.exam, attempt.scope) : [];
  const scopeTitle = attempt && attempt.scope !== "all" ? attempt.scope : "Examen completo";
  const examTitle = selected ? `${selected.exam.title} · ${scopeTitle}` : "";
  // The sidebar stays on every screen except the test; results and review belong to Practicar, reports to Perfil.
  const navView = { home: "home", setup: "setup", results: "setup", review: "setup", history: "history", league: "league", profile: "profile", reports: "profile" }[view] ?? null;
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
          onPractice={() => setView("setup")}
          onLeague={() => setView("league")}
          onGo={setView}
        />
      )}

      {view === "setup" && selected && (
        <Setup
          exam={selected.exam}
          slug={selected.slug}
          exams={exams}
          onPickExam={(slug) => openExam(slug)}
          onBack={() => setView("home")}
          onStart={startAttempt}
        />
      )}

      {view === "test" && attempt && selected && (
        <Test
          title={examTitle}
          examLabel={selected.exam.title}
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          onChange={setAttempt}
          onSubmit={submit}
          onExit={goHome}
          figures={selected.figures}
        />
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
          onRetry={() => startAttempt(attempt.scope, attempt.mode)}
        />
      )}

      {view === "review" && attempt && selected && (
        <Review
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          keyStatus={selected.keyStatus}
          notes={selected.notes}
          figures={selected.figures}
          examLabel={selected.exam.title}
          startIndex={reviewStart}
          startNumber={reviewNumber}
          onBack={() => setView(attempt.from === "reports" ? "reports" : "results")}
        />
      )}

      {view === "league" && <League onBack={() => setView("home")} />}
      {view === "profile" && <Profile theme={theme} onTheme={setTheme} onTeacher={() => setView("teacher")} onReports={() => setView("reports")} />}
      {view === "history" && <History onBack={() => setView("home")} onNew={() => setView("setup")} onOpen={openFromHistory} />}
      {view === "reports" && <Reports onBack={() => setView("profile")} onPractice={() => setView("setup")} onOpen={openFromReport} />}
      {view === "teacher" && <Teacher onExit={() => setView("profile")} />}

      {navView && <BottomNav active={navView} onGo={setView} />}
    </div>
    </ExamContext.Provider>
  );
}
