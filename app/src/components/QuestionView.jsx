import RichText from "./RichText.jsx";
import FigureBlock from "./FigureBlock.jsx";
import { SOURCE_LINE } from "../lib/exam.js";

// One question with its shared passage. In review mode, `review` carries the correct letter (or null when no key).
// `figures` is the Map from parseFigureSpecs; figures without a valid spec fall back to their crop.
export default function QuestionView({ question, answer, onAnswer, review, figures }) {
  const { group } = question;
  const stemFigures = [
    ...(figures?.get(question.key) ?? []),
    ...(group ? figures?.get(`group:${group.id}`) ?? [] : []),
  ].filter((f) => f.target === "stem");
  const optionFigure = (letter) =>
    (figures?.get(question.key) ?? []).find((f) => f.target === "option" && f.option === letter);
  const chartOptions = question.options.some((o) => optionFigure(o.letter));
  // Many questions repeat their passage in stimulus_md, which the group already shows.
  const ownStimulus = question.stimulus_md && question.stimulus_md.trim() !== group?.stimulus_md?.trim();
  return (
    <article className="question" aria-labelledby={`q-${question.key}`}>
      {group && (
        <section className="passage" aria-label={`Texto para las preguntas ${group.from} a ${group.to}`}>
          {group.directions && <p className="directions">{group.directions}</p>}
          <RichText html={group.stimulus_md} className="stimulus" />
        </section>
      )}
      {ownStimulus && <RichText html={question.stimulus_md} className="stimulus" />}
      <h2 id={`q-${question.key}`} className="qnum">
        Pregunta {question.number}
        <span className="part"> · {question.section}{question.part ? ` · ${question.part}` : ""}</span>
      </h2>
      <RichText html={question.stem_md} className="stem" />
      {stemFigures.map((f) => (
        <FigureBlock key={f.id} figure={f} alt={f.id} />
      ))}
      <ul className={chartOptions ? "options charts" : "options"}>
        {question.options.map((opt) => {
          const selected = answer === opt.letter;
          const correct = Boolean(review?.correctLetter) && review.correctLetter === opt.letter;
          const wrong = Boolean(review?.correctLetter) && selected && !correct;
          const classes = ["option"];
          if (selected) classes.push("selected");
          if (correct) classes.push("correct");
          if (wrong) classes.push("wrong");
          const body = (
            <>
              <span className="letter">{opt.letter}</span>
              {optionFigure(opt.letter) ? (
                <FigureBlock figure={optionFigure(opt.letter)} alt={`Opción ${opt.letter}`} />
              ) : (
                <RichText html={opt.text_md} className="option-text" />
              )}
            </>
          );
          return (
            <li key={opt.letter}>
              {onAnswer ? (
                <label className={classes.join(" ")}>
                  <input
                    type="radio"
                    name={`answer-${question.key}`}
                    value={opt.letter}
                    checked={selected}
                    onChange={() => onAnswer(opt.letter)}
                  />
                  {body}
                </label>
              ) : (
                <div className={classes.join(" ")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="source">{SOURCE_LINE}</p>
    </article>
  );
}
