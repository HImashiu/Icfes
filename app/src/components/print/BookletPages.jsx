import { useEffect, useMemo, useRef, useState } from "react";
import { buildFlow, Atom } from "./bookletFlow.jsx";
import { geometry, padPages, paginate, saddleOrder } from "../../lib/bookletLayout.js";
import { FONTS, LEADING, SPACING, cleanStyle, sidesFor } from "../../lib/bookletStyle.js";
import { SOURCE_LINE } from "../../lib/exam.js";
import { APP_NAME, areaColor } from "../../lib/brand.js";
import owlUrl from "../../assets/owl.svg";

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Waits for fonts, pictures and math to settle so every piece is measured at its printed size.
async function settled(node) {
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }
  const imgs = [...node.querySelectorAll("img")];
  await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  await frame();
  await frame();
}

// The type settings every page and the measuring box share, as CSS variables (booklet.css reads them).
export function typeVars(style) {
  return {
    "--bk-font": FONTS[style.font].css,
    "--bk-size": `${style.fontSize}pt`,
    "--bk-lead": LEADING[style.leading],
    "--bk-gap": `${SPACING[style.spacing]}mm`,
  };
}

// The typeset cuadernillo of one version: measured, laid out in pages and, for a folded booklet, imposed two pages
// per sheet in saddle-stitch order. `onLaid` reports { pages, sheets, sides, over } once the layout is done.
// `style` is the print format (lib/bookletStyle.js); meta.size / meta.binding are still read when it is missing.
// part: "all" | "front" | "back" prints only one side of every sheet, for printers that cannot print both sides.
export default function BookletPages({ questions, figures, meta, style: rawStyle, onLaid, zoom = 1, part = "all", reverseBacks = false }) {
  const style = useMemo(() => cleanStyle(rawStyle ?? { size: meta.size, binding: meta.binding }), [rawStyle, meta.size, meta.binding]);
  const g = geometry(style);
  const { atoms, flow, areas } = useMemo(() => buildFlow(questions, figures), [questions, figures]);
  const measureRef = useRef(null);
  const [laid, setLaid] = useState(null);
  const vars = typeVars(style);
  const opts = { optionGrid: style.optionGrid, workSpace: style.workSpace, colW: g.colW, fontSize: style.fontSize };
  const layoutKey = JSON.stringify([g.page, g.margins, g.cols, style.font, style.fontSize, style.leading, style.spacing, style.workSpace, style.optionGrid,
    style.areaBreak, style.cover, style.kicker, style.subtitle, meta.title, meta.schoolName, Boolean(meta.logo), atoms.length]);

  useEffect(() => {
    let live = true;
    setLaid(null);
    (async () => {
      const node = measureRef.current;
      if (!node) return;
      await settled(node);
      if (!live) return;
      const mm = node.querySelector(".bk-ruler").getBoundingClientRect().height / 100;
      const heights = [...node.querySelectorAll(":scope > .bk-cell")].map((el) => el.getBoundingClientRect().height / mm);
      const bannerH = node.querySelector(".bk-banner").getBoundingClientRect().height / mm;
      const firstH = style.cover === "header" ? node.querySelector(".bk-firsthead").getBoundingClientRect().height / mm : 0;
      const pages = paginate(flow, (a) => heights[a] ?? 0, { colH: g.bodyH, cols: g.cols, bannerH, areaBreak: style.areaBreak, firstH });
      setLaid({ pages, key: layoutKey });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, atoms]);

  const contentPages = laid?.key === layoutKey ? laid.pages : null;
  const answersHere = style.answerSheet && !g.imposed;

  // Cover, instructions, the questions, the answer sheet, then the back cover. Blank pages fill a folded booklet to a
  // multiple of four and a two-sided one to an even count; with "each area on a right-hand page" a blank verso goes
  // before an area that would start on the left.
  const logical = useMemo(() => {
    if (!contentPages) return null;
    const list = [];
    if (style.cover === "full") list.push({ kind: "cover" });
    if (style.instructions) list.push({ kind: "instructions" });
    contentPages.forEach((p, i) => {
      if (style.areaRecto && g.duplex && p.banner && list.length % 2 === 1) list.push({ kind: "blank" });
      list.push({ kind: "content", page: p, first: i === 0 });
    });
    if (answersHere) {
      if (g.duplex && list.length % 2 === 1) list.push({ kind: "blank" });
      list.push({ kind: "answers" });
    }
    if (style.backCover) list.push({ kind: "back" });
    const of = g.imposed ? 4 : g.duplex ? 2 : 1;
    return padPages(list, of, { kind: "blank" }, style.backCover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPages, g.imposed, g.duplex, style.cover, style.instructions, style.areaRecto, style.backCover, answersHere]);

  const sides = useMemo(() => {
    if (!logical) return [];
    const all = g.imposed ? saddleOrder(logical.length) : logical.map((_, i) => [i]);
    const keep = sidesFor(all.length, part, g.duplex).map((i) => all[i]);
    return part === "back" && reverseBacks ? keep.reverse() : keep;
  }, [logical, g.imposed, g.duplex, part, reverseBacks]);

  useEffect(() => {
    if (!logical) return;
    const n = logical.length;
    onLaid?.({ pages: n, sheets: g.imposed ? n / 4 : g.duplex ? Math.ceil(n / 2) : n, sides: g.imposed ? n / 2 : n, over: contentPages.filter((p) => p.over).length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logical]);

  const total = questions.length;
  const totalPages = logical?.length ?? 0;
  const headLeft = style.headText.trim() || `${meta.title}${meta.version ? ` · Versión ${meta.version}` : ""}`;
  const renderPage = (p, i) => {
    const recto = !g.duplex || i % 2 === 0;
    const pad = {
      paddingTop: `${g.margins.top}mm`, paddingBottom: `${g.margins.bottom}mm`,
      paddingLeft: `${recto ? g.margins.inner : g.margins.outer}mm`, paddingRight: `${recto ? g.margins.outer : g.margins.inner}mm`,
    };
    const section = p.kind === "content" ? p.page.section : null;
    const cls = `bk-page bk-${p.kind}${g.small ? " bk-small" : ""}${style.color ? " bk-color" : ""}`;
    const common = { className: cls, style: { width: `${g.page.w}mm`, height: `${g.page.h}mm`, ...pad, ...vars, "--bk-area": section ? areaColor(section) : undefined } };
    const folio = <Folio n={i + 1} total={totalPages} recto={recto} meta={meta} style={style} pad={pad} />;
    if (p.kind === "cover") return <div key={i} {...common}><Cover meta={meta} style={style} areas={areas} total={total} /></div>;
    if (p.kind === "back") return <div key={i} {...common}><BackCover meta={meta} /></div>;
    if (p.kind === "blank") return <div key={i} {...common}><p className="bk-blank-note">Página en blanco intencionalmente</p>{folio}</div>;
    const head = style.head && !(p.first && style.cover === "header") && (
      <header className={`bk-head ${recto ? "r" : "v"}`} style={{ top: `${Math.max(4, g.margins.top - 10)}mm`, left: pad.paddingLeft, right: pad.paddingRight }}>
        <span>{headLeft}</span>
        {style.headArea && <span>{p.kind === "content" ? section : p.kind === "answers" ? "Hoja de respuestas" : "Instrucciones"}</span>}
      </header>
    );
    if (p.kind === "instructions") return <div key={i} {...common}>{head}<Instructions meta={meta} style={style} areas={areas} total={total} />{folio}</div>;
    if (p.kind === "answers") return <div key={i} {...common}>{head}<AnswerPage meta={meta} areas={areas} total={total} />{folio}</div>;
    return (
      <div key={i} {...common}>
        {head}
        {p.first && style.cover === "header" && <FirstHeader meta={meta} style={style} total={total} />}
        {p.page.banner && <Banner name={p.page.section} area={areas.find((a) => a.name === p.page.section)} />}
        <div className={`bk-cols c${g.cols}${style.colRule ? "" : " norule"}`} style={{ columnGap: `${g.gap}mm`, gridTemplateColumns: `repeat(${g.cols}, ${g.colW}mm)` }}>
          {p.page.columns.map((col, c) => (
            <div key={c} className="bk-col">{col.map((a) => <div key={a} className="bk-cell"><Atom atom={atoms[a]} opts={opts} /></div>)}</div>
          ))}
        </div>
        {folio}
      </div>
    );
  };

  return (
    <>
      {/* Every piece at column width, off screen, to measure it. */}
      <div ref={measureRef} className={`bk-measure${g.small ? " bk-small" : ""}${style.color ? " bk-color" : ""}`} style={{ width: `${g.colW}mm`, ...vars }} aria-hidden="true">
        <div className="bk-ruler" style={{ height: "100mm" }} />
        <div style={{ width: `${g.bodyW}mm` }}><Banner name="Área" area={{ from: 1, to: 2 }} /></div>
        {style.cover === "header" && <div style={{ width: `${g.bodyW}mm` }}><FirstHeader meta={meta} style={style} total={total} /></div>}
        {atoms.map((a, i) => <div key={i} className="bk-cell"><Atom atom={a} opts={opts} /></div>)}
      </div>
      {!logical ? <div className="bk-wait">Diagramando el cuadernillo…</div> : sides.map((pair) => (
        <div key={pair.join("-")} className={`bk-sheet${g.imposed ? " bk-imposed" : ""}`} style={{ width: `${g.sheet.w}mm`, height: `${g.sheet.h}mm`, zoom }}>
          {pair.map((idx) => renderPage(logical[idx], idx))}
        </div>
      ))}
    </>
  );
}

function Folio({ n, total, recto, meta, style, pad }) {
  const source = `${SOURCE_LINE}${meta.examLabel ? `, ${meta.examLabel}` : ""}`;
  const number = style.pageNumber === "none" ? null : <b className="bk-pn">{style.pageTotal ? `${n} de ${total}` : n}</b>;
  return (
    <footer className={`bk-foot ${recto ? "r" : "v"}${style.pageNumber === "center" ? " c" : ""}`} style={{ paddingLeft: pad.paddingLeft, paddingRight: pad.paddingRight }}>
      <span className="bk-src">{source}{style.footText ? <><br />{style.footText}</> : null}</span>
      {number}
    </footer>
  );
}

function Banner({ name, area }) {
  return (
    <div className="bk-banner">
      <h2>{name}</h2>
      {area && <span>{area.to > area.from ? `Preguntas ${area.from} a ${area.to}` : `Pregunta ${area.from}`}</span>}
    </div>
  );
}

function SchoolMark({ meta }) {
  if (!meta.schoolName && !meta.logo) return null;
  return (
    <div className="bk-school">
      {meta.logo && <img src={meta.logo} alt="" />}
      {meta.schoolName && <strong>{meta.schoolName}</strong>}
    </div>
  );
}

function Cover({ meta, style, areas, total }) {
  return (
    <div className="bk-cover-in">
      <div className="bk-cover-top">
        <SchoolMark meta={meta} />
        <span className="bk-app"><img src={owlUrl} alt="" />{APP_NAME}</span>
      </div>
      <div className="bk-cover-mid">
        <p className="bk-kicker">{style.kicker || meta.kicker || "Simulacro Saber 11"}</p>
        <h1>{meta.title}</h1>
        {(style.subtitle || meta.subtitle) && <p className="bk-sub">{style.subtitle || meta.subtitle}</p>}
        <div className="bk-cover-tags">
          {meta.version && <span className="bk-form"><small>Versión</small><b>{meta.version}</b></span>}
          <span className="bk-count"><b>{total}</b><small>{total === 1 ? "pregunta" : "preguntas"}</small></span>
        </div>
      </div>
      <div className="bk-fields">
        <p><span>Nombre completo</span><i /></p>
        <div className="bk-fields-row">
          <p><span>Documento</span><i /></p>
          <p><span>Curso</span><i>{meta.course}</i></p>
          <p><span>Fecha</span><i /></p>
        </div>
      </div>
      {areas.length > 0 && (
        <table className="bk-areas">
          <thead><tr><th>Prueba</th><th>Preguntas</th></tr></thead>
          <tbody>{areas.map((a) => <tr key={a.name} style={{ "--bk-area": areaColor(a.name) }}><td><i className="bk-dot" />{a.name}</td><td>{a.from === a.to ? a.from : `${a.from} a ${a.to}`}</td></tr>)}</tbody>
        </table>
      )}
      <p className="bk-cover-note">No abras este cuadernillo hasta que el docente lo indique.</p>
    </div>
  );
}

// The cover squeezed into a strip at the top of the first page, for booklets that save the cover sheet.
function FirstHeader({ meta, style, total }) {
  return (
    <div className="bk-firsthead">
      <div className="bk-fh-top">
        <SchoolMark meta={meta} />
        <div className="bk-fh-title">
          <p className="bk-kicker">{style.kicker || "Simulacro Saber 11"}{meta.version ? ` · Versión ${meta.version}` : ""} · {total} {total === 1 ? "pregunta" : "preguntas"}</p>
          <h1>{meta.title}</h1>
          {style.subtitle && <p className="bk-sub">{style.subtitle}</p>}
        </div>
      </div>
      <div className="bk-fh-fields">
        <p><span>Nombre</span><i /></p>
        <p><span>Curso</span><i>{meta.course}</i></p>
        <p><span>Fecha</span><i /></p>
      </div>
      {!style.instructions && <p className="bk-fh-note">Marca tus respuestas en la hoja de respuestas: un solo círculo relleno por pregunta.{style.extraInstruction ? ` ${style.extraInstruction}` : ""}</p>}
    </div>
  );
}

function Instructions({ meta, style, areas, total }) {
  return (
    <div className="bk-instr">
      <h2>Instrucciones</h2>
      <ol>
        <li>Este cuadernillo tiene {total} preguntas de selección múltiple con única respuesta{areas.length ? `, de las pruebas ${areas.map((a) => a.name).join(", ").replace(/, ([^,]*)$/, " y $1")}` : ""}.</li>
        <li>Cada pregunta tiene cuatro opciones de respuesta (A, B, C y D) y solo una es correcta.</li>
        <li>Marca tus respuestas <b>únicamente en la hoja de respuestas</b>. Rellena por completo el círculo de la letra que elijas, con lápiz de mina negra n.º 2.</li>
        <li>Si quieres cambiar una respuesta, borra por completo la marca anterior. Una pregunta con dos marcas se califica como incorrecta.</li>
        <li>Algunas preguntas comparten un texto, una tabla o una gráfica. El recuadro «Responde las preguntas…» indica cuáles lo usan.</li>
        <li>Puedes hacer cálculos y anotaciones en el cuadernillo, pero solo se califica la hoja de respuestas.</li>
        {meta.version && <li>Tu cuadernillo es la <b>versión {meta.version}</b>. Verifica que tu hoja de respuestas diga la misma versión antes de empezar.</li>}
        {style.extraInstruction && <li>{style.extraInstruction}</li>}
        <li>Al terminar, entrega el cuadernillo y la hoja de respuestas al docente.</li>
      </ol>
      <div className="bk-example">
        <p className="bk-range">Ejemplo de cómo marcar</p>
        <div className="bk-example-row">
          <span>Pregunta 1</span>
          {["A", "B", "C", "D"].map((l) => <i key={l} className={l === "C" ? "on" : ""}>{l === "C" ? "" : l}</i>)}
          <small>Bien: el círculo de la C está relleno por completo.</small>
        </div>
      </div>
      <div className="bk-attrib">
        <p><b>Sobre las preguntas.</b> Las preguntas de este cuadernillo fueron publicadas por el Instituto Colombiano para la Evaluación de la Educación (ICFES) en sus cuadernillos liberados de la prueba Saber 11{meta.examLabel ? ` (${meta.examLabel})` : ""}. Se reproducen con fines de práctica y no constituyen una prueba oficial del ICFES.</p>
      </div>
    </div>
  );
}

// A bubble sheet to tear off and grade by hand. The sheets the phone scanner reads are printed from Papel.
export function AnswerPage({ meta, areas, total }) {
  const perCol = total > 100 ? 30 : 25;
  const cols = [];
  for (let n = 1; n <= total; n += 1) {
    if ((n - 1) % perCol === 0) cols.push([]);
    cols.at(-1).push(n);
  }
  const areaOf = (n) => areas.find((a) => n >= a.from && n <= a.to)?.name;
  return (
    <div className="bk-answers">
      <h2>Hoja de respuestas{meta.version ? ` · Versión ${meta.version}` : ""}</h2>
      <div className="bk-fh-fields">
        <p><span>Nombre</span><i /></p>
        <p><span>Curso</span><i>{meta.course}</i></p>
        <p><span>Fecha</span><i /></p>
      </div>
      <div className="bk-ans-grid" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 3)}, 1fr)` }}>
        {cols.map((col, c) => (
          <div key={c} className="bk-ans-col">
            {col.map((n) => (
              <div key={n} className={`bk-ans-row${areaOf(n) !== areaOf(n - 1) ? " first" : ""}`} style={{ "--bk-area": areaColor(areaOf(n)) }} title={areaOf(n)}>
                <b>{n}</b>
                {["A", "B", "C", "D"].map((l) => <i key={l}>{l}</i>)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="bk-ans-note">Rellena por completo un solo círculo por pregunta. {areas.map((a) => `${a.name}: ${a.from === a.to ? a.from : `${a.from}–${a.to}`}`).join(" · ")}</p>
    </div>
  );
}

function BackCover({ meta }) {
  return (
    <div className="bk-back-in">
      <SchoolMark meta={meta} />
      <div className="bk-back-mid">
        <img src={owlUrl} alt="" />
        <strong>{APP_NAME}</strong>
        <span>Práctica para el Saber 11</span>
      </div>
      <p className="bk-back-src">{SOURCE_LINE}{meta.examLabel ? `, ${meta.examLabel}` : ""}. Preguntas publicadas por el ICFES en sus cuadernillos liberados; material de práctica, no oficial. Diagramación: {APP_NAME}.</p>
    </div>
  );
}
