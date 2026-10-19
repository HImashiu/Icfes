import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import RichText from "./RichText.jsx";
import FigureBlock from "./FigureBlock.jsx";
import { SOURCE_LINE } from "../lib/exam.js";
import ReportError from "./ReportError.jsx";
import Zoomable from "./Zoomable.jsx";
import { gapSentence } from "../lib/gaps.js";
import { QuestionNotes, useAnnotations } from "./Annotations.jsx";

// Traced scans are inlined as data URIs by the sync; other paths sit under the app's base URL.
const tracedSrc = (url) => (url.startsWith("data:") ? url : `${import.meta.env.BASE_URL}${url}`);

// Option states: "selected" (the student's pick while answering), "correct" and "incorrect" for grading.
function optionState({ letter, answer, correctLetter, graded }) {
  if (graded && correctLetter && letter === correctLetter) return "correct";
  if (graded && correctLetter && answer === letter && letter !== correctLetter) return "incorrect";
  if (answer === letter) return "selected";
  return "default";
}

const STATE_LABEL = { correct: "Respuesta según la clave", incorrect: "Tu respuesta" };

// Figure ids the editor placed in the text as [[figura:ID]] tokens.
const TOKEN_IDS = /\[\[figura:([^\]\s]+)\]\]/g;
const tokenIdsOf = (...texts) => texts.flatMap((t) => [...(typeof t === "string" ? t : "").matchAll(TOKEN_IDS)].map((m) => m[1]));

// Long stimuli on phone: the first lines show with a fade, and "Leer texto completo" opens the rest.
const LONG_TEXT = 600;
function LongText({ html, className, long, resolve, ann, qkey }) {
  const [open, setOpen] = useState(false);
  if (!long) return <RichText html={html} className={className} resolve={resolve} ann={ann} qkey={qkey} />;
  return (
    <div className="long-text">
      <div className={open ? "clamp open" : "clamp"}>
        <RichText html={html} className={className} resolve={resolve} ann={ann} qkey={qkey} />
      </div>
      <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Mostrar menos" : "Leer texto completo"}
      </button>
    </div>
  );
}

// Which text of a question is long enough to live in its own pane (a docked panel on phone, a left column
// on desktop): the text its group shares, or its own stimulus. Short texts stay inside the question card.
export const TEXT_PANE_MIN = 400;
// `groupMin` lowers the bar for a shared text: on a wide screen any shared text gets the side column, so the
// questions of the text are listed together beside it instead of each carrying its own copy.
export function textPaneKind(question, groupMin = TEXT_PANE_MIN) {
  const shared = question.group?.stimulus_md ?? "";
  if (shared.trim() && shared.length > groupMin) return "group";
  const own = question.stimulus_md?.trim() && question.stimulus_md.trim() !== shared.trim() ? question.stimulus_md : "";
  return own.length > TEXT_PANE_MIN ? "own" : null;
}

// True on desktop, where the context (passage, figure) sits in its own column and is never collapsed.
function useWide() {
  const query = "(min-width: 1200px)";
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return undefined;
    const onChange = (e) => setWide(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return wide;
}

// Two columns on desktop: the context (passage, stimulus, figure, source) and the question (stem, options).
// On phone they stack: context first, then the question. A question with no context spans both.
// `review` holds { correctLetter } when a key exists; `graded` turns on the correct/incorrect states.
// `footer` and `feedback` are placed under the options; `flagged` and `onToggleFlag` drive the desktop "Marcar" toggle.
export default function QuestionView({
  question,
  answer,
  onAnswer,
  graded = false,
  review,
  figures,
  collapsedGroup = false,
  showPassage = true,
  examLabel,
  footer,
  feedback,
  flagged = false,
  onToggleFlag,
  report = true,
  textTarget = null,
  gapLine = false,
  paneGroupMin = TEXT_PANE_MIN,
}) {
  const { group } = question;
  const groupAnn = group ? `g:${group.id}:stimulus` : undefined;
  const ownAnn = `q:${question.key}:stimulus`;
  const annotations = useAnnotations();
  const wide = useWide();

  const [groupOpen, setGroupOpen] = useState(!collapsedGroup);
  const correctLetter = review?.correctLetter ?? null;
  const collapsed = collapsedGroup && !wide;

  // A figure placed in the text by the editor is drawn there, not in the usual slot above the stem.
  const inText = new Set(tokenIdsOf(question.stem_md, question.stimulus_md, group?.stimulus_md));
  // With `textTarget` (a node of the test screen) the long text is drawn there, in its own pane, through a portal:
  // the shared text and the figures of the group go with it; the question keeps its own figures.
  const paneKind = textTarget ? textPaneKind(question, paneGroupMin) : null;
  const inPane = Boolean(paneKind === "own" || (paneKind === "group" && showPassage));
  const groupFigures = group ? figures?.get(`group:${group.id}`) ?? [] : [];
  const stemFigures = [
    ...(figures?.get(question.key) ?? []),
    ...(inPane || (paneKind === "group" && !showPassage) ? [] : groupFigures),
  ].filter((f) => f.target === "stem" && !inText.has(f.id));
  const paneFigures = paneKind === "group" && inPane ? groupFigures.filter((f) => f.target === "stem" && !inText.has(f.id)) : [];

  // Draws the figure a token names: a native figure not replaced by a crop, then a crop by figure id, then by spec id.
  const allNative = [...(figures?.values() ?? [])].flat();
  const crops = [...(group?.traced ?? []), ...(question.traced ?? [])];
  const replacedSpecs = new Set(crops.map((t) => t.spec_id).filter(Boolean));
  const resolveToken = (id) => {
    const native = allNative.find((f) => f.id === id && !replacedSpecs.has(id));
    if (native) return <FigureBlock figure={native} alt={id} />;
    const crop = crops.find((t) => t.figure_id === id) ?? crops.find((t) => t.spec_id === id);
    if (!crop) return null;
    return (
      <figure className="traced-figure">
        <Zoomable src={tracedSrc(crop.url)} alt={id}>
          <img className="scanfig" src={tracedSrc(crop.url)} alt={id} />
        </Zoomable>
      </figure>
    );
  };
  const optionFigure = (letter) =>
    (figures?.get(question.key) ?? []).find((f) => f.target === "option" && f.option === letter);
  const chartOptions = question.options.some((o) => optionFigure(o.letter) || o.traced);

  // Matching tables put each item's stem in a row of the passage; showing the stem again would repeat it.
  const plainText = (html) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const stemText = plainText(question.stem_md);
  const stemInPassage = stemText.length > 20 && plainText(group?.stimulus_md).includes(stemText);
  // A fill-in question beside its text only repeats "Blank (N): choose the option that completes the text".
  const clozeStem = Boolean(paneKind) && /^blank \(\d+\)/.test(stemText) && stemText.length < 90;
  // With `gapLine` (the text is behind a tab) such a question shows the sentence of its blank instead.
  const blankLine = gapLine && clozeStem ? gapSentence(paneKind === "group" ? group?.stimulus_md : question.stimulus_md, question.number) : "";

  // Many questions repeat their passage in stimulus_md, which the group already shows.
  const ownStimulus = question.stimulus_md && question.stimulus_md.trim() !== group?.stimulus_md?.trim();
  const ownInCard = ownStimulus && !(inPane && paneKind === "own");
  const source = <span className="source">{question.sourceLine ?? (examLabel ? `${SOURCE_LINE}, ${examLabel}` : SOURCE_LINE)}</span>;
  const pane = inPane && createPortal(
    paneKind === "group" ? (
      <div className="pane-text" aria-label={`Texto para las preguntas ${group.from} a ${group.to}`}>
        {group.directions && <p className="directions">{group.directions}</p>}
        <RichText html={group.stimulus_md} className="stimulus" resolve={resolveToken} ann={groupAnn} qkey={question.key} />
        {paneFigures.map((f) => <FigureBlock key={f.id} figure={f} alt={f.id} />)}
        {source}
      </div>
    ) : (
      <div className="pane-text">
        <RichText html={question.stimulus_md} className="stimulus" resolve={resolveToken} ann={ownAnn} qkey={question.key} />
        {source}
      </div>
    ),
    textTarget,
  );

  const passage = group && showPassage && !inPane && (
    <section className="passage paper-passage" aria-label={`Texto para las preguntas ${group.from} a ${group.to}`}>
      {group.directions && <p className="directions">{group.directions}</p>}
      <LongText html={group.stimulus_md} className="stimulus" long={!wide && (group.stimulus_md ?? "").length > LONG_TEXT} resolve={resolveToken} ann={groupAnn} qkey={question.key} />
    </section>
  );

  // A traced figure (a scan trace from figures/traced) stands in for the native spec it replaces.
  const traced = (question.traced ?? []).filter((t) => !inText.has(t.figure_id) && !inText.has(t.spec_id));
  const hasContext = Boolean(passage || ownInCard || stemFigures.length || traced.length);

  return (
    <div className={hasContext ? "q-split" : "q-split solo"}>
      {pane}
      {hasContext && (
        <section className="paper-card q-context" aria-label="Texto y gráfica de la pregunta">
          {passage && (collapsed ? (
            <details className="group-collapse" open={groupOpen} onToggle={(e) => setGroupOpen(e.currentTarget.open)}>
              <summary>{stemFigures.length || traced.length ? "Ver texto y gráfica" : "Ver texto"}</summary>
              {passage}
            </details>
          ) : passage)}
          {ownInCard && <LongText html={question.stimulus_md} className="stimulus" long={!wide && question.stimulus_md.length > LONG_TEXT} resolve={resolveToken} ann={ownAnn} qkey={question.key} />}
          {traced.map((t) => (
            <figure className="traced-figure" key={t.figure_id}>
              <Zoomable src={tracedSrc(t.url)} alt={t.figure_id}>
                <img src={tracedSrc(t.url)} alt={t.figure_id} />
              </Zoomable>
            </figure>
          ))}
          {stemFigures.map((f) => (
            <FigureBlock key={f.id} figure={f} alt={f.id} />
          ))}
          {source}
        </section>
      )}

      <div className="q-main">
        <article className="paper-card q-question" aria-labelledby={`q-${question.key}`}>
          <div className="card-row">
            <span className="card-label" id={`q-${question.key}`}>
              Pregunta {question.number} · {question.section}
              {question.part ? ` · ${question.part}` : ""}
            </span>
            {onToggleFlag && (
              <button
                type="button"
                className={flagged ? "mark-btn on" : "mark-btn"}
                aria-pressed={flagged}
                onClick={onToggleFlag}
              >
                {flagged ? "Marcada" : "Marcar"}
              </button>
            )}
          </div>
          {blankLine && <RichText html={blankLine} className="stem gap-line" />}
          {!stemInPassage && !clozeStem && <RichText html={question.stem_md} className="stem" resolve={resolveToken} ann={`q:${question.key}:stem`} qkey={question.key} />}
          {!hasContext && !paneKind && source}
          {annotations && <QuestionNotes qkey={question.key} annPrefix={`q:${question.key}:`} />}
        </article>

        <ul className={chartOptions ? "options charts" : "options"} role="radiogroup" aria-label={`Opciones de la pregunta ${question.number}`}>
          {question.options.map((opt) => {
            const state = optionState({ letter: opt.letter, answer, correctLetter, graded });
            const figure = optionFigure(opt.letter);
            const inner = (
              <>
                <span className="letter-tile">{opt.letter}</span>
                {figure ? (
                  <FigureBlock figure={figure} alt={`Opción ${opt.letter}`} inOption />
                ) : opt.traced ? (
                  <Zoomable hintOnly src={tracedSrc(opt.traced.url)} alt={`Opción ${opt.letter}`}>
                    <img className="traced-option" src={tracedSrc(opt.traced.url)} alt={`Opción ${opt.letter}`} />
                  </Zoomable>
                ) : opt.pending_spec && !opt.text_md?.trim() ? (
                  // The golden file marks an option whose figure is not drawn yet: say so, never show a scan.
                  <span className="pending-fig">Figura pendiente de dibujar</span>
                ) : (
                  <RichText html={opt.text_md} className="option-text" ann={`q:${question.key}:opt:${opt.letter}`} qkey={question.key} />
                )}
                {STATE_LABEL[state] && <span className="option-tag">{STATE_LABEL[state]}</span>}
              </>
            );
            const disabled = !onAnswer;
            return (
              <li key={opt.letter}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={answer === opt.letter}
                  disabled={disabled}
                  className={`option ${state}`}
                  onClick={() => onAnswer?.(opt.letter)}
                >
                  {inner}
                </button>
              </li>
            );
          })}
        </ul>
        {feedback}
        {report && !question.sourceLine && <ReportError question={question} examLabel={examLabel} />}
        {footer}
      </div>
    </div>
  );
}
