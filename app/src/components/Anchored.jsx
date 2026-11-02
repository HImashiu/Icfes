import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A small panel anchored to a rectangle, closed by a tap outside or Escape.
export default function Anchored({ rect, onClose, className = "", children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = window.innerHeight - rect.bottom - 8;
    const want = below < h && rect.top > below ? rect.top - h - 4 : rect.bottom + 4;
    const top = Math.max(8, Math.min(want, window.innerHeight - h - 8));
    setPos({ top, left });
  }, [rect]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("pointerdown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={`ui-pop hd-menu ${className}`} style={pos ?? { top: rect.bottom + 4, left: rect.left, visibility: "hidden" }}>{children}</div>,
    document.fullscreenElement || document.body,
  );
}

