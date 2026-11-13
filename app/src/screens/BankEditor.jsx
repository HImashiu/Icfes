import { useCallback, useEffect, useMemo, useState } from "react";
import { quotaLine, useBankQuota } from "../lib/protect.js";
import { confirmDialog, Select } from "../components/Controls.jsx";
import { areaColor } from "../lib/brand.js";
import { draftFromBank, overrideRow } from "../lib/overrides.js";
import Workspace from "./builder/Workspace.jsx";
import { UseBadge, UseHistory } from "../components/QuestionUse.jsx";
import { holdOf, useIndex } from "../lib/questionUse.js";
import { loadQuestionControl } from "../lib/questionControl.js";
import Icon from "../components/Icon.jsx";
import QuestionsPrint from "../components/QuestionsPrint.jsx";
import "./builder/builder.css";
import Loading from "../components/Loading.jsx";

const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const PAGE = 30;

// “Banco de preguntas”: cualquier docente puede corregir o adaptar una pregunta del banco. El cambio se guarda
// como versión del colegio: los estudiantes y docentes de este colegio ven la versión editada, el banco compartido
// no cambia y se puede volver a la original en cualquier momento.
// What chosen bank questions can become in one step (target ids: "clase" and "proyectar" make a class for projecting,
// the rest are presets of Nueva actividad).
const USES = [
  ["clase", "Diapositivas", "play"], ["proyectar", "Proyectar ahora", "expand"], ["hoja", "Hoja de trabajo", "print"],
  ["quiz", "Quiz", "check"], ["tarea", "Tarea", "book"], ["practica", "Práctica en clase", "pencil"], ["simulacro", "Examen con tiempo", "clock"], ["papel", "Examen en papel", "print"],
];

export default function BankEditor({ api, profile, exams, fetchExam, guard, setNotice, onConvert = null }) {
  const ready = (exams ?? []).filter((e) => e.status !== "proximamente");
  const [slug, setSlug] = useState(ready[0]?.slug ?? "");
  const [bundle, setBundle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [page, setPage] = useState(0);
  const [work, setWork] = useState(null);
  // Where the school already used each question, and its holds (Biblioteca › Control).
  const [qc, setQc] = useState(null);
  const [usage, setUsage] = useState(null);
  // Questions chosen to turn into slides, a worksheet, a quiz, an exam or a practice (this booklet only).
  const [chosen, setChosen] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);
  useEffect(() => { let on = true; loadQuestionControl(api).then((v) => on && setQc(v), () => {}); return () => { on = false; }; }, [api]);

  const load = useCallback(() => {
    if (!slug) return Promise.resolve();
    return guard(async () => {
      const [b, v] = await Promise.all([fetchExam(slug), api.questionOverrides(slug)]);
      setBundle(b);
      setVersions(v);
    });
  }, [slug, fetchExam, api, guard]);
  useEffect(() => { setBundle(null); setPage(0); setChosen(new Set()); load(); }, [load]);

  // Protección del banco: how many booklets this account has left today (bank_quota, migration 0036).
  const quota = useBankQuota(bundle);
  const openedWeek = useMemo(() => new Set(quota?.opened_week ?? []), [quota]);
  const byKey = useMemo(() => new Map(versions.map((v) => [v.qkey, v])), [versions]);
  const index = useMemo(() => (qc && bundle ? useIndex(qc.uses, slug, bundle.exam) : new Map()), [qc, bundle, slug]);
  const areas = useMemo(() => [...new Set((bundle?.exam.questions ?? []).map((q) => q.section))], [bundle]);
  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (bundle?.exam.questions ?? []).filter((q) => (!area || q.section === area) && (!t || `${q.number} ${plain(q.stem_md)} ${plain(q.stimulus_md)}`.toLowerCase().includes(t)));
  }, [bundle, text, area]);

  const saver = (q) => async (draft) => {
    const row = overrideRow(draft, { schoolId: profile.school_id, userId: profile.id, slug, qkey: q.key });
    return api.saveOverride(row);
  };
  const restore = async (q) => {
    const v = byKey.get(q.key);
    if (!v || !(await confirmDialog(`¿Volver a la pregunta original ${q.number}? Se pierde la versión de tu colegio.`, { confirmLabel: "Volver a la original", danger: true }))) return;
    guard(async () => { await api.deleteOverride(v.id); setNotice(`Pregunta ${q.number}: vuelve la versión original.`); await load(); });
  };

  if (work) {
    return <Workspace api={api} profile={profile} guard={guard} initial={[work.draft]} startAt={0} saver={saver(work.q)}
      onClose={async (saved) => { setWork(null); if (saved) setNotice("Guardado como versión de tu colegio."); await load(); }} />;
  }
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const toggleChosen = (k) => setChosen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pageKeys = shown.slice(page * PAGE, page * PAGE + PAGE).map((q) => q.key);
  const pageAll = pageKeys.length > 0 && pageKeys.every((k) => chosen.has(k));
  const choosePage = () => setChosen((cur) => { const n = new Set(cur); for (const k of pageKeys) if (pageAll) n.delete(k); else n.add(k); return n; });
  // In booklet order, so the slides, the worksheet and the activity read like the cuadernillo.
  const chosenKeys = (bundle?.exam.questions ?? []).map((q) => q.key).filter((k) => chosen.has(k));
  const examTitle = ready.find((e) => e.slug === slug)?.title ?? slug;
  const use = (target) => {
    if (target === "hoja") { setPrinting(true); return; }
    onConvert?.({ target, slug, keys: chosenKeys, title: `${examTitle} · ${chosenKeys.length} preguntas` });
  };
  return (
    <>
      <header className="t-head">
        <div>
          <h1>Banco de preguntas</h1>
          <span className="caption">Corrige una pregunta para tu colegio o elige varias y conviértelas en clase, quiz o examen.</span>
        </div>
      </header>
      <div className="card t-card">
        <div className="bank-filters">
          <label className="field"><span className="label">Cuadernillo</span>
            <Select value={slug} onChange={setSlug} aria-label="Cuadernillo">
              {ready.map((e) => <option key={e.slug} value={e.slug}>{`${e.title ?? e.slug}${openedWeek.has(e.slug) ? " · ya abierto" : ""}`}</option>)}
            </Select>
          </label>
          <label className="field"><span className="label">Área</span>
            <Select value={area} onChange={(v) => { setArea(v); setPage(0); }} aria-label="Área">
              <option value="">Todas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
          <label className="field"><span className="label">Buscar</span>
            <input className="qb-input" type="search" value={text} placeholder="Número o texto" onChange={(e) => { setText(e.target.value); setPage(0); }} />
          </label>
        </div>
        {quotaLine(quota) && <p className="caption pm-quota">{quotaLine(quota)}</p>}
        {bundle && (
          <div className={chosen.size ? "bk-use on" : "bk-use"} role="region" aria-label="Usar las preguntas elegidas">
            <label className="check-row"><input type="checkbox" checked={pageAll} onChange={choosePage} /><span>{pageAll ? "Quitar esta página" : "Elegir esta página"}</span></label>
            {chosen.size === 0 ? <span className="caption">Marca preguntas para usarlas.</span> : (
              <>
                <strong>{chosen.size} {chosen.size === 1 ? "elegida" : "elegidas"}</strong>
                <span className="bk-use-btns">
                  {USES.filter(([id]) => id === "hoja" || onConvert).map(([id, label, icon]) => (
                    <button key={id} type="button" className={id === "clase" ? "primary small" : "secondary small"} onClick={() => use(id)}><Icon name={icon} size={14} /> {label}</button>
                  ))}
                </span>
                <button type="button" className="link" onClick={() => setChosen(new Set())}>Vaciar</button>
              </>
            )}
          </div>
        )}
        {printing && bundle && <QuestionsPrint bundle={bundle} keys={chosenKeys} title={`${examTitle} · hoja de trabajo`} onClose={() => setPrinting(false)} />}
        {!bundle && <Loading label="Cargando preguntas…" />}
        <ul className="b-list">
          {shown.slice(page * PAGE, page * PAGE + PAGE).map((q) => {
            const v = byKey.get(q.key);
            return (
              <li key={q.key} className={chosen.has(q.key) ? "b-row on" : "b-row"} style={{ gridTemplateColumns: "auto 1fr auto" }}>
                <input type="checkbox" aria-label={`Elegir la pregunta ${q.number}`} checked={chosen.has(q.key)} onChange={() => toggleChosen(q.key)} />
                <div className="b-body">
                  <strong><span className="dot" style={{ background: areaColor(q.section) }} /> N.° {q.number} · {q.section}</strong>
                  <span className="b-text">{plain(q.stem_md || q.stimulus_md).slice(0, 160)}</span>
                  {(() => {
                    const hold = holdOf(qc?.holds ?? [], slug, q.key);
                    const n = index.get(q.key)?.length ?? 0;
                    if (!v && !n && !hold) return null;
                    return (
                      <span className="chips-row">
                        {v && <span className="badge pending">Versión de tu colegio</span>}
                        <UseBadge count={n} />
                        {hold?.reserve && <span className="qu-badge warn">Reservada para simulacro</span>}
                        {hold?.hide && !hold.reserve && <span className="qu-badge info">Oculta de la práctica</span>}
                      </span>
                    );
                  })()}
                </div>
                <span>
                  <button type="button" className="link" onClick={() => setWork({ q, draft: draftFromBank(q, bundle.key.get(q.key), v) })}>Editar</button>
                  {" "}<button type="button" className="link" onClick={() => setUsage(q)}>Uso</button>
                  {v && <>{" "}<button type="button" className="link" onClick={() => restore(q)}>Volver a la original</button></>}
                </span>
              </li>
            );
          })}
        </ul>
        {bundle && shown.length === 0 && <p className="caption">Ninguna pregunta coincide.</p>}
        {usage && (
          <div className="b-modal" role="dialog" aria-modal="true" aria-label={`Uso de la pregunta ${usage.number}`} onClick={(e) => e.target === e.currentTarget && setUsage(null)}>
            <div className="b-modal-card">
              <div className="section-head"><strong>Pregunta {usage.number} · {usage.section}</strong><button type="button" className="link" onClick={() => setUsage(null)}>Cerrar</button></div>
              <UseHistory uses={index.get(usage.key) ?? []} hold={holdOf(qc?.holds ?? [], slug, usage.key)} schoolWide={qc?.schoolWide !== false} />
              <p className="caption">Reserva u oculta preguntas en Biblioteca › Control de preguntas.</p>
            </div>
          </div>
        )}
        {pages > 1 && (
          <div className="report-actions">
            <button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="caption">Página {page + 1} de {pages} · {shown.length} preguntas</span>
            <button type="button" className="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        )}
      </div>
    </>
  );
}
