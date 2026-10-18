import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cropCanvas, linesInBox } from "../../lib/builder/pdfSource.js";
import { FileButton } from "./ui.jsx";

// Left pane: the teacher's PDF or photos, one page at a time. Dragging on the page draws a box; the box's menu
// turns it into an image (a figure, an option) or reads its text into the form, like the admin editor's crop bar.
export default function SourcePane({ doc, page, setPage, anchor, recent, onOpenFiles, onOpenRecent, onForget, onDetect, targets, activeName, onImage, onText, busy, setBusy, notify, pendingTarget }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [zoom, setZoom] = useState("fit");
  const [size, setSize] = useState(null);
  const [box, setBox] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState(false);

  useLayoutEffect(() => {
    const node = wrap.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setWidth(node.clientWidth - 24));
    ro.observe(node);
    setWidth(node.clientWidth - 24);
    return () => ro.disconnect();
  }, [doc]);

  useEffect(() => {
    if (!doc) return undefined;
    let alive = true;
    const p = doc.page(page);
    setBox(null);
    p.size().then((s) => { if (alive) setSize(s); });
    return () => { alive = false; };
  }, [doc, page]);

  const scale = size ? (zoom === "fit" ? Math.max(0.2, width / size.width) : zoom) : 1;
  useEffect(() => {
    if (!doc || !size || !canvas.current) return;
    const dpr = window.devicePixelRatio || 1;
    doc.page(page).render(canvas.current, scale * dpr).catch(() => {});
  }, [doc, page, size, scale]);

  // The question being edited came from this document: its page opens and its box is outlined.
  useEffect(() => {
    if (anchor?.page && doc && anchor.page <= doc.count) setPage(anchor.page);
  }, [anchor?.page, anchor?.box?.y, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const frac = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = frac(e);
    setDrawing({ x0: x, y0: y, x1: x, y1: y });
    setBox(null);
  };
  const move = (e) => { if (drawing) { const [x, y] = frac(e); setDrawing({ ...drawing, x1: x, y1: y }); } };
  const up = () => {
    if (!drawing) return;
    const b = { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) };
    setDrawing(null);
    if (b.w > 0.015 && b.h > 0.008) setBox(b);
  };
  const live = drawing ? { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) } : box;

  const crop = async (target) => {
    const b = box;
    setBox(null);
    const hi = await doc.page(page).hires();
    onImage(target, cropCanvas(hi, b), { page, box: b });
  };
  const read = async (kind) => {
    const b = box;
    setBusy(doc.kind === "pdf" ? "Leyendo el texto…" : "Leyendo con OCR… la primera vez descarga el lector (unos segundos)");
    try {
      const p = doc.page(page);
      let text = linesInBox(await p.textLines(), b);
      if (!text.trim()) {
        setBusy("Esta página es una imagen: leyendo con OCR… la primera vez descarga el lector (unos segundos)");
        text = linesInBox(await p.lines(), b);
      }
      if (!text.trim()) { notify("No encontré texto en el recuadro."); return; }
      setBox(null);
      onText(kind, text, { page, box: b });
    } catch {
      notify("No se pudo leer el texto. Revisa tu conexión: el lector se descarga la primera vez.");
    } finally {
      setBusy("");
    }
  };

  const dropFiles = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) onOpenFiles(files);
  };

  if (!doc) {
    return (
      <div className={drag ? "qb-source empty drag" : "qb-source empty"} ref={wrap} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={dropFiles}>
        <div className="qb-drop">
          <span className="qb-drop-icon" aria-hidden="true">📄</span>
          <h3>Trae tu examen en PDF o en fotos</h3>
          <p className="caption">Ábrelo aquí al lado y arma cada pregunta recortando del documento: el texto se lee solo y las gráficas se recortan con fondo limpio. El archivo se queda en este computador; no se sube a ningún lado.</p>
          <FileButton className="primary" accept="application/pdf,image/*" multiple onFiles={onOpenFiles} label="Abrir PDF o fotos">Abrir PDF o fotos</FileButton>
          <span className="caption">o arrástralo a este recuadro</span>
          {recent?.length > 0 && (
            <div className="qb-recent">
              <span className="label">Recientes</span>
              {recent.map((r) => (
                <span key={r.id} className="qb-recent-row">
                  <button type="button" className="link" onClick={() => onOpenRecent(r)}>{r.name}</button>
                  <button type="button" className="qb-icon" aria-label={`Olvidar ${r.name}`} title="Quitar de recientes" onClick={() => onForget(r)}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const zoomBy = (f) => setZoom((z) => Math.min(4, Math.max(0.3, (z === "fit" ? scale : z) * f)));
  return (
    <div className="qb-source" ref={wrap} onDragOver={(e) => e.preventDefault()} onDrop={dropFiles}>
      <div className="qb-pagebar">
        <button type="button" className="qb-tool" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="caption">pág. <b>{page}</b> de {doc.count}</span>
        <button type="button" className="qb-tool" aria-label="Página siguiente" disabled={page >= doc.count} onClick={() => setPage(page + 1)}>›</button>
        <span className="qb-grow" />
        <button type="button" className="qb-tool" aria-label="Alejar" onClick={() => zoomBy(1 / 1.25)}>−</button>
        <button type="button" className={zoom === "fit" ? "qb-tool on" : "qb-tool"} onClick={() => setZoom("fit")}>Ancho</button>
        <button type="button" className="qb-tool" aria-label="Acercar" onClick={() => zoomBy(1.25)}>+</button>
        <button type="button" className="qb-tool" onClick={onDetect} title="Encuentra las preguntas numeradas del documento y crea una por cada una">⚡ Detectar preguntas</button>
        <FileButton className="qb-tool" accept="application/pdf,image/*" multiple onFiles={onOpenFiles} label="Abrir otro documento">Otro…</FileButton>
      </div>
      <p className="qb-hint caption">{pendingTarget ? `Dibuja un recuadro sobre la imagen de ${pendingTarget.label}.` : "Arrastra sobre la página para recortar una imagen o leer un texto."} <b>{doc.name}</b></p>
      <div className="qb-pagewrap">
        <div className="qb-page" style={size ? { width: size.width * scale, height: size.height * scale } : undefined}>
          <canvas ref={canvas} style={size ? { width: size.width * scale, height: size.height * scale } : undefined} />
          <div className="qb-boxlayer" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrawing(null)} aria-label="Página: arrastra para dibujar un recuadro" />
          {anchor?.page === page && anchor.box && !live && <div className="qb-anchor" style={pct(anchor.box)} aria-hidden="true" />}
          {live && <div className="qb-box" style={pct(live)} />}
          {box && (
            <div className="qb-boxmenu" style={{ left: `${Math.min(box.x * 100, 55)}%`, top: `${(box.y + box.h) * 100}%` }} role="menu" aria-label="Qué hacer con el recuadro">
              <span className="label">Imagen del recuadro en…</span>
              <div className="qb-boxrow">
                {targets.map((t) => <button key={t.id} type="button" className={t.id === pendingTarget?.id ? "qb-tool on" : "qb-tool"} onClick={() => crop(t.id)}>{t.label}</button>)}
              </div>
              <span className="label">Texto del recuadro</span>
              <div className="qb-boxrow">
                <button type="button" className="qb-tool accent" onClick={() => read("field")} disabled={!activeName}>{activeName ? `→ ${activeName}` : "→ (haz clic en un campo)"}</button>
                <button type="button" className="qb-tool" onClick={() => read("options")}>Repartir en A–D</button>
                <button type="button" className="qb-tool" onClick={() => read("question")} title="Texto, enunciado y opciones de una vez">Pregunta completa</button>
                <button type="button" className="qb-tool" onClick={() => read("copy")}>Copiar</button>
                <button type="button" className="qb-icon" aria-label="Cerrar" onClick={() => setBox(null)}>✕</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {busy && <div className="qb-busy" role="status"><span className="qb-spin" aria-hidden="true" />{busy}</div>}
    </div>
  );
}

const pct = (b) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
