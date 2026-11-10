import RichText from "../RichText.jsx";
import FigureBlock from "../FigureBlock.jsx";
import { isMatching } from "../../lib/matching.js";
import { splitBlocks, splitLongParagraph } from "../../lib/bookletLayout.js";
import CropImage from "./CropImage.jsx";
import { areaColor } from "../../lib/brand.js";

const TOKEN_IDS = /\[\[figura:([^\]\s]+)\]\]/g;
const tokenIdsOf = (...texts) => texts.flatMap((t) => [...(typeof t === "string" ? t : "").matchAll(TOKEN_IDS)].map((m) => m[1]));
const hasDigits = (s) => /\d/.test(s ?? "");
const textLength = (atom) => (atom?.kind === "html" ? atom.html.replace(/<[^>]+>/g, "").trim().length : 999);
// "Tabla", "Figura 2", a right-aligned label or a "Tomado de…" source belongs to the piece above it.
const CAPTION = /^\s*(\*\*)?\s*(tomado|fuente|adaptado|recuperado|imagen tomada|tabla|figura|gr[aá]fica|cuadro|mapa|esquema)\b/i;
export function isCaption(atom) {
  if (atom?.kind !== "html") return false;
  const text = atom.html.replace(/<[^>]+>/g, "").trim();
  return text.length < 260 && (CAPTION.test(text) || (/text-align:\s*right/.test(atom.html) && text.length < 80));
}
// One chain per piece, except that captions travel with the piece above them.
function withCaptions(list, atoms) {
  const chains = [];
  for (const a of list) {
    if (chains.length && isCaption(atoms[a])) chains.at(-1).push(a);
    else chains.push([a]);
  }
  return chains;
}
const blocksOf = (html) => splitBlocks(html).flatMap((b) => splitLongParagraph(b));

// The areas of a printed set, numbered 1..n in the order given: [{ name, from, to }].
export function areasOf(questions) {
  const areas = [];
  questions.forEach((q, i) => {
    if (!areas.length || areas.at(-1).name !== q.section) areas.push({ name: q.section, from: i + 1, to: i + 1 });
    areas.at(-1).to = i + 1;
  });
  return areas;
}

// Turns the printed questions into measured pieces ("atoms") and the flow the paginator lays out.
// Questions are numbered 1..n in the order given (the order of the answer sheet).
// A shared text prints once, before its first question, and continues in the next column when it is long;
// it is kept in one column with its first question whenever both fit. A question (stem and options) is never split.
export function buildFlow(questions, figures) {
  const atoms = [];
  const flow = [];
  const add = (atom) => atoms.push(atom) - 1;
  const allNative = [...(figures?.values() ?? [])].flat();
  const range = new Map();
  questions.forEach((q, i) => {
    const id = q.group?.id;
    if (!id) return;
    const r = range.get(id) ?? [i + 1, i + 1];
    r[1] = i + 1;
    range.set(id, r);
  });
  const areas = [];
  let lastSection = null;
  let lastGroup = null;
  let pending = null; // the open passage block, waiting for its first question

  questions.forEach((question, i) => {
    const number = i + 1;
    const { group } = question;
    if (question.section !== lastSection) {
      if (pending) { flow.push(pending); pending = null; }
      lastSection = question.section;
      const area = { name: question.section, from: number, to: number };
      areas.push(area);
      flow.push({ type: "section", name: question.section, head: add({ kind: "areahead", area }) });
    }
    areas.at(-1).to = number;

    const inText = new Set(tokenIdsOf(question.stem_md, question.stimulus_md, group?.stimulus_md));
    const crops = [...(group?.traced ?? []), ...(question.traced ?? [])];
    const replaced = new Set(crops.map((t) => t.spec_id).filter(Boolean));
    const resolve = (id) => {
      const native = allNative.find((f) => f.id === id && !replaced.has(id));
      if (native) return <FigureBlock figure={native} alt={id} />;
      const crop = crops.find((t) => t.figure_id === id) ?? crops.find((t) => t.spec_id === id);
      return crop ? <CropImage url={crop.url} /> : null;
    };

    const newGroup = group && group.id !== lastGroup;
    lastGroup = group?.id ?? null;
    if (newGroup) {
      if (pending) flow.push(pending);
      const [from, to] = range.get(group.id);
      const head = [add({ kind: "range", text: to > from ? `Responde las preguntas ${from} a ${to} de acuerdo con la siguiente información` : `Responde la pregunta ${from} de acuerdo con la siguiente información` })];
      if (group.directions && !hasDigits(group.directions)) head.push(add({ kind: "directions", text: group.directions }));
      const parts = blocksOf(group.stimulus_md).map((html) => add({ kind: "html", html, resolve }));
      const groupFigures = (figures?.get(`group:${group.id}`) ?? []).filter((f) => f.target === "stem" && !inText.has(f.id));
      groupFigures.forEach((f) => parts.push(add({ kind: "figure", figure: f })));
      if (isMatching(question)) parts.push(add({ kind: "bank", question }));
      // The range line never ends a column alone: it travels with the first piece of the text.
      // A short title or source line counts as part of the head, so the range line always has real text under it.
      let take = 1;
      while (take < parts.length && take < 3 && textLength(atoms[parts[take - 1]]) < 120) take += 1;
      const rest = withCaptions(parts.slice(take), atoms);
      const chains = parts.length ? [[...head, ...parts.slice(0, take)], ...rest] : [head];
      // A caption right after the head's last piece stays in the head chain.
      while (chains.length > 1 && isCaption(atoms[chains[1][0]])) chains[0].push(...chains.splice(1, 1)[0]);
      pending = { type: "block", chains };
    }

    const own = [];
    if (question.stimulus_md?.trim() && question.stimulus_md.trim() !== group?.stimulus_md?.trim()) {
      blocksOf(question.stimulus_md).forEach((html) => own.push(add({ kind: "html", html, resolve, own: true })));
    }
    (question.traced ?? []).filter((t) => !inText.has(t.figure_id) && !inText.has(t.spec_id)).forEach((t) => own.push(add({ kind: "crop", url: t.url })));
    (figures?.get(question.key) ?? []).filter((f) => f.target === "stem" && !inText.has(f.id)).forEach((f) => own.push(add({ kind: "figure", figure: f })));
    const q = add({ kind: "question", question, number, resolve, figures });
    // A figure or table right before the stem stays with it; the rest of a long own text may run ahead.
    const ownChains = withCaptions(own, atoms);
    const chains = [...ownChains.slice(0, -1), [...(ownChains.at(-1) ?? []), q]];
    if (pending) {
      // The passage keeps its last piece with the first question, so a text never ends a column with its question overleaf.
      const last = pending.chains.pop();
      pending.chains.push([...last, ...chains[0]], ...chains.slice(1));
      flow.push(pending);
      pending = null;
    } else {
      flow.push({ type: "block", chains });
    }
  });
  if (pending) flow.push(pending);
  return { atoms, flow, areas };
}

// One measured piece, as printed. `opts` carries the print format choices that change how a piece looks:
// { optionGrid, workSpace (mm after a math question), colW (mm), fontSize (pt) }.
export function Atom({ atom, opts = {} }) {
  switch (atom.kind) {
    case "areahead": return (
      <div className="bk-areahead" style={{ "--bk-area": areaColor(atom.area.name) }}>
        <h2>{atom.area.name}</h2>
        <span>{atom.area.to > atom.area.from ? `Preguntas ${atom.area.from} a ${atom.area.to}` : `Pregunta ${atom.area.from}`}</span>
      </div>
    );
    case "range": return <p className="bk-range">{atom.text}</p>;
    case "directions": return <p className="bk-directions">{atom.text}</p>;
    case "html": return <RichText html={atom.html} className={`bk-text${atom.own ? " bk-own" : ""}${isCaption(atom) ? " bk-caption" : ""}`} resolve={atom.resolve} />;
    case "figure": return <div className="bk-figure"><FigureBlock figure={atom.figure} alt={atom.figure.id} /></div>;
    case "crop": return <CropImage url={atom.url} />;
    case "bank": return (
      <ol className="bk-bank" aria-label="Lista de palabras">
        {atom.question.options.map((opt) => <li key={opt.letter}><b>{opt.letter}.</b> <RichText html={opt.text_md} className="bk-text bk-inline" /></li>)}
      </ol>
    );
    case "question": return <Question {...atom} opts={opts} />;
    default: return null;
  }
}

const plainText = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim();
const RICH = /<(table|img|svg|ul|ol|br)|\$|\\\(|katex|\[\[/i;

// How many short text options fit side by side in a column: 4, 2 or 1 (a plain list).
export function optionAcross(options, colW, fontSize = 10.5) {
  if (!options?.length || options.some((o) => RICH.test(o.text_md ?? ""))) return 1;
  const longest = Math.max(...options.map((o) => plainText(o.text_md).length));
  const perChar = fontSize * 0.2; // mm per character, roughly, for the body type
  const fitsIn = (n) => longest * perChar <= (colW - 7) / n - 7;
  if (options.length === 4 && fitsIn(4)) return 4;
  return fitsIn(2) ? 2 : 1;
}

function Question({ question, number, resolve, figures, opts = {} }) {
  const optionFigure = (letter) => (figures?.get(question.key) ?? []).find((f) => f.target === "option" && f.option === letter);
  const pictures = question.options.some((o) => optionFigure(o.letter) || o.traced);
  const across = !pictures && opts.optionGrid ? optionAcross(question.options, opts.colW ?? 85, opts.fontSize) : 1;
  const work = opts.workSpace && /matem/i.test(question.section ?? "") ? opts.workSpace : 0;
  return (
    <div className="bk-q">
      <div className="bk-stem"><b className="bk-num">{number}.</b><RichText html={question.stem_md} className="bk-text" resolve={resolve} /></div>
      {!isMatching(question) && (
        <ol className={pictures ? "bk-options bk-pics" : across > 1 ? `bk-options bk-across a${across}` : "bk-options"}>
          {question.options.map((opt) => {
            const figure = optionFigure(opt.letter);
            return (
              <li key={opt.letter}>
                <b>{opt.letter}.</b>
                <div className="bk-opt">
                  {figure ? <FigureBlock figure={figure} alt={`Opción ${opt.letter}`} inOption />
                    : opt.traced ? <CropImage url={opt.traced.url} option />
                    : <RichText html={opt.text_md} className="bk-text" />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {work > 0 && <div className="bk-work" style={{ height: `${work}mm` }} aria-hidden="true" />}
    </div>
  );
}
