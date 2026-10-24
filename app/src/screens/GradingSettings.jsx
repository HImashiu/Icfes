import { useEffect, useMemo, useState } from "react";
import { Select, confirmDialog } from "../components/Controls.jsx";
import { FORMULA_FUNCTIONS } from "../lib/formula.js";
import { FORMULA_VARS, MODEL_KINDS, SOURCE_LABEL, describeModel, gradeMany, normalizeModel, resolveModel, xpFactor } from "../lib/grading.js";

const AREAS = ["Lectura crítica", "Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
// Invented students for the preview: the same share right everywhere, nudged a little per area.
const SAMPLE = [["Muy bajo", 0.2], ["Bajo", 0.4], ["Medio", 0.55], ["Cerca del pase", 0.62], ["Alto", 0.8], ["Perfecto", 1]];
const sampleItems = () => SAMPLE.map(([label, p], k) => ({
  id: label, mode: "timed", minutes: 90, attemptNo: 1,
  perArea: AREAS.map((name, i) => ({ name, total: 10, answered: 10, correct: Math.min(10, Math.max(0, Math.round(p * 10) + ((i + k) % 3) - 1)) })),
}));

// Text field for a number: accepts a comma or a dot, commits when what is typed is a number.
function NumField({ label, value, onChange, hint, suffix }) {
  const [text, setText] = useState(String(value).replace(".", ","));
  useEffect(() => { if (Number(text.replace(",", ".")) !== Number(value)) setText(String(value).replace(".", ",")); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field"><span className="label">{label}</span>
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
  for (const c of courses) out.push({ key: `course:${c.id}`, scope: "course", id: c.id, courseId: c.id, label: `Espacio · ${c.name}` });
  for (const a of assignments) out.push({ key: `assignment:${a.id}`, scope: "assignment", id: a.id, courseId: a.course_id, label: `Asignación · ${a.title} (${a.courses?.name ?? ""})` });
  return out;
}

// Calificación: how results become numbers, per school, class space or assignment.
export default function GradingSettings({ api, profile, courses, assignments, models, reloadModels, guard, setNotice, initialTarget = null, embedded = false }) {
  const targets = useMemo(() => targetsFor({ profile, courses, assignments }), [profile, courses, assignments]);
  const [targetKey, setTargetKey] = useState(initialTarget ?? targets[0]?.key ?? "");
  const target = targets.find((t) => t.key === targetKey) ?? targets[0] ?? null;
  const own = target ? models.find((r) => r.scope === target.scope && r.scope_id === target.id) : null;
  // What applies above this level, shown when there is no model of its own.
  const inherited = useMemo(() => {
    if (!target) return resolveModel([], {});
    const above = { schoolId: profile.school_id, courseId: target.scope === "school" ? null : target.scope === "course" ? null : target.courseId };
    return resolveModel(models, target.scope === "assignment" ? { courseId: target.courseId, schoolId: profile.school_id } : target.scope === "course" ? { schoolId: profile.school_id } : above);
  }, [models, target, profile.school_id]);
  const [draft, setDraft] = useState(() => normalizeModel(own?.model ?? inherited.model));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(normalizeModel(own?.model ?? inherited.model)); }, [targetKey, own?.id, own?.model, inherited.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => normalizeModel({ ...d, ...patch }));
  const setIn = (key, patch) => setDraft((d) => normalizeModel({ ...d, [key]: { ...d[key], ...patch } }));
  const setCurve = (area, patch) => setDraft((d) => normalizeModel({ ...d, curves: { ...d.curves, [area]: { strict: 1, bonus: 0, ...d.curves[area], ...patch } } }));

  const preview = useMemo(() => gradeMany(sampleItems(), draft, {}), [draft]);
  const formulaError = draft.kind === "formula" ? preview.find((r) => r.error)?.error : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(normalizeModel(own?.model ?? inherited.model));
  const kind = MODEL_KINDS.find((k) => k.id === draft.kind);

  if (!target) return <p className="caption">Crea un espacio de clase para configurar su calificación.</p>;

  const save = async () => {
    if (formulaError) return;
    setBusy(true);
    await guard(async () => {
      await api.saveGradingModel({ schoolId: profile.school_id, userId: profile.id, scope: target.scope, scopeId: target.id, model: draft });
      await reloadModels();
      setNotice?.(`Modelo guardado para: ${target.label}. Los reportes ya lo usan.`);
    });
    setBusy(false);
  };
  const clear = async () => {
    if (!(await confirmDialog("¿Quitar este modelo? Se usará el del nivel superior.", { confirmLabel: "Quitar" }))) return;
    await guard(async () => { await api.clearGradingModel(target.scope, target.id); await reloadModels(); setNotice?.("Modelo quitado."); });
  };

  return (
    <>
      {!embedded && <header className="t-head"><div><h1>Calificación</h1><span className="caption">Elige cómo se convierten los aciertos en la nota que ven tú y tus estudiantes. Se aplica por colegio, espacio de clase o asignación; gana el más específico.</span></div></header>}
      <div className="card t-card assign-form grading">
        <label className="field"><span className="label">Aplicar a</span>
          <Select value={target.key} onChange={setTargetKey} aria-label="Aplicar a">{targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
          <span className="caption">{own ? `Tiene su propio modelo: ${describeModel(own.model)}.` : `Sin modelo propio: usa ${SOURCE_LABEL[inherited.source]} (${describeModel(inherited.model)}).`}</span></label>

        <label className="field"><span className="label">Cómo se calcula la nota</span>
          <Select value={draft.kind} onChange={(v) => set({ kind: v })} aria-label="Modelo">{MODEL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>
          <span className="caption">{kind.hint}</span></label>

        {draft.kind === "irt" && <p className="notice">El puntaje IRT es provisional: se calibra con las respuestas de tu grupo (media 50 y desviación 10 por área) y las claves son preliminares. Con menos de 15 entregas en un área se usa el estimado ICFES. Sirve para comparar dentro del grupo, no para predecir el puntaje oficial.</p>}
        {draft.kind === "icfes" && <p className="notice">La curva es provisional hasta calibrarla con resultados reales del ICFES.</p>}

        {(draft.kind === "scale" || draft.kind === "formula") && (
          <fieldset className="grade-box"><legend className="label">{draft.kind === "formula" ? "Escala de referencia (variable «nota»)" : "Tu escala"}</legend>
            <div className="grade-grid">
              <NumField label="Mínima" value={draft.scale.min} onChange={(v) => setIn("scale", { min: v })} />
              <NumField label="Máxima" value={draft.scale.max} onChange={(v) => setIn("scale", { max: v })} />
              <NumField label="Nota para aprobar" value={draft.scale.pass} onChange={(v) => setIn("scale", { pass: v })} />
              <NumField label="Exigencia" suffix="%" value={draft.scale.passPct} onChange={(v) => setIn("scale", { passPct: v })} hint="Porcentaje de aciertos que da la nota de aprobar" />
              <NumField label="Decimales" value={draft.scale.decimals} onChange={(v) => setIn("scale", { decimals: v })} />
            </div>
          </fieldset>
        )}

        {draft.kind === "formula" && (
          <fieldset className="grade-box"><legend className="label">Tu fórmula</legend>
            <input className="grade-formula" aria-label="Fórmula" spellCheck="false" value={draft.formula.expr} onChange={(e) => setIn("formula", { expr: e.target.value })} placeholder="max(1, pct / 20 - hints * 0.1)" />
            {formulaError ? <p className="notice error" role="alert">{formulaError}</p> : <span className="caption">Operadores: + − × / % ^ y comparaciones (&lt; &gt; == != &amp;&amp; ||). Funciones: {FORMULA_FUNCTIONS.join(", ")}. Con area("matematicas") obtienes el porcentaje de un área.</span>}
            <div className="chips-row" aria-label="Variables">
              {Object.entries(FORMULA_VARS).map(([v, d]) => <button key={v} type="button" className="chip" title={d} onClick={() => setIn("formula", { expr: `${draft.formula.expr}${draft.formula.expr && !/[\s(]$/.test(draft.formula.expr) ? " " : ""}${v}` })}>{v}</button>)}
            </div>
            <div className="grade-grid">
              <label className="field"><span className="label">Unidad (opcional)</span><input value={draft.formula.unit} maxLength={12} onChange={(e) => setIn("formula", { unit: e.target.value })} placeholder="pts" /></label>
              <NumField label="Decimales del resultado" value={draft.formula.decimals} onChange={(v) => setIn("formula", { decimals: v })} />
            </div>
          </fieldset>
        )}

        <fieldset className="grade-box"><legend className="label">Crédito parcial</legend>
          <div className="grade-grid">
            <NumField label="Respuesta correcta con pista vale" suffix="%" value={Math.round(draft.partial.hintCredit * 100)} onChange={(v) => setIn("partial", { hintCredit: v / 100 })} hint="100 % = las pistas no restan" />
            <NumField label="Cada respuesta incorrecta resta" value={draft.partial.wrongPenalty} onChange={(v) => setIn("partial", { wrongPenalty: v })} hint="0 = no resta; 0,25 = un cuarto de acierto (azar de 4 opciones: 0,33)" />
          </div>
          <label className="field"><span className="label">Sobre qué se calcula</span>
            <Select value={draft.denominator} onChange={(v) => set({ denominator: v })} aria-label="Denominador">
              <option value="auto">Automático: simulacros sobre todas las preguntas, práctica sobre las respondidas</option>
              <option value="total">Siempre sobre todas las preguntas (lo no respondido cuenta como error)</option>
              <option value="answered">Siempre sobre las respondidas</option>
            </Select></label>
        </fieldset>

        <fieldset className="grade-box"><legend className="label">Curvas por área</legend>
          <span className="caption">Exigencia: 1 deja el porcentaje igual, más de 1 lo hace más estricto, menos de 1 más generoso. El ajuste suma o resta puntos al final.</span>
          {AREAS.map((a) => {
            const c = draft.curves[a] ?? { strict: 1, bonus: 0 };
            return (
              <div key={a} className="grade-grid curve-row">
                <strong>{a}</strong>
                <NumField label={`Exigencia · ${a}`} value={c.strict} onChange={(v) => setCurve(a, { strict: v })} />
                <NumField label={`Ajuste (puntos) · ${a}`} value={c.bonus} onChange={(v) => setCurve(a, { bonus: v })} />
              </div>
            );
          })}
        </fieldset>

        <fieldset className="grade-box"><legend className="label">XP en intentos repetidos</legend>
          <div className="grade-grid">
            <NumField label="Caída por intento" value={draft.xp.decay} onChange={(v) => setIn("xp", { decay: v })} hint="0 = sin caída. 1 = el intento n da 1/n del XP" />
            <NumField label="Mínimo" suffix="%" value={Math.round(draft.xp.floor * 100)} onChange={(v) => setIn("xp", { floor: v / 100 })} hint="Nunca baja de este porcentaje" />
          </div>
          {draft.xp.decay > 0 && <span className="caption">Intento 1: 100 % · intento 2: {Math.round(xpFactor(draft, 2) * 100)} % · intento 3: {Math.round(xpFactor(draft, 3) * 100)} % · intento 5: {Math.round(xpFactor(draft, 5) * 100)} %. Aplica a las asignaciones con este modelo.</span>}
        </fieldset>

        <div>
          <span className="label">Vista previa con estudiantes inventados (mismo porcentaje en todas las áreas)</span>
          <div className="table-wrap">
            <table className="t-table">
              <thead><tr><th>Estudiante</th><th>Aciertos</th><th>Nota con este modelo</th></tr></thead>
              <tbody>
                {SAMPLE.map(([label, p], i) => (
                  <tr key={label}><td>{label}</td><td>{Math.round(preview[i].rawPct ?? 0)} %</td><td><strong>{preview[i].display}</strong>{preview[i].low != null && <span className="caption"> ({preview[i].low}–{preview[i].high})</span>}{preview[i].passed != null && <span className={preview[i].passed ? "badge" : "badge pending"}> {preview[i].passed ? "aprueba" : "no aprueba"}</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft.kind === "irt" && <span className="caption">La vista previa no tiene grupo, por eso muestra el estimado ICFES; en el reporte de una asignación se calibra con sus entregas.</span>}
        </div>

        <div className="report-actions">
          {own && <button type="button" className="secondary" onClick={clear}>Quitar este modelo</button>}
          <button type="button" className="primary" disabled={busy || Boolean(formulaError) || (!dirty && Boolean(own))} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
        <span className="caption">Las notas usan la clave preliminar de cada simulacro, no la oficial. Cambiar el modelo no borra nada: los reportes se recalculan con las respuestas guardadas.</span>
      </div>
    </>
  );
}
