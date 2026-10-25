import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import PrintBooklet from "../components/PrintBooklet.jsx";
import TeacherKey from "../components/TeacherKey.jsx";
import { FilePicker, Select, confirmDialog } from "../components/Controls.jsx";
import LessonCover from "../components/LessonCover.jsx";
import { imageToDataUrl } from "../lib/imageFile.js";
import { areaColor } from "../lib/brand.js";
import { moveKey } from "../lib/bank.js";
import { INTRO_COLORS, INTRO_LAYOUTS, TEXT_KINDS, appendKeys, cleanIntro, cleanItems, cleanOutro, cleanSettings, introOf, lessonQuestions, questionKeys } from "../lib/lesson.js";
import ActivityPanel from "./ActivityPanel.jsx";
import AssignBuilder from "./AssignBuilder.jsx";
import LiveHost from "./LiveHost.jsx";
import { Overlay } from "./Paper.jsx";
import Presenter from "./Presenter.jsx";
import "./teach.css";

const plain = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const SECONDS = [30, 45, 60, 90, 120, 180, 300];

// One lesson: its slides in order, how it is presented, and everything you can do with it:
// project it, play it live, print it as a worksheet, a booklet or a key, or turn it into an assignment.
export default function LessonEditor({ api, profile, row, courses, exams, fetchExam, guard, setNotice, reload, onBack, onSaved, onDeleted, autoPresent = false }) {
  const mine = row.owner_id === profile.id;
  const [lesson, setLesson] = useState(row);
  const [dirty, setDirty] = useState(false);
  const [bundle, setBundle] = useState(null);
  const [formats, setFormats] = useState([]);
  const [panel, setPanel] = useState(null); // "add" | "activity" | "live"
  const [presenting, setPresenting] = useState(null); // slide index to start at
  const [printing, setPrinting] = useState(null); // "worksheet" | "booklet" | "key"
  const [slideDraft, setSlideDraft] = useState({ title: "", body: "" });
  const [liveCourse, setLiveCourse] = useState("");
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(null); // index of the slide whose note is being written
  const [names, setNames] = useState([]); // first names of the class chosen for "Sortear quién responde"
  const [imgError, setImgError] = useState(null);

  const items = useMemo(() => cleanItems(lesson.items), [lesson.items]);
  const settings = cleanSettings(lesson.settings);
  const keys = useMemo(() => questionKeys(items), [items]);
  const keysId = keys.join("|");
  const examTitle = exams.find((e) => e.slug === lesson.exam_slug)?.title ?? lesson.exam_slug;

  useEffect(() => {
    let live = true;
    if (keys.length === 0) { setBundle(null); return undefined; }
    guard(() => fetchExam(lesson.exam_slug, lesson.exam_slug === "teacher" ? keys : null)).then((b) => { if (live) setBundle(b ?? null); });
    return () => { live = false; };
  }, [lesson.exam_slug, keysId, fetchExam, guard]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadFormats = useCallback(() => guard(async () => setFormats(await api.activityFormats())), [api, guard]);
  useEffect(() => { reloadFormats(); }, [reloadFormats]);

  // The class the name picker draws from: only first names, never scores.
  useEffect(() => {
    const id = settings.courseId;
    if (!id || !api.listMembers) { setNames([]); return undefined; }
    let alive = true;
    api.listMembers(id).then((m) => {
      if (alive) setNames(m.filter((x) => x.role === "student").map((x) => (x.full_name || x.email.split("@")[0]).split(/\s+/).slice(0, 2).join(" ")));
    }).catch(() => alive && setNames([]));
    return () => { alive = false; };
  }, [api, settings.courseId]);
  const intro = cleanIntro(settings.intro ?? {});
  const outro = cleanOutro(settings.outro);
  const setIntro = (patch) => setSetting({ intro: { ...intro, ...patch } });
  const setOutro = (patch) => setSetting({ outro: { ...outro, ...patch } });
  const pickImage = async (e, apply) => {
    const file = e.target.files?.[0];
    setImgError(null);
    if (!file) return;
    try { apply(await imageToDataUrl(file)); } catch (err) { setImgError(err.message); }
  };

  const presentable = useMemo(() => ({ ...lesson, items, settings }), [lesson, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = useMemo(() => new Map((bundle?.exam?.questions ?? []).map((q) => [q.key, q])), [bundle]);
  const edit = (patch) => { setLesson((l) => ({ ...l, ...patch })); setDirty(true); };
  const setItems = (next) => edit({ items: next });
  const setSetting = (patch) => edit({ settings: { ...settings, ...patch } });

  const persist = useCallback(async () => {
    const saved = await api.saveLesson({
      title: lesson.title.trim() || "Clase sin título", items: cleanItems(lesson.items), settings: cleanSettings(lesson.settings), visibility: lesson.visibility,
    }, lesson.id);
    setLesson(saved);
    setDirty(false);
    onSaved?.(saved);
    return saved;
  }, [api, lesson, onSaved]);
  // Before an activity is made from the lesson, unsaved edits are saved; a colleague's lesson is used as it is.
  const ensureSaved = async () => (dirty && mine ? { ...lesson, ...(await persist()) } : lesson);
  const save = () => { setBusy(true); guard(async () => { await persist(); setNotice("Clase guardada."); }).finally(() => setBusy(false)); };

  const duplicate = () => guard(async () => {
    const copy = await api.saveLesson({
      school_id: profile.school_id, owner_id: profile.id, title: `Copia de ${lesson.title}`, exam_slug: lesson.exam_slug,
      items: cleanItems(lesson.items), settings: cleanSettings(lesson.settings), visibility: "private",
    });
    setNotice("Copia creada. Ahora puedes editarla.");
    onSaved?.(copy);
    onBack();
  });
  const remove = async () => {
    if (!(await confirmDialog(`¿Borrar la clase «${lesson.title}»? Las actividades que ya creaste con ella siguen en pie.`, { confirmLabel: "Borrar clase", danger: true }))) return;
    guard(async () => { await api.deleteLesson(lesson.id); onDeleted?.(lesson.id); onBack(); });
  };

  const addSlide = (e) => {
    e.preventDefault();
    if (!slideDraft.title.trim() && !slideDraft.body.trim()) return;
    setItems([...items, { type: "text", ...slideDraft }]);
    setSlideDraft({ title: "", body: "" });
  };
  const patchSlide = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const goLive = () => {
    if (keys.length === 0) return;
    setBusy(true);
    guard(async () => {
      const created = await api.liveCreate({ title: lesson.title || "En vivo", exam: lesson.exam_slug, keys, seconds: settings.seconds, course: liveCourse });
      setRoom(created);
    }).finally(() => setBusy(false));
  };

  // Opened with "Proyectar" from the list: start the projection as soon as the questions are loaded.
  const [autoDone, setAutoDone] = useState(!autoPresent);
  const autoReady = Boolean(bundle) && lessonQuestions(lesson, bundle).length > 0;
  useEffect(() => { if (!autoDone && autoReady) { setAutoDone(true); setPresenting(0); } }, [autoDone, autoReady]);

  if (room) return <LiveHost api={api} initial={room} fetchExam={fetchExam} guard={guard} onExit={() => { setRoom(null); setPanel(null); }} />;

  if (panel === "add") {
    return (
      <>
        <header className="t-head"><div><h1>Agregar preguntas</h1><span className="caption">Se suman al final de «{lesson.title}», del mismo cuadernillo.</span></div></header>
        <AssignBuilder api={api} courses={courses} exams={exams} fetchExam={fetchExam} guard={guard} onCancel={() => setPanel(null)}
          lesson={{ slug: lesson.exam_slug, label: "Agregar a la clase", onCreate: async ({ keys: picked }) => {
            if (picked.length === 0) throw new Error("Elige al menos una pregunta.");
            setItems(appendKeys(items, picked));
            setPanel(null);
          } }} />
      </>
    );
  }

  const questions = bundle ? lessonQuestions(lesson, bundle) : [];
  const courseName = courses.length === 1 ? courses[0].name : "";
  const ready = Boolean(bundle) && questions.length > 0;

  return (
    <>
      <header className="t-head">
        <div>
          <button type="button" className="link" onClick={onBack}>‹ Clases</button>
          <h1>{lesson.title || "Clase sin título"}</h1>
          <span className="caption">{keys.length} {keys.length === 1 ? "pregunta" : "preguntas"} · {examTitle}{mine ? "" : " · de un colega"}</span>
        </div>
        <div className="les-actions">
          <button type="button" className="primary" disabled={!ready} onClick={() => setPresenting(0)}><Icon name="play" size={18} />Presentar</button>
          {mine && <button type="button" className="secondary" disabled={!dirty || busy} onClick={save}>{dirty ? "Guardar cambios" : "Guardado"}</button>}
        </div>
      </header>

      <div className="card t-card">
        <div className="section-head"><strong>Qué hacer con esta clase</strong>
          <span className="les-minor"><button type="button" className="link" onClick={duplicate}>Duplicar</button>{mine && <button type="button" className="link" onClick={remove}>Borrar</button>}</span></div>
        <div className="les-do">
          {[
            { id: "present", icon: "play", label: "Proyectar", note: "Revela respuesta y explicación paso a paso", on: false, disabled: !ready, run: () => setPresenting(0) },
            { id: "activity", icon: "book", label: "Convertir en actividad", note: "Tarea, quiz, examen o práctica", on: panel === "activity", disabled: keys.length === 0, run: () => setPanel(panel === "activity" ? null : "activity") },
            { id: "live", icon: "bolt", label: "Jugar en vivo", note: "Sala con código o QR, sin ranking", on: panel === "live", disabled: keys.length === 0, run: () => setPanel(panel === "live" ? null : "live") },
            { id: "worksheet", icon: "pencil", label: "Hoja de trabajo", note: "Para imprimir y resolver en clase", disabled: !ready, run: () => setPrinting("worksheet") },
            { id: "booklet", icon: "print", label: "Cuadernillo de examen", note: "Formato del examen, en papel", disabled: !ready, run: () => setPrinting("booklet") },
            { id: "key", icon: "check", label: "Clave del docente", note: "Respuestas y explicaciones", disabled: !ready, run: () => setPrinting("key") },
          ].map((a) => (
            <button key={a.id} type="button" aria-label={a.label} title={a.note} className={a.on ? "les-do-tile on" : "les-do-tile"} disabled={a.disabled} aria-pressed={a.on === undefined ? undefined : a.on} onClick={a.run}>
              <span className="les-do-ico" aria-hidden="true"><Icon name={a.icon} size={18} /></span>
              <span><strong>{a.label}</strong><span className="caption">{a.note}</span></span>
            </button>
          ))}
        </div>
      </div>

      {panel === "live" && (
        <div className="card t-card assign-form">
          <div className="section-head"><strong>Jugar en vivo</strong></div>
          <p className="caption">Abre una sala con estas {keys.length} preguntas. Los estudiantes entran con el código o el QR y ves cómo responde la clase; no hay ranking. {settings.seconds} s por pregunta (cámbialo abajo).</p>
          <label className="field"><span className="label">Curso (opcional)</span>
            <Select value={liveCourse} onChange={(v) => setLiveCourse(v)} aria-label="Curso de la sala">
              <option value="">Cualquiera con el código</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select></label>
          <div className="report-actions"><button type="button" className="primary" disabled={busy} onClick={goLive}>Crear sala</button></div>
        </div>
      )}
      {panel === "activity" && (
        <ActivityPanel api={api} profile={profile} lesson={lesson} courses={courses} formats={formats} reloadFormats={reloadFormats}
          persist={ensureSaved} guard={guard} setNotice={setNotice} reload={reload} />
      )}

      <div className="les-two">
        <div className="card t-card">
          <div className="section-head"><strong>Diapositivas</strong>
            {mine && <button type="button" className="secondary" onClick={() => setPanel("add")}><Icon name="plus" size={16} />Preguntas</button>}</div>
          {mine && <label className="field"><span className="label">Nombre de la clase</span><input aria-label="Nombre de la clase" value={lesson.title} onChange={(e) => edit({ title: e.target.value })} /></label>}
          <ol className="les-items">
            {items.map((it, i) => {
              const q = it.type === "q" ? byKey.get(it.key) : null;
              return (
                <li key={it.type === "q" ? `q-${it.key}` : `t-${i}`} className={it.type === "text" ? "les-item is-text" : "les-item"}>
                  <span className="les-n">{i + 1}</span>
                  {q ? <span className="assign-tile" style={{ background: areaColor(q.section) }} aria-hidden="true" /> : <Icon name="pencil" size={18} />}
                  {it.type === "q" ? (
                    <button type="button" className="link les-text" disabled={!bundle} onClick={() => setPresenting(settings.titleSlide ? i + 1 : i)}>
                      {q ? `${q.number}. ${plain(q.stem_md) || plain(q.stimulus_md) || q.section}` : `Pregunta ${it.key}`}
                    </button>
                  ) : mine ? (
                    <span className="les-slide-edit">
                      <span className="les-slide-row">
                        <Select aria-label={`Tipo de la diapositiva ${i + 1}`} value={it.kind ?? "text"} onChange={(v) => patchSlide(i, { kind: v === "text" ? undefined : v })} options={TEXT_KINDS.map(([v, l]) => ({ value: v, label: l }))} />
                        {it.image
                          ? <span className="les-img"><img src={it.image} alt="" /><button type="button" className="link" onClick={() => patchSlide(i, { image: undefined })}>Quitar imagen</button></span>
                          : <FilePicker className="les-img-pick" accept="image/*" label="Imagen" hint="opcional" aria-label={`Imagen de la diapositiva ${i + 1}`} onChange={(e) => pickImage(e, (image) => patchSlide(i, { image }))} />}
                      </span>
                      <input aria-label={`Título de la diapositiva ${i + 1}`} placeholder={it.kind === "discuss" ? "La pregunta para discutir" : "Título"} value={it.title} onChange={(e) => patchSlide(i, { title: e.target.value })} />
                      <textarea aria-label={`Texto de la diapositiva ${i + 1}`} rows={3} placeholder={it.kind === "activity" ? "Instrucciones. El cronómetro arranca solo al llegar a esta diapositiva." : "Texto. Empieza una línea con «- » para hacer una lista."} value={it.body} onChange={(e) => patchSlide(i, { body: e.target.value })} />
                    </span>
                  ) : <span className="les-text">{it.title || plain(it.body)}</span>}
                  {mine && (
                    <span className="b-move">
                      <button type="button" className={it.note ? "b-btn on" : "b-btn"} aria-label={`Nota para ti en la diapositiva ${i + 1}`} aria-expanded={noteOpen === i} title="Nota para ti (solo la ves tú al presentar)" onClick={() => setNoteOpen(noteOpen === i ? null : i)}><Icon name="pencil" size={14} /></button>
                      <button type="button" className="b-btn" aria-label={`Subir diapositiva ${i + 1}`} disabled={i === 0} onClick={() => setItems(moveKey(items, i, -1))}>↑</button>
                      <button type="button" className="b-btn" aria-label={`Bajar diapositiva ${i + 1}`} disabled={i === items.length - 1} onClick={() => setItems(moveKey(items, i, 1))}>↓</button>
                      <button type="button" className="b-btn" aria-label={`Quitar diapositiva ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  )}
                </li>
              );
            }).flatMap((li, i) => (noteOpen === i && mine ? [li, (
              <li key={`note-${i}`} className="les-note">
                <textarea autoFocus aria-label={`Nota de la diapositiva ${i + 1}`} rows={2} placeholder="Nota para ti: qué preguntar, qué recordar. La clase no la ve; al presentar, ábrela con N." value={items[i].note ?? ""} onChange={(e) => patchSlide(i, { note: e.target.value })} />
              </li>
            )] : [li]))}
            {items.length === 0 && <li className="caption" style={{ display: "block" }}>Esta clase aún no tiene diapositivas.</li>}
          </ol>
          {mine && (
            <form className="assign-form" onSubmit={addSlide} aria-label="Nueva diapositiva de texto">
              <strong>Diapositiva de texto</strong>
              <input aria-label="Título de la nueva diapositiva" placeholder="Título (por ejemplo: Objetivo de hoy)" value={slideDraft.title} onChange={(e) => setSlideDraft({ ...slideDraft, title: e.target.value })} />
              <textarea aria-label="Texto de la nueva diapositiva" rows={3} placeholder={"Texto. Empieza una línea con «- » para hacer una lista."} value={slideDraft.body} onChange={(e) => setSlideDraft({ ...slideDraft, body: e.target.value })} />
              <div className="report-actions"><button type="submit" className="secondary" disabled={!slideDraft.title.trim() && !slideDraft.body.trim()}>Agregar diapositiva</button></div>
            </form>
          )}
        </div>

        <div className="les-side">
          <div className="card t-card assign-form les-cover-card">
            <div className="section-head"><strong>Portada</strong>
              <label className="check-row les-inline"><input type="checkbox" disabled={!mine} checked={settings.titleSlide} onChange={(e) => setSetting({ titleSlide: e.target.checked })} /><span>Empezar con portada</span></label></div>
            <div className="les-cover-preview" aria-hidden="true"><LessonCover intro={introOf({ ...lesson, settings })} count={keys.length} preview /></div>
            {mine && settings.titleSlide && (
              <>
                <div className="chips-row" role="radiogroup" aria-label="Diseño de la portada">
                  {INTRO_LAYOUTS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={intro.layout === id} className={intro.layout === id ? "chip on" : "chip"} onClick={() => setIntro({ layout: id })}>{label}</button>)}
                </div>
                <label className="field"><span className="label">Título</span><input value={intro.title} placeholder={lesson.title} onChange={(e) => setIntro({ title: e.target.value })} /></label>
                <label className="field"><span className="label">Subtítulo</span><input value={intro.subtitle} placeholder="Por ejemplo: Matemáticas · repaso para el simulacro" onChange={(e) => setIntro({ subtitle: e.target.value })} /></label>
                <label className="field"><span className="label">Docente o curso</span><input value={intro.by} placeholder={`Por ejemplo: Prof. ${profile.full_name || ""}`.trim()} onChange={(e) => setIntro({ by: e.target.value })} /></label>
                {intro.layout !== "minimal" && (
                  <label className="field"><span className="label">Objetivos de hoy (uno por línea)</span>
                    <textarea rows={3} value={intro.goals} placeholder={"- Leer la tabla antes de mirar las opciones\n- Justificar con un dato"} onChange={(e) => setIntro({ goals: e.target.value })} /></label>
                )}
                <div className="field"><span className="label">Color</span>
                  <div className="les-swatches" role="radiogroup" aria-label="Color de la portada">
                    {INTRO_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={intro.color === c} aria-label={`Color ${c}`} className={intro.color === c ? "les-swatch on" : "les-swatch"} style={{ background: c }} onClick={() => setIntro({ color: c })} />)}
                  </div></div>
                {intro.layout === "image" && (
                  intro.image
                    ? <span className="les-img"><img src={intro.image} alt="" /><button type="button" className="link" onClick={() => setIntro({ image: "" })}>Quitar imagen</button></span>
                    : <FilePicker accept="image/*" label="Imagen de fondo" hint="una foto del colegio, del tema o de la clase" aria-label="Imagen de la portada" onChange={(e) => pickImage(e, (image) => setIntro({ image }))} />
                )}
                <label className="check-row"><input type="checkbox" checked={intro.date} onChange={(e) => setIntro({ date: e.target.checked })} /><span>Mostrar la fecha de hoy</span></label>
                <label className="check-row"><input type="checkbox" checked={intro.count} onChange={(e) => setIntro({ count: e.target.checked })} /><span>Mostrar cuántas preguntas hay</span></label>
              </>
            )}
            {imgError && <p className="notice error">{imgError}</p>}
          </div>

          {mine && (
            <div className="card t-card assign-form">
              <div className="section-head"><strong>Cierre</strong><span className="caption">La última diapositiva</span></div>
              <label className="field"><span className="label">Título</span><input value={outro.title} placeholder="Fin de la clase" onChange={(e) => setOutro({ title: e.target.value })} /></label>
              <label className="field"><span className="label">Mensaje o tarea para la próxima clase</span>
                <textarea rows={2} value={outro.body} placeholder={"- Repasa las preguntas 3 y 5\n- Trae la tabla de la página 12"} onChange={(e) => setOutro({ body: e.target.value })} /></label>
            </div>
          )}

          <div className="card t-card assign-form">
            <div className="section-head"><strong>Cómo se presenta</strong></div>
            <label className="check-row"><input type="checkbox" disabled={!mine} checked={settings.hideOptions} onChange={(e) => setSetting({ hideOptions: e.target.checked })} />
              <span>Mostrar las opciones en un paso aparte <span className="caption">(la clase primero piensa la pregunta)</span></span></label>
            <label className="check-row"><input type="checkbox" disabled={!mine} checked={Boolean(settings.autoTimer)} onChange={(e) => setSetting({ autoTimer: e.target.checked || undefined })} />
              <span>Cronómetro automático en cada pregunta</span></label>
            <label className="check-row"><input type="checkbox" disabled={!mine} checked={settings.progress !== false} onChange={(e) => setSetting({ progress: e.target.checked ? undefined : false })} />
              <span>Barra de avance arriba</span></label>
            <label className="field"><span className="label">Cronómetro y tiempo por pregunta en vivo</span>
              <Select value={String(settings.seconds)} disabled={!mine} onChange={(v) => setSetting({ seconds: Number(v) })} aria-label="Segundos por pregunta">
                {SECONDS.map((sec) => <option key={sec} value={String(sec)}>{sec} segundos</option>)}
              </Select></label>
            {courses.length > 0 && (
              <label className="field"><span className="label">Curso para «Sortear quién responde»</span>
                <Select value={settings.courseId ?? ""} disabled={!mine} onChange={(v) => setSetting({ courseId: v || undefined })} aria-label="Curso para sortear"
                  options={[{ value: "", label: "Ninguno" }, ...courses.map((c) => ({ value: c.id, label: c.name }))]} />
                <span className="caption">{settings.courseId ? `${names.length} nombres. Solo se muestra el nombre de quien responde; nada de puntajes.` : "Al presentar, R saca un nombre al azar sin repetir."}</span></label>
            )}
            {mine && (
              <label className="check-row"><input type="checkbox" checked={lesson.visibility === "school"} onChange={(e) => edit({ visibility: e.target.checked ? "school" : "private" })} />
                <span>Compartir con los docentes de mi colegio <span className="caption">(pueden presentarla y duplicarla, no editarla)</span></span></label>
            )}
            <p className="caption">Al presentar tienes lápiz para marcar sobre la diapositiva (P), conteo de manos A–D (V), sorteo de quién responde (R), tus notas (N), todas las diapositivas (G) y pausa con pantalla negra (B). La respuesta sale de la clave preliminar y la explicación solo donde la clave está confirmada. ? muestra todos los atajos.</p>
          </div>
        </div>
      </div>

      {presenting != null && bundle && <Presenter lesson={presentable} bundle={bundle} start={presenting} names={names} onExit={() => setPresenting(null)} />}
      {printing === "worksheet" && (
        <Overlay title="Hoja de trabajo" hint={`${questions.length} preguntas · A4`} onClose={() => setPrinting(null)} page="14mm 14mm 16mm">
          <PrintBooklet variant="worksheet" questions={questions} figures={bundle.figures} examLabel={bundle.exam.title} title={lesson.title} course={courseName} />
        </Overlay>
      )}
      {printing === "booklet" && (
        <Overlay title="Cuadernillo de examen" hint="Para calificar con hojas de respuestas, crea la actividad y usa Papel." onClose={() => setPrinting(null)} page="14mm 14mm 16mm">
          <PrintBooklet questions={questions} figures={bundle.figures} examLabel={bundle.exam.title} title={lesson.title} course={courseName} />
        </Overlay>
      )}
      {printing === "key" && (
        <Overlay title="Clave del docente" hint="Solo para ti: no la repartas a los estudiantes" onClose={() => setPrinting(null)} page="14mm 14mm 16mm">
          <TeacherKey questions={questions} bundle={bundle} title={lesson.title} course={courseName} />
        </Overlay>
      )}
    </>
  );
}
