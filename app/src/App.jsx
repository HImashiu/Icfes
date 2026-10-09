import { useCallback, useEffect, useState } from "react";
import Home from "./screens/Home.jsx";
import Test from "./screens/Test.jsx";
import Results from "./screens/Results.jsx";
import Review from "./screens/Review.jsx";
import { parseExam, parseKey, questionsFor, timedSeconds } from "./lib/exam.js";
import { clearAttempt, loadAttempt, saveAttempt } from "./lib/storage.js";
import { parseFigureSpecs } from "./lib/figures.js";

const base = import.meta.env.BASE_URL;

async function getJson(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return res.json();
}

export default function App() {
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null); // { slug, exam, key }
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(null);
  const [view, setView] = useState("home");
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    getJson("exams/index.json")
      .then((data) => setExams(data.exams))
      .catch((err) => {
        setExams([]);
        setLoadError(err.message);
      });
  }, []);

  // The index says whether a key exists, so a missing key is never requested.
  const openExam = useCallback(async (slug) => {
    setOpenError(null);
    if (!slug) {
      setSelected(null);
      return;
    }
    const entry = exams?.find((e) => e.slug === slug);
    setOpening(true);
    try {
      const [raw, rawKey, rawFigures] = await Promise.all([
        getJson(`exams/${slug}.json`),
        entry?.hasKey ? getJson(`exams/${slug}.key.json`) : null,
        entry?.hasFigures ? getJson(`exams/${slug}.figures.json`) : null,
      ]);
      setSelected({ slug, exam: parseExam(raw), key: parseKey(rawKey), figures: parseFigureSpecs(rawFigures) });
    } catch (err) {
      setOpenError(err.message);
    } finally {
      setOpening(false);
    }
  }, [exams]);

  // Keep an unfinished or submitted attempt in this browser, so a reload does not lose answers.
  useEffect(() => {
    if (attempt) saveAttempt(attempt.slug, attempt.scope, attempt);
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
      current: 0,
      submittedAt: null,
      auto: false,
    });
    setView("test");
  };

  const resume = async (saved) => {
    if (!selected || selected.slug !== saved.slug) await openExam(saved.slug);
    setAttempt(saved);
    setView(saved.submittedAt ? "results" : "test");
  };

  const submit = useCallback(({ auto }) => {
    setAttempt((a) => (a && !a.submittedAt ? { ...a, submittedAt: Date.now(), auto } : a));
    setView("results");
  }, []);

  const goHome = () => {
    setView("home");
    setAttempt(null);
  };

  if (exams === null) return <main className="shell"><p className="muted">Cargando…</p></main>;

  const questions = selected && attempt ? questionsFor(selected.exam, attempt.scope) : [];
  const scopeTitle = attempt && attempt.scope !== "all" ? attempt.scope : "Examen completo";

  return (
    <main className="shell">
      {loadError && <p className="notice error">{loadError}</p>}
      {opening && <p className="muted">Cargando examen…</p>}

      {view === "home" && (
        <Home
          exams={exams}
          selected={selected}
          onOpen={openExam}
          onStart={startAttempt}
          onResume={resume}
          loading={opening}
          error={openError}
        />
      )}

      {view === "test" && attempt && selected && (
        <Test
          title={`${selected.exam.title} · ${scopeTitle}`}
          questions={questions}
          attempt={attempt}
          onChange={setAttempt}
          onSubmit={submit}
          onExit={goHome}
          figures={selected.figures}
        />
      )}

      {view === "results" && attempt && selected && (
        <Results
          title={`${selected.exam.title} · ${scopeTitle}`}
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          figures={selected.figures}
          onReview={() => setView("review")}
          onHome={goHome}
          onRetry={() => startAttempt(attempt.scope, attempt.mode)}
        />
      )}

      {view === "review" && attempt && selected && (
        <Review
          questions={questions}
          attempt={attempt}
          answerKey={selected.key}
          figures={selected.figures}
          onBack={() => setView("results")}
        />
      )}
    </main>
  );
}
