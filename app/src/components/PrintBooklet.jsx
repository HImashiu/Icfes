import RichText from "./RichText.jsx";
import FigureBlock from "./FigureBlock.jsx";
import { SOURCE_LINE } from "../lib/exam.js";

const tracedSrc = (url) => (url.startsWith("data:") ? url : `${import.meta.env.BASE_URL}${url}`);
const TOKEN_IDS = /\[\[figura:([^\]\s]+)\]\]/g;
const tokenIdsOf = (...texts) => texts.flatMap((t) => [...(typeof t === "string" ? t : "").matchAll(TOKEN_IDS)].map((m) => m[1]));
const hasDigits = (s) => /\d/.test(s ?? "");

// The printed booklet: black on white, one shared passage printed once before its first question, options as "A." lines.
// Questions are renumbered 1..n (the number on the answer sheet), so group ranges are recomputed from the printed set.
export default function PrintBooklet({ questions, figures, examLabel, title, course }) {
  const range = new Map();
  questions.forEach((q, i) => {
    const id = q.group?.id;
    if (!id) return;
    const r = range.get(id) ?? [i + 1, i + 1];
    r[1] = i + 1;
    range.set(id, r);
  });
  const areas = [];
  questions.forEach((q) => { if (!areas.length || areas.at(-1).name !== q.section) areas.push({ name: q.section, n: 0 }); areas.at(-1).n += 1; });
  const source = examLabel ? `${SOURCE_LINE}, ${examLabel}` : SOURCE_LINE;
  let lastGroup = null;
  let lastSection = null;

  const blocks = questions.map((question, i) => {
    const number = i + 1;
    const { group } = question;
    const inText = new Set(tokenIdsOf(question.stem_md, question.stimulus_md, group?.stimulus_md));
    const allNative = [...(figures?.values() ?? [])].flat();
    const crops = [...(group?.traced ?? []), ...(question.traced ?? [])];
    const replaced = new Set(crops.map((t) => t.spec_id).filter(Boolean));
    const resolveToken = (id) => {
      const native = allNative.find((f) => f.id === id && !replaced.has(id));
      if (native) return <FigureBlock figure={native} alt={id} />;
      const crop = crops.find((t) => t.figure_id === id) ?? crops.find((t) => t.spec_id === id);
      return crop ? <figure className="pb-fig"><img src={tracedSrc(crop.url)} alt="" /></figure> : null;
    };
    const showSection = question.section !== lastSection;
    lastSection = question.section;
    const newGroup = group && group.id !== lastGroup;
    lastGroup = group?.id ?? null;
    const [from, to] = group ? range.get(group.id) : [number, number];
    const groupFigures = group && newGroup ? (figures?.get(`group:${group.id}`) ?? []).filter((f) => f.target === "stem" && !inText.has(f.id)) : [];
    const ownStimulus = question.stimulus_md?.trim() && question.stimulus_md.trim() !== group?.stimulus_md?.trim();
    const stemFigures = (figures?.get(question.key) ?? []).filter((f) => f.target === "stem" && !inText.has(f.id));
    const traced = (question.traced ?? []).filter((t) => !inText.has(t.figure_id) && !inText.has(t.spec_id));
    const optionFigure = (letter) => (figures?.get(question.key) ?? []).find((f) => f.target === "option" && f.option === letter);
    const figureOptions = question.options.some((o) => optionFigure(o.letter) || o.traced);

    return (
      <div key={question.key} className="pb-unit">
        {showSection && <h2 className="pb-section">{question.section}</h2>}
        {newGroup && (
          <section className="pb-passage">
            <p className="pb-range">{to > from ? `Responde las preguntas ${from} a ${to} con la siguiente información` : `Responde la pregunta ${from} con la siguiente información`}</p>
            {group.directions && !hasDigits(group.directions) && <p className="pb-directions">{group.directions}</p>}
            <RichText html={group.stimulus_md} className="pb-text" resolve={resolveToken} />
            {groupFigures.map((f) => <FigureBlock key={f.id} figure={f} alt={f.id} />)}
          </section>
        )}
        <article className="pb-question">
          {ownStimulus && <RichText html={question.stimulus_md} className="pb-text pb-own" resolve={resolveToken} />}
          {traced.map((t) => <figure className="pb-fig" key={t.figure_id}><img src={tracedSrc(t.url)} alt="" /></figure>)}
          {stemFigures.map((f) => <FigureBlock key={f.id} figure={f} alt={f.id} />)}
          <div className="pb-stem"><b className="pb-num">{number}.</b> <RichText html={question.stem_md} className="pb-text pb-inline" resolve={resolveToken} /></div>
          <ol className={figureOptions ? "pb-options pb-grid" : "pb-options"}>
            {question.options.map((opt) => {
              const figure = optionFigure(opt.letter);
              return (
                <li key={opt.letter}>
                  <b>{opt.letter}.</b>
                  {figure ? <FigureBlock figure={figure} alt={`Opción ${opt.letter}`} inOption />
                    : opt.traced ? <img className="pb-opt-img" src={tracedSrc(opt.traced.url)} alt="" />
                    : <RichText html={opt.text_md} className="pb-text pb-inline" />}
                </li>
              );
            })}
          </ol>
        </article>
      </div>
    );
  });

  return (
    <div className="pb">
      <section className="pb-cover">
        <p className="pb-kicker">Simulacro impreso</p>
        <h1>{title}</h1>
        <div className="pb-fields">
          <p>Nombre: <span /></p>
          <p>Curso: <span className="short">{course}</span></p>
          <p>Fecha: <span className="short" /></p>
        </div>
        <ul className="pb-instr">
          <li>Este cuadernillo tiene {questions.length} preguntas de selección múltiple con única respuesta.</li>
          <li>Responde <b>solo en la hoja de respuestas</b>, rellenando por completo el círculo de la letra elegida con lápiz oscuro.</li>
          <li>No escribas en el cuadernillo. Si te equivocas, borra bien antes de marcar otra letra.</li>
        </ul>
        {areas.length > 1 && <table className="pb-areas"><tbody>{areas.map((a) => <tr key={a.name}><td>{a.name}</td><td>{a.n} preguntas</td></tr>)}</tbody></table>}
        <p className="pb-source">{source}</p>
      </section>
      {blocks}
    </div>
  );
}
