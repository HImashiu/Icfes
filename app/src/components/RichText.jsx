import { useLayoutEffect, useMemo, useRef } from "react";
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

// Renders exam HTML (with math and figure slots) as text, never as raw markup.
export default function RichText({ html, className }) {
  const safe = useMemo(() => renderRich(html), [html]);
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    fitMath(node);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitMath(node)) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [safe]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}
