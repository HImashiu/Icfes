import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BookletPages from "./BookletPages.jsx";
import TeacherKeyPrint from "./TeacherKeyPrint.jsx";
import { BINDINGS, geometry } from "../../lib/bookletLayout.js";
import { imageToDataUrl } from "../../lib/imageFile.js";
import { orderForVersion, versionCounts, versionLabel } from "../../lib/seating.js";
import { FilePicker } from "../Controls.jsx";
import "./booklet.css";

const STORE = "condor.print.v1";
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* private window */ } };
const MM = 96 / 25.4;

function Seg({ value, onChange, options }) {
  return (
    <div className="bks-seg" role="group">
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

// The print studio for a paper simulacro: the typeset cuadernillo (cover with the school's logo, instructions, two
// columns, running heads, page numbers, back cover) for every seating version, and the teacher's key.
// Printing goes through the browser: "Guardar como PDF" gives a vector PDF for a print shop.
export default function BookletStudio({ api = null, bundle, questions, title, course, plan = null, initialDoc = "booklet" }) {
  const [prefs, setPrefs] = useState(() => ({ size: "Carta", binding: "sueltas", ...loadPrefs() }));
  const [doc, setDoc] = useState(initialDoc);
  const [only, setOnly] = useState("all");
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  const [schoolId, setSchoolId] = useState(null);
  const set = (patch) => setPrefs((p) => { const next = { ...p, ...patch }; savePrefs(next); return next; });

  // The school's name and logo come from the school settings when they exist there; a teacher who cannot change those
  // keeps their own copy in this browser.
  useEffect(() => {
    if (!api?.schoolInfo) return;
    let live = true;
    (async () => {
      try {
        const [info, settings] = await Promise.all([api.schoolInfo(), api.schoolSettings?.() ?? null]);
        if (!live) return;
        setSchoolId(info?.id ?? null);
        setPrefs((p) => ({ ...p, schoolName: p.schoolName || settings?.print_school_name || info?.name || "", logo: p.logo || settings?.print_logo || null }));
      } catch { /* offline or demo */ }
    })();
    return () => { live = false; };
  }, [api]);

  const shareSchool = async (patch) => {
    if (!api?.saveSchoolSettings || !schoolId) return;
    try {
      const current = (await api.schoolSettings?.()) ?? {};
      await api.saveSchoolSettings(schoolId, { ...current, ...patch });
    } catch { /* only coordinators can; the copy in this browser is enough */ }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const logo = await imageToDataUrl(file, 600, 0.9);
      set({ logo });
      shareSchool({ print_logo: logo });
    } catch (err) { setError(err.message); }
  };

  const counts = plan ? versionCounts(plan) : null;
  const versions = counts ? counts.map((n, v) => v).filter((v) => counts[v] > 0) : [null];
  const shown = only === "all" ? versions : versions.filter((v) => String(v) === only);
  const sets = useMemo(() => shown.map((v) => ({ v, label: v == null ? null : versionLabel(v), qs: v == null ? questions : orderForVersion(questions, v, plan.orderSeed) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [only, questions, plan]);

  const g = geometry(prefs.size, prefs.binding);
  const keyPaper = prefs.size === "A4" ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
  const pageCss = doc === "key" ? `@page { size: ${keyPaper.w}mm ${keyPaper.h}mm; margin: 14mm 15mm; }` : `@page { size: ${g.sheet.w}mm ${g.sheet.h}mm; margin: 0; }`;

  const fitW = doc === "key" ? keyPaper.w : g.sheet.w;
  // The preview shrinks to the window; printing always uses the real size.
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 8) / (fitW * MM)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitW]);

  const meta = (label) => ({ title, course, version: label, examLabel: bundle.exam.title, schoolName: prefs.schoolName, logo: prefs.logo, size: prefs.size, binding: prefs.binding });
  const laid = shown.every((v) => stats[`${v}|${prefs.size}|${prefs.binding}`]);
  const totals = shown.map((v) => stats[`${v}|${prefs.size}|${prefs.binding}`]).filter(Boolean);
  const pages = totals[0]?.pages;
  const sheets = totals[0]?.sheets;
  const over = totals.reduce((s, t) => s + t.over, 0);

  return (
    <div className="bks">
      <style>{pageCss}</style>
      <div className="bks-panel">
        <div className="bks-field">Imprimir<Seg value={doc} onChange={setDoc} options={[{ value: "booklet", label: "Cuadernillo" }, { value: "key", label: "Clave del docente" }]} /></div>
        <div className="bks-field">Papel<Seg value={prefs.size} onChange={(size) => set({ size })} options={[{ value: "Carta", label: "Carta" }, { value: "A4", label: "A4" }]} /></div>
        {doc === "booklet" && <div className="bks-field">Encuadernación<Seg value={prefs.binding} onChange={(binding) => set({ binding })} options={Object.entries(BINDINGS).map(([value, b]) => ({ value, label: b.label }))} /></div>}
        {versions.length > 1 && <div className="bks-field">Versiones<Seg value={only} onChange={setOnly} options={[{ value: "all", label: "Todas" }, ...versions.map((v) => ({ value: String(v), label: versionLabel(v) }))]} /></div>}
        {doc === "booklet" && (
          <>
            <label>Colegio en la portada
              <input type="text" value={prefs.schoolName ?? ""} placeholder="Nombre del colegio" onChange={(e) => set({ schoolName: e.target.value })} onBlur={(e) => shareSchool({ print_school_name: e.target.value })} />
            </label>
            <div className="bks-field">Logo del colegio
              <div className="bks-logo">
                {prefs.logo && <img src={prefs.logo} alt="Logo del colegio" />}
                <FilePicker accept="image/*" onChange={onLogo} label={prefs.logo ? "Cambiar logo" : "Subir logo"} hint="PNG o JPG" />
                {prefs.logo && <button type="button" className="secondary" onClick={() => set({ logo: null })}>Quitar</button>}
              </div>
            </div>
          </>
        )}
        {error && <p className="bks-hint bks-warn">{error}</p>}
        <p className="bks-hint">
          {doc === "key" ? "La clave va aparte: no la imprimas con los cuadernillos de los estudiantes." : (
            <>
              {BINDINGS[prefs.binding].hint}{" "}
              {laid && pages ? <b>{pages} páginas{g.imposed ? ` en ${sheets} ${sheets === 1 ? "hoja" : "hojas"} ${g.sheet.w > 400 ? (prefs.size === "A4" ? "A3" : "doble carta") : prefs.size === "A4" ? "A4" : "carta"}` : ""} por cuadernillo.</b> : "Diagramando…"}{" "}
              {g.imposed ? "En la impresora elige doble cara, voltear por el borde corto, tamaño real (100 %)." : "En la impresora elige doble cara y tamaño real (100 %)."}{" "}
              Para mandarlo a una imprenta, elige «Guardar como PDF».
              {counts && only === "all" && <> Imprime {versions.map((v) => `${counts[v]} de la ${versionLabel(v)}`).join(", ")}.</>}
              {over > 0 && <span className="bks-warn"> {over === 1 ? "Una página tiene" : `${over} páginas tienen`} una pieza más alta que la columna; revisa la vista previa.</span>}
            </>
          )}
        </p>
      </div>
      <div className="bks-pages" ref={boxRef}>
        <div className="bks-zoom">
          {doc === "key"
            ? sets.map((s) => <TeacherKeyPrint key={s.v ?? "x"} questions={s.qs} bundle={bundle} title={title} course={course} version={s.label} paper={keyPaper} zoom={zoom} />)
            : sets.map((s) => (
              <BookletPages key={`${s.v}|${prefs.size}|${prefs.binding}`} questions={s.qs} figures={bundle.figures} meta={meta(s.label)} zoom={zoom}
                onLaid={(r) => setStats((cur) => ({ ...cur, [`${s.v}|${prefs.size}|${prefs.binding}`]: r }))} />
            ))}
        </div>
      </div>
    </div>
  );
}
