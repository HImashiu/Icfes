import { Fragment, useLayoutEffect, useMemo, useRef } from "react";
import { renderRich } from "../lib/render.js";

// A formula stays on one line: one wider than its column is drawn with a smaller font, down to half size.
// Same rule as the editor (icfes_admin fitMath); the room is the nearest block ancestor's content width less 8px.
function fitMath(root) {
  if (!root) return;
  root.querySelectorAll(".katex").forEach((k) => {
    k.style.fontSize = "";
    let host = k.parentElement;
    while (host && getComputedStyle(host).display.startsWith("inline")) host = host.parentElement;
    if (!host) return;
    const cs = getComputedStyle(host);
    const room = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 8;
    if (room <= 0) return;
    // The width does not scale exactly with the type (rules, spacing), so it is measured again after each step.
    let scale = 1;
    let tooWide = Infinity;
    for (let i = 0; i < 5; i++) {
      const wide = k.getBoundingClientRect().width;
      if (wide > room) {
        tooWide = scale;
        scale = Math.max(0.5, (scale * room / wide) * 0.98);
      } else if (wide < room * 0.95 && scale < 1 && scale < tooWide * 0.99) {
        scale = Math.min(1, tooWide * 0.99, (scale * room / wide) * 0.98);
      } else {
        break;
      }
      k.style.fontSize = scale === 1 ? "" : `${scale.toFixed(3)}em`;
      if (scale === 0.5) break;
    }
  });
}

// A figure the editor placed in the text: [[figura:ID]] on a line of its own (the paragraph tags are optional).
const FIGURE_TOKEN = /(?:<p>\s*)?\[\[figura:([^\]\s]+)\]\](?:\s*<\/p>)?/g;
function splitFigureTokens(source) {
  const html = source ?? "";
  const parts = [];
  let last = 0;
  for (const m of html.matchAll(FIGURE_TOKEN)) {
    parts.push({ text: html.slice(last, m.index) });
    parts.push({ id: m[1] });
    last = m.index + m[0].length;
  }
  parts.push({ text: html.slice(last) });
  return parts;
}

// Renders exam HTML (with math and figure slots) as text, never as raw markup.
// With `resolve` (an id to element function), each [[figura:ID]] token is drawn in place of its text.
export default function RichText({ html, className, resolve }) {
  const parts = useMemo(() => (resolve ? splitFigureTokens(html) : null), [html, resolve]);
  const inline = Boolean(parts?.some((p) => p.id));
  const safe = useMemo(() => (inline ? "" : renderRich(html)), [html, inline]);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    fitMath(node);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitMath(node)) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [safe, inline]);
  if (inline) {
    return (
      <div ref={ref} className={className}>
        {parts.map((p, i) => (p.id ? <Fragment key={i}>{resolve(p.id)}</Fragment> : p.text.trim() ? <RichText key={i} html={p.text} /> : null))}
      </div>
    );
  }
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
