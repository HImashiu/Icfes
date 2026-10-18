import { useEffect, useRef, useState } from "react";
import { encodeCrop, trimWhite, whiten } from "../../lib/builder/pdfSource.js";
import { Dialog, Segmented, Toggle } from "./ui.jsx";

// The crop clean-up of the admin editor: a white background that drops scan grey and show-through, a brush that
// covers stray marks (a question number, a bit of the next column), and trimmed margins. Enter keeps the image.
export default function CropDialog({ source, target, onDone, onClose }) {
  const canvas = useRef(null);
  const [bg, setBg] = useState("white");
  const [level, setLevel] = useState(205);
  const [brush, setBrush] = useState(false);
  const [size, setSize] = useState(18);
  const [trim, setTrim] = useState(true);
  const history = useRef([]);
  const strokes = useRef(null);

  // The picture is redrawn from the original whenever the background changes; brush strokes are replayed on top.
  const redraw = () => {
    const cv = canvas.current;
    if (!cv) return;
    cv.width = source.width;
    cv.height = source.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(source, 0, 0);
    if (bg === "white") ctx.putImageData(whiten(ctx.getImageData(0, 0, cv.width, cv.height), level), 0, 0);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineCap = ctx.lineJoin = "round";
    for (const s of history.current) {
      ctx.lineWidth = s.r * 2;
      ctx.beginPath();
      ctx.moveTo(...s.pts[0]);
      s.pts.forEach((p) => ctx.lineTo(...p));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      ctx.stroke();
    }
  };
  useEffect(redraw, [source, bg, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e) => {
    const cv = canvas.current;
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
  };
  const down = (e) => {
    if (!brush) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cv = canvas.current;
    const r = size * (cv.width / cv.getBoundingClientRect().width) / 2;
    strokes.current = { r, pts: [at(e)] };
    history.current.push(strokes.current);
    redraw();
  };
  const move = (e) => {
    if (!strokes.current) return;
    strokes.current.pts.push(at(e));
    redraw();
  };
  const up = () => { strokes.current = null; };
  const undo = () => { history.current.pop(); redraw(); };

  const done = () => {
    const out = trim ? trimWhite(canvas.current) : canvas.current;
    onDone(encodeCrop(out));
  };
  useEffect(() => {
    const key = (e) => { if (e.key === "Enter" && !e.target.closest?.("input,textarea,[contenteditable]")) { e.preventDefault(); done(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  return (
    <Dialog title={`Imagen para ${target}`} onClose={onClose} wide>
      <div className="qb-croptools">
        <Segmented label="Fondo" value={bg} onChange={setBg} options={[{ value: "white", label: "✨ Fondo blanco" }, { value: "original", label: "Original" }]} />
        {bg === "white" && (
          <span className="qb-stepper" aria-label="Qué tan claro se vuelve blanco">
            <button type="button" className="qb-tool" onClick={() => setLevel((v) => Math.min(250, v + 10))} title="Limpia menos (conserva grises claros)">− Menos</button>
            <span className="caption">Limpieza {Math.round(((255 - level) / 100) * 100)}%</span>
            <button type="button" className="qb-tool" onClick={() => setLevel((v) => Math.max(120, v - 10))} title="Limpia más (borra grises)">+ Más</button>
          </span>
        )}
        <Toggle on={brush} onChange={setBrush}>🖌 Tapar con blanco</Toggle>
        {brush && <Segmented label="Grosor" value={size} onChange={setSize} options={[{ value: 8, label: "Fino" }, { value: 18, label: "Medio" }, { value: 40, label: "Grueso" }]} />}
        <button type="button" className="qb-tool" onClick={undo}>↶ Deshacer</button>
        <Toggle on={trim} onChange={setTrim}>✂ Recortar bordes blancos</Toggle>
      </div>
      <div className={brush ? "qb-cropview brush" : "qb-cropview"}>
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Imagen recortada" />
      </div>
      <div className="report-actions">
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" onClick={done}>Usar imagen (Enter)</button>
      </div>
    </Dialog>
  );
}
