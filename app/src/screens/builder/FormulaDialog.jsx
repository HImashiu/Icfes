import { useEffect, useRef, useState } from "react";
import { renderRich } from "../../lib/render.js";
import { Dialog, Segmented } from "./ui.jsx";

let mathlive = null;
// MathLive (the visual formula editor of the admin editor) loads the first time a formula is written.
// Its fonts are KaTeX's, which the app already loads, so it fetches none of its own.
function loadMathLive() {
  if (!mathlive) {
    mathlive = import("mathlive").then((m) => {
      m.MathfieldElement.fontsDirectory = null;
      m.MathfieldElement.soundsDirectory = null;
      return m;
    });
  }
  return mathlive;
}

const QUICK = [
  ["a/b", "\\frac{#@}{#?}"], ["√", "\\sqrt{#0}"], ["xⁿ", "#@^{#?}"], ["xₙ", "#@_{#?}"], ["π", "\\pi"], ["·", "\\cdot"],
  ["×", "\\times"], ["÷", "\\div"], ["≤", "\\le"], ["≥", "\\ge"], ["≠", "\\ne"], ["±", "\\pm"], ["°", "^{\\circ}"], ["∞", "\\infty"],
  ["( )", "\\left(#0\\right)"], ["|x|", "\\left|#0\\right|"], ["sen", "\\sin"], ["cos", "\\cos"], ["log", "\\log"], ["Σ", "\\sum_{#?}^{#?}"], ["→", "\\rightarrow"],
];

const isChem = (tex) => /^\\ce\{[\s\S]*\}$/.test(tex.trim());

// Writes or edits one formula. `initial` is the formula's LaTeX (empty for a new one); `chem` opens the chemistry tab.
export default function FormulaDialog({ initial = "", chem = false, onDone, onClose, onRemove }) {
  const startChem = chem || isChem(initial);
  const [mode, setMode] = useState(startChem ? "chem" : "math");
  const [tex, setTex] = useState(startChem ? initial.trim().replace(/^\\ce\{([\s\S]*)\}$/, "$1") : initial);
  const [ready, setReady] = useState(false);
  const field = useRef(null);

  useEffect(() => {
    let alive = true;
    loadMathLive().then(() => { if (alive) setReady(true); }).catch(() => setReady(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const mf = field.current;
    if (!ready || mode !== "math" || !mf) return undefined;
    mf.mathVirtualKeyboardPolicy = "manual";
    mf.smartFence = true;
    if (mf.value !== tex) mf.value = tex;
    const onInput = () => setTex(mf.value);
    mf.addEventListener("input", onInput);
    setTimeout(() => mf.focus(), 30);
    return () => mf.removeEventListener("input", onInput);
  }, [ready, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalTex = mode === "chem" ? (tex.trim() ? `\\ce{${tex.trim()}}` : "") : tex.trim();
  const preview = finalTex ? renderRich(`$${finalTex}$`) : "";
  const insert = (snippet) => {
    const mf = field.current;
    if (mf?.executeCommand) { mf.executeCommand(["insert", snippet, { focus: true }]); setTex(mf.value); } else setTex(tex + snippet.replace(/#[@?0]/g, ""));
  };
  const done = () => onDone(finalTex);

  return (
    <Dialog title={initial ? "Editar fórmula" : "Nueva fórmula"} onClose={onClose}>
      <Segmented label="Tipo" value={mode} onChange={(m) => { setMode(m); setTex(""); }} options={[{ value: "math", label: "ƒx Matemáticas" }, { value: "chem", label: "⚗ Química" }]} />
      {mode === "math" ? (
        <>
          <p className="caption">Escribe como en una calculadora: / hace una fracción, ^ un exponente, sqrt una raíz. Enter inserta.</p>
          <div className="qb-quick">{QUICK.map(([label, snip]) => <button key={label} type="button" className="qb-tool" onClick={() => insert(snip)}>{label}</button>)}</div>
          {ready
            ? <math-field ref={field} class="qb-mathfield" aria-label="Fórmula" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } }} />
            : <input className="qb-input" aria-label="Fórmula en LaTeX" value={tex} onChange={(e) => setTex(e.target.value)} placeholder="Cargando el editor de fórmulas… también puedes escribir LaTeX" />}
          <details className="qb-latex"><summary>Ver o escribir el código LaTeX</summary>
            <input className="qb-input" aria-label="Código LaTeX" value={tex} spellCheck={false} onChange={(e) => { setTex(e.target.value); if (field.current) field.current.value = e.target.value; }} />
          </details>
        </>
      ) : (
        <>
          <p className="caption">Escribe la fórmula o la reacción tal cual: H2O, CO2, 2H2 + O2 -&gt; 2H2O, Fe^3+, Na+ (los números se ponen solos como subíndices).</p>
          <input className="qb-input" aria-label="Fórmula química" autoFocus value={tex} spellCheck={false} onChange={(e) => setTex(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") done(); }} placeholder="2H2 + O2 -> 2H2O" />
        </>
      )}
      <div className="qb-preview" aria-label="Vista previa" dangerouslySetInnerHTML={{ __html: preview || '<span class="caption">La vista previa aparece aquí.</span>' }} />
      <div className="report-actions">
        {onRemove && <button type="button" className="secondary" onClick={onRemove}>Quitar fórmula</button>}
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" disabled={!finalTex} onClick={done}>{initial ? "Listo" : "Insertar"}</button>
      </div>
    </Dialog>
  );
}
