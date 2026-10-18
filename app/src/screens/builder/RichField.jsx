import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cleanText, figBlock, gapChip, mathChip, RICH_BLOCK, sourceFromHtml, toSource, toVisual } from "../../lib/builder/richSource.js";

// The builder's text fields: Word-style editing over the stored exam text, as in the admin editor.
// The toolbar acts on the field that last had the caret (ctx.active).
export const RichCtx = createContext(null);

export function useRichFields({ figs, onFormula }) {
  const active = useRef(null);
  const [activeName, setActiveName] = useState("");
  const [code, setCode] = useState(false);
  const [inTable, setInTable] = useState(false);
  const ctx = useMemo(() => ({
    active, figs, code, onFormula,
    setActive(api) { active.current = api; setActiveName(api?.name ?? ""); },
    setInTable,
  }), [figs, code, onFormula]);
  return { ctx, activeName, code, setCode, inTable };
}

const sel = () => window.getSelection();
const nodeEl = (n) => (n?.nodeType === 1 ? n : n?.parentElement);

export function RichField({ name, label, value, onChange, small = false, placeholder = "" }) {
  const ctx = useContext(RichCtx);
  const el = useRef(null);
  const last = useRef(null);
  const range = useRef(null);
  const change = useRef(onChange);
  change.current = onChange;
  const figsRef = useRef(ctx.figs);
  figsRef.current = ctx.figs;

  const api = useMemo(() => {
    const a = {
      name: label,
      key: name,
      el: () => el.current,
      emit() {
        if (!el.current) return;
        const src = toSource(el.current);
        last.current = src;
        el.current.classList.toggle("empty", !el.current.textContent.trim() && !el.current.querySelector("table,li,.figblock,.mathchip,.gapchip"));
        change.current(src);
      },
      save() {
        const s = sel();
        if (s?.rangeCount && el.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange();
      },
      // Puts the caret back where it was in this field (or at its end).
      restore() {
        const node = el.current;
        if (!node) return;
        node.focus({ preventScroll: true });
        const s = sel();
        if (range.current && node.contains(range.current.startContainer)) {
          s.removeAllRanges();
          s.addRange(range.current);
        } else if (!(s.rangeCount && node.contains(s.anchorNode))) {
          const r = document.createRange();
          r.selectNodeContents(node);
          r.collapse(false);
          s.removeAllRanges();
          s.addRange(r);
        }
      },
      insertHtml(html) {
        a.restore();
        document.execCommand("insertHTML", false, html);
        a.save();
        a.emit();
      },
      insertSource(src) { a.insertHtml(toVisual(src, figsRef.current)); },
      setSource(src) {
        a.restore();
        document.execCommand("selectAll");
        document.execCommand("insertHTML", false, toVisual(src, figsRef.current) || "<br>");
        a.emit();
      },
      source: () => last.current ?? "",
    };
    return a;
  }, [name, label]);

  useLayoutEffect(() => {
    if (ctx.code || !el.current) return;
    if (value !== last.current || !el.current.dataset.ready) {
      el.current.dataset.ready = "1";
      el.current.innerHTML = toVisual(value, figsRef.current);
      last.current = value;
      el.current.classList.toggle("empty", !value?.trim());
    }
  }, [value, ctx.code]);

  // A figure's picture follows its crop when the crop changes (or disappears).
  useEffect(() => {
    el.current?.querySelectorAll(".figblock").forEach((b) => b.replaceWith(htmlNode(figBlock(b.dataset.fig, ctx.figs))));
  }, [ctx.figs]);

  useEffect(() => () => { if (ctx.active.current === api) ctx.setActive(null); }, [api, ctx]);

  if (ctx.code) {
    return (
      <label className="qb-field">
        <span className="label">{label}</span>
        <textarea className="qb-code" rows={small ? 2 : 5} value={value} spellCheck={false} onFocus={() => ctx.setActive(api)} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  const onClick = (e) => {
    const x = e.target.closest(".figx");
    if (x) { e.preventDefault(); x.closest(".figblock").remove(); api.emit(); return; }
    const chip = e.target.closest(".mathchip");
    if (chip) { ctx.setActive(api); ctx.onFormula?.(api, chip); return; }
    const gap = e.target.closest(".gapchip");
    if (gap) { gap.remove(); api.emit(); }
  };
  const onPaste = (e) => {
    if (e.clipboardData?.files?.length) return;
    e.preventDefault();
    const html = e.clipboardData?.getData("text/html");
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const src = html ? sourceFromHtml(html) : text;
    document.execCommand("insertHTML", false, toVisual(src, figsRef.current));
    api.emit();
  };
  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "m") { e.preventDefault(); ctx.onFormula?.(api, null); }
  };
  const track = () => {
    api.save();
    const here = nodeEl(sel()?.anchorNode);
    ctx.setInTable(Boolean(here?.closest("td,th") && el.current?.contains(here)));
  };

  return (
    <div className="qb-field">
      <span className="label" id={`lbl-${name}`}>{label}</span>
      <div
        ref={el}
        className={small ? "rich small" : "rich"}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`lbl-${name}`}
        data-ph={placeholder}
        spellCheck
        lang="es"
        onFocus={() => ctx.setActive(api)}
        onInput={api.emit}
        onKeyUp={track}
        onMouseUp={track}
        onBlur={api.save}
        onClick={onClick}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function htmlNode(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content.firstElementChild;
}

// Top-level blocks of the field touched by the selection; loose text at the top level is wrapped in a block first.
function selectedBlocks(root) {
  let run = [];
  const wrap = () => {
    if (!run.length) return;
    const d = document.createElement("div");
    run[0].before(d);
    d.append(...run);
    run = [];
  };
  [...root.childNodes].forEach((n) => {
    if (n.nodeType === 1 && RICH_BLOCK.test(n.tagName)) wrap();
    else run.push(n);
  });
  wrap();
  const s = sel();
  if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  return [...root.children].filter((b) => r.intersectsNode(b));
}

const SYMBOLS = ["≤", "≥", "≠", "≈", "±", "×", "÷", "√", "π", "°", "²", "³", "½", "¼", "∞", "→", "←", "↔", "α", "β", "Δ", "θ", "λ", "μ", "Ω", "%", "€", "—", "¿", "¡"];

// Formatting commands. Each runs on the active field with its caret restored.
export function runCommand(api, cmd) {
  if (!api) return false;
  const root = api.el();
  if (!root) return false;
  api.restore();
  const s = sel();
  const here = nodeEl(s?.anchorNode);
  switch (cmd) {
    case "table": {
      const mark = `t${Date.now()}`;
      document.execCommand("insertHTML", false, `<table class="exam-table" data-new="${mark}"><tbody><tr><th>Columna 1</th><th>Columna 2</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><div><br></div>`);
      const t = root.querySelector(`[data-new="${mark}"]`);
      if (t) {
        t.removeAttribute("data-new");
        const r = document.createRange();
        r.selectNodeContents(t.querySelector("th"));
        s.removeAllRanges();
        s.addRange(r);
      }
      break;
    }
    case "row+": case "row-": case "col+": case "col-": case "deltable": {
      const cell = here?.closest("td,th");
      if (!cell || !root.contains(cell)) return false;
      const tr = cell.parentElement;
      const table = cell.closest("table");
      const k = [...tr.children].indexOf(cell);
      if (cmd === "row+") {
        const n = tr.cloneNode(true);
        n.querySelectorAll("th,td").forEach((c) => { const td = document.createElement("td"); td.innerHTML = "&nbsp;"; c.replaceWith(td); });
        tr.after(n);
      }
      if (cmd === "row-" && table.querySelectorAll("tr").length > 1) tr.remove();
      if (cmd === "col+") table.querySelectorAll("tr").forEach((r) => { const c = r.children[k]; const n = document.createElement(c?.tagName === "TH" ? "th" : "td"); n.innerHTML = "&nbsp;"; if (c) c.after(n); else r.appendChild(n); });
      if (cmd === "col-" && tr.children.length > 1) table.querySelectorAll("tr").forEach((r) => r.children[k]?.remove());
      if (cmd === "deltable") table.remove();
      break;
    }
    case "clear":
      document.execCommand("removeFormat");
      document.execCommand("justifyLeft");
      break;
    case "small": {
      const cur = here?.closest("small");
      if (cur && root.contains(cur)) cur.replaceWith(...cur.childNodes);
      else if (s.rangeCount && !s.isCollapsed) {
        const r = s.getRangeAt(0);
        const sm = document.createElement("small");
        sm.append(r.extractContents());
        r.insertNode(sm);
      }
      break;
    }
    case "fuente": case "cita": case "poema": {
      const blocks = selectedBlocks(root);
      if (!blocks.length) return false;
      const cls = cmd;
      if (blocks.every((b) => b.classList.contains(cls))) {
        blocks.forEach((b) => { const d = document.createElement("div"); d.append(...b.childNodes); b.replaceWith(d); });
      } else {
        const box = document.createElement(cls === "fuente" ? "p" : "div");
        box.className = cls;
        blocks.forEach((b, i) => {
          if (i) box.append(document.createElement("br"));
          box.append(...b.childNodes);
        });
        blocks[0].before(box);
        blocks.forEach((b) => b.remove());
      }
      break;
    }
    case "espacio": {
      const blocks = selectedBlocks(root);
      const sp = htmlNode('<div class="espacio" contenteditable="false"></div>');
      if (blocks.length) blocks[blocks.length - 1].after(sp);
      else root.append(sp);
      break;
    }
    case "hueco":
      document.execCommand("insertHTML", false, `${gapChip("")}&nbsp;`);
      break;
    case "limpiar": {
      const after = cleanText(api.source());
      api.setSource(after);
      return true;
    }
    default:
      if (cmd.startsWith("sym:")) document.execCommand("insertText", false, cmd.slice(4));
      else document.execCommand(cmd, false, null);
  }
  api.save();
  api.emit();
  return true;
}

const B = ({ cmd, title, children, onRun, className = "" }) => (
  <button type="button" className={`qb-tool ${className}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onRun(cmd)}>{children}</button>
);

// The toolbar over the form. `extra` holds the figure menu (it knows the question's figures).
export function Toolbar({ ctx, code, setCode, inTable, activeName, onFormula, onChem, figureMenu }) {
  const [syms, setSyms] = useState(false);
  const run = (cmd) => runCommand(ctx.active.current, cmd);
  return (
    <div className="qb-toolbar" role="toolbar" aria-label="Formato del texto">
      <div className="qb-seg small" role="radiogroup" aria-label="Vista del texto">
        <button type="button" role="radio" aria-checked={!code} className={!code ? "on" : ""} onClick={() => setCode(false)}>Aa Formato</button>
        <button type="button" role="radio" aria-checked={code} className={code ? "on" : ""} onClick={() => setCode(true)}>‹/› Código</button>
      </div>
      {!code && (
        <>
          <B cmd="bold" title="Negrita (Ctrl+B)" onRun={run}><b>B</b></B>
          <B cmd="italic" title="Cursiva (Ctrl+I)" onRun={run}><i>I</i></B>
          <B cmd="underline" title="Subrayado (Ctrl+U)" onRun={run}><u>S</u></B>
          <B cmd="strikeThrough" title="Tachado" onRun={run}><s>T</s></B>
          <B cmd="subscript" title="Subíndice" onRun={run}>x₂</B>
          <B cmd="superscript" title="Superíndice" onRun={run}>x²</B>
          <span className="qb-sep" />
          <B cmd="insertUnorderedList" title="Lista con viñetas" onRun={run}>• Lista</B>
          <B cmd="insertOrderedList" title="Lista numerada" onRun={run}>1. Lista</B>
          <B cmd="justifyLeft" title="Alinear a la izquierda" onRun={run}>⇤</B>
          <B cmd="justifyCenter" title="Centrar" onRun={run}>≡</B>
          <B cmd="justifyRight" title="Alinear a la derecha" onRun={run}>⇥</B>
          <B cmd="justifyFull" title="Justificar" onRun={run}>☰</B>
          <span className="qb-sep" />
          <B cmd="table" title="Tabla" onRun={run}>▦ Tabla</B>
          <button type="button" className="qb-tool" title="Fórmula (Ctrl+M)" onMouseDown={(e) => e.preventDefault()} onClick={onFormula}>ƒx Fórmula</button>
          <button type="button" className="qb-tool" title="Química: fórmulas y reacciones" onMouseDown={(e) => e.preventDefault()} onClick={onChem}>⚗ Química</button>
          <span className="qb-symwrap">
            <button type="button" className="qb-tool" title="Símbolos" aria-expanded={syms} onMouseDown={(e) => e.preventDefault()} onClick={() => setSyms(!syms)}>Ω Símbolo ▾</button>
            {syms && (
              <span className="qb-syms" role="menu">
                {SYMBOLS.map((c) => <button key={c} type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => { run(`sym:${c}`); setSyms(false); }}>{c}</button>)}
              </span>
            )}
          </span>
          <B cmd="hueco" title="Hueco para completar" onRun={run}>▁ Hueco</B>
          {figureMenu}
          <span className="qb-sep" />
          <B cmd="cita" title="Cita (sangría con línea)" onRun={run}>❝ Cita</B>
          <B cmd="poema" title="Poema (respeta los versos)" onRun={run}>Poema</B>
          <B cmd="fuente" title="Fuente del texto (pequeña, a la derecha)" onRun={run}>Fuente</B>
          <B cmd="small" title="Texto más pequeño" onRun={run}>A− Pequeño</B>
          <B cmd="espacio" title="Espacio en blanco" onRun={run}>↕ Espacio</B>
          <B cmd="limpiar" title="Unir líneas cortadas y espacios dobles (texto pegado de un PDF)" onRun={run}>🧹 Limpiar</B>
          <B cmd="clear" title="Quitar formato" onRun={run}>T̸ Quitar formato</B>
          {inTable && (
            <span className="qb-tablebar" aria-label="Tabla">
              <B cmd="row+" title="Agregar fila" onRun={run}>+ Fila</B>
              <B cmd="row-" title="Quitar fila" onRun={run}>− Fila</B>
              <B cmd="col+" title="Agregar columna" onRun={run}>+ Columna</B>
              <B cmd="col-" title="Quitar columna" onRun={run}>− Columna</B>
              <B cmd="deltable" title="Quitar la tabla" onRun={run}>Quitar tabla</B>
            </span>
          )}
        </>
      )}
      <span className="qb-active caption">{activeName ? `Escribiendo en: ${activeName}` : "Haz clic en un campo para escribir"}</span>
    </div>
  );
}

// Puts a formula chip into the active field (or replaces the chip being edited).
export function placeFormula(api, chip, tex) {
  if (!api) return;
  if (chip && api.el()?.contains(chip)) {
    if (!tex) chip.remove();
    else chip.replaceWith(htmlNode(mathChip(tex)));
    api.emit();
    return;
  }
  if (tex) api.insertHtml(`${mathChip(tex)}&nbsp;`);
}

// Puts a figure on its own line at the caret of the active field.
export function placeFigure(api, id, figs) {
  if (!api) return false;
  api.insertHtml(`${figBlock(id, figs)}<div><br></div>`);
  return true;
}
