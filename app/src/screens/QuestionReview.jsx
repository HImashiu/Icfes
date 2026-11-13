import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QuestionView, { textPaneKind } from "../components/QuestionView.jsx";
import TextToggle from "../components/TextToggle.jsx";
import { getJson } from "../lib/data.js";
import { parseExam, parseKey } from "../lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../lib/figures.js";
import { useMedia } from "../lib/media.js";
import { checkRendered } from "../lib/reviewChecks.js";
import Loading from "../components/Loading.jsx";

// Question review (#revision-preguntas): one question drawn with the same components and layout rules as the student's
// test screen (screens/Test.jsx), so a person or a Claude session can look at it as a student sees it and write down
// what is wrong. Dev only (see main.jsx): it is not in any build that goes to schools.
//
//   #revision-preguntas                        list of booklets
//   #revision-preguntas?exam=S11-B_1ra          every question number, with the mechanical issues of the whole booklet
//   #revision-preguntas?exam=S11-B_1ra&n=21     question 21 as the student sees it
//   add &bare=1  only the student's view (no review panel) so screenshots are clean
//   add &key=1   show the answer key's correct option, as after "Comprobar"
// The page sets data-review-state="ready" on <body> once fonts, pictures and formulas settled, and exposes
// window.__reviewIssues() with the mechanical checks (lib/reviewChecks.js).

const params = () => new URLSearchParams(window.location.hash.replace(/^#revision-preguntas\??/, ""));
const go = (next) => { window.location.hash = `#revision-preguntas${next ? `?${new URLSearchParams(next)}` : ""}`; };

const bundleCache = new Map();
async function loadBundle(slug) {
  if (bundleCache.has(slug)) return bundleCache.get(slug);
  const index = (await getJson("exams/index.json")).exams ?? [];
  const entry = index.find((e) => e.slug === slug);
  if (!entry) throw new Error(`No existe el cuadernillo ${slug}`);
  const optional = (p) => getJson(p).catch(() => null);
  const [raw, rawKey, rawFigures] = await Promise.all([
    getJson(`exams/${slug}.json`),
    entry.hasKey ? optional(`exams/${slug}.key.json`) : null,
    entry.hasFigures ? getJson(`exams/${slug}.figures.json`) : null,
  ]);
  const parsed = parseExam(raw);
  const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
  const bundle = { slug, exam: prepareExam(parsed, figures), key: parseKey(rawKey), figures, raw };
  bundleCache.set(slug, bundle);
  return bundle;
}

function useHashParams() {
  const [p, setP] = useState(params);
  useEffect(() => {
    const on = () => setP(params());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return p;
}

export default function QuestionReview() {
  const p = useHashParams();
  const slug = p.get("exam");
  if (!slug) return <BookletList />;
  const n = p.get("n");
  return n ? <OneQuestion slug={slug} number={Number(n)} bare={p.get("bare") === "1"} showKey={p.get("key") === "1"} />
    : <BookletMap slug={slug} />;
}

function BookletList() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { getJson("exams/index.json").then((d) => setList(d.exams ?? [])).catch((e) => setError(e.message)); }, []);
  useEffect(() => { document.body.dataset.reviewState = list || error ? "ready" : "loading"; }, [list, error]);
  if (error) return <main className="frame"><p className="notice error">{error}</p></main>;
  if (!list) return <Loading page label="Cargando…" />;
  return (
    <main className="frame">
      <h1>Revisión de preguntas</h1>
      <p className="caption">Uso interno. Elige un cuadernillo; cada pregunta se dibuja como la ve el estudiante.</p>
      <ul>
        {list.filter((e) => e.status !== "proximamente").map((e) => (
          <li key={e.slug}><a href={`#revision-preguntas?exam=${e.slug}`}>{e.slug}</a> <span className="caption">· {e.title} · {e.questions ?? e.count ?? "?"} preguntas</span></li>
        ))}
      </ul>
    </main>
  );
}

function useBundle(slug) {
  const [state, setState] = useState({ bundle: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ bundle: null, error: null });
    loadBundle(slug).then((bundle) => live && setState({ bundle, error: null })).catch((error) => live && setState({ bundle: null, error: error.message }));
    return () => { live = false; };
  }, [slug]);
  return state;
}

function BookletMap({ slug }) {
  const { bundle, error } = useBundle(slug);
  useEffect(() => { document.body.dataset.reviewState = bundle || error ? "ready" : "loading"; }, [bundle, error]);
  if (error) return <main className="frame"><p className="notice error">{error}</p></main>;
  if (!bundle) return <Loading page label="Cargando…" />;
  const qs = bundle.exam.questions;
  return (
    <main className="frame">
      <h1>{bundle.exam.title}</h1>
      <p className="caption">{qs.length} preguntas visibles para el estudiante. <a href="#revision-preguntas">Todos los cuadernillos</a></p>
      <p>{qs.map((q) => <a key={q.key} href={`#revision-preguntas?exam=${slug}&n=${q.number}`} style={{ marginRight: 8 }}>{q.number}</a>)}</p>
    </main>
  );
}

function OneQuestion({ slug, number, bare, showKey }) {
  const { bundle, error } = useBundle(slug);
  const roomy = useMedia("(min-width: 900px)");
  const [textEl, setTextEl] = useState(null);
  const [view, setView] = useState("text");
  const [issues, setIssues] = useState(null);
  const rootRef = useRef(null);

  const questions = bundle?.exam.questions ?? [];
  const index = questions.findIndex((q) => q.number === number);
  const q = index >= 0 ? questions[index] : null;
  // Same rules as Test.jsx: the questions that share a text are drawn together beside it on a wide screen.
  const sameText = (a, b) => a && b && (a.group_id ? a.group_id === b.group_id : false);
  let from = index; let to = index;
  if (q) { while (from > 0 && sameText(questions[from - 1], q)) from--; while (to < questions.length - 1 && sameText(questions[to + 1], q)) to++; }
  const fullBlock = q ? questions.slice(from, to + 1) : [];
  const groupMin = roomy ? 0 : undefined;
  const paneKind = q ? textPaneKind(q, groupMin) : null;
  const sideText = roomy && (paneKind === "group" || (paneKind === "own" && fullBlock.length === 1));
  const dockText = !roomy && paneKind !== null;
  const block = dockText ? [q] : fullBlock;
  const textTarget = sideText || dockText ? textEl : null;
  const correct = showKey ? bundle?.key?.get(q?.key) ?? null : null;

  // Phone: both the text and the question are drawn (the text tab is the one the student sees first); the review
  // shows the question tab, and `view=text` in the address shows the text.
  useEffect(() => { setView(new URLSearchParams(window.location.hash.replace(/^#revision-preguntas\??/, "")).get("view") === "text" ? "text" : "question"); }, [slug, number]);

  const runChecks = useCallback(() => {
    const root = rootRef.current;
    if (!root || !q) return [];
    const found = checkRendered(root, q);
    setIssues(found);
    return found;
  }, [q]);
  useEffect(() => { window.__reviewIssues = runChecks; }, [runChecks]);

  // Ready when the booklet is loaded, the pane exists (when needed), fonts and every picture have settled.
  useEffect(() => {
    document.body.dataset.reviewState = "loading";
    if (!bundle) return undefined;
    if (!q) { document.body.dataset.reviewState = "missing"; return undefined; }
    if ((sideText || dockText) && !textEl) return undefined;
    let cancelled = false;
    (async () => {
      await (document.fonts?.ready ?? Promise.resolve());
      const imgs = [...document.querySelectorAll(".review-harness img")];
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;
      runChecks();
      document.body.dataset.reviewState = "ready";
    })();
    return () => { cancelled = true; };
  }, [bundle, q, textEl, sideText, dockText, view, runChecks]);

  const examLabel = bundle?.exam.title;
  const renderBlock = () => block.map((qq, i) => (
    <section key={qq.key} data-qkey={qq.key} className={`block-q${qq.key === q.key ? " current" : ""}`}>
      <QuestionView
        question={qq} answer={null} graded={Boolean(correct)} review={correct ? { correctLetter: bundle.key.get(qq.key) } : null}
        figures={bundle.figures} showPassage={i === 0} examLabel={examLabel}
        textTarget={textTarget} paneGroupMin={groupMin} gapLine={dockText}
      />
    </section>
  ));

  if (error) return <main className="frame"><p className="notice error">{error}</p></main>;
  if (!bundle) return <Loading page label="Cargando…" />;
  if (!q) return <main className="frame"><p className="notice error">El cuadernillo {slug} no tiene la pregunta {number} visible para el estudiante.</p></main>;

  const prev = questions[index - 1]; const next = questions[index + 1];
  const link = (x) => `#revision-preguntas?exam=${slug}&n=${x.number}${showKey ? "&key=1" : ""}`;
  return (
    <div className="test review-harness" ref={rootRef}>
      {!bare && (
        <header className="review-panel" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line, #444)", fontSize: 13 }}>
          <a href={`#revision-preguntas?exam=${slug}`}>{slug}</a> · pregunta {q.number} de {questions.length} · {q.section}
          {" · "}clave: {bundle.key?.get(q.key) ?? "sin clave"}{" · "}fuente: pág. {(q.source?.pages ?? []).join(", ") || "?"}
          {" · "}{prev && <a href={link(prev)}>← {prev.number}</a>} {next && <a href={link(next)}>{next.number} →</a>}
          {issues && (issues.length === 0
            ? <span style={{ color: "#6c6" }}> · sin problemas mecánicos</span>
            : <ul style={{ color: "#e88", margin: "4px 0 0" }}>{issues.map((it, i) => <li key={i}>[{it.level}] {it.message}</li>)}</ul>)}
        </header>
      )}
      <div className="test-body">
        <main className={dockText && view === "text" ? "test-main view-text" : "test-main"}>
          {dockText && <TextToggle view={view} onView={setView} number={q.number} bodyRef={setTextEl} />}
          {sideText ? (
            <div className="read-split">
              <aside className="read-text paper-card" ref={setTextEl} aria-label="Texto de las preguntas" />
              <div className="read-qs">{renderBlock()}</div>
            </div>
          ) : renderBlock()}
        </main>
      </div>
    </div>
  );
}
