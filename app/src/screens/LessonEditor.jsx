import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import PrintBooklet from "../components/PrintBooklet.jsx";
import TeacherKey from "../components/TeacherKey.jsx";
import { Select, confirmDialog } from "../components/Controls.jsx";
import { areaColor } from "../lib/brand.js";
import { moveKey } from "../lib/bank.js";
import { appendKeys, cleanItems, cleanSettings, lessonQuestions, questionKeys } from "../lib/lesson.js";
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
  // Opened with "Proyectar" from the list: start the projection as soon as the questions are loaded.
  const [autoDone, setAutoDone] = useState(!autoPresent);
  useEffect(() => { if (!autoDone && ready) { setAutoDone(true); setPresenting(0); } }, [autoDone, ready]);

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
                    <span style={{ display: "grid", gap: 6 }}>
                      <input aria-label={`Título de la diapositiva ${i + 1}`} placeholder="Título" value={it.title} onChange={(e) => patchSlide(i, { title: e.target.value })} />
                      <textarea aria-label={`Texto de la diapositiva ${i + 1}`} rows={3} placeholder={"Texto. Empieza una línea con «- » para hacer una lista."} value={it.body} onChange={(e) => patchSlide(i, { body: e.target.value })} />
                    </span>
                  ) : <span className="les-text">{it.title || plain(it.body)}</span>}
                  {mine && (
                    <span className="b-move">
                      <button type="button" className="b-btn" aria-label={`Subir diapositiva ${i + 1}`} disabled={i === 0} onClick={() => setItems(moveKey(items, i, -1))}>↑</button>
                      <button type="button" className="b-btn" aria-label={`Bajar diapositiva ${i + 1}`} disabled={i === items.length - 1} onClick={() => setItems(moveKey(items, i, 1))}>↓</button>
                      <button type="button" className="b-btn" aria-label={`Quitar diapositiva ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  )}
                </li>
              );
            })}
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

        <div className="card t-card assign-form">
          <div className="section-head"><strong>Cómo se presenta</strong></div>
          <label className="check-row"><input type="checkbox" disabled={!mine} checked={settings.hideOptions} onChange={(e) => setSetting({ hideOptions: e.target.checked })} />
            <span>Mostrar las opciones en un paso aparte <span className="caption">(la clase primero piensa la pregunta)</span></span></label>
          <label className="check-row"><input type="checkbox" disabled={!mine} checked={settings.titleSlide} onChange={(e) => setSetting({ titleSlide: e.target.checked })} />
            <span>Empezar con una diapositiva de título</span></label>
          <label className="field"><span className="label">Cronómetro y tiempo por pregunta en vivo</span>
            <Select value={String(settings.seconds)} disabled={!mine} onChange={(v) => setSetting({ seconds: Number(v) })} aria-label="Segundos por pregunta">
              {SECONDS.map((s) => <option key={s} value={String(s)}>{s} segundos</option>)}
            </Select></label>
          {mine && (
            <label className="check-row"><input type="checkbox" checked={lesson.visibility === "school"} onChange={(e) => edit({ visibility: e.target.checked ? "school" : "private" })} />
              <span>Compartir con los docentes de mi colegio <span className="caption">(pueden presentarla y duplicarla, no editarla)</span></span></label>
          )}
          <p className="caption">Al presentar: → o espacio avanzan un paso (pregunta, opciones, respuesta, explicación), A muestra la respuesta, E la explicación, B deja la pantalla en blanco, T inicia el cronómetro, + y − cambian el tamaño, F pone pantalla completa. La respuesta sale de la clave preliminar y la explicación solo donde la clave está confirmada.</p>
        </div>
      </div>

      {presenting != null && bundle && <Presenter lesson={presentable} bundle={bundle} start={presenting} onExit={() => setPresenting(null)} />}
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
