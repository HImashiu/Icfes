import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { findSheetCorners, frameToGray, readSheetAnyRotation } from "../lib/omr.js";

const SCAN_SIDE = 1600;
const TICK_MS = 200;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 300);
  } catch { /* no audio: the flash is enough */ }
  try { navigator.vibrate?.(60); } catch { /* not every phone vibrates */ }
}

function thumbOf(canvas) {
  const t = document.createElement("canvas");
  const s = 120 / Math.max(canvas.width, canvas.height);
  t.width = Math.max(1, Math.round(canvas.width * s));
  t.height = Math.max(1, Math.round(canvas.height * s));
  t.getContext("2d").drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.6);
}

// Live scanner: the phone camera watches for answer sheets, reads each one as soon as it holds still, and moves on to the next.
// onCapture(read, thumb) is called once per sheet. A sheet counts again only after it left the picture.
export default function LiveScanner({ n, roster, onCapture, onClose }) {
  const videoRef = useRef(null);
  const [state, setState] = useState({ phase: "starting", frame: null, corners: null });
  const [shots, setShots] = useState([]);
  const [flash, setFlash] = useState(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useEffect(() => {
    let stop = false;
    let stream = null;
    let timer = null;
    const canvas = document.createElement("canvas");
    const mem = { armed: true, key: null, streak: 0, miss: 0 };

    const nameOf = (read) => (read.studentIndex != null ? roster[read.studentIndex]?.full_name || roster[read.studentIndex]?.email : null);

    const tick = () => {
      if (stop) return;
      const video = videoRef.current;
      try {
        if (video && video.readyState >= 2 && video.videoWidth) {
          const { gray, w, h } = frameToGray(video, canvas, SCAN_SIDE);
          const corners = findSheetCorners(gray, w, h);
          if (!corners) {
            mem.miss += 1;
            if (mem.miss >= 3) { mem.armed = true; mem.key = null; mem.streak = 0; }
            setState({ phase: "search", frame: [w, h], corners: null });
          } else {
            mem.miss = 0;
            if (!mem.armed) {
              setState({ phase: "done", frame: [w, h], corners });
            } else {
              const read = readSheetAnyRotation(gray, w, h, n);
              const key = read.ok && read.studentIndex != null ? `${read.studentIndex}|${read.answers.join("")}` : null;
              if (key && key === mem.key) mem.streak += 1; else { mem.key = key; mem.streak = key ? 1 : 0; }
              if (mem.streak >= 2) {
                mem.armed = false;
                beep();
                const thumb = thumbOf(canvas);
                const name = nameOf(read);
                setShots((cur) => [...cur.filter((x) => x.read.studentIndex == null || x.read.studentIndex !== read.studentIndex), { id: `${Date.now()}`, thumb, name, read }]);
                setFlash({ name, doubtful: read.flags.filter(Boolean).length, answered: read.answers.filter(Boolean).length, n });
                setTimeout(() => setFlash(null), 1600);
                onCaptureRef.current(read, thumb);
                setState({ phase: "done", frame: [w, h], corners });
              } else {
                setState({ phase: key ? "hold" : "reading", frame: [w, h], corners });
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
      timer = setTimeout(tick, TICK_MS);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch (e) {
        setState({ phase: "error", frame: null, corners: null, message: e?.name === "NotAllowedError" ? "La cámara está bloqueada. Permite el acceso en el navegador, o sube las fotos." : "No pude abrir la cámara de este equipo. Sube las fotos en su lugar." });
      }
    })();

    return () => {
      stop = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [n, roster]);

  const HINT = {
    starting: "Abriendo la cámara…",
    search: "Pon la hoja frente a la cámara, con las cuatro marcas negras visibles",
    reading: "Acerca la hoja y evita sombras: no leo el código del estudiante",
    hold: "Quieta un momento…",
    done: "Listo. Pasa a la siguiente hoja",
  };
  const quad = state.corners && state.frame ? [0, 1, 3, 2].map((i) => state.corners[i].join(",")).join(" ") : null;

  return createPortal(
    <div className="scanner" role="dialog" aria-label="Escáner de hojas">
      <video ref={videoRef} className="scanner-video" playsInline muted />
      {quad && (
        <svg className="scanner-quad" viewBox={`0 0 ${state.frame[0]} ${state.frame[1]}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <polygon points={quad} className={state.phase === "done" ? "ok" : state.phase === "hold" ? "hold" : ""} />
        </svg>
      )}
      <div className="scanner-top">
        <button type="button" className="scanner-close" onClick={onClose} aria-label="Cerrar el escáner"><Icon name="close" size={20} /></button>
        <span className="chip scanner-count"><strong>{shots.length}</strong> {shots.length === 1 ? "hoja" : "hojas"}</span>
      </div>
      {state.phase === "error" ? (
        <div className="scanner-msg error"><Icon name="flag" size={22} /><p>{state.message}</p><button type="button" className="primary" onClick={onClose}>Volver</button></div>
      ) : (
        <div className="scanner-bottom">
          {flash ? (
            <div className="scanner-flash" role="status">
              <span className="scanner-tick"><Icon name="check" size={22} strokeWidth={3} /></span>
              <div><strong>{flash.name ?? "Código fuera de la lista"}</strong><span>{flash.answered} de {flash.n} marcadas{flash.doubtful ? ` · ${flash.doubtful} para revisar` : ""}</span></div>
            </div>
          ) : (
            <p className="scanner-hint" role="status">{HINT[state.phase]}</p>
          )}
          {shots.length > 0 && (
            <div className="scanner-strip">
              {shots.slice(-8).map((s) => (
                <figure key={s.id} className={s.read.flags.some(Boolean) || !s.name ? "warn" : ""}>
                  <img src={s.thumb} alt="" />
                  <figcaption>{s.name ?? "?"}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <button type="button" className="primary scanner-done" onClick={onClose}>{shots.length ? `Terminar · revisar ${shots.length}` : "Cerrar"}</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
