import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cleanGlossary, findTerms } from "../lib/glossary.js";

const Ctx = createContext(null);
export const useGlossary = () => useContext(Ctx);

// Marks the glossary words inside `root` (text nodes only, never inside math) as tappable terms.
export function markTerms(root, glossary) {
  root.querySelectorAll(".def-term").forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
  root.normalize();
  if (!glossary?.length) return;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(".katex, .gap, .gap-fill, script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    const hits = findTerms(node.data, glossary);
    for (const h of hits.reverse()) {
      const tail = node.splitText(h.end);
      const mid = node.splitText(h.start);
      const span = document.createElement("span");
      span.className = "def-term";
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.dataset.def = h.def;
      mid.replaceWith(span);
      span.append(mid);
      void tail;
    }
  }
}

// Provides the teacher's word list to the question text and shows the definition when a word is tapped.
export function GlossaryProvider({ glossary, children }) {
  const list = useMemo(() => cleanGlossary(glossary), [glossary]);
  const [pop, setPop] = useState(null);
  useEffect(() => {
    if (!list.length) return undefined;
    const open = (el) => { const r = el.getBoundingClientRect(); setPop({ x: r.left + r.width / 2, y: r.bottom, term: el.textContent, def: el.dataset.def }); };
    const onClick = (e) => { const t = e.target.closest?.(".def-term"); if (t) open(t); else setPop(null); };
    const onKey = (e) => { if (e.key === "Escape") setPop(null); if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("def-term")) { e.preventDefault(); open(e.target); } };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, [list]);
  return (
    <Ctx.Provider value={list.length ? list : null}>
      {children}
      {pop && createPortal(
        <div className="def-pop" role="status" style={{ left: Math.max(12, Math.min(window.innerWidth - 272, pop.x - 130)), top: Math.min(window.innerHeight - 140, pop.y + 8) }}>
          <strong>{pop.term}</strong>
          <p>{pop.def}</p>
          <span className="caption">Definición de tu docente</span>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}
