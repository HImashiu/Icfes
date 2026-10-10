import { useEffect, useState } from "react";
import RichText from "./RichText.jsx";
import FigureBlock from "./FigureBlock.jsx";
import { SOURCE_LINE } from "../lib/exam.js";
import ReportError from "./ReportError.jsx";

// Option states: "selected" (the student's pick while answering), "correct" and "incorrect" for grading.
function optionState({ letter, answer, correctLetter, graded }) {
  if (graded && correctLetter && letter === correctLetter) return "correct";
  if (graded && correctLetter && answer === letter && letter !== correctLetter) return "incorrect";
  if (answer === letter) return "selected";
  return "default";
}

const STATE_LABEL = { correct: "Respuesta según la clave", incorrect: "Tu respuesta" };

// Long stimuli on phone: the first lines show with a fade, and "Leer texto completo" opens the rest.
const LONG_TEXT = 600;
function LongText({ html, className, long }) {
  const [open, setOpen] = useState(false);
  if (!long) return <RichText html={html} className={className} />;
  return (
    <div className="long-text">
      <div className={open ? "clamp open" : "clamp"}>
        <RichText html={html} className={className} />
      </div>
      <button type="button" className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Mostrar menos" : "Leer texto completo"}
      </button>
    </div>
  );
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
  examLabel,
  footer,
  feedback,
  flagged = false,
  onToggleFlag,
  report = true,
}) {
  const { group } = question;
  const wide = useWide();
  const [groupOpen, setGroupOpen] = useState(!collapsedGroup);
  const correctLetter = review?.correctLetter ?? null;
  const collapsed = collapsedGroup && !wide;

  const stemFigures = [
    ...(figures?.get(question.key) ?? []),
    ...(group ? figures?.get(`group:${group.id}`) ?? [] : []),
  ].filter((f) => f.target === "stem");
  const optionFigure = (letter) =>
    (figures?.get(question.key) ?? []).find((f) => f.target === "option" && f.option === letter);
  const chartOptions = question.options.some((o) => optionFigure(o.letter));

  // Many questions repeat their passage in stimulus_md, which the group already shows.
  const ownStimulus = question.stimulus_md && question.stimulus_md.trim() !== group?.stimulus_md?.trim();

  const passage = group && (
    <section className="passage paper-passage" aria-label={`Texto para las preguntas ${group.from} a ${group.to}`}>
      {group.directions && <p className="directions">{group.directions}</p>}
      <LongText html={group.stimulus_md} className="stimulus" long={!wide && (group.stimulus_md ?? "").length > LONG_TEXT} />
    </section>
  );

  const hasContext = Boolean(passage || ownStimulus || stemFigures.length);
  const source = <span className="source">{examLabel ? `${SOURCE_LINE}, ${examLabel}` : SOURCE_LINE}</span>;

  return (
    <div className={hasContext ? "q-split" : "q-split solo"}>
      {hasContext && (
        <section className="paper-card q-context" aria-label="Texto y gráfica de la pregunta">
          {passage && (collapsed ? (
            <details className="group-collapse" open={groupOpen} onToggle={(e) => setGroupOpen(e.currentTarget.open)}>
              <summary>Ver texto y gráfica</summary>
              {passage}
            </details>
          ) : passage)}
          {ownStimulus && <LongText html={question.stimulus_md} className="stimulus" long={!wide && question.stimulus_md.length > LONG_TEXT} />}
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
          <RichText html={question.stem_md} className="stem" />
          {!hasContext && source}
        </article>

        <ul className={chartOptions ? "options charts" : "options"} role="radiogroup" aria-label={`Opciones de la pregunta ${question.number}`}>
          {question.options.map((opt) => {
            const state = optionState({ letter: opt.letter, answer, correctLetter, graded });
            const figure = optionFigure(opt.letter);
            const inner = (
              <>
                <span className="letter-tile">{opt.letter}</span>
                {figure ? (
                  <FigureBlock figure={figure} alt={`Opción ${opt.letter}`} />
                ) : (
                  <RichText html={opt.text_md} className="option-text" />
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
                  aria-label={`Opción ${opt.letter}`}
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
        {report && <ReportError question={question} examLabel={examLabel} />}
        {footer}
      </div>
    </div>
  );
}
