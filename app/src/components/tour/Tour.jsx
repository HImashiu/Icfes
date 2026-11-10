import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon.jsx";
import Mascot from "../Mascot.jsx";
import "./tour.css";

// A guided tutorial: a card that walks through the real screen, step by step. A step can move the app first
// (`route`, handed to `navigate`), point at an element marked with data-tour="<target>" (the first visible one),
// and list every function that lives there (`bullets`), so nothing the school pays for is left unexplained.
// Used by every section of the teacher panel, the student app and the booklet print studio.

const seenKey = (scope, uid, id) => `condor:tour:${scope}:${uid ?? "anon"}:${id}`;
const anyKey = (scope, id) => `condor:tour:${scope}:*:${id}`;
export function tourSeen(scope, uid, id) {
  try { return localStorage.getItem(seenKey(scope, uid, id)) === "1" || localStorage.getItem(anyKey(scope, id)) === "1"; }
  catch { return true; } // storage blocked: never nag
}
export function markTourSeen(scope, uid, id) {
  try { localStorage.setItem(seenKey(scope, uid, id), "1"); localStorage.setItem(anyKey(scope, id), "1"); } catch { /* storage blocked */ }
}

export function findTarget(name) {
  if (!name || typeof document === "undefined") return null;
  for (const n of String(name).split("|")) {
    for (const el of document.querySelectorAll(`[data-tour="${n}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

const CARD_W = 380;
const PAD = 6;
const PHONE = 640;

// steps: [{ id, title, text, bullets?, target?, route?, owl?, final?, extra? }]
export default function Tour({ steps, label = "Tutorial", navigate = null, onClose, start = 0 }) {
  const [i, setI] = useState(Math.min(start, steps.length - 1));
  const [hole, setHole] = useState(null);
  const [pos, setPos] = useState(null);
  const card = useRef(null);
  const step = steps[i] ?? steps[0];
  const last = i === steps.length - 1;

  const place = useCallback(() => {
    const el = findTarget(step.target);
    const vw = window.innerWidth, vh = window.innerHeight;
    const h = card.current?.offsetHeight ?? 260;
    const phone = vw < PHONE;
    const w = phone ? vw - 16 : Math.min(CARD_W, vw - 24);
    if (!el) { setHole(null); setPos(phone ? { left: 8, top: Math.max(8, vh - h - 8), w, side: "sheet" } : { left: (vw - w) / 2, top: Math.max(12, (vh - h) / 2), w, side: "center" }); return; }
    const r = el.getBoundingClientRect();
    // A target taller than the screen (a whole page section) is outlined only where it shows.
    const top = Math.max(r.top, 4), bottom = Math.min(r.bottom, vh - 4);
    setHole({ top: top - PAD, left: Math.max(2, r.left - PAD), width: Math.min(vw - 4, r.width + PAD * 2), height: Math.max(0, bottom - top) + PAD * 2 });
    if (phone) {
      // A bottom sheet, moved to the top when the target sits in the lower half.
      const below = (top + bottom) / 2 < vh / 2;
      setPos({ left: 8, top: below ? Math.max(8, vh - h - 8) : 8, w, side: "sheet" });
      return;
    }
    const clampX = (x) => Math.max(12, Math.min(x, vw - w - 12));
    const clampY = (y) => Math.max(12, Math.min(y, vh - h - 12));
    let left, y, side;
    if (r.right + 16 + w <= vw - 12 && r.width < vw / 2) { left = r.right + 16; y = clampY((top + bottom) / 2 - h / 2); side = "right"; }
    else if (r.left - 16 - w >= 12 && r.width < vw / 2) { left = r.left - 16 - w; y = clampY((top + bottom) / 2 - h / 2); side = "left"; }
    else if (vh - bottom - 16 >= h) { left = clampX(r.left + r.width / 2 - w / 2); y = bottom + 14; side = "below"; }
    else if (top - 16 >= h) { left = clampX(r.left + r.width / 2 - w / 2); y = top - h - 14; side = "above"; }
    else { left = vw - w - 12; y = clampY(vh - h - 12); side = "corner"; }
    setPos({ left, top: y, w, side });
  }, [step.target]);

  // Move the app first, then wait (up to 1.5 s) for the element the step points at.
  useLayoutEffect(() => {
    if (step.route && navigate) navigate(step.route);
    let tries = 0;
    let timer;
    const look = () => {
      const el = findTarget(step.target);
      if (el || !step.target || tries > 15) {
        el?.scrollIntoView?.({ block: "center", inline: "nearest" });
        place();
        timer = setTimeout(place, 80);
        return;
      }
      tries += 1;
      place();
      timer = setTimeout(look, 100);
    };
    look();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [place]);
  useEffect(() => { card.current?.focus({ preventScroll: true }); if (card.current) card.current.scrollTop = 0; }, [i]);

  const finish = useCallback((done) => onClose?.(done), [onClose]);
  const nextStep = useCallback(() => (last ? finish(true) : setI((n) => n + 1)), [last, finish]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") finish(false);
      else if (e.key === "ArrowRight") nextStep();
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [finish, nextStep]);

  const count = steps.length;
  return createPortal(
    <div className={hole ? "ob-tour" : "ob-tour dim"} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      {hole && <div className="ob-hole" style={hole} aria-hidden="true" />}
      <div ref={card} tabIndex={-1} key={step.id} className={`ob-card ${pos?.side ?? "center"} ${step.final ? "final" : ""} ${step.owl ? "owl" : ""}`}
        style={pos ? { left: pos.left, top: pos.top, width: pos.w } : { visibility: "hidden" }}>
        <button type="button" className="icon-btn ob-x" aria-label="Cerrar el tutorial" onClick={() => finish(false)}><Icon name="x" size={16} /></button>
        {step.owl && <Mascot pose={step.owl} size={step.final ? 60 : 72} />}
        <span className="caption ob-count">{label}{count > 1 ? ` · ${i + 1} de ${count}` : ""}</span>
        <h2 id="ob-title">{step.title}</h2>
        {step.text && <p>{step.text}</p>}
        {step.bullets?.length > 0 && (
          <ul className="ob-bullets">
            {step.bullets.map((b) => {
              const [head, ...rest] = String(b).split(": ");
              return <li key={b}><Icon name="check" size={13} strokeWidth={3.2} /><span>{rest.length ? <><b>{head}</b>: {rest.join(": ")}</> : b}</span></li>;
            })}
          </ul>
        )}
        {step.extra}
        <div className="ob-foot">
          {count > 1 && count <= 12 && <span className="ob-dots" aria-hidden="true">{steps.map((st, k) => <span key={st.id} className={k === i ? "on" : k < i ? "past" : ""} />)}</span>}
          {count > 12 && <span className="ob-bar" aria-hidden="true"><span style={{ width: `${((i + 1) / count) * 100}%` }} /></span>}
          {i === 0 && !last && <button type="button" className="link" onClick={() => finish(false)}>Ahora no</button>}
          {i > 0 && <button type="button" className="secondary" onClick={() => setI(i - 1)}>Atrás</button>}
          <button type="button" className="primary" onClick={nextStep}>{last ? "Entendido" : i === 0 ? "Empezar" : "Siguiente"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The "?" next to a screen's title: replays that screen's tutorial.
export function TourButton({ onClick, label = "Tutorial de esta sección", className = "" }) {
  return (
    <button type="button" className={`ob-help ${className}`} onClick={onClick} aria-label={label} title={label} data-tour="help">
      <span aria-hidden="true">?</span>
    </button>
  );
}
