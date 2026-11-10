import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BookletPages, { AnswerPage, typeVars } from "./BookletPages.jsx";
import TeacherKeyPrint from "./TeacherKeyPrint.jsx";
import { areasOf } from "./bookletFlow.jsx";
import { BINDINGS, PAPER, geometry } from "../../lib/bookletLayout.js";
import { DEFAULT_STYLE, FONTS, FONT_SIZES, PRESETS, WORK_SPACE, canFold, cleanStyle, presetOf } from "../../lib/bookletStyle.js";
import { imageToDataUrl } from "../../lib/imageFile.js";
import { orderForVersion, versionCounts, versionLabel } from "../../lib/seating.js";
import { FilePicker, Select } from "../Controls.jsx";
import Icon from "../Icon.jsx";
import Tour, { TourButton, markTourSeen, tourSeen } from "../tour/Tour.jsx";
import { studioTour } from "../../lib/tours.jsx";
import "./booklet.css";

const STORE = "condor.print.v2";
const OLD_STORE = "condor.print.v1";
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const loadPrefs = () => {
  const saved = read(STORE);
  if (saved) return saved;
  const old = read(OLD_STORE) ?? {};
  return { style: old.size || old.binding ? { size: old.size, binding: old.binding } : null, schoolName: old.schoolName, logo: old.logo };
};
const savePrefs = (p) => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* private window */ } };
const MM = 96 / 25.4;
const fmtMm = (n) => String(n).replace(".", ",");

function Seg({ value, onChange, options, label }) {
  return (
    <div className="bks-seg" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.value)} type="button" aria-pressed={value === o.value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

function Check({ checked, onChange, children, disabled, note }) {
  return (
    <label className={`check-row bks-check${disabled ? " off" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}{note && <span className="bks-note">{note}</span>}</span>
    </label>
  );
}

const TABS = [
  { value: "plantilla", label: "Tipo de cuadernillo", icon: "grid" },
  { value: "papel", label: "Papel", icon: "print" },
  { value: "pagina", label: "Página", icon: "panel" },
  { value: "letra", label: "Letra", icon: "pencil" },
  { value: "portada", label: "Portada", icon: "image" },
  { value: "bordes", label: "Encabezado y pie", icon: "sliders" },
];

// The print studio for a cuadernillo: the typeset booklet (cover with the school's logo, instructions, columns,
// running heads, page numbers, back cover) for every seating version, a hand-graded answer sheet and the teacher's key.
// The teacher chooses paper, binding, one or two sides, margins, type, columns, cover and running heads, starts from a
// template, and a coordinator can save the result as the school's format. Printing goes through the browser:
// «Guardar como PDF» gives a vector PDF for a print shop.
export default function BookletStudio({ api = null, bundle, questions, title, course, plan = null, initialDoc = "booklet", answerSheets = true }) {
  const [prefs, setPrefs] = useState(() => {
    const p = loadPrefs();
    return { schoolName: p.schoolName ?? "", logo: p.logo ?? null, style: cleanStyle(p.style ?? DEFAULT_STYLE), local: Boolean(p.style) };
  });
  const style = prefs.style;
  const [doc, setDoc] = useState(initialDoc);
  const [tab, setTab] = useState("plantilla");
  const [only, setOnly] = useState("all");
  const [part, setPart] = useState("all");
  const [reverseBacks, setReverseBacks] = useState(false);
  const [error, setError] = useState(null);
  // The first time a teacher opens the print studio, its tutorial walks through it (replay with «?»).
  const [tour, setTour] = useState(() => !tourSeen("docente", null, "estudio"));
  const [notice, setNotice] = useState(null);
  const [stats, setStats] = useState({});
  const [schoolId, setSchoolId] = useState(null);
  const [schoolStyle, setSchoolStyle] = useState(null);
  const update = (fn) => setPrefs((p) => { const next = fn(p); savePrefs({ style: next.style, schoolName: next.schoolName, logo: next.logo }); return next; });
  const set = (patch) => update((p) => ({ ...p, ...patch }));
  const setStyle = (patch) => update((p) => ({ ...p, style: cleanStyle({ ...p.style, ...patch }), local: true }));

  // The school's name, logo and print format come from the school settings when they exist there; a teacher who
  // cannot change those keeps their own copy in this browser.
  useEffect(() => {
    if (!api?.schoolInfo) return;
    let live = true;
    (async () => {
      try {
        const [info, settings] = await Promise.all([api.schoolInfo(), api.schoolSettings?.() ?? null]);
        if (!live) return;
        setSchoolId(info?.id ?? null);
        const shared = settings?.print_style ? cleanStyle(settings.print_style) : null;
        setSchoolStyle(shared);
        setPrefs((p) => ({
          ...p,
          schoolName: p.schoolName || settings?.print_school_name || info?.name || "",
          logo: p.logo || settings?.print_logo || null,
          style: !p.local && shared ? shared : p.style,
        }));
      } catch { /* offline or demo */ }
    })();
    return () => { live = false; };
  }, [api]);

  const shareSchool = async (patch) => {
    if (!api?.saveSchoolSettings || !schoolId) return false;
    try {
      const current = (await api.schoolSettings?.()) ?? {};
      await api.saveSchoolSettings(schoolId, { ...current, ...patch });
      return true;
    } catch { return false; /* only coordinators can; the copy in this browser is enough */ }
  };

  const saveSchoolFormat = async () => {
    setNotice(null);
    const ok = await shareSchool({ print_style: style });
    if (ok) { setSchoolStyle(style); setNotice("Guardado como formato del colegio: los demás docentes lo verán al imprimir."); }
    else setNotice("Solo coordinación puede guardar el formato del colegio. Este formato queda guardado en este navegador.");
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

  const g = geometry(style);
  const paper = PAPER[style.size];
  const pageCss = doc === "key" ? `@page { size: ${paper.w}mm ${paper.h}mm; margin: 14mm 15mm; }`
    : doc === "answers" ? `@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }`
    : `@page { size: ${g.sheet.w}mm ${g.sheet.h}mm; margin: 0; }`;

  const fitW = doc === "booklet" ? g.sheet.w : paper.w;
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

  const meta = (label) => ({ title, course, version: label, examLabel: bundle.exam.title, schoolName: prefs.schoolName, logo: prefs.logo });
  const styleKey = JSON.stringify(style);
  const statKey = (v) => String(v);
  const laid = shown.every((v) => stats[statKey(v)]);
  const totals = shown.map((v) => stats[statKey(v)]).filter(Boolean);
  const pages = totals[0]?.pages;
  const sheets = totals[0]?.sheets;
  const over = totals.reduce((s, t) => s + t.over, 0);
  const chosen = presetOf(style);
  const isSchool = schoolStyle && JSON.stringify(schoolStyle) === styleKey;
  const docs = [{ value: "booklet", label: "Cuadernillo" }, ...(answerSheets ? [{ value: "answers", label: "Hoja de respuestas" }] : []), { value: "key", label: "Clave del docente" }];

  // One line under each option in the side list, so the current choice shows without opening it.
  const preset = PRESETS.find((p) => p.id === chosen);
  const summary = (t) => ({
    plantilla: isSchool ? "Formato del colegio" : preset ? preset.label : "Personalizado",
    papel: `${style.size} · ${BINDINGS[style.binding].label}${style.binding === "sueltas" ? (style.sides === "duplex" ? " · doble cara" : " · una cara") : ""}`,
    pagina: `${g.cols === 2 ? "Dos columnas" : "Una columna"} · márgenes ${{ estrecho: "estrechos", normal: "normales", amplio: "amplios", custom: "a medida" }[style.margins]}`,
    letra: `${FONTS[style.font]?.label ?? ""} ${fmtMm(style.fontSize)} pt`,
    portada: { full: "Página completa", header: "Arriba de la página 1", none: "Sin portada" }[style.cover],
    bordes: style.head ? "Con encabezado" : "Sin encabezado",
  })[t];

  const printerHint = g.imposed
    ? `En la impresora: papel ${g.sheetLabel}, horizontal, doble cara volteando por el borde corto, tamaño real (100 %). Dobla el paquete por la mitad y grapa en el lomo.`
    : g.duplex
      ? `En la impresora: papel ${g.sheetLabel}, doble cara volteando por el borde largo, tamaño real (100 %). Grapa en la esquina superior izquierda.`
      : `En la impresora: papel ${g.sheetLabel}, una sola cara, tamaño real (100 %).`;

  return (
    <div className="bks">
      <style>{pageCss}</style>
      <aside className="bks-panel">
        <div className="bks-top">
          <div className="bks-field" data-tour="bks-doc">Imprimir<Seg label="Qué imprimir" value={doc} onChange={setDoc} options={docs} /></div>
          <TourButton label="Cómo funciona el cuadernillo" onClick={() => setTour(true)} />
        </div>
        {versions.length > 1 && <div className="bks-field" data-tour="bks-versions">Versiones<Seg label="Versiones" value={only} onChange={setOnly} options={[{ value: "all", label: "Todas" }, ...versions.map((v) => ({ value: String(v), label: versionLabel(v) }))]} /></div>}

        {doc === "booklet" && (
          <>
            <div className="bks-cfg" data-tour="bks-cfg">
              <div className="bks-rail" role="tablist" aria-label="Opciones del cuadernillo" aria-orientation="vertical" data-tour="bks-rail">
                {TABS.map((t) => (
                  <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={tab === t.value ? "on" : ""} onClick={() => setTab(t.value)}>
                    <Icon name={t.icon} size={18} strokeWidth={2.4} />
                    <span className="bks-rail-text"><strong>{t.label}</strong><span>{summary(t.value)}</span></span>
                  </button>
                ))}
              </div>
              <div className="bks-opts" role="tabpanel" data-tour="bks-opts">
            {tab === "plantilla" && (
              <>
            <div className="bks-field">Elige un punto de partida; luego ajusta cada detalle en las demás opciones.
                  <div className="bks-presets">
                    {PRESETS.map((p) => (
                      <button key={p.id} type="button" className="bks-preset" aria-pressed={chosen === p.id} onClick={() => setStyle({ ...p.style, binding: p.style.binding === "plegado" && !canFold(style.size) ? "sueltas" : p.style.binding })}>
                        <strong>{p.label}</strong><span>{p.note}</span>
                      </button>
                    ))}
                    {schoolStyle && (
                      <button type="button" className="bks-preset" aria-pressed={Boolean(isSchool)} onClick={() => setStyle(schoolStyle)}>
                        <strong>Formato del colegio</strong><span>El que guardó coordinación</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            {tab === "papel" && (
              <>
                <div className="bks-field">Tamaño del papel<Seg label="Tamaño" value={style.size} onChange={(size) => setStyle({ size })} options={[{ value: "Carta", label: "Carta" }, { value: "A4", label: "A4" }, { value: "Oficio", label: "Oficio" }]} /></div>
                <div className="bks-field">Encuadernación
                  <Seg label="Encuadernación" value={style.binding} onChange={(binding) => setStyle({ binding })}
                    options={Object.entries(BINDINGS).map(([value, b]) => ({ value, label: b.label, disabled: value === "plegado" && !canFold(style.size), title: value === "plegado" && !canFold(style.size) ? "No hay hoja doble oficio: usa carta o A4" : b.hint }))} />
                  <span className="bks-note">{BINDINGS[style.binding].hint}</span>
                </div>
                {style.binding === "sueltas" && (
                  <div className="bks-field">Caras<Seg label="Caras" value={style.sides} onChange={(sides) => setStyle({ sides })} options={[{ value: "duplex", label: "Doble cara" }, { value: "simplex", label: "Una cara" }]} />
                    <span className="bks-note">{style.sides === "duplex" ? "Márgenes en espejo y páginas pares e impares, como un libro." : "Cada página en su propia hoja, sin páginas en blanco."}</span></div>
                )}
                <div className="bks-field">Tinta<Seg label="Tinta" value={style.color} onChange={(color) => setStyle({ color })} options={[{ value: false, label: "Blanco y negro" }, { value: true, label: "A color" }]} />
                  {style.color && <span className="bks-note">Portada y títulos de área con el color de cada prueba.</span>}</div>
              </>
            )}
            {tab === "pagina" && (
              <>
                <div className="bks-field">Márgenes<Seg label="Márgenes" value={style.margins} onChange={(margins) => setStyle({ margins, custom: margins === "custom" ? { ...g.margins } : style.custom })}
                  options={[{ value: "estrecho", label: "Estrechos" }, { value: "normal", label: "Normales" }, { value: "amplio", label: "Amplios" }, { value: "custom", label: "A medida" }]} />
                  {style.margins === "custom" ? (
                    <div className="bks-margins">
                      {[["top", "Arriba"], ["bottom", "Abajo"], ["inner", g.duplex ? "Interior" : "Izquierda"], ["outer", g.duplex ? "Exterior" : "Derecha"]].map(([k, l]) => (
                        <label key={k}>{l}<span className="bks-mm"><input type="number" min="6" max="40" step="1" value={style.custom[k]} onChange={(e) => setStyle({ custom: { ...style.custom, [k]: e.target.value } })} />mm</span></label>
                      ))}
                    </div>
                  ) : <span className="bks-note">Arriba {fmtMm(g.margins.top)}, abajo {fmtMm(g.margins.bottom)}, {g.duplex ? "interior" : "izquierda"} {fmtMm(g.margins.inner)}, {g.duplex ? "exterior" : "derecha"} {fmtMm(g.margins.outer)} mm.</span>}
                </div>
                <div className="bks-field">Columnas<Seg label="Columnas" value={style.cols} onChange={(cols) => setStyle({ cols })} options={[{ value: "auto", label: g.small ? "Automático (1)" : "Automático (2)" }, { value: 1, label: "Una" }, { value: 2, label: "Dos" }]} />
                  {g.cols === 2 && <Check checked={style.colRule} onChange={(colRule) => setStyle({ colRule })}>Línea entre columnas</Check>}</div>
                <div className="bks-field">Cada prueba<Seg label="Cada prueba" value={style.areaBreak} onChange={(areaBreak) => setStyle({ areaBreak })} options={[{ value: "page", label: "Empieza en página nueva" }, { value: "flow", label: "Sigue donde va" }]} />
                  {style.areaBreak === "page" && g.duplex && <Check checked={style.areaRecto} onChange={(areaRecto) => setStyle({ areaRecto })} note="Como los libros: agrega una página en blanco cuando hace falta.">Siempre en página derecha</Check>}</div>
              </>
            )}
            {tab === "letra" && (
              <>
                <label className="bks-field">Fuente
                  <Select value={style.font} onChange={(font) => setStyle({ font })} aria-label="Fuente" options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))} />
                </label>
                <label className="bks-field">Tamaño de la letra
                  <Select value={String(style.fontSize)} onChange={(v) => setStyle({ fontSize: Number(v) })} aria-label="Tamaño de la letra" options={FONT_SIZES.map((n) => ({ value: String(n), label: `${fmtMm(n)} pt` }))} />
                </label>
                <div className="bks-field">Interlineado<Seg label="Interlineado" value={style.leading} onChange={(leading) => setStyle({ leading })} options={[{ value: "compacto", label: "Compacto" }, { value: "normal", label: "Normal" }, { value: "amplio", label: "Amplio" }]} /></div>
                <div className="bks-field">Espacio entre preguntas<Seg label="Espacio entre preguntas" value={style.spacing} onChange={(spacing) => setStyle({ spacing })} options={[{ value: "compacto", label: "Poco" }, { value: "normal", label: "Normal" }, { value: "amplio", label: "Mucho" }]} /></div>
                <label className="bks-field">Espacio para operaciones en Matemáticas
                  <Select value={String(style.workSpace)} onChange={(v) => setStyle({ workSpace: Number(v) })} aria-label="Espacio para operaciones" options={WORK_SPACE.map((n) => ({ value: String(n), label: n ? `${n} mm debajo de cada pregunta` : "Sin espacio extra" }))} />
                </label>
                <Check checked={style.optionGrid} onChange={(optionGrid) => setStyle({ optionGrid })} note="Ahorra espacio cuando las opciones son palabras o números.">Opciones cortas una al lado de la otra</Check>
              </>
            )}
            {tab === "portada" && (
              <>
                <div className="bks-field">Portada<Seg label="Portada" value={style.cover} onChange={(cover) => setStyle({ cover })} options={[{ value: "full", label: "Página completa" }, { value: "header", label: "Arriba de la primera página" }, { value: "none", label: "Sin portada" }]} /></div>
                {style.cover !== "none" && (
                  <>
                    <label className="bks-field">Colegio
                      <input type="text" value={prefs.schoolName ?? ""} placeholder="Nombre del colegio" onChange={(e) => set({ schoolName: e.target.value })} onBlur={(e) => shareSchool({ print_school_name: e.target.value })} />
                    </label>
                    <div className="bks-field">Logo del colegio
                      <div className="bks-logo">
                        {prefs.logo && <img src={prefs.logo} alt="Logo del colegio" />}
                        <FilePicker accept="image/*" onChange={onLogo} label={prefs.logo ? "Cambiar logo" : "Subir logo"} hint="PNG o JPG" />
                        {prefs.logo && <button type="button" className="secondary" onClick={() => set({ logo: null })}>Quitar</button>}
                      </div>
                    </div>
                    <label className="bks-field">Texto sobre el título
                      <input type="text" value={style.kicker} maxLength={60} placeholder="Simulacro Saber 11" onChange={(e) => setStyle({ kicker: e.target.value })} />
                    </label>
                    <label className="bks-field">Subtítulo
                      <input type="text" value={style.subtitle} maxLength={120} placeholder="Ej.: Primer periodo · Jornada mañana" onChange={(e) => setStyle({ subtitle: e.target.value })} />
                    </label>
                  </>
                )}
                <Check checked={style.instructions} onChange={(instructions) => setStyle({ instructions })}>Página de instrucciones</Check>
                <label className="bks-field">Instrucción adicional
                  <textarea rows={2} value={style.extraInstruction} maxLength={400} placeholder="Ej.: Tienes 4 horas y 30 minutos. No se permite calculadora." onChange={(e) => setStyle({ extraInstruction: e.target.value })} />
                </label>
                <Check checked={style.answerSheet && !g.imposed} disabled={g.imposed} onChange={(answerSheet) => setStyle({ answerSheet })}
                  note={g.imposed ? "En un cuadernillo plegado, imprímela aparte: «Imprimir › Hoja de respuestas»." : "Para calificar a mano. Las hojas que lee el celular se imprimen desde Papel."}>Hoja de respuestas al final, para recortar</Check>
                <Check checked={style.backCover} onChange={(backCover) => setStyle({ backCover })}>Contraportada</Check>
              </>
            )}
            {tab === "bordes" && (
              <>
                <Check checked={style.head} onChange={(head) => setStyle({ head })}>Encabezado en cada página</Check>
                {style.head && (
                  <>
                    <label className="bks-field">Texto del encabezado
                      <input type="text" value={style.headText} maxLength={90} placeholder={`${title}${sets[0]?.label ? ` · Versión ${sets[0].label}` : ""}`} onChange={(e) => setStyle({ headText: e.target.value })} />
                    </label>
                    <Check checked={style.headArea} onChange={(headArea) => setStyle({ headArea })}>Nombre de la prueba al otro lado</Check>
                  </>
                )}
                <div className="bks-field">Número de página<Seg label="Número de página" value={style.pageNumber} onChange={(pageNumber) => setStyle({ pageNumber })} options={[{ value: "outer", label: g.duplex ? "En la esquina exterior" : "A la derecha" }, { value: "center", label: "Al centro" }, { value: "none", label: "Sin número" }]} />
                  {style.pageNumber !== "none" && <Check checked={style.pageTotal} onChange={(pageTotal) => setStyle({ pageTotal })}>Con el total («3 de 24»)</Check>}</div>
                <label className="bks-field">Texto del pie de página
                  <input type="text" value={style.footText} maxLength={120} placeholder="Ej.: Prohibida su reproducción · Colegio …" onChange={(e) => setStyle({ footText: e.target.value })} />
                  <span className="bks-note">La fuente (ICFES, Saber 11) siempre va en el pie.</span>
                </label>
              </>
            )}
              </div>
            </div>
            <div className="bks-save" data-tour="bks-save">
              {api?.saveSchoolSettings && schoolId && <button type="button" className="secondary" disabled={Boolean(isSchool)} onClick={saveSchoolFormat}>{isSchool ? "Es el formato del colegio" : "Guardar como formato del colegio"}</button>}
              <button type="button" className="link" onClick={() => { setStyle(DEFAULT_STYLE); setNotice(null); }}>Volver al formato inicial</button>
            </div>
            {notice && <p className="bks-note">{notice}</p>}
          </>
        )}
        {doc !== "booklet" && (
          <div className="bks-field">Tamaño del papel<Seg label="Tamaño" value={style.size} onChange={(size) => setStyle({ size })} options={[{ value: "Carta", label: "Carta" }, { value: "A4", label: "A4" }, { value: "Oficio", label: "Oficio" }]} /></div>
        )}

        {error && <p className="bks-hint bks-warn">{error}</p>}
        <div className="bks-hint" data-tour="bks-hint">
          {doc === "key" ? <p>La clave va aparte: no la imprimas con los cuadernillos de los estudiantes.</p>
            : doc === "answers" ? <p>Una hoja por estudiante, para calificar a mano. Imprime una y saca copias, o elige el número de copias en la impresora.{plan ? " Las hojas que lee el celular están en Papel › Hojas de respuestas." : ""}</p>
            : (
              <>
                <p className="bks-sum">{laid && pages ? <><b>{pages} páginas</b> en <b>{sheets} {sheets === 1 ? "hoja" : "hojas"} {g.sheetLabel}</b> por cuadernillo{counts && only === "all" ? ` · imprime ${versions.map((v) => `${counts[v]} de la ${versionLabel(v)}`).join(", ")}` : ""}.</> : "Diagramando…"}</p>
                <p>{printerHint} Para mandarlo a una imprenta, elige «Guardar como PDF».</p>
                {over > 0 && <p className="bks-warn">{over === 1 ? "Una página tiene" : `${over} páginas tienen`} una pieza más alta que la columna; revisa la vista previa o usa una columna.</p>}
                {g.duplex && (
                  <div className="bks-field bks-manual">¿Tu impresora no imprime por las dos caras?
                    <Seg label="Qué caras imprimir" value={part} onChange={setPart} options={[{ value: "all", label: "Todas" }, { value: "front", label: "1. Caras de adelante" }, { value: "back", label: "2. Caras de atrás" }]} />
                    {part !== "all" && <span className="bks-note">{part === "front" ? "Imprime estas caras. Luego voltea el paquete, vuelve a ponerlo en la bandeja y elige «2. Caras de atrás»." : "Pon el paquete volteado en la bandeja e imprime. Si salen en desorden, invierte el orden."}</span>}
                    {part === "back" && <Check checked={reverseBacks} onChange={setReverseBacks}>Invertir el orden</Check>}
                  </div>
                )}
              </>
            )}
        </div>
      </aside>
      {tour && <Tour label="Tutorial · Cuadernillo" steps={studioTour({ versions: versions.length > 1, answerSheets, schoolStyle: Boolean(api?.saveSchoolSettings) })}
        navigate={(r) => { if (r.doc) setDoc(r.doc); if (r.tab) setTab(r.tab); }} onClose={() => { markTourSeen("docente", null, "estudio"); setTour(false); setDoc("booklet"); }} />}
      <div className="bks-pages" ref={boxRef} data-tour="bks-pages">
        <div className="bks-zoom">
          {doc === "key"
            ? sets.map((s) => <TeacherKeyPrint key={s.v ?? "x"} questions={s.qs} bundle={bundle} title={title} course={course} version={s.label} paper={paper} zoom={zoom} />)
            : doc === "answers"
              ? sets.map((s) => (
                <div key={s.v ?? "x"} className="bk-sheet" style={{ width: `${paper.w}mm`, height: `${paper.h}mm`, zoom }}>
                  <div className="bk-page" style={{ width: `${paper.w}mm`, height: `${paper.h}mm`, padding: "16mm 15mm", ...typeVars(style) }}>
                    <AnswerPage meta={meta(s.label)} areas={areasOf(s.qs)} total={s.qs.length} />
                  </div>
                </div>
              ))
              : sets.map((s) => (
                <BookletPages key={s.v ?? "x"} questions={s.qs} figures={bundle.figures} meta={meta(s.label)} style={style} zoom={zoom} part={part} reverseBacks={reverseBacks}
                  onLaid={(r) => setStats((cur) => ({ ...cur, [statKey(s.v)]: r }))} />
              ))}
        </div>
      </div>
    </div>
  );
}
