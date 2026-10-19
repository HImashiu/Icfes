import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { COLORS, COLOR_LABEL, loadLocal, locate, mergeItems, newId, offsetsIn, rangeAt, saveLocal, visible } from "../lib/annotations.js";

// Highlights use the browser's CSS Custom Highlight API, so the exam text is never rewritten and the look is ours.
const SUPPORTED = typeof CSS !== "undefined" && Boolean(CSS.highlights) && typeof Highlight !== "undefined";

const Ctx = createContext(null);
export const useAnnotations = () => useContext(Ctx);

// Wraps the screens where a student reads a question. `api` and `profileId` (optional) also save the items to the account.
export function AnnotationProvider({ slug, profileId = null, api = null, children }) {
  const [items, setItems] = useState(() => loadLocal(profileId, slug));
  const [pop, setPop] = useState(null); // { x, y, mode: "new" | "edit", sel?, id? }
  const rootRef = useRef(null);
  const remoteReady = useRef(false);

  // The items of this booklet, from this browser first and then merged with the account's copy.
  useEffect(() => {
    setItems(loadLocal(profileId, slug));
    remoteReady.current = false;
    if (!api?.myAnnotations || !profileId) return undefined;
    let live = true;
    api.myAnnotations(slug).then((remote) => {
      if (!live) return;
      remoteReady.current = true;
      setItems((cur) => mergeItems(cur, remote ?? []));
    }).catch(() => {});
    return () => { live = false; };
  }, [slug, profileId, api]);

  useEffect(() => {
    saveLocal(profileId, slug, items);
    if (!api?.saveAnnotations || !profileId || !remoteReady.current) return undefined;
    const t = setTimeout(() => api.saveAnnotations(slug, items).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [items, slug, profileId, api]);

  const alive = useMemo(() => visible(items), [items]);
  const upsert = useCallback((item) => setItems((cur) => mergeItems(cur, [{ ...item, at: Date.now() }])), []);
  const remove = useCallback((id) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, gone: true, at: Date.now() } : i))), []);

  // Paint every highlight into the page; repaint when the items change or the text re-renders.
  useEffect(() => {
    if (!SUPPORTED) return undefined;
    const paint = () => {
      const byColor = Object.fromEntries(COLORS.map((c) => [c, []]));
      document.querySelectorAll("[data-ann]").forEach((el) => {
        for (const it of alive) {
          if (it.ann !== el.dataset.ann || !it.text) continue;
          const at = locate(el.textContent, it);
          const range = at && rangeAt(el, at[0], at[1]);
          if (range) (byColor[it.color] ?? byColor.lime).push(range);
        }
      });
      for (const c of COLORS) {
        if (byColor[c].length) CSS.highlights.set(`ann-${c}`, new Highlight(...byColor[c]));
        else CSS.highlights.delete(`ann-${c}`);
      }
    };
    paint();
    let raf = 0;
    const observer = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(raf); COLORS.forEach((c) => CSS.highlights.delete(`ann-${c}`)); };
  }, [alive]);

  // A selection inside one text block opens the colour bar next to it.
  useEffect(() => {
    if (!SUPPORTED) return undefined;
    let timer = 0;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setPop((p) => (p?.mode === "new" ? null : p));
        const range = sel.getRangeAt(0);
        const host = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest?.("[data-ann]");
        if (!host || !host.contains(range.endContainer)) return undefined;
        const [start, end] = offsetsIn(host, range);
        const text = host.textContent.slice(start, end);
        if (!text.trim()) return undefined;
        const rect = range.getBoundingClientRect();
        setPop({ x: rect.left + rect.width / 2, y: rect.bottom, mode: "new", sel: { ann: host.dataset.ann, qkey: host.dataset.annq, start, end, text } });
        return undefined;
      }, 220);
    };
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); clearTimeout(timer); };
  }, []);

  // A tap on a highlight opens it for editing.
  const onClick = (e) => {
    if (!SUPPORTED || !window.getSelection()?.isCollapsed) return;
    const host = e.target.closest?.("[data-ann]");
    if (!host) return;
    const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    const node = caret?.offsetNode;
    if (!node) return;
    const r = document.createRange();
    r.setStart(node, caret.offset);
    r.collapse(true);
    const [at] = offsetsIn(host, r);
    const hit = alive.find((it) => it.ann === host.dataset.ann && it.text && (() => { const l = locate(host.textContent, it); return l && at >= l[0] && at <= l[1]; })());
    if (hit) setPop({ x: e.clientX, y: e.clientY + 14, mode: "edit", id: hit.id });
  };

  const ctx = useMemo(() => ({ items: alive, upsert, remove, supported: SUPPORTED }), [alive, upsert, remove]);
  const close = () => { setPop(null); window.getSelection()?.removeAllRanges(); };
  const current = pop?.mode === "edit" ? alive.find((i) => i.id === pop.id) : null;

  return (
    <Ctx.Provider value={ctx}>
      <div ref={rootRef} style={{ display: "contents" }} onClick={onClick}>{children}</div>
      {pop && (pop.mode === "new" || current) && createPortal(
        <Toolbar pop={pop} current={current} onClose={close} onSave={upsert} onRemove={remove} />,
        document.body,
      )}
    </Ctx.Provider>
  );
}

// Colours, a sticky note and delete. The mouse-down is cancelled so the selection survives the click.
function Toolbar({ pop, current, onClose, onSave, onRemove }) {
  const [note, setNote] = useState(current?.note ?? "");
  const [writing, setWriting] = useState(false);
  const left = Math.max(12, Math.min(window.innerWidth - 292, pop.x - 140));
  const top = Math.min(window.innerHeight - (writing ? 190 : 64), pop.y + 10);
  const base = current ?? { id: newId(), ...pop.sel, color: "lime" };
  const pick = (color) => { onSave({ ...base, color, note: note || base.note }); onClose(); };
  const saveNote = () => { onSave({ ...base, note: note.trim() }); onClose(); };
  return (
    <div className="ann-bar" style={{ left, top }} role="toolbar" aria-label="Resaltar" onMouseDown={(e) => { if (e.target.tagName !== "TEXTAREA") e.preventDefault(); }}>
      <div className="ann-row">
        {COLORS.map((c) => (
          <button key={c} type="button" className={`ann-dot ann-${c}${current?.color === c ? " on" : ""}`} aria-label={`Resaltar en ${COLOR_LABEL[c].toLowerCase()}`} onClick={() => pick(c)} />
        ))}
        <button type="button" className="ann-btn" onClick={() => setWriting(!writing)} aria-expanded={writing}><Icon name="pencil" size={16} /> Nota</button>
        {current && <button type="button" className="ann-btn bad" onClick={() => { onRemove(current.id); onClose(); }}>Quitar</button>}
        <button type="button" className="ann-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={16} /></button>
      </div>
      {writing && (
        <div className="ann-write">
          <textarea autoFocus rows={3} maxLength={400} value={note} placeholder="Escribe tu nota" onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="primary" onClick={saveNote}>Guardar nota</button>
        </div>
      )}
    </div>
  );
}

// Sticky notes of one question (notes on the whole question and notes on highlighted text), with a button to add one.
export function QuestionNotes({ qkey, annPrefix }) {
  const a = useAnnotations();
  const [draft, setDraft] = useState(null); // { id, note } being written
  if (!a) return null;
  const mine = a.items.filter((i) => i.note && (i.qkey === qkey || (i.ann ?? "").startsWith(annPrefix)));
  const save = () => {
    if (draft.note.trim()) {
      const old = a.items.find((i) => i.id === draft.id);
      a.upsert(old ? { ...old, note: draft.note.trim() } : { id: draft.id, ann: null, qkey, color: "amber", note: draft.note.trim() });
    }
    setDraft(null);
  };
  return (
    <div className="q-notes">
      {mine.map((n) => (draft?.id === n.id ? null : (
        <div key={n.id} className={`sticky ann-${n.color}`}>
          {n.text && <q>{n.text.length > 70 ? `${n.text.slice(0, 70)}…` : n.text}</q>}
          <p>{n.note}</p>
          <span className="sticky-actions">
            <button type="button" className="link" onClick={() => setDraft({ id: n.id, note: n.note })}>Editar</button>
            <button type="button" className="link" onClick={() => a.remove(n.id)}>Quitar</button>
          </span>
        </div>
      )))}
      {draft ? (
        <div className="sticky editing">
          <textarea autoFocus rows={3} maxLength={400} value={draft.note} placeholder="Escribe tu nota" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <span className="sticky-actions"><button type="button" className="primary" onClick={save}>Guardar</button><button type="button" className="link" onClick={() => setDraft(null)}>Cancelar</button></span>
        </div>
      ) : (
        <button type="button" className="link add-note" onClick={() => setDraft({ id: newId(), note: "" })}><Icon name="plus" size={14} /> Agregar nota</button>
      )}
    </div>
  );
}
