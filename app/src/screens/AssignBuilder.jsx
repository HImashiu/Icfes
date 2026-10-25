import { useEffect, useMemo, useRef, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import AiAnalysis from "../components/AiAnalysis.jsx";
import { weakCompetencias } from "../lib/analytics.js";
import { KINDS } from "../lib/assignments.js";
import { TEACHER_ENTRY } from "../lib/teacherExam.js";
import { areaColor } from "../lib/brand.js";
import { confirmDialog, DateField, Select } from "../components/Controls.jsx";
import { cleanGlossary } from "../lib/glossary.js";
import { MODEL_KINDS, describeModel, normalizeModel, resolveModel } from "../lib/grading.js";
import {
  autoPick, bankItems, DIFFICULTY_LABEL, EMPTY_FILTER, facet, filterItems, moveKey, sortByBooklet, summarize, withGroupMates,
} from "../lib/bank.js";
import { checkKeys, holdOf, useIndex, verdict } from "../lib/questionUse.js";
import { holdRows, loadQuestionControl } from "../lib/questionControl.js";
import { UseBadge, UseHistory } from "../components/QuestionUse.jsx";

const isoDay = (d) => d.toISOString().slice(0, 10);
const PAGE = 40;
const REVEAL = [
  ["after_submit", "Al entregar"],
  ["after_close", "Cuando cierre la asignación"],
  ["never", "No mostrar respuestas"],
];
const DELIVERY = [
  { id: "online", label: "En línea", note: "En el celular o el computador" },
  { id: "paper", label: "En papel", note: "Cuadernillo impreso y hoja de burbujas" },
];
const PAPER_KIND_HELP = {
  homework: "Taller impreso para resolver en clase o en casa; luego escaneas las hojas.",
  exam: "Como el ICFES real: cuadernillo, hoja de respuestas y tiempo en el salón.",
};
const KIND_HELP = {
  task: "Práctica en clase, sin nota.",
  homework: "Para entregar en casa antes de la fecha.",
  exam: "Con cronómetro, cuenta para la banda estimada.",
};

// Constructor de asignaciones: explora el banco, filtra, previsualiza, elige a mano o automático, ordena y asigna.
// With `lesson` ({ onCreate, slug?, label }) it picks the questions of a teaching lesson instead of an assignment;
// `slug` locks the booklet (adding questions to a lesson that already has some).
// `grading` ({ models, profile, onChange }) adds the grading model choice; without it the form is as before.
// `preset` ({ kind, delivery }) starts the form as a given kind of activity (Tarea, Simulacro en papel…).
export default function AssignBuilder({ api, courses, exams, fetchExam, guard, onCancel, onSaved, live = null, lesson = null, grading = null, preset = null }) {
  const ready = [...exams.filter((e) => e.status !== "proximamente"), ...(api.teacherQuestions ? [TEACHER_ENTRY] : [])];
  const cache = useRef(new Map());
  const [slug, setSlug] = useState(lesson?.slug ?? ready[0]?.slug ?? "");
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [picked, setPicked] = useState([]);
  const [mates, setMates] = useState(true);
  const [limitShown, setLimitShown] = useState(PAGE);
  const [preview, setPreview] = useState(null);
  const [panel, setPanel] = useState("bank");
  const [autoCount, setAutoCount] = useState("10");
  const [weak, setWeak] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [courseIds, setCourseIds] = useState(courses.length === 1 ? [courses[0].id] : []);
  const [kind, setKind] = useState(preset?.kind ?? "homework");
  const [delivery, setDelivery] = useState(preset?.delivery ?? "online");
  const paper = delivery === "paper";
  const [title, setTitle] = useState("");
  const [opens, setOpens] = useState(isoDay(new Date()));
  const [due, setDue] = useState(isoDay(new Date(Date.now() + 7 * 864e5)));
  const [limit, setLimit] = useState("");
  const [attempts, setAttempts] = useState("");
  const [reveal, setReveal] = useState(preset?.delivery === "paper" ? "after_close" : "after_submit");
  const [hints, setHints] = useState(true);
  const [instant, setInstant] = useState(true);
  const [defsOn, setDefsOn] = useState(false);
  const [defs, setDefs] = useState([{ term: "", def: "" }]);
  const [proctor, setProctor] = useState(false);
  const [seconds, setSeconds] = useState("60");
  const [liveCourse, setLiveCourse] = useState("");
  const [gradeKind, setGradeKind] = useState(""); // "" = what the class space (or the school) already uses
  // Question control: what the school already used, the holds and the rules. fresh = list only questions these
  // students have not met (the default); reserve = a simulacro reserves its questions and hides them from practice.
  const [qc, setQc] = useState(null);
  const [fresh, setFresh] = useState(true);
  const [reserve, setReserve] = useState(true);
  useEffect(() => { let on = true; loadQuestionControl(api).then((v) => on && setQc(v), () => on && setQc(null)); return () => { on = false; }; }, [api]);

  useEffect(() => {
    if (!slug) return undefined;
    let live = true;
    const hit = cache.current.get(slug);
    if (hit) { setBundle(hit); return undefined; }
    setLoading(true);
    guard(() => fetchExam(slug)).then((b) => {
      if (!live) return;
      if (b) cache.current.set(slug, b);
      setBundle(b ?? null);
      setLoading(false);
    });
    return () => { live = false; };
  }, [slug, fetchExam, guard]);

  const items = useMemo(() => (bundle ? bankItems(bundle.exam, { enrich: bundle.enrich, key: bundle.key, notes: bundle.notes }) : []), [bundle]);
  // Who the activity is for, and what kind it is, decide which earlier uses count against a question.
  const useKind = lesson ? "lesson" : live ? "live" : kind;
  // Until the classes are chosen nothing counts against a question except holds and the school-wide history.
  const target = lesson ? [] : live ? courses.filter((c) => c.id === liveCourse) : courses.filter((c) => courseIds.includes(c.id));
  const index = useMemo(() => (qc && bundle ? useIndex(qc.uses, slug, bundle.exam) : new Map()), [qc, bundle, slug]);
  const checks = useMemo(
    () => checkKeys(items.map((i) => i.key), { kind: useKind, courses: target, index, holds: qc?.holds ?? [], slug, rules: qc?.rules }),
    [items, useKind, target.map((c) => c.id).join(","), index, qc, slug], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const blocked = (k) => checks.get(k)?.level === "block";
  // With no class to compare against (a class for projection, a live game open to anyone) any earlier use counts.
  const anyUse = lesson || (live && !liveCourse);
  const stale = (k) => ["block", "warn"].includes(checks.get(k)?.level) || (anyUse && (index.get(k)?.length ?? 0) > 0);
  const filtered = useMemo(() => filterItems(items, filter).filter((i) => !fresh || !stale(i.key)), [items, filter, fresh, checks]); // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenStale = useMemo(() => (fresh ? filterItems(items, filter).filter((i) => stale(i.key)).length : 0), [items, filter, fresh, checks]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedCheck = useMemo(() => verdict(picked, checks), [picked, checks]);
  const summary = useMemo(() => summarize(picked, items), [picked, items]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const tagged = items.some((i) => i.competencia);

  const set = (field, value) => { setFilter((f) => ({ ...f, [field]: value })); setLimitShown(PAGE); };
  const toggleIn = (field, value) => set(field, filter[field].includes(value) ? filter[field].filter((v) => v !== value) : [...filter[field], value]);

  const changeExam = async (next) => {
    if (picked.length && !(await confirmDialog("Cambiar de cuadernillo vacía la selección. ¿Continuar?", { confirmLabel: "Cambiar" }))) return;
    setSlug(next); setPicked([]); setFilter(EMPTY_FILTER); setWeak(null); setBundle(null);
  };
  const add = (keys) => {
    const next = (mates ? withGroupMates(keys, items) : keys).filter((k) => !blocked(k));
    setPicked((cur) => [...cur, ...next.filter((k) => !cur.includes(k))]);
  };
  const toggle = (k) => (picked.includes(k) ? setPicked(picked.filter((x) => x !== k)) : add([k]));
  const autoFill = () => {
    // The automatic pick never takes a question these students already met, whatever the "fresh" switch says.
    const keys = autoPick(filtered.filter((i) => !stale(i.key)), autoCount, { balance: filter.areas.length !== 1 });
    setPicked((mates ? withGroupMates(keys, items) : keys).filter((k) => !blocked(k)));
  };
  const findWeak = () =>
    guard(async () => {
      const courseId = courseIds[0] ?? courses[0]?.id;
      const [members, all] = await Promise.all([api.listMembers(courseId), api.examAttempts(slug)]);
      const ids = new Set(members.map((m) => m.profile_id).filter(Boolean));
      const list = weakCompetencias(items, bundle.key, all.filter((a) => ids.has(a.profile_id)));
      if (list.length === 0) throw new Error("Todavía no hay suficientes respuestas de este curso en este cuadernillo. Asigna una práctica primero.");
      setWeak(list);
      set("competencias", list.slice(0, 3).map((c) => c.competencia));
    });

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    if (picked.length === 0) return setMsg("Elige al menos una pregunta.");
    if (!lesson && !live) {
      if (courseIds.length === 0) return setMsg("Elige al menos un curso.");
      if (due && due < isoDay(new Date())) return setMsg("La fecha de entrega debe ser hoy o después.");
      if (due && due < opens) return setMsg("La entrega no puede ser antes de la apertura.");
    }
    if (pickedCheck.blocked.length) return setMsg(`${pickedCheck.blocked.length === 1 ? "Una pregunta no se puede usar" : `${pickedCheck.blocked.length} preguntas no se pueden usar`} en esta actividad (las reglas del colegio lo impiden). Quítalas con «Quitar las bloqueadas».`);
    return (pickedCheck.warned.length
      ? confirmDialog(`${pickedCheck.warned.length === 1 ? "Una pregunta ya la vieron" : `${pickedCheck.warned.length} preguntas ya las vieron`} estos estudiantes. ¿Usarlas otra vez?`, { confirmLabel: "Usar igual", cancelLabel: "Revisar" })
      : Promise.resolve(true)).then((ok) => ok && save());
  };
  const save = () => {
    if (lesson) {
      setBusy(true);
      guard(() => lesson.onCreate({ keys: picked, slug, title: title.trim() })).finally(() => setBusy(false));
      return undefined;
    }
    if (live) {
      setBusy(true);
      guard(() => live.onCreate({ keys: picked, slug, seconds: Number(seconds), title: title.trim() || `En vivo · ${picked.length} preguntas`, course: liveCourse }))
        .finally(() => setBusy(false));
      return undefined;
    }
    setBusy(true);
    guard(async () => {
      const me = await api.getProfile();
      const areas = [...new Set(picked.map((k) => byKey.get(k)?.section).filter(Boolean))];
      const kindLabel = paper ? (kind === "exam" ? "Simulacro en papel" : "Taller en papel") : KINDS.find((k) => k.id === kind).label;
      const auto = `${kindLabel} · ${areas.length === 1 ? areas[0] : "Varias áreas"} · ${picked.length} preguntas`;
      let last = null;
      const created = [];
      for (const course_id of courseIds) {
        last = await api.createAssignment({
          course_id, created_by: me.id, kind, title: title.trim() || auto, exam_slug: slug, scope: "all", question_keys: picked,
          opens_at: new Date(`${opens}T00:00:00`).toISOString(),
          due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null,
          time_limit_min: kind === "exam" && limit ? Number(limit) : null,
          max_attempts: attempts ? Number(attempts) : kind === "exam" ? 1 : null,
          reveal_policy: reveal, status: "active",
          // Sent only for paper, so creating assignments keeps working before migration 0023 runs.
          ...(paper ? { delivery: "paper", max_attempts: 1, proctor: false } : {}),
          // Sent only when switched off, so creating assignments keeps working before migration 0007 runs.
          ...(hints ? {} : { allow_hints: false }),
          ...(proctor ? { proctor: true } : {}),
          ...(instant || kind === "exam" ? {} : { instant_feedback: false }),
          // Sent only when switched on, so creating assignments keeps working before migration 0011 runs.
          ...(defsOn && cleanGlossary(defs).length ? { allow_definitions: true, definitions: cleanGlossary(defs) } : {}),
        });
        created.push(last);
      }
      // A model chosen here belongs to each new assignment; it starts from the class's settings (scale, curves) with the chosen kind.
      if (grading && gradeKind) {
        for (const a of created) {
          if (!a?.id) continue;
          const base = resolveModel(grading.models, { courseId: a.course_id, schoolId: grading.profile.school_id }).model;
          await api.saveGradingModel({ schoolId: grading.profile.school_id, userId: me.id, scope: "assignment", scopeId: a.id, model: normalizeModel({ ...base, kind: gradeKind }) });
        }
        await grading.onChange?.();
      }
      // A simulacro reserves its questions and hides them from free practice until it closes.
      if (kind === "exam" && reserve && qc?.holds && last?.id) {
        try {
          await api.saveHolds(holdRows({ schoolId: me.school_id, userId: me.id, slug, keys: picked, reserve: true, hide: true, label: last.title, until: last.due_at ?? null, assignmentId: last.id }));
        } catch { /* the activity is saved; the hold can be set later in Biblioteca › Control */ }
      }
      onSaved(last, courseIds.length);
    }).finally(() => setBusy(false));
  };

  const areaFacet = facet(items, "section", filter, "areas");
  const compFacet = facet(items, "competencia", filter, "competencias");
  const compoFacet = facet(items, "componente", filter, "componentes");
  const diffFacet = facet(items, "dificultad", filter, "difficulty");
  const nFilters = filter.areas.length + filter.competencias.length + filter.componentes.length + filter.difficulty.length + (filter.text ? 1 : 0) + (filter.onlyKeyed ? 1 : 0) + (filter.onlyTagged ? 1 : 0);

  const chips = (field, list, label) => list.length > 0 && (
    <div className="b-facet"><span className="label">{label}</span>
      <div className="chips-row">
        {list.map(([v, n]) => (
          <button key={String(v)} type="button" className={filter[field].includes(v) ? "chip on" : "chip"} aria-pressed={filter[field].includes(v)} onClick={() => toggleIn(field, v)}>
            {field === "difficulty" ? `${v} · ${DIFFICULTY_LABEL[v] ?? ""}` : v} <span className="muted">{n}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const bank = (
    <section className="card t-card b-bank" aria-label="Banco de preguntas">
      <div className="section-head"><strong>Banco de preguntas</strong>
        <Select aria-label="Cuadernillo" value={slug} disabled={Boolean(lesson?.slug)} onChange={(v) => changeExam(v)}>
          {ready.map((x) => <option key={x.slug} value={x.slug}>{x.title ?? x.slug}</option>)}
        </Select>
      </div>
      <input type="search" placeholder="Buscar por palabra, tema o competencia" aria-label="Buscar preguntas" value={filter.text} onChange={(e) => set("text", e.target.value)} />
      {chips("areas", areaFacet, "Área")}
      {chips("competencias", compFacet, "Competencia")}
      {chips("componentes", compoFacet, "Componente")}
      {chips("difficulty", diffFacet, "Dificultad (estimada con IA)")}
      {!tagged && !loading && bundle && <p className="caption">Este cuadernillo todavía no tiene competencias ni dificultad generadas; puedes filtrar por área.</p>}
      <div className="b-toggles">
        <label><input type="checkbox" checked={filter.onlyKeyed} onChange={(e) => set("onlyKeyed", e.target.checked)} /> Solo con clave</label>
        <label><input type="checkbox" checked={mates} onChange={(e) => setMates(e.target.checked)} /> Traer las preguntas del mismo texto</label>
        <label><input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> {anyUse ? "Solo preguntas sin usar en el colegio" : "Solo preguntas nuevas para estos estudiantes"}</label>
        {!lesson && !live && courseIds.length === 0 && <span className="caption">Elige los cursos en «Tu asignación» y el banco marca lo que ya vieron.</span>}
        {nFilters > 0 && <button type="button" className="link" onClick={() => { setFilter(EMPTY_FILTER); setWeak(null); }}>Quitar filtros ({nFilters})</button>}
      </div>
      <div className="b-actions">
        <span className="caption" aria-live="polite">{filtered.length} de {items.length} preguntas</span>
        {hiddenStale > 0 && <button type="button" className="link" onClick={() => setFresh(false)}>{hiddenStale} ya usadas, ocultas</button>}
        <button type="button" className="secondary" disabled={filtered.length === 0} onClick={() => add(filtered.map((i) => i.key))}>Agregar las {filtered.length}</button>
        <span className="b-auto">
          <input aria-label="Cantidad automática" inputMode="numeric" value={autoCount} onChange={(e) => setAutoCount(e.target.value.replace(/\D/g, ""))} />
          <button type="button" className="secondary" disabled={filtered.length === 0 || !autoCount} onClick={autoFill}>Elegir automáticamente</button>
        </span>
        {courses.length > 0 && tagged && <button type="button" className="secondary" disabled={!bundle} onClick={findWeak}>Según lo que el curso falla</button>}
      </div>
      {weak && (
        <p className="notice">Lo más flojo del curso en este cuadernillo: {weak.slice(0, 3).map((c) => `${c.competencia} (${c.pct} %)`).join(", ")}. Filtré por esas competencias.</p>
      )}
      {loading && <p className="caption">Cargando preguntas…</p>}
      <ul className="b-list">
        {filtered.slice(0, limitShown).map((it) => {
          const on = picked.includes(it.key);
          const ck = checks.get(it.key);
          return (
            <li key={it.key} className={`b-row${on ? " on" : ""}${ck?.level === "block" ? " qu-blocked" : ""}`}>
              <input type="checkbox" checked={on} disabled={ck?.level === "block" && !on} onChange={() => toggle(it.key)} aria-label={`Elegir pregunta ${it.number}`} />
              <span className="assign-tile" style={{ background: areaColor(it.section) }} aria-hidden="true" />
              <div className="b-body">
                <strong>{it.number}. <span className="muted">{it.section}</span></strong>
                <span className="b-text">{it.preview || "(sin texto)"}</span>
                <span className="chips-row">
                  {it.competencia && <span className="badge pending">{it.competencia}</span>}
                  {it.dificultad && <span className="badge pending">{DIFFICULTY_LABEL[it.dificultad]}</span>}
                  {it.groupSize > 1 && <span className="badge pending">Texto compartido · {it.groupSize}</span>}
                  {!it.hasKey && <span className="badge pending">Sin clave</span>}
                  {it.keyDoubt && <span className="badge pending">Clave en duda</span>}
                  <UseBadge check={ck} count={index.get(it.key)?.length ?? 0} />
                </span>
              </div>
              <button type="button" className="link" onClick={() => setPreview(it.key)}>Ver</button>
            </li>
          );
        })}
        {filtered.length === 0 && !loading && (
          <li className="caption">{hiddenStale ? "Estos estudiantes ya vieron todas las preguntas que cumplen estos filtros. Prueba otro cuadernillo u otra área, o muestra las ya usadas." : "Ninguna pregunta cumple estos filtros."}</li>
        )}
      </ul>
      {filtered.length > limitShown && <button type="button" className="secondary" onClick={() => setLimitShown(limitShown + PAGE)}>Mostrar más ({filtered.length - limitShown})</button>}
    </section>
  );

  const mine = (
    <form className="card t-card b-mine assign-form" onSubmit={submit} aria-label={live ? "Tu sala" : lesson ? "Tu clase" : "Tu asignación"}>
      <div className="section-head"><strong>{live ? "Tu sala" : lesson ? "Tu clase" : "Tu asignación"}</strong><span className="muted">{summary.total} preguntas</span></div>
      {summary.total > 0 && (
        <div className="b-summary">
          <span className="chips-row">{summary.areas.map((a) => <span key={a.name} className="badge" style={{ borderLeft: `4px solid ${areaColor(a.name)}` }}>{a.name} · {a.n}</span>)}</span>
          <span className="caption">
            Unos {summary.minutes} min (estimado){summary.avgDifficulty ? ` · dificultad media ${summary.avgDifficulty}/5` : ""}
            {summary.noKey ? ` · ${summary.noKey} sin clave` : ""}{summary.doubt ? ` · ${summary.doubt} con clave en duda` : ""}
          </span>
        </div>
      )}
      <ol className="b-picked">
        {picked.map((k, i) => {
          const it = byKey.get(k);
          return (
            <li key={k}>
              <span className="b-num">{i + 1}</span>
              <button type="button" className="link b-name" onClick={() => setPreview(k)}>
                {["block", "warn"].includes(checks.get(k)?.level) && <span className={`qu-dot ${checks.get(k).level}`} title={checks.get(k).reasons.join(" · ")} aria-label={checks.get(k).level === "block" ? "No permitida" : "Ya usada"} />}
                {it ? `${it.number}. ${it.preview || it.section}` : k}
              </button>
              <span className="b-move">
                <button type="button" className="b-btn" aria-label={`Subir pregunta ${it?.number}`} disabled={i === 0} onClick={() => setPicked(moveKey(picked, i, -1))}>↑</button>
                <button type="button" className="b-btn" aria-label={`Bajar pregunta ${it?.number}`} disabled={i === picked.length - 1} onClick={() => setPicked(moveKey(picked, i, 1))}>↓</button>
                <button type="button" className="b-btn" aria-label={`Quitar pregunta ${it?.number}`} onClick={() => setPicked(picked.filter((x) => x !== k))}>✕</button>
              </span>
            </li>
          );
        })}
        {picked.length === 0 && <li className="caption" style={{ display: "block" }}>Aún no hay preguntas. Elige en el banco o usa la selección automática.</li>}
      </ol>
      {(pickedCheck.blocked.length > 0 || pickedCheck.warned.length > 0) && (
        <p className={pickedCheck.blocked.length ? "notice error qu-notice" : "notice qu-notice"}>
          {pickedCheck.blocked.length > 0 && <>{pickedCheck.blocked.length} no se {pickedCheck.blocked.length === 1 ? "puede" : "pueden"} usar aquí. </>}
          {pickedCheck.warned.length > 0 && <>{pickedCheck.warned.length} ya {pickedCheck.warned.length === 1 ? "la vieron" : "las vieron"} estos estudiantes. </>}
          <button type="button" className="link" onClick={() => setPicked(picked.filter((k) => !(pickedCheck.blocked.includes(k) || pickedCheck.warned.includes(k))))}>
            {pickedCheck.warned.length ? "Quitar las repetidas" : "Quitar las bloqueadas"}
          </button>
        </p>
      )}
      {picked.length > 1 && (
        <div className="report-actions">
          <button type="button" className="link" onClick={() => setPicked(sortByBooklet(picked, items))}>Ordenar como el cuadernillo</button>
          <button type="button" className="link" onClick={() => setPicked([])}>Vaciar</button>
        </div>
      )}

      <hr className="b-sep" />
      {lesson ? (
        !lesson.slug && <label className="field"><span className="label">Nombre de la clase</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Por ejemplo: Repaso de álgebra" /></label>
      ) : live ? (
        <>
          <label className="field"><span className="label">Nombre de la sala (opcional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span className="label">Tiempo por pregunta</span>
            <Select value={seconds} onChange={(v) => setSeconds(v)}>
              {[30, 45, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n} segundos</option>)}
            </Select>
            <span className="caption">Las preguntas ICFES con lectura necesitan 60 a 120 segundos.</span></label>
          <label className="field"><span className="label">Curso (opcional)</span>
            <Select value={liveCourse} onChange={(v) => setLiveCourse(v)}>
              <option value="">Cualquiera con el código</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select></label>
        </>
      ) : (
        <>
      <fieldset className="field"><legend className="label">Cursos</legend>
        {courses.map((c) => (
          <label key={c.id} className="b-check"><input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => setCourseIds(courseIds.includes(c.id) ? courseIds.filter((x) => x !== c.id) : [...courseIds, c.id])} /> {c.name}{c.grade ? ` · Grado ${c.grade}` : ""}</label>
        ))}
      </fieldset>
      <fieldset className="field b-delivery"><legend className="label">Cómo la resuelven</legend>
        <div className="b-delivery-opts" role="radiogroup" aria-label="Cómo la resuelven">
          {DELIVERY.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={delivery === d.id} className={delivery === d.id ? "b-delivery-opt on" : "b-delivery-opt"}
              onClick={() => { setDelivery(d.id); if (d.id === "paper") { setReveal("after_close"); if (kind === "task") setKind("exam"); } }}>
              <strong>{d.label}</strong><span className="caption">{d.note}</span>
            </button>
          ))}
        </div>
        <span className="caption">{paper ? "Imprimes el cuadernillo y una hoja de burbujas por estudiante, y escaneas las hojas con el celular. Los estudiantes no ven las preguntas en la app antes del examen." : "Siempre puedes imprimirla también: en la actividad, pestaña En papel."}</span>
      </fieldset>
      <label className="field"><span className="label">Tipo</span>
        <Select value={kind} onChange={(v) => setKind(v)}>{KINDS.filter((k) => !paper || k.id !== "task").map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>
        <span className="caption">{paper ? PAPER_KIND_HELP[kind] : KIND_HELP[kind]}</span></label>
      <label className="field"><span className="label">Título (opcional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span className="label">Abre</span><DateField value={opens} onChange={(v) => setOpens(v)} /></label>
      <label className="field"><span className="label">Fecha de entrega</span><DateField value={due} min={isoDay(new Date())} onChange={(v) => setDue(v)} /></label>
      {kind === "exam" && !paper && (
        <label className="field"><span className="label">Tiempo en minutos (vacío = el estándar)</span>
          <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} placeholder={summary.total ? `≈ ${summary.minutes}` : ""} /></label>
      )}
      {!paper && <label className="field"><span className="label">Intentos permitidos</span>
        <Select value={attempts} onChange={(v) => setAttempts(v)}>
          <option value="">{kind === "exam" ? "Uno (simulacro)" : "Sin límite"}</option>
          {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select></label>}
      <label className="field"><span className="label">Mostrar respuestas y explicaciones</span>
        <Select value={reveal} onChange={(v) => setReveal(v)}>{REVEAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
      {kind !== "exam" && !paper && (
        <label className="field"><span className="label">Corrección de cada pregunta</span>
          <Select value={instant ? "now" : "end"} onChange={(v) => setInstant(v === "now")}>
            <option value="now">Inmediata: ve si acertó al tocar “Comprobar”</option>
            <option value="end">Al final: responde todo y ve los resultados al terminar</option>
          </Select></label>
      )}
      {grading && (() => {
        const inherited = resolveModel(grading.models, { courseId: courseIds[0], schoolId: grading.profile.school_id });
        return (
          <label className="field"><span className="label">Calificación</span>
            <Select aria-label="Calificación" value={gradeKind} onChange={setGradeKind}
              options={[{ value: "", label: `Como la clase: ${MODEL_KINDS.find((k) => k.id === inherited.model.kind)?.label ?? "Porcentaje"}` }, ...MODEL_KINDS.map((k) => ({ value: k.id, label: k.label }))]} />
            <span className="caption">{gradeKind ? `${MODEL_KINDS.find((k) => k.id === gradeKind).hint} Escala, curvas, crédito parcial y fórmula se ajustan después en la pestaña Calificación de la actividad.` : `Ahora: ${describeModel(inherited.model)}. Cámbialo para esta actividad o en Resultados › Calificación para toda la clase.`}</span>
          </label>
        );
      })()}
      {kind === "exam" && qc?.holds && !paper && (
        <label className="check-row"><input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
          <span>Reservar estas preguntas para este simulacro <span className="caption">(nadie del colegio las usa en tareas ni juegos, y los estudiantes no las ven en la práctica libre hasta la fecha de entrega)</span></span></label>
      )}
      {!paper && <label className="check-row"><input type="checkbox" checked={proctor} onChange={(e) => setProctor(e.target.checked)} />
        <span>Monitorear el examen <span className="caption">(avisarte cuando un estudiante sale de la pestaña; el estudiante lo ve)</span></span></label>}
      {kind !== "exam" && !paper && (
        <label className="check-row"><input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} />
          <span>Permitir pistas antes de responder <span className="caption">(“Pista”, generada con IA)</span></span></label>
      )}
      {!paper && <label className="check-row"><input type="checkbox" checked={defsOn} onChange={(e) => setDefsOn(e.target.checked)} />
        <span>Mostrar definiciones de palabras <span className="caption">(las escribes tú; salen al tocar la palabra en textos y opciones)</span></span></label>}
      {defsOn && !paper && (
        <div className="glossary-edit">
          {defs.map((d, i) => (
            <div key={i} className="glossary-row">
              <input aria-label="Palabra" placeholder="Palabra" value={d.term} onChange={(e) => setDefs(defs.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))} />
              <input aria-label="Definición" placeholder="Definición" value={d.def} onChange={(e) => setDefs(defs.map((x, j) => (j === i ? { ...x, def: e.target.value } : x)))} />
              {defs.length > 1 && <button type="button" className="link" onClick={() => setDefs(defs.filter((_, j) => j !== i))} aria-label="Quitar palabra">Quitar</button>}
            </div>
          ))}
          <button type="button" className="link" onClick={() => setDefs([...defs, { term: "", def: "" }])}>+ Agregar palabra</button>
        </div>
      )}
        </>
      )}
      {msg && <p className="notice error" role="alert">{msg}</p>}
      <div className="report-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Guardando…" : lesson ? lesson.label ?? "Guardar clase" : live ? "Crear sala" : paper ? (courseIds.length > 1 ? `Crear para ${courseIds.length} cursos e imprimir` : "Crear e imprimir") : courseIds.length > 1 ? `Asignar a ${courseIds.length} cursos` : "Asignar"}</button>
      </div>
    </form>
  );

  const open = preview ? byKey.get(preview) : null;
  return (
    <div className="builder">
      <div className="segmented small b-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={panel === "bank"} className={panel === "bank" ? "seg active" : "seg"} onClick={() => setPanel("bank")}>Banco</button>
        <button type="button" role="tab" aria-selected={panel === "mine"} className={panel === "mine" ? "seg active" : "seg"} onClick={() => setPanel("mine")}>{lesson ? "Tu clase" : "Tu asignación"} ({picked.length})</button>
      </div>
      <div className={`b-grid show-${panel}`}>{bank}{mine}</div>
      {open && bundle && (
        <div className="b-modal" role="dialog" aria-modal="true" aria-label={`Pregunta ${open.number}`}>
          <div className="b-modal-card">
            <div className="section-head">
              <strong>Pregunta {open.number} · {open.section}</strong>
              <span>
                <button type="button" className={picked.includes(open.key) ? "secondary" : "primary"} disabled={!picked.includes(open.key) && blocked(open.key)} onClick={() => toggle(open.key)}>{picked.includes(open.key) ? "Quitar" : "Agregar"}</button>
                <button type="button" className="link" onClick={() => setPreview(null)}>Cerrar</button>
              </span>
            </div>
            <QuestionView question={open.question} answer={bundle.key?.get(open.key)} graded review={{ correctLetter: bundle.key?.get(open.key) ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
            {checks.get(open.key)?.level && (
              <p className={checks.get(open.key).level === "block" ? "notice error" : "notice"}>{checks.get(open.key).reasons.join(". ")}.</p>
            )}
            <UseHistory uses={index.get(open.key) ?? []} hold={holdOf(qc?.holds ?? [], slug, open.key)} schoolWide={qc?.schoolWide !== false} />
            <AiAnalysis row={bundle.enrich?.[String(open.number)]} correctLetter={bundle.key?.get(open.key) ?? null} meta={bundle.enrichMeta} />
            <p className="caption">La clave marcada es preliminar, no oficial.</p>
          </div>
        </div>
      )}
    </div>
  );
}
