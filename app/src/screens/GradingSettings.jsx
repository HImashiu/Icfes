import { useEffect, useMemo, useState } from "react";
import { Select, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { FORMULA_FUNCTIONS } from "../lib/formula.js";
import { areaColor } from "../lib/brand.js";
import { progressRows, questionsForAttempt } from "../lib/assignments.js";
import { FORMULA_VARS, MODEL_KINDS, describeModel, formatValue, gradeMany, itemFromRow, normalizeModel, resolveModel, xpFactor } from "../lib/grading.js";
import { classLabel, groupOf } from "../lib/teaching.js";
import Gradebook from "./Gradebook.jsx";
import "./results.css";

const AREAS = ["Lectura crítica", "Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
// Invented students for when there are no deliveries yet: the same share right everywhere, nudged a little per area.
const SAMPLE = [["Muy bajo", 0.2], ["Bajo", 0.4], ["Medio", 0.55], ["Cerca del pase", 0.62], ["Alto", 0.8], ["Perfecto", 1]];
const sampleItems = () => SAMPLE.map(([label, p], k) => ({
  id: label, mode: "timed", minutes: 90, attemptNo: 1,
  perArea: AREAS.map((name, i) => ({ name, total: 10, answered: 10, correct: Math.min(10, Math.max(0, Math.round(p * 10) + ((i + k) % 3) - 1)) })),
}));
// 30 right out of 50, six per area: the worked example on every method card.
const EXAMPLE = { id: "ej", mode: "timed", minutes: 60, attemptNo: 1, perArea: AREAS.map((name) => ({ name, total: 10, answered: 10, correct: 6 })) };

// Plain words for each method: what it does and when to use it.
const PLAIN = {
  percent: { title: "Porcentaje de aciertos", what: "La nota es el porcentaje de preguntas correctas, sin convertir.", when: "Para ver el desempeño tal cual, en prácticas y tareas." },
  scale: { title: "Escala del colegio (ej. 1,0 a 5,0)", what: "Convierte el porcentaje a tu escala. Tú decides la exigencia: con ese porcentaje se saca la nota mínima para aprobar.", when: "Para las notas que van al boletín o a la planilla." },
  icfes: { title: "Estimado Saber 11 (0 a 500)", what: "Simula el puntaje del ICFES: descuenta el azar y pondera las áreas como el examen real.", when: "En simulacros completos (Sesión 1 + 2), para orientar. Curva provisional, no es el puntaje oficial." },
  irt: { title: "Puntaje por dificultad (IRT)", what: "Acertar preguntas que casi nadie acertó vale más. Compara a cada estudiante con su propio grupo.", when: "Con 15 entregas o más. Con menos, usa el estimado Saber 11." },
  formula: { title: "Tu propia fórmula", what: "Escribe la regla como en una hoja de cálculo, por ejemplo restar por pistas o bonificar por tiempo.", when: "Para reglas especiales del área o del colegio." },
};

// Text field for a number: accepts a comma or a dot, commits when what is typed is a number.
function NumField({ label, value, onChange, hint, suffix, bare = false }) {
  const [text, setText] = useState(String(value).replace(".", ","));
  useEffect(() => { if (Number(text.replace(",", ".")) !== Number(value)) setText(String(value).replace(".", ",")); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={bare ? "field bare" : "field"}>{!bare && <span className="label">{label}</span>}
      <span className="grade-num"><input inputMode="decimal" value={text} aria-label={label} onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
      }} />{suffix && <span className="caption">{suffix}</span>}</span>
      {hint && <span className="caption">{hint}</span>}</label>
  );
}

export function targetsFor({ profile, courses, assignments }) {
  const out = [];
  if (profile.role === "school_admin") out.push({ key: `school:${profile.school_id}`, scope: "school", id: profile.school_id, label: "Todo el colegio" });
  for (const c of courses) out.push({ key: `course:${c.id}`, scope: "course", id: c.id, courseId: c.id, label: `Clase · ${classLabel(c)}`, name: classLabel(c) });
  for (const a of assignments) out.push({ key: `assignment:${a.id}`, scope: "assignment", id: a.id, courseId: a.course_id, label: `Asignación · ${a.title} (${a.courses?.name ?? ""})`, name: a.title });
  return out;
}

const LEVELS = [
  { id: "school", label: "Todo el colegio", hint: "Lo usan todas las clases que no tengan su propia calificación." },
  { id: "course", label: "Una clase", hint: "Por ejemplo Matemáticas 11 A. Gana sobre la del colegio." },
  { id: "assignment", label: "Una actividad", hint: "Solo esa tarea o simulacro. Gana sobre la de su clase." },
];

// Calificación: what it is, where it applies, which method, its settings and how it changes real grades, then save.
// Outside an activity it also holds the Planilla de notas (final notes per class).
export default function GradingSettings({ api, profile, courses, assignments, models, reloadModels, guard, setNotice, initialTarget = null, embedded = false, fetchExam = null }) {
  const [page, setPage] = useState("metodo");
  if (embedded) return <GradingWizard {...{ api, profile, courses, assignments, models, reloadModels, guard, setNotice, initialTarget, embedded, fetchExam }} />;
  return (
    <>
      <header className="t-head gw-intro">
        <div>
          <h1>Calificación</h1>
          <span className="caption">La calificación convierte las respuestas de cada estudiante en una nota: la que ves en los resultados, la que va a la planilla y la que exportas. No cambia lo que respondieron; si la cambias, todo se recalcula.</span>
        </div>
      </header>
      <div className="seg-tabs gw-pages" role="tablist" aria-label="Calificación">
        {[["metodo", "Cómo se califica"], ["planilla", "Notas finales"]].map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={page === id} className={page === id ? "on" : ""} onClick={() => setPage(id)}>{l}</button>)}
      </div>
      {page === "metodo"
        ? <GradingWizard {...{ api, profile, courses, assignments, models, reloadModels, guard, setNotice, initialTarget, embedded, fetchExam }} />
        : <Gradebook {...{ api, profile, courses, assignments, models, guard, fetchExam, reloadModels, setNotice }} onEditRule={() => setPage("metodo")} />}
    </>
  );
}

function GradingWizard({ api, profile, courses, assignments, models, reloadModels, guard, setNotice, initialTarget, embedded, fetchExam }) {
  const targets = useMemo(() => targetsFor({ profile, courses, assignments }), [profile, courses, assignments]);
  const [targetKey, setTargetKey] = useState(initialTarget ?? targets.find((t) => t.scope === "course")?.key ?? targets[0]?.key ?? "");
  const target = targets.find((t) => t.key === targetKey) ?? targets[0] ?? null;
  const level = target?.scope ?? "course";
  const own = target ? models.find((r) => r.scope === target.scope && r.scope_id === target.id) : null;
  // What applies above this level, shown when there is no model of its own.
  const inherited = useMemo(() => {
    if (!target) return resolveModel([], {});
    if (target.scope === "assignment") return resolveModel(models, { courseId: target.courseId, schoolId: profile.school_id });
    if (target.scope === "course") return resolveModel(models, { schoolId: profile.school_id });
    return resolveModel([], {});
  }, [models, target, profile.school_id]);
  const [draft, setDraft] = useState(() => normalizeModel(own?.model ?? inherited.model));
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { setDraft(normalizeModel(own?.model ?? inherited.model)); }, [targetKey, own?.id, own?.model, inherited.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => normalizeModel({ ...d, ...patch }));
  const setIn = (key, patch) => setDraft((d) => normalizeModel({ ...d, [key]: { ...d[key], ...patch } }));
  const setCurve = (area, patch) => setDraft((d) => normalizeModel({ ...d, curves: { ...d.curves, [area]: { strict: 1, bonus: 0, ...d.curves[area], ...patch } } }));

  const examples = useMemo(() => Object.fromEntries(MODEL_KINDS.map((k) => [k.id, gradeMany([EXAMPLE], { ...draft, kind: k.id }, {})[0]])), [draft]);
  const formulaError = draft.kind === "formula" ? examples.formula?.error : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(normalizeModel(own?.model ?? inherited.model));

  if (!target) return <p className="caption">Crea una clase para configurar su calificación.</p>;
  const levels = LEVELS.filter((l) => targets.some((t) => t.scope === l.id));
  const pickLevel = (id) => {
    if (id === level) return;
    const same = id === "course" ? targets.find((t) => t.scope === "course" && t.id === target.courseId) : id === "assignment" ? targets.find((t) => t.scope === "assignment" && t.courseId === target.courseId) : null;
    setTargetKey((same ?? targets.find((t) => t.scope === id))?.key ?? targetKey);
  };
  const whereName = target.scope === "school" ? "todo el colegio" : target.scope === "course" ? `la clase ${target.name}` : `la actividad «${target.name}»`;

  const save = async () => {
    if (formulaError) return;
    setBusy(true);
    await guard(async () => {
      await api.saveGradingModel({ schoolId: profile.school_id, userId: profile.id, scope: target.scope, scopeId: target.id, model: draft });
      await reloadModels();
      setNotice?.(`Calificación guardada para ${whereName}. Los resultados y la planilla ya la usan.`);
    });
    setBusy(false);
  };
  const clear = async () => {
    if (!(await confirmDialog("¿Quitar esta calificación? Se usará la del nivel superior.", { confirmLabel: "Quitar" }))) return;
    await guard(async () => { await api.clearGradingModel(target.scope, target.id); await reloadModels(); setNotice?.("Calificación quitada."); });
  };

  return (
    <div className="gw">
      {embedded && <p className="caption gw-lead">La calificación convierte las respuestas en la nota de esta actividad. Por defecto usa la de su clase; elige otra solo si esta actividad lo necesita.</p>}

      <section className="card t-card gw-step">
        <span className="gw-n">1</span>
        <div className="gw-body">
          <strong>¿A qué se aplica?</strong>
          <div className="gw-levels" role="radiogroup" aria-label="Nivel">
            {levels.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className={level === l.id ? "gw-level on" : "gw-level"} onClick={() => pickLevel(l.id)}>
                <strong>{l.label}</strong><span className="caption">{l.hint}</span>
              </button>
            ))}
          </div>
          {level !== "school" && targets.filter((t) => t.scope === level).length > 1 && (
            <Select aria-label={level === "course" ? "Clase" : "Actividad"} value={target.key} onChange={setTargetKey}
              options={targets.filter((t) => t.scope === level).map((t) => ({ value: t.key, label: t.scope === "assignment" ? `${t.name}${courses.find((c) => c.id === t.courseId) ? ` · ${groupOf(courses.find((c) => c.id === t.courseId)).name}` : ""}` : t.name }))} />
          )}
          <Chain target={target} models={models} profile={profile} courses={courses} />
        </div>
      </section>

      <section className="card t-card gw-step">
        <span className="gw-n">2</span>
        <div className="gw-body">
          <strong>Elige el método</strong>
          <span className="caption">Cada tarjeta muestra qué nota sacaría alguien con 30 de 50 aciertos (60 %).</span>
          <div className="gw-kinds" role="radiogroup" aria-label="Método">
            {MODEL_KINDS.map((k) => {
              const ex = examples[k.id];
              return (
                <button key={k.id} type="button" role="radio" aria-checked={draft.kind === k.id} className={draft.kind === k.id ? "gw-kind on" : "gw-kind"} onClick={() => set({ kind: k.id })}>
                  <span className="gw-kind-top"><strong>{PLAIN[k.id].title}</strong><span className="gw-ex" title="30 de 50 aciertos">{ex?.ok ? ex.display : "—"}</span></span>
                  <span>{PLAIN[k.id].what}</span>
                  <span className="caption">{PLAIN[k.id].when}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {(draft.kind === "scale" || draft.kind === "formula") && (
        <section className="card t-card gw-step">
          <span className="gw-n">3</span>
          <div className="gw-body">
            <strong>{draft.kind === "formula" ? "Tu fórmula" : "Tu escala"}</strong>
            {draft.kind === "scale" && <ScaleLine scale={draft.scale} />}
            {draft.kind === "formula" && (
              <>
                <input className="grade-formula" aria-label="Fórmula" spellCheck="false" value={draft.formula.expr} onChange={(e) => setIn("formula", { expr: e.target.value })} placeholder="max(1, pct / 20 - hints * 0.1)" />
                {formulaError ? <p className="notice error" role="alert">{formulaError}</p> : <span className="caption">Operadores: + − × / % ^ y comparaciones (&lt; &gt; == != &amp;&amp; ||). Funciones: {FORMULA_FUNCTIONS.join(", ")}. Con area("matematicas") obtienes el porcentaje de un área.</span>}
                <div className="chips-row" aria-label="Variables">
                  {Object.entries(FORMULA_VARS).map(([v, d]) => <button key={v} type="button" className="chip" title={d} onClick={() => setIn("formula", { expr: `${draft.formula.expr}${draft.formula.expr && !/[\s(]$/.test(draft.formula.expr) ? " " : ""}${v}` })}>{v}</button>)}
                </div>
                <div className="grade-grid">
                  <label className="field"><span className="label">Unidad (opcional)</span><input value={draft.formula.unit} maxLength={12} onChange={(e) => setIn("formula", { unit: e.target.value })} placeholder="pts" /></label>
                  <NumField label="Decimales del resultado" value={draft.formula.decimals} onChange={(v) => setIn("formula", { decimals: v })} />
                </div>
                <span className="label">Escala de referencia (variable «nota»)</span>
              </>
            )}
            <div className="grade-grid">
              <NumField label="Nota mínima" value={draft.scale.min} onChange={(v) => setIn("scale", { min: v })} />
              <NumField label="Nota máxima" value={draft.scale.max} onChange={(v) => setIn("scale", { max: v })} />
              <NumField label="Nota para aprobar" value={draft.scale.pass} onChange={(v) => setIn("scale", { pass: v })} />
              <NumField label="Exigencia" suffix="%" value={draft.scale.passPct} onChange={(v) => setIn("scale", { passPct: v })} hint="Aciertos que dan la nota para aprobar" />
              <NumField label="Decimales" value={draft.scale.decimals} onChange={(v) => setIn("scale", { decimals: v })} />
            </div>
          </div>
        </section>
      )}
      {draft.kind === "irt" && <p className="notice">El puntaje IRT es provisional: se calibra con las respuestas de tu grupo (media 50 y desviación 10 por área) y las claves son preliminares. Con menos de 15 entregas en un área se usa el estimado Saber 11. Sirve para comparar dentro del grupo, no para predecir el puntaje oficial.</p>}
      {draft.kind === "icfes" && <p className="notice">La curva es provisional hasta calibrarla con resultados reales del ICFES. El puntaje completo sale de Sesión 1 + Sesión 2.</p>}

      <section className="card t-card gw-step">
        <span className="gw-n">{draft.kind === "scale" || draft.kind === "formula" ? 4 : 3}</span>
        <div className="gw-body">
          <button type="button" className="gw-more" aria-expanded={more} onClick={() => setMore(!more)}>
            <strong>Ajustes opcionales</strong>
            <span className="caption">{[draft.partial.hintCredit < 1 && "pistas", draft.partial.wrongPenalty > 0 && "errores restan", Object.keys(draft.curves).length && "curvas", draft.xp.decay > 0 && "XP"].filter(Boolean).join(", ") || "Pistas, errores que restan, curvas por área y XP: todo apagado"}</span>
            <span className="chev"><Icon name="right" size={14} strokeWidth={3} /></span>
          </button>
          {more && (
            <>
              <fieldset className="grade-box"><legend className="label">Crédito parcial</legend>
                <div className="grade-grid">
                  <NumField label="Respuesta correcta con pista vale" suffix="%" value={Math.round(draft.partial.hintCredit * 100)} onChange={(v) => setIn("partial", { hintCredit: v / 100 })} hint="100 % = las pistas no restan" />
                  <NumField label="Cada respuesta incorrecta resta" value={draft.partial.wrongPenalty} onChange={(v) => setIn("partial", { wrongPenalty: v })} hint="0 = no resta; 0,33 descuenta el azar de 4 opciones" />
                </div>
                <label className="field"><span className="label">Sobre qué se calcula</span>
                  <Select value={draft.denominator} onChange={(v) => set({ denominator: v })} aria-label="Denominador">
                    <option value="auto">Automático: simulacros sobre todas las preguntas, práctica sobre las respondidas</option>
                    <option value="total">Siempre sobre todas las preguntas (lo no respondido cuenta como error)</option>
                    <option value="answered">Siempre sobre las respondidas</option>
                  </Select></label>
              </fieldset>
              <fieldset className="grade-box"><legend className="label">Curvas por área</legend>
                <span className="caption">Exigencia 1 deja el porcentaje igual; más de 1 lo hace más estricto, menos de 1 más generoso. El ajuste suma o resta puntos al final.</span>
                <div className="gs-curves" role="table" aria-label="Curvas por área">
                  <div className="gs-curve head" role="row"><span role="columnheader">Área</span><span role="columnheader">Exigencia</span><span role="columnheader">Ajuste (puntos)</span><span role="columnheader">60 % queda en</span></div>
                  {AREAS.map((a) => {
                    const c = draft.curves[a] ?? { strict: 1, bonus: 0 };
                    const at60 = Math.max(0, Math.min(100, Math.round(100 * 0.6 ** c.strict + c.bonus)));
                    return (
                      <div key={a} className="gs-curve" role="row">
                        <span role="cell" className="gs-area"><span className="dot" style={{ background: areaColor(a) }} />{a}</span>
                        <span role="cell"><NumField bare label={`Exigencia · ${a}`} value={c.strict} onChange={(v) => setCurve(a, { strict: v })} /></span>
                        <span role="cell"><NumField bare label={`Ajuste (puntos) · ${a}`} value={c.bonus} onChange={(v) => setCurve(a, { bonus: v })} /></span>
                        <span role="cell" className={at60 < 60 ? "gs-at down" : at60 > 60 ? "gs-at up" : "gs-at"}>{at60} %</span>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="grade-box"><legend className="label">XP en intentos repetidos</legend>
                <div className="grade-grid">
                  <NumField label="Caída por intento" value={draft.xp.decay} onChange={(v) => setIn("xp", { decay: v })} hint="0 = sin caída. 1 = el intento n da 1/n del XP" />
                  <NumField label="Mínimo" suffix="%" value={Math.round(draft.xp.floor * 100)} onChange={(v) => setIn("xp", { floor: v / 100 })} hint="Nunca baja de este porcentaje" />
                </div>
                {draft.xp.decay > 0 && <span className="caption">Intento 1: 100 % · intento 2: {Math.round(xpFactor(draft, 2) * 100)} % · intento 3: {Math.round(xpFactor(draft, 3) * 100)} % · intento 5: {Math.round(xpFactor(draft, 5) * 100)} %.</span>}
              </fieldset>
            </>
          )}
        </div>
      </section>

      <RealPreview api={api} fetchExam={fetchExam} profile={profile} target={target} targets={targets} assignments={assignments} courses={courses} models={models} draft={draft} guard={guard} />

      <div className="gw-save">
        <span className="caption">{own ? (dirty ? "Cambios sin guardar." : `Guardada para ${whereName}.`) : `${whereName[0].toUpperCase()}${whereName.slice(1)} aún no tiene calificación propia.`} {describeModel(draft)}.</span>
        <span className="gw-save-btns">
          {own && <button type="button" className="secondary" onClick={clear}>Quitar</button>}
          <button type="button" className="primary" disabled={busy || Boolean(formulaError) || (!dirty && Boolean(own))} onClick={save}>{busy ? "Guardando…" : dirty || !own ? `Guardar para ${target.scope === "school" ? "el colegio" : target.scope === "course" ? "la clase" : "la actividad"}` : "Guardado"}</button>
        </span>
      </div>
      <span className="caption">Las notas usan la clave preliminar de cada cuadernillo, no la oficial. Cambiar la calificación no borra nada.</span>
    </div>
  );
}

// Where the grading of this level comes from (activity → class → school, the nearest one wins), said in one sentence.
function Chain({ target, models, profile, courses }) {
  const find = (scope, id) => (id ? models.find((r) => r.scope === scope && r.scope_id === id) : null);
  const course = courses.find((c) => c.id === target.courseId);
  const own = { assignment: find("assignment", target.id), course: find("course", target.courseId), school: find("school", profile.school_id) };
  const name = (row) => describeModel(row.model).split(" · ")[0];
  const self = target.scope === "assignment" ? "Esta actividad" : target.scope === "course" ? `${course ? classLabel(course) : "Esta clase"}` : "El colegio";
  let text;
  let mine = false;
  if (own[target.scope]) { mine = true; text = <>{self} usa su propia calificación: <b>{name(own[target.scope])}</b>.</>; }
  else {
    const from = target.scope === "assignment" && own.course ? ["la de su clase", own.course] : target.scope !== "school" && own.school ? ["la del colegio", own.school] : null;
    text = from
      ? <>{self} no tiene calificación propia: usa {from[0]}, <b>{name(from[1])}</b>. Elige un método abajo solo si necesita otra.</>
      : <>{self} no tiene calificación propia: usa la de siempre, <b>porcentaje de aciertos</b>. Elige un método abajo para cambiarla.</>;
  }
  return (
    <p className={mine ? "gw-source own" : "gw-source"} aria-label="De dónde sale la calificación">
      <Icon name={mine ? "check" : "bulb"} size={16} strokeWidth={2.6} /><span>{text}</span>
    </p>
  );
}

// The scale as a ruler: 0 % → min, exigencia → pass, 100 % → max.
function ScaleLine({ scale }) {
  const f = (v) => Number(v).toLocaleString("es-CO", { minimumFractionDigits: scale.decimals, maximumFractionDigits: scale.decimals });
  return (
    <div className="gw-ruler" aria-label={`0 % da ${f(scale.min)}, ${scale.passPct} % da ${f(scale.pass)}, 100 % da ${f(scale.max)}`}>
      <span className="gw-ruler-bar"><span className="no" style={{ width: `${scale.passPct}%` }} /><span className="yes" style={{ width: `${100 - scale.passPct}%` }} /></span>
      <span className="gw-ruler-mark" style={{ left: 0 }}><b>{f(scale.min)}</b><span>0 %</span></span>
      <span className="gw-ruler-mark" style={{ left: `${scale.passPct}%` }}><b>{f(scale.pass)}</b><span>{scale.passPct} %</span></span>
      <span className="gw-ruler-mark end" style={{ left: "100%" }}><b>{f(scale.max)}</b><span>100 %</span></span>
    </div>
  );
}

// How the chosen method would change the grades of real students of one activity, before saving.
function RealPreview({ api, fetchExam, profile, target, assignments, courses, models, draft, guard }) {
  const pool = useMemo(() => {
    const list = target.scope === "assignment" ? assignments.filter((a) => a.id === target.id)
      : target.scope === "course" ? assignments.filter((a) => a.course_id === target.id) : assignments;
    return list.filter((a) => a.status !== "draft").sort((x, y) => String(y.due_at ?? y.created_at ?? "").localeCompare(String(x.due_at ?? x.created_at ?? "")));
  }, [target, assignments]);
  const [pick, setPick] = useState("");
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const chosen = pool.find((a) => a.id === pick) ?? pool[0] ?? null;
  useEffect(() => {
    if (!chosen || !api?.assignmentAttempts) { setData(null); return undefined; }
    let alive = true;
    setData("loading");
    (async () => {
      try {
        const [members, attempts, b] = await Promise.all([api.listMembers(chosen.course_id), api.assignmentAttempts(chosen.id), fetchExam ? fetchExam(chosen.exam_slug, chosen.question_keys).catch(() => null) : null]);
        if (alive) setData({ rows: progressRows(members, attempts).rows.filter((r) => r.attempt), ctx: b ? { questions: questionsForAttempt(b.exam, { scope: chosen.scope, keys: chosen.question_keys }), key: b.key } : {} });
      } catch { if (alive) setData(null); }
    })();
    return () => { alive = false; };
  }, [api, fetchExam, chosen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // What applies to this activity now, and what would apply once the draft is saved at the chosen level.
  const where = chosen ? { assignmentId: chosen.id, courseId: chosen.course_id, schoolId: profile.school_id } : {};
  const now = resolveModel(models, where);
  const sim = [...models.filter((r) => !(r.scope === target.scope && r.scope_id === target.id)), { scope: target.scope, scope_id: target.id, model: draft }];
  const next = resolveModel(sim, where);
  const shadowed = chosen && next.source !== target.scope;
  const real = data && data !== "loading" && data.rows.length > 0;
  const items = useMemo(() => (real ? data.rows.map((r) => itemFromRow(r.attempt)) : sampleItems()), [data, real]);
  const ctx = useMemo(() => (real ? data.ctx : {}), [data, real]);
  const names = real ? data.rows.map((r) => r.name) : SAMPLE.map(([l]) => `${l} (inventado)`);
  const before = useMemo(() => gradeMany(items, now.model, ctx), [items, now.model, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => gradeMany(items, shadowed ? draft : next.model, ctx), [items, next.model, draft, shadowed, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const every = useMemo(() => (all ? MODEL_KINDS.map((k) => ({ k, out: gradeMany(items, { ...draft, kind: k.id }, ctx) })) : []), [all, items, draft, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = (list) => { const v = list.filter((g) => g.ok).map((g) => g.value); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const passes = (list) => (list.some((g) => g.passed != null) ? list.filter((g) => g.passed).length : null);
  const same = now.model.kind === draft.kind;
  const order = items.map((_, i) => i).sort((a, b) => (before[a].rawPct ?? 0) - (before[b].rawPct ?? 0));

  return (
    <section className="card t-card gw-step gw-preview">
      <span className="gw-n"><Icon name="chart" size={16} /></span>
      <div className="gw-body">
        <div className="section-head"><strong>Así cambiarían las notas</strong>
          <label className="gw-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Comparar todos los métodos</label></div>
        {pool.length > 1 && (
          <Select aria-label="Actividad de ejemplo" value={chosen?.id ?? ""} onChange={setPick}
            options={pool.slice(0, 60).map((a) => ({ value: a.id, label: `${a.title}${courses.find((c) => c.id === a.course_id) ? ` · ${groupOf(courses.find((c) => c.id === a.course_id)).name}` : ""}` }))} />
        )}
        {data === "loading" && <span className="caption">Cargando entregas…</span>}
        {!real && data !== "loading" && <span className="caption">{chosen ? "Esta actividad aún no tiene entregas: se muestran estudiantes inventados." : "Sin actividades todavía: se muestran estudiantes inventados."}</span>}
        {shadowed && <p className="notice">«{chosen.title}» tiene su propia calificación ({describeModel(next.model).split(" · ")[0]}), así que guardar aquí no la cambia. La columna «Con este método» muestra cómo quedaría si la usara.</p>}
        <div className="gw-sum">
          <div><span className="label">Promedio</span><strong>{formatValue(now.model, avg(before))} <Icon name="right" size={14} strokeWidth={3} /> {formatValue(draft, avg(after))}</strong></div>
          {(passes(before) != null || passes(after) != null) && <div><span className="label">Aprueban</span><strong>{passes(before) ?? "—"} <Icon name="right" size={14} strokeWidth={3} /> {passes(after) ?? "—"}</strong><span className="caption">de {items.length}</span></div>}
          <div><span className="label">Hoy se usa</span><strong className="gw-small">{describeModel(now.model).split(" · ")[0]}</strong></div>
        </div>
        <div className="table-wrap gw-table">
          <table className="t-table">
            <thead><tr><th>Estudiante</th><th>Aciertos</th><th>Ahora</th><th>Con este método</th>{!all && same && <th>Cambio</th>}{every.map(({ k }) => <th key={k.id}>{PLAIN[k.id].title.split(" (")[0]}</th>)}</tr></thead>
            <tbody>
              {order.map((i) => {
                const d = same && before[i].ok && after[i].ok ? after[i].value - before[i].value : null;
                return (
                  <tr key={i}>
                    <td>{names[i]}</td>
                    <td>{Math.round(before[i].rawPct ?? 0)} %</td>
                    <td>{before[i].display}{before[i].passed === false && <span className="badge pending"> no aprueba</span>}</td>
                    <td><strong>{after[i].display}</strong>{after[i].passed === false && <span className="badge pending"> no aprueba</span>}</td>
                    {!all && same && <td className={d > 0 ? "gw-up" : d < 0 ? "gw-down" : ""}>{d == null || Math.abs(d) < 1e-9 ? "=" : `${d > 0 ? "+" : "−"}${formatValue(draft, Math.abs(d)).replace(" %", "")}`}</td>}
                    {every.map(({ k, out }) => <td key={k.id} className={k.id === draft.kind ? "gw-cur" : ""}>{out[i].display}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <span className="caption">Ordenados por aciertos, de menos a más. Nada se guarda hasta que toques «Guardar». La nota final de la clase se arma en «Notas finales».</span>
      </div>
    </section>
  );
}
