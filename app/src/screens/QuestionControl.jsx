import { useCallback, useEffect, useMemo, useState } from "react";
import QuestionView from "../components/QuestionView.jsx";
import Icon from "../components/Icon.jsx";
import { confirmDialog, Select } from "../components/Controls.jsx";
import { UseHistory } from "../components/QuestionUse.jsx";
import { areaColor } from "../lib/brand.js";
import { TEACHER_ENTRY } from "../lib/teacherExam.js";
import { holdRows, loadQuestionControl } from "../lib/questionControl.js";
import { bookletMap, DEFAULT_RULES, filterMap, holdOf, MAP_FILTERS, mapTotals, RULE_TEXT, useIndex } from "../lib/questionUse.js";

const STATE_LABEL = { free: "Sin usar", practice: "En tareas o clases", exam: "En simulacros", both: "Un grupo la vio en tarea y simulacro" };
const LEVELS = [["block", "Bloquear"], ["warn", "Avisar"], ["off", "Permitir"]];

// Biblioteca › Control: each booklet as a map of its questions, coloured by where the school already used them, with
// holds (reserve for a simulacro, hide from students' free practice) on single questions or the whole booklet.
// Coordination sets the school's rules here too; teachers see them.
export default function QuestionControl({ api, profile, exams, fetchExam, guard, setNotice }) {
  const admin = profile.role === "school_admin";
  const ready = useMemo(() => [...(exams ?? []).filter((e) => e.status !== "proximamente"), ...(api.teacherQuestions ? [TEACHER_ENTRY] : [])], [exams, api]);
  const [slug, setSlug] = useState(ready[0]?.slug ?? "");
  const [bundle, setBundle] = useState(null);
  const [qc, setQc] = useState(null);
  const [area, setArea] = useState("");
  const [show, setShow] = useState("all");
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState([]);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const loadControl = useCallback(() => guard(async () => setQc(await loadQuestionControl(api))), [api, guard]);
  useEffect(() => { loadControl(); }, [loadControl]);
  useEffect(() => {
    if (!slug) return undefined;
    let on = true;
    setBundle(null); setSel([]); setOpen(null);
    guard(() => fetchExam(slug)).then((b) => on && setBundle(b ?? null));
    return () => { on = false; };
  }, [slug, fetchExam, guard]);

  const holds = qc?.holds ?? [];
  const index = useMemo(() => (qc && bundle ? useIndex(qc.uses, slug, bundle.exam) : new Map()), [qc, bundle, slug]);
  const rows = useMemo(() => (bundle ? bookletMap(bundle.exam, index, holds, slug) : []), [bundle, index, holds, slug]);
  const areas = useMemo(() => [...new Set(rows.map((r) => r.section))], [rows]);
  const inArea = rows.filter((r) => !area || r.section === area);
  const shown = filterMap(inArea, show);
  const totals = mapTotals(inArea);
  const whole = holds.filter((h) => h.slug === slug && h.key === null);
  const wholeHide = whole.some((h) => h.hide);
  const wholeReserve = whole.some((h) => h.reserve);
  const canHold = Array.isArray(qc?.holds);
  const mine = (h) => admin || h.createdBy === profile.id;

  const write = (fn, done) => {
    setBusy(true);
    return guard(async () => { await fn(); await loadControl(); if (done) setNotice(done); }).finally(() => setBusy(false));
  };
  // Holds on some keys (null = the whole booklet). A key held by another teacher is left alone unless you coordinate.
  const hold = (keys, { reserve, hide }) => {
    const free = keys.filter((k) => { const h = holdOf(holds, slug, k)?.holds.filter((x) => x.key === k) ?? []; return h.every(mine); });
    const skipped = keys.length - free.length;
    const old = new Map(holds.filter((h) => h.slug === slug).map((h) => [h.key, h]));
    const name = profile.full_name || profile.email;
    const rowsOut = free.map((k) => {
      const prev = old.get(k);
      return holdRows({ schoolId: profile.school_id, userId: prev?.createdBy ?? profile.id, slug, keys: [k], reserve: reserve ?? prev?.reserve, hide: hide ?? prev?.hide, label: prev?.label || `${name}`, until: prev?.until ?? null, assignmentId: prev?.assignmentId ?? null })[0];
    });
    const what = reserve ? "reservadas para simulacro" : hide ? "ocultas de la práctica libre" : "actualizadas";
    return write(() => api.saveHolds(rowsOut), `${free.length} ${free.length === 1 ? "pregunta" : "preguntas"} ${what}.${skipped ? ` ${skipped} las tiene otro docente; solo él o coordinación las cambian.` : ""}`);
  };
  const release = async (keys) => {
    const ids = holds.filter((h) => h.slug === slug && keys.includes(h.key) && mine(h)).map((h) => h.id);
    if (!ids.length) return setNotice("Esas preguntas no tienen reservas tuyas para liberar.");
    if (!(await confirmDialog(`¿Liberar ${ids.length === 1 ? "esta pregunta" : `${ids.length} preguntas`}? Vuelven a estar disponibles para tareas, juegos y práctica.`, { confirmLabel: "Liberar" }))) return undefined;
    return write(() => api.deleteHolds(ids), "Liberadas.");
  };
  const setWhole = async ({ hide, reserve }) => {
    if (hide === false || reserve === false) {
      const next = { hide: hide ?? wholeHide, reserve: reserve ?? wholeReserve };
      if (!next.hide && !next.reserve) return write(() => api.deleteHolds(whole.filter(mine).map((h) => h.id)), "El cuadernillo vuelve a estar disponible.");
      return hold([null], next);
    }
    return hold([null], { hide: hide ?? wholeHide, reserve: reserve ?? wholeReserve });
  };
  const saveRules = (next) => write(() => api.saveQuestionRules(profile.school_id, next), "Reglas guardadas para todo el colegio.");

  const tap = (r) => {
    if (selecting) setSel(sel.includes(r.key) ? sel.filter((k) => k !== r.key) : [...sel, r.key]);
    else setOpen(r.key);
  };
  const openRow = open ? rows.find((r) => r.key === open) : null;
  const rules = qc?.rules ?? DEFAULT_RULES;
  const title = ready.find((e) => e.slug === slug)?.title ?? slug;

  return (
    <>
      <header className="t-head">
        <div>
          <h1>Control de preguntas</h1>
          <span className="caption">Dónde ya se usó cada pregunta en el colegio, cuáles están reservadas para simulacros y cuáles no ven los estudiantes.</span>
        </div>
      </header>

      <section className="card t-card qc-rules">
        <button type="button" className="qc-rules-head" aria-expanded={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>
          <Icon name="shield" size={18} />
          <span><strong>Reglas del colegio</strong>
            <span className="caption">Tarea ↔ simulacro: {LEVELS.find(([v]) => v === rules.cross)[1].toLowerCase()} · Repetir: {LEVELS.find(([v]) => v === rules.repeat)[1].toLowerCase()} · Reservadas: {LEVELS.find(([v]) => v === rules.reserved)[1].toLowerCase()}</span>
          </span>
          <Icon name={rulesOpen ? "left" : "right"} size={14} strokeWidth={3} className="qc-chev" />
        </button>
        {rulesOpen && (
          <div className="qc-rules-body">
            {["cross", "repeat", "reserved"].map((k) => (
              <div key={k} className="qc-rule">
                <span><strong>{RULE_TEXT[k].label}</strong><span className="caption">{RULE_TEXT[k].help}</span></span>
                <div className="segmented small" role="radiogroup" aria-label={RULE_TEXT[k].label}>
                  {LEVELS.map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={rules[k] === v} className={rules[k] === v ? "seg active" : "seg"} disabled={!admin || busy} onClick={() => saveRules({ ...rules, [k]: v })}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="qc-rule">
              <span><strong>{RULE_TEXT.reach.label}</strong><span className="caption">{RULE_TEXT.reach.help}</span></span>
              <div className="segmented small" role="radiogroup" aria-label={RULE_TEXT.reach.label}>
                {[["group", "Mismos estudiantes"], ["school", "Todo el colegio"]].map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={rules.reach === v} className={rules.reach === v ? "seg active" : "seg"} disabled={!admin || busy} onClick={() => saveRules({ ...rules, reach: v })}>{l}</button>
                ))}
              </div>
            </div>
            {!admin && <p className="caption">Solo coordinación cambia las reglas.</p>}
          </div>
        )}
      </section>

      {!canHold && qc && <p className="notice">Para reservar y ocultar preguntas falta ejecutar la migración 0021 en Supabase. Mientras tanto ves el uso{qc.schoolWide ? "" : " de tus propias actividades"}.</p>}

      <section className="card t-card qc-booklet">
        <div className="bank-filters">
          <label className="field"><span className="label">Cuadernillo</span>
            <Select value={slug} onChange={setSlug} aria-label="Cuadernillo" options={ready.map((e) => ({ value: e.slug, label: e.title ?? e.slug }))} />
          </label>
          <label className="field"><span className="label">Área</span>
            <Select value={area} onChange={setArea} aria-label="Área" options={[{ value: "", label: "Todas" }, ...areas.map((a) => ({ value: a, label: a }))]} />
          </label>
        </div>
        {canHold && (
          <div className="qc-whole">
            <label className="check-row"><input type="checkbox" checked={wholeHide} disabled={busy || (whole.length > 0 && !whole.every(mine))} onChange={(e) => setWhole({ hide: e.target.checked })} />
              <span>Ocultar todo el cuadernillo a los estudiantes <span className="caption">(no aparece en su práctica libre; las actividades que asignes sí se ven)</span></span></label>
            <label className="check-row"><input type="checkbox" checked={wholeReserve} disabled={busy || (whole.length > 0 && !whole.every(mine))} onChange={(e) => setWhole({ reserve: e.target.checked })} />
              <span>Reservar todo el cuadernillo para simulacros <span className="caption">(nadie del colegio lo usa en tareas, juegos ni clases)</span></span></label>
          </div>
        )}

        <div className="qc-totals" role="group" aria-label="Filtrar">
          {MAP_FILTERS.map(([id, label]) => {
            const n = id === "all" ? totals.total : totals[id];
            if (id !== "all" && !n && show !== id) return null;
            return (
              <button key={id} type="button" className={show === id ? "chip on" : "chip"} aria-pressed={show === id} onClick={() => setShow(id)}>
                {label} <span className="muted">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="qc-legend" aria-hidden="true">
          {Object.entries(STATE_LABEL).map(([k, l]) => <span key={k}><i className={`qc-swatch s-${k}`} />{l}</span>)}
          <span><Icon name="lock" size={12} />Reservada</span>
          <span><Icon name="eyeOff" size={12} />Oculta</span>
        </div>

        <div className="qc-toolbar">
          <button type="button" className={selecting ? "secondary on" : "secondary"} aria-pressed={selecting} disabled={!canHold} onClick={() => { setSelecting(!selecting); setSel([]); }}>
            {selecting ? "Cancelar selección" : "Elegir varias"}
          </button>
          {selecting && <button type="button" className="link" onClick={() => setSel(shown.map((r) => r.key))}>Elegir las {shown.length}</button>}
        </div>

        {!bundle && <p className="caption">Cargando preguntas…</p>}
        <div className="qc-grid" role="list" aria-label={`Preguntas de ${title}`}>
          {shown.map((r) => (
            <button key={r.key} type="button" role="listitem" className={`qc-tile s-${r.state}${sel.includes(r.key) ? " picked" : ""}${r.repeated ? " rep" : ""}`}
              style={{ "--area": areaColor(r.section) }} onClick={() => tap(r)}
              aria-label={`Pregunta ${r.number}, ${STATE_LABEL[r.state]}${r.uses.length ? `, ${r.uses.length} usos` : ""}${r.reserve ? ", reservada" : ""}${r.hide ? ", oculta" : ""}`}>
              <span className="qc-num">{r.number}</span>
              <span className="qc-marks">
                {r.reserve && <Icon name="lock" size={11} strokeWidth={2.8} />}
                {r.hide && <Icon name="eyeOff" size={11} strokeWidth={2.8} />}
                {r.uses.length > 1 && <span className="qc-count">{r.uses.length}</span>}
              </span>
            </button>
          ))}
        </div>
        {bundle && shown.length === 0 && <p className="caption">Ninguna pregunta en este filtro.</p>}
        {!qc?.schoolWide && qc && <p className="caption">Ves solo tus actividades. Con la migración 0021 ves el uso de todo el colegio.</p>}
      </section>

      {selecting && sel.length > 0 && (
        <div className="qc-bar" role="toolbar" aria-label="Acciones">
          <strong>{sel.length} {sel.length === 1 ? "elegida" : "elegidas"}</strong>
          <button type="button" className="primary" disabled={busy} onClick={() => hold(sel, { reserve: true, hide: true }).then(() => { setSel([]); setSelecting(false); })}><Icon name="lock" size={15} />Reservar</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => hold(sel, { hide: true }).then(() => { setSel([]); setSelecting(false); })}><Icon name="eyeOff" size={15} />Ocultar</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => release(sel).then(() => { setSel([]); setSelecting(false); })}>Liberar</button>
        </div>
      )}

      {openRow && bundle && (
        <div className="b-modal" role="dialog" aria-modal="true" aria-label={`Pregunta ${openRow.number}`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="b-modal-card">
            <div className="section-head">
              <strong>Pregunta {openRow.number} · {openRow.section}</strong>
              <button type="button" className="link" onClick={() => setOpen(null)}>Cerrar</button>
            </div>
            <p className={`qc-state s-${openRow.state}`}>{STATE_LABEL[openRow.state]}{openRow.repeated ? " · el mismo grupo la vio más de una vez" : ""}</p>
            {canHold && (
              <div className="report-actions qc-actions">
                {!openRow.reserve && <button type="button" className="secondary" disabled={busy} onClick={() => hold([openRow.key], { reserve: true, hide: true })}><Icon name="lock" size={15} />Reservar para simulacro</button>}
                {!openRow.hide && <button type="button" className="secondary" disabled={busy} onClick={() => hold([openRow.key], { hide: true })}><Icon name="eyeOff" size={15} />Ocultar de la práctica</button>}
                {(openRow.reserve || openRow.hide) && openRow.hold?.holds.some((h) => h.key === openRow.key) && <button type="button" className="secondary" disabled={busy} onClick={() => release([openRow.key])}>Liberar</button>}
              </div>
            )}
            <UseHistory uses={openRow.uses} hold={openRow.hold} schoolWide={qc?.schoolWide !== false} />
            <QuestionView question={openRow.question} answer={bundle.key?.get(openRow.key)} graded review={{ correctLetter: bundle.key?.get(openRow.key) ?? null }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />
          </div>
        </div>
      )}
    </>
  );
}
