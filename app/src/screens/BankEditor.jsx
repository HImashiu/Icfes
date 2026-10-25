import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog, Select } from "../components/Controls.jsx";
import { areaColor } from "../lib/brand.js";
import { draftFromBank, overrideRow } from "../lib/overrides.js";
import Workspace from "./builder/Workspace.jsx";
import { UseBadge, UseHistory } from "../components/QuestionUse.jsx";
import { holdOf, useIndex } from "../lib/questionUse.js";
import { loadQuestionControl } from "../lib/questionControl.js";
import "./builder/builder.css";

const plain = (h) => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const PAGE = 30;

// “Banco de preguntas”: cualquier docente puede corregir o adaptar una pregunta del banco. El cambio se guarda
// como versión del colegio: los estudiantes y docentes de este colegio ven la versión editada, el banco compartido
// no cambia y se puede volver a la original en cualquier momento.
export default function BankEditor({ api, profile, exams, fetchExam, guard, setNotice }) {
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
  useEffect(() => { let on = true; loadQuestionControl(api).then((v) => on && setQc(v), () => {}); return () => { on = false; }; }, [api]);

  const load = useCallback(() => {
    if (!slug) return Promise.resolve();
    return guard(async () => {
      const [b, v] = await Promise.all([fetchExam(slug), api.questionOverrides(slug)]);
      setBundle(b);
      setVersions(v);
    });
  }, [slug, fetchExam, api, guard]);
  useEffect(() => { setBundle(null); setPage(0); load(); }, [load]);

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
  return (
    <>
      <header className="t-head">
        <div>
          <h1>Banco de preguntas</h1>
          <span className="caption">Corrige o adapta cualquier pregunta. Tu colegio ve la versión editada; el banco compartido no cambia y puedes volver a la original.</span>
        </div>
      </header>
      <div className="card t-card">
        <div className="bank-filters">
          <label className="field"><span className="label">Cuadernillo</span>
            <Select value={slug} onChange={setSlug} aria-label="Cuadernillo">
              {ready.map((e) => <option key={e.slug} value={e.slug}>{e.title ?? e.slug}</option>)}
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
        {!bundle && <p className="caption">Cargando preguntas…</p>}
        <ul className="b-list">
          {shown.slice(page * PAGE, page * PAGE + PAGE).map((q) => {
            const v = byKey.get(q.key);
            return (
              <li key={q.key} className="b-row" style={{ gridTemplateColumns: "1fr auto" }}>
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
