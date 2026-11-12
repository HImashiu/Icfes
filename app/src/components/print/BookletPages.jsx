import { useEffect, useMemo, useRef, useState } from "react";
import { buildFlow, Atom } from "./bookletFlow.jsx";
import { geometry, padPages, paginate, saddleOrder } from "../../lib/bookletLayout.js";
import { SOURCE_LINE } from "../../lib/exam.js";
import { APP_NAME } from "../../lib/brand.js";
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

// The typeset cuadernillo of one version: measured, laid out in pages and, for a folded booklet, imposed two pages
// per sheet in saddle-stitch order. `onLaid` reports { pages, sheets, over } once the layout is done.
export default function BookletPages({ questions, figures, meta, onLaid, zoom = 1 }) {
  const g = geometry(meta.size, meta.binding);
  const { atoms, flow, areas } = useMemo(() => buildFlow(questions, figures), [questions, figures]);
  const measureRef = useRef(null);
  const [laid, setLaid] = useState(null);
  const layoutKey = `${meta.size}|${meta.binding}|${atoms.length}`;

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
      const pages = paginate(flow, (a) => heights[a] ?? 0, { colH: g.bodyH, cols: g.cols, bannerH });
      setLaid({ pages, key: layoutKey });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, atoms]);

  const contentPages = laid?.key === layoutKey ? laid.pages : null;

  // Cover, instructions, the questions, then the back cover. Blank pages fill a folded booklet to a multiple of four.
  const logical = useMemo(() => {
    if (!contentPages) return null;
    const list = [{ kind: "cover" }, { kind: "instructions" }, ...contentPages.map((p) => ({ kind: "content", page: p })), { kind: "back" }];
    return padPages(list, g.imposed ? 4 : 2, { kind: "blank" });
  }, [contentPages, g.imposed]);

  useEffect(() => {
    if (!logical) return;
    onLaid?.({ pages: logical.length, sheets: g.imposed ? logical.length / 4 : Math.ceil(logical.length / 2), over: contentPages.filter((p) => p.over).length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logical]);

  const total = questions.length;
  const renderPage = (p, i) => {
    const recto = i % 2 === 0;
    const pad = {
      paddingTop: `${g.margins.top}mm`, paddingBottom: `${g.margins.bottom}mm`,
      paddingLeft: `${recto ? g.margins.inner : g.margins.outer}mm`, paddingRight: `${recto ? g.margins.outer : g.margins.inner}mm`,
    };
    const common = { className: `bk-page bk-${p.kind}${g.small ? " bk-small" : ""}`, style: { width: `${g.page.w}mm`, height: `${g.page.h}mm`, ...pad } };
    if (p.kind === "cover") return <div key={i} {...common}><Cover meta={meta} areas={areas} total={total} /></div>;
    if (p.kind === "back") return <div key={i} {...common}><BackCover meta={meta} /></div>;
    if (p.kind === "blank") return <div key={i} {...common}><p className="bk-blank-note">Página en blanco intencionalmente</p><Folio n={i + 1} recto={recto} meta={meta} pad={pad} /></div>;
    return (
      <div key={i} {...common}>
        <header className={`bk-head ${recto ? "r" : "v"}`} style={{ top: `${g.margins.top - 10}mm`, left: pad.paddingLeft, right: pad.paddingRight }}>
          <span>{meta.title}{meta.version ? ` · Versión ${meta.version}` : ""}</span>
          <span>{p.kind === "content" ? p.page.section : "Instrucciones"}</span>
        </header>
        {p.kind === "instructions" ? <Instructions meta={meta} areas={areas} total={total} /> : (
          <>
            {p.page.banner && <Banner name={p.page.section} area={areas.find((a) => a.name === p.page.section)} />}
            <div className={`bk-cols c${g.cols}`} style={{ columnGap: `${g.gap}mm`, gridTemplateColumns: `repeat(${g.cols}, ${g.colW}mm)` }}>
              {p.page.columns.map((col, c) => (
                <div key={c} className="bk-col">{col.map((a) => <div key={a} className="bk-cell"><Atom atom={atoms[a]} /></div>)}</div>
              ))}
            </div>
          </>
        )}
        <Folio n={i + 1} recto={recto} meta={meta} pad={pad} />
      </div>
    );
  };

  return (
    <>
      {/* Every piece at column width, off screen, to measure it. */}
      <div ref={measureRef} className={`bk-measure${g.small ? " bk-small" : ""}`} style={{ width: `${g.colW}mm` }} aria-hidden="true">
        <div className="bk-ruler" style={{ height: "100mm" }} />
        <div style={{ width: `${g.bodyW}mm` }}><Banner name="Área" area={{ from: 1, to: 2 }} /></div>
        {atoms.map((a, i) => <div key={i} className="bk-cell"><Atom atom={a} /></div>)}
      </div>
      {!logical ? <div className="bk-wait">Diagramando el cuadernillo…</div> : g.imposed ? (
        saddleOrder(logical.length).map(([l, r], s) => (
          <div key={s} className="bk-sheet bk-imposed" style={{ width: `${g.sheet.w}mm`, height: `${g.sheet.h}mm`, zoom }}>
            {renderPage(logical[l], l)}{renderPage(logical[r], r)}
          </div>
        ))
      ) : logical.map((p, i) => <div key={i} className="bk-sheet" style={{ width: `${g.sheet.w}mm`, height: `${g.sheet.h}mm`, zoom }}>{renderPage(p, i)}</div>)}
    </>
  );
}

function Folio({ n, recto, meta, pad }) {
  return (
    <footer className={`bk-foot ${recto ? "r" : "v"}`} style={{ paddingLeft: pad.paddingLeft, paddingRight: pad.paddingRight }}>
      <span className="bk-src">{SOURCE_LINE}{meta.examLabel ? `, ${meta.examLabel}` : ""}</span>
      <b className="bk-pn">{n}</b>
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

function Cover({ meta, areas, total }) {
  return (
    <div className="bk-cover-in">
      <div className="bk-cover-top">
        <SchoolMark meta={meta} />
        <span className="bk-app"><img src={owlUrl} alt="" />{APP_NAME}</span>
      </div>
      <div className="bk-cover-mid">
        <p className="bk-kicker">{meta.kicker ?? "Simulacro Saber 11"}</p>
        <h1>{meta.title}</h1>
        {meta.subtitle && <p className="bk-sub">{meta.subtitle}</p>}
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
          <tbody>{areas.map((a) => <tr key={a.name}><td>{a.name}</td><td>{a.from === a.to ? a.from : `${a.from} a ${a.to}`}</td></tr>)}</tbody>
        </table>
      )}
      <p className="bk-cover-note">No abras este cuadernillo hasta que el docente lo indique.</p>
    </div>
  );
}

function Instructions({ meta, areas, total }) {
  return (
    <div className="bk-instr">
      <h2>Instrucciones</h2>
      <ol>
        <li>Este cuadernillo tiene {total} preguntas de selección múltiple con única respuesta, de las pruebas {areas.map((a) => a.name).join(", ").replace(/, ([^,]*)$/, " y $1")}.</li>
        <li>Cada pregunta tiene cuatro opciones de respuesta (A, B, C y D) y solo una es correcta.</li>
        <li>Marca tus respuestas <b>únicamente en la hoja de respuestas</b>. Rellena por completo el círculo de la letra que elijas, con lápiz de mina negra n.º 2.</li>
        <li>Si quieres cambiar una respuesta, borra por completo la marca anterior. Una pregunta con dos marcas se califica como incorrecta.</li>
        <li>Algunas preguntas comparten un texto, una tabla o una gráfica. El recuadro «Responde las preguntas…» indica cuáles lo usan.</li>
        <li>Puedes hacer cálculos y anotaciones en el cuadernillo, pero solo se califica la hoja de respuestas.</li>
        {meta.version && <li>Tu cuadernillo es la <b>versión {meta.version}</b>. Verifica que tu hoja de respuestas diga la misma versión antes de empezar.</li>}
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

