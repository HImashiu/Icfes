import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import QuestionView from "../components/QuestionView.jsx";
import { areaColor } from "../lib/brand.js";
import { CAUSES, causeLabel, causeSummary, filterNotebook, loadNotes, notebook, practiceGroups, saveNote, EMPTY_FILTER } from "../lib/errors.js";
import { explanationOf } from "../lib/lesson.js";
import { loadHistory } from "../lib/local.js";
import { bookletCode, sessionOf } from "../lib/booklets.js";
import { daysUntil, loadGoal } from "../lib/goal.js";
import { practiceInsights } from "../lib/student.js";
import { weekPlan } from "../lib/studyPlan.js";
import "./study.css";

const ago = (t) => {
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};
const bookName = (slug) => `Cuadernillo ${bookletCode(slug)} · Sesión ${sessionOf(slug)}`;

// Cuaderno de errores: cada pregunta fallada, con por qué crees que la fallaste, una nota tuya, la pregunta a la
// vista con tu respuesta y la explicación, y rondas para practicar las pendientes. Solo lo ves tú.
export function ErrorNotebook({ fetchExam, onPracticeKeys }) {
  const [notes, setNotes] = useState(() => loadNotes());
  const entries = useMemo(() => notebook(loadHistory(), notes), [notes]);
  const [f, setF] = useState(EMPTY_FILTER);
  const [open, setOpen] = useState(null);
  const [show, setShow] = useState(null);
  const [bundles, setBundles] = useState({});
  const [limit, setLimit] = useState(12);
  const slugs = useMemo(() => [...new Set(entries.map((e) => e.slug))], [entries]);
  // The booklets are read once, to name each question's area and to show it with the student's answer.
  useEffect(() => {
    if (!fetchExam) return;
    for (const s of slugs) if (!(s in bundles)) fetchExam(s).then((b) => setBundles((x) => ({ ...x, [s]: b })), () => setBundles((x) => ({ ...x, [s]: null })));
  }, [slugs]); // eslint-disable-line react-hooks/exhaustive-deps
  const qOf = (e) => bundles[e.slug]?.exam.questions.find((q) => q.key === e.key) ?? null;
  const full = useMemo(() => entries.map((e) => ({ ...e, area: e.area ?? qOf(e)?.section ?? null, number: qOf(e)?.number ?? e.number })), [entries, bundles]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = filterNotebook(full, f);
  const sum = causeSummary(full);
  const groups = practiceGroups(filterNotebook(full, { ...f, state: "pending" }));
  const areas = [...new Set(full.map((e) => e.area).filter(Boolean))];
  const tag = (id, patch) => setNotes(saveNote(id, patch));

  if (entries.length === 0) {
    return (
      <div className="card sh-allclear">
        <Mascot size={72} pose="happy" />
        <div><strong>Tu cuaderno de errores está vacío</strong><span className="caption">Cada pregunta que falles en una práctica aparece aquí, para que anotes por qué y la recuperes después.</span></div>
      </div>
    );
  }
  return (
    <div className="st-wrap">
      <div className="card st-summary">
        <div className="st-kpis">
          <span><b className="bad-text">{sum.pending}</b><span className="caption">por recuperar</span></span>
          <span><b className="ok-text">{sum.recovered}</b><span className="caption">recuperadas</span></span>
          <span><b>{sum.untagged}</b><span className="caption">sin clasificar</span></span>
        </div>
        {sum.counts.length > 0 && (
          <div className="st-causes" aria-label="Por qué fallas">
            {sum.counts.map((c) => (
              <button key={c.id} type="button" className={f.cause === c.id ? "st-cause on" : "st-cause"} onClick={() => setF((x) => ({ ...x, cause: x.cause === c.id ? "" : c.id }))}>
                <span>{c.label}</span><span className="td-track"><span style={{ width: `${(c.n / Math.max(1, sum.pending)) * 100}%` }} /></span><b>{c.n}</b>
              </button>
            ))}
          </div>
        )}
        {sum.main ? <p className="st-tip"><Icon name="bolt" size={16} /><span><b>Tu error más común: {sum.main.label.toLowerCase()}.</b> {sum.main.tip}</span></p>
          : <p className="caption">Abre cada error y marca por qué crees que lo fallaste: así el cuaderno te dice qué cambiar.</p>}
      </div>

      {groups.length > 0 && (
        <div className="st-groups">
          {groups.map((g) => (
            <button key={g.slug} type="button" className="card st-group" onClick={() => onPracticeKeys?.(g.slug, g.keys.slice(0, 20), { label: "Errores por recuperar" })}>
              <span><b>Recuperar {Math.min(20, g.keys.length)} {g.keys.length === 1 ? "error" : "errores"}</b><span className="caption">{bookName(g.slug)}{g.keys.length > 20 ? ` · las ${20} más falladas de ${g.keys.length}` : ""}</span></span>
              <Icon name="right" />
            </button>
          ))}
        </div>
      )}

      <div className="st-filters">
        <div className="segmented small" role="radiogroup" aria-label="Estado">
          {[["pending", "Por recuperar"], ["recovered", "Recuperadas"], ["all", "Todas"]].map(([id, l]) => (
            <button key={id} type="button" role="radio" aria-checked={f.state === id} className={f.state === id ? "seg active" : "seg"} onClick={() => setF((x) => ({ ...x, state: id }))}>{l}</button>
          ))}
        </div>
        {areas.length > 1 && (
          <div className="chips-row">
            {areas.map((a) => <button key={a} type="button" aria-pressed={f.area === a} className={f.area === a ? "chip on" : "chip"} onClick={() => setF((x) => ({ ...x, area: x.area === a ? "" : a }))}><span className="dot" style={{ background: areaColor(a) }} />{a}</button>)}
          </div>
        )}
        {f.cause && <button type="button" className="chip on" onClick={() => setF((x) => ({ ...x, cause: "" }))}>{causeLabel(f.cause)} ✕</button>}
      </div>

      <ul className="st-list">
        {shown.length === 0 && <li className="caption">Nada con estos filtros.</li>}
        {shown.slice(0, limit).map((e) => {
          const q = qOf(e);
          const b = bundles[e.slug];
          const right = b?.key?.get(e.key) ?? null;
          const why = q && explanationOf(b?.enrich?.[String(q.number)]);
          return (
            <li key={e.id} className={e.recovered ? "card st-item done" : "card st-item"}>
              <button type="button" className="st-head" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className="dot" style={{ background: e.area ? areaColor(e.area) : "var(--line)" }} />
                <span className="st-main">
                  <b>{e.area ?? "Pregunta"} · pregunta {e.number ?? e.key}</b>
                  <span className="caption">{e.chosen ? `Elegiste ${e.chosen}` : "En blanco"}{right ? ` · era ${right}` : ""} · {e.times > 1 ? `fallada ${e.times} veces · ` : ""}{e.recovered ? `recuperada ${ago(e.recoveredAt)}` : ago(e.lastAt)}</span>
                </span>
                {e.cause ? <span className="badge">{causeLabel(e.cause)}</span> : <span className="badge pending">¿Por qué?</span>}
              </button>
              {open === e.id && (
                <div className="st-body">
                  <span className="label">¿Por qué crees que la fallaste?</span>
                  <div className="chips-row">
                    {CAUSES.map((c) => <button key={c.id} type="button" aria-pressed={e.cause === c.id} className={e.cause === c.id ? "chip on" : "chip"} onClick={() => tag(e.id, { cause: e.cause === c.id ? "" : c.id })}>{c.label}</button>)}
                  </div>
                  <label className="field"><span className="label">Tu nota</span>
                    <textarea rows={2} maxLength={400} defaultValue={e.note} placeholder="Ej.: confundí porcentaje con proporción" onBlur={(ev) => tag(e.id, { note: ev.target.value.trim() })} /></label>
                  <div className="report-actions">
                    {q && <button type="button" className="secondary" onClick={() => setShow(show === e.id ? null : e.id)}>{show === e.id ? "Ocultar la pregunta" : "Ver la pregunta"}</button>}
                    <button type="button" className="primary" onClick={() => onPracticeKeys?.(e.slug, [e.key], { label: "Errores por recuperar" })}>Intentarla otra vez</button>
                  </div>
                  {show === e.id && q && (
                    <>
                      <QuestionView question={q} answer={e.chosen} graded review={{ correctLetter: right }} figures={b.figures} examLabel={b.exam.title} report={false} />
                      {why && <div className="card t-card"><strong>Por qué</strong><p>{why.text}</p></div>}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length > limit && <button type="button" className="secondary" onClick={() => setLimit((n) => n + 20)}>Ver {Math.min(20, shown.length - limit)} más de {shown.length - limit}</button>}
    </div>
  );
}

// Mi plan de la semana: cada día con qué practicar según la fecha del examen, la meta diaria y las áreas más
// débiles; se marca solo cuando practicas eso ese día.
export function StudyPlan({ onPracticeArea, onSimulacro, onMix, onErrors, onGoal }) {
  const history = useMemo(() => loadHistory(), []);
  const goal = useMemo(() => loadGoal(), []);
  const ins = useMemo(() => practiceInsights(history), [history]);
  const pendingErrors = useMemo(() => causeSummary(notebook(history, loadNotes())).pending, [history]);
  const left = daysUntil(goal.examDate);
  const plan = useMemo(() => weekPlan({ goal, insights: ins, history, pendingErrors, daysLeft: left }), [goal, ins, history, pendingErrors, left]);
  const act = (d) => (d.kind === "area" ? onPracticeArea?.(d.area) : d.kind === "simulacro" ? onSimulacro?.() : d.kind === "mix" ? onMix?.() : d.kind === "errors" ? onErrors?.() : null);
  const DAYN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  return (
    <div className="st-wrap">
      <div className="card st-summary">
        <span className="label">{plan.label}</span>
        <strong className="st-big">{left == null ? "Sin fecha de examen" : left <= 0 ? "¡Es hoy!" : `Faltan ${left} días`}</strong>
        <span className="caption">{plan.help}</span>
        <div className="progress thin" aria-label={`${plan.done} de ${plan.due} días cumplidos`}><span style={{ width: `${plan.due ? (plan.done / plan.due) * 100 : 0}%` }} /></div>
        <span className="caption">{plan.due ? `Llevas ${plan.done} de ${plan.due} días cumplidos esta semana` : "La semana empieza hoy"} · unas {plan.perDay} preguntas al día según tu meta de XP.</span>
        {(left == null || !goal.examDate) && <button type="button" className="secondary" onClick={onGoal}>Poner la fecha de mi examen</button>}
      </div>
      <ol className="st-days">
        {plan.days.map((d, i) => (
          <li key={d.date} className={`card st-day${d.today ? " today" : ""}${d.done && d.kind !== "rest" ? " done" : ""}${d.past && !d.done ? " missed" : ""}`}>
            <span className="st-check" aria-hidden="true">{d.kind === "rest" ? "☾" : d.done ? "✓" : d.today ? "●" : ""}</span>
            <span className="st-main">
              <b>{DAYN[i]}{d.today ? " · hoy" : ""}</b>
              <span className="caption">{d.area && <span className="dot" style={{ background: areaColor(d.area) }} />}{d.label}{d.questions ? ` · ${d.questions} preguntas · ~${d.minutes} min` : d.kind === "simulacro" ? " · unas 4 h 30 min" : ""}</span>
            </span>
            {d.kind !== "rest" && !d.done && d.today && <button type="button" className="primary" onClick={() => act(d)}>Empezar</button>}
            {d.kind !== "rest" && !d.done && d.past && <span className="caption">Pendiente</span>}
          </li>
        ))}
      </ol>
      <p className="caption">El plan cambia cada semana con tus resultados: el área que más te cuesta aparece más días.</p>
    </div>
  );
}
