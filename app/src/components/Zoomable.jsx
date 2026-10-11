import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A figure that opens full screen when tapped. Pinch, the wheel or the buttons zoom; dragging pans when zoomed.
// `hintOnly` keeps the thumbnail inert (inside an answer option, where a tap selects the option) and shows only "Ampliar".
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const clamp = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export default function Zoomable({ html, src, alt, hintOnly = false, children }) {
  const [open, setOpen] = useState(false);
  const openFull = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " ") openFull(e);
  };

  return (
    <div className="zoomable">
      <div
        className="zoom-thumb"
        onClick={hintOnly ? undefined : openFull}
        onKeyDown={hintOnly ? undefined : onKey}
        role={hintOnly ? undefined : "button"}
        tabIndex={hintOnly ? undefined : 0}
        aria-label={hintOnly ? undefined : `Ampliar ${alt ?? "figura"}`}
      >
        {children}
      </div>
      <span className="zoom-hint" role="button" tabIndex={0} aria-label={`Ampliar ${alt ?? "figura"}`} onClick={openFull} onKeyDown={onKey}>
        ⤢ Ampliar
      </span>
      {open && <Lightbox html={html} src={src} alt={alt} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Lightbox({ html, src, alt, onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setZoom = (next) => {
    const n = clamp(next);
    setScale(n);
    if (n === 1) setPos({ x: 0, y: 0 });
  };
  const zoomBy = (factor) => setZoom(scale * factor);

  const onPointerDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, pos };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinch.current.scale * (dist / pinch.current.dist));
    } else if (drag.current && scale > 1) {
      setPos({ x: drag.current.pos.x + (e.clientX - drag.current.x), y: drag.current.pos.y + (e.clientY - drag.current.y) });
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = pointers.current.values();
      drag.current = { x: p.x, y: p.y, pos };
    } else if (pointers.current.size === 0) {
      drag.current = null;
    }
  };

  return createPortal(
    <div
      className="zoom-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Figura ampliada: ${alt}` : "Figura ampliada"}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="zoom-bar">
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Alejar">−</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Restablecer zoom">{Math.round(scale * 100)}%</button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Acercar">+</button>
        <button type="button" className="zoom-close" onClick={onClose}>Cerrar</button>
      </div>
      <div
        className="zoom-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onDoubleClick={() => setZoom(scale > 1 ? 1 : 2.5)}
      >
        <div className="zoom-art" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}>
          {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <img src={src} alt={alt ?? ""} draggable={false} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
