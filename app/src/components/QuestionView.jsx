import { useState } from "react";
import RichText from "./RichText.jsx";
import FigureBlock from "./FigureBlock.jsx";
import { SOURCE_LINE } from "../lib/exam.js";

// Option states: "selected" (the student's pick while answering), "correct" and "incorrect" for grading.
function optionState({ letter, answer, correctLetter, graded }) {
  if (graded && correctLetter && letter === correctLetter) return "correct";
  if (graded && correctLetter && answer === letter && letter !== correctLetter) return "incorrect";
  if (answer === letter) return "selected";
  return "default";
}

const STATE_LABEL = { correct: "Respuesta según la clave", incorrect: "Tu respuesta" };

// The question always sits on a light paper card; options sit outside it on the app surface.
// `review` holds { correctLetter } when a key exists; `graded` turns on the correct/incorrect states.
export default function QuestionView({ question, answer, onAnswer, graded = false, review, figures, collapsedGroup = false, examLabel }) {
  const { group } = question;
  const [groupOpen, setGroupOpen] = useState(!collapsedGroup);
  const correctLetter = review?.correctLetter ?? null;

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
      <RichText html={group.stimulus_md} className="stimulus" />
    </section>
  );

  return (
    <>
      <article className="paper-card" aria-labelledby={`q-${question.key}`}>
        <span className="card-label" id={`q-${question.key}`}>
          Pregunta {question.number} · {question.section}
          {question.part ? ` · ${question.part}` : ""}
        </span>
        {group && collapsedGroup ? (
          <details className="group-collapse" open={groupOpen} onToggle={(e) => setGroupOpen(e.currentTarget.open)}>
            <summary>Ver texto y gráfica</summary>
            {passage}
          </details>
        ) : (
          passage
        )}
        {ownStimulus && <RichText html={question.stimulus_md} className="stimulus" />}
        {stemFigures.map((f) => (
          <FigureBlock key={f.id} figure={f} alt={f.id} />
        ))}
        <RichText html={question.stem_md} className="stem" />
        <span className="source">{examLabel ? `${SOURCE_LINE} · ${examLabel}` : SOURCE_LINE}</span>
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
    </>
  );
}
