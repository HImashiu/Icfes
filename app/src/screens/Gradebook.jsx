import { useEffect, useMemo, useState } from "react";
import { DateField, Select } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { FINAL_KINDS, computeGradebook, explainFinal, gradebookTable } from "../lib/gradebook.js";
import { describeModel, normalizeModel, resolveModel } from "../lib/grading.js";
import { groupOf } from "../lib/teaching.js";
import "./results.css";
import ReportCards from "./teacher/ReportCards.jsx";
import { DESEMPENOS, desempeno, desempenoCuts, finalColumn, sortRows } from "../lib/teacherTime.js";
import "./teacher/time.css";

function download(name, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}\n`], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "");
const KIND_SHORT = { task: "Práctica", homework: "Tarea", exam: "Simulacro" };

// Notas finales: the gradebook of one class, built from each activity's grade and the class's final-note rule.
export default function Gradebook({ api, profile, courses, assignments, models, guard, fetchExam, reloadModels, setNotice, onEditRule }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [data, setData] = useState(null);
  const [bundles, setBundles] = useState(new Map());
  const [rule, setRule] = useState(false);
  const [copied, setCopied] = useState(false);
  const [order, setOrder] = useState(() => { try { return localStorage.getItem("condor:gb-order") || "name"; } catch { return "name"; } });
  const [cards, setCards] = useState(false);
  const course = courses.find((c) => c.id === courseId) ?? courses[0] ?? null;
  const [picked, setPicked] = useState(false);
  const pickCourse = (id) => { setPicked(true); setCourseId(id); };

  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
      setData({ members, attempts });
    });
  }, [api, guard]);
  // Opens on the first class that has students, unless the teacher already chose one.
  useEffect(() => {
    if (!data || picked) return;
    const has = (id) => data.members.some((m) => m.role === "student" && m.course_id === id);
    if (course && has(course.id)) return;
    const first = courses.find((c) => has(c.id));
    if (first) setCourseId(first.id);
  }, [data, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const acts = useMemo(() => assignments.filter((a) => a.course_id === course?.id && a.status !== "draft"), [assignments, course]);
  useEffect(() => {
    if (!fetchExam) return undefined;
    let live = true;
    Promise.all(acts.map(async (a) => { try { return [a.id, await fetchExam(a.exam_slug, a.question_keys)]; } catch { return null; } }))
      .then((list) => { if (live) setBundles(new Map(list.filter(Boolean))); });
    return () => { live = false; };
  }, [acts, fetchExam]);

  const own = course ? models.find((r) => r.scope === "course" && r.scope_id === course.id) : null;
  const classModel = course ? resolveModel(models, { courseId: course.id, schoolId: profile.school_id }) : null;
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft(classModel ? normalizeModel(classModel.model).final : null); }, [course?.id, own?.model]); // eslint-disable-line react-hooks/exhaustive-deps
  // The table follows the rule being edited, so the teacher sees each change before saving.
  const sim = useMemo(() => {
    if (!course || !draft || !classModel) return models;
    const base = normalizeModel(classModel.model);
    return [...models.filter((r) => !(r.scope === "course" && r.scope_id === course.id)), { scope: "course", scope_id: course.id, model: { ...base, final: draft } }];
  }, [models, course, draft, classModel]);
  const book = useMemo(() => (data && course ? computeGradebook({ members: data.members, assignments, attempts: data.attempts, models: sim, schoolId: profile.school_id, courseId: course.id, bundles }) : null), [data, course, assignments, sim, profile.school_id, bundles]);

  if (!course) return <p className="caption">Crea una clase para ver su planilla de notas.</p>;
  const savedFinal = normalizeModel(classModel.model).final;
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(savedFinal);
  const setW = (k, v) => setDraft((d) => ({ ...d, weights: { ...d.weights, [k]: Math.max(0, Math.min(100, Number(v) || 0)) } }));
  const saveRule = () => guard(async () => {
    await api.saveGradingModel({ schoolId: profile.school_id, userId: profile.id, scope: "course", scopeId: course.id, model: { ...normalizeModel(classModel.model), final: draft } });
    await reloadModels?.();
    setNotice?.(`Regla de la nota final guardada para ${course.name}.`);
  });
  const scale = book?.model.kind === "scale" ? book.model.scale : null;
  const rows = useMemo(() => (book ? sortRows(book.rows, order) : []), [book, order]);
  const sorted = book ? { ...book, rows } : null;
  const setSort = (v) => { setOrder(v); try { localStorage.setItem("condor:gb-order", v); } catch { /* storage blocked */ } };
  const copyText = async (what, text) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  const copy = () => copyText("all", gradebookTable(sorted, "\t"));
  const avgFinal = book ? book.rows.filter((r) => r.final).map((r) => r.final.value) : [];
  const passing = book?.rows.filter((r) => r.final?.passed).length ?? 0;

  return (
    <div className="gb">
      <section className="card t-card gb-top">
        <div className="gb-pick">
          <label className="field"><span className="label">Clase</span>
            <Select aria-label="Clase" value={course.id} onChange={pickCourse} options={courses.map((c) => ({ value: c.id, label: c.name }))} /></label>
          <div className="gb-model">
            <span className="label">Calificación de la clase</span>
            <strong>{describeModel(classModel.model).split(" · ")[0]}</strong>
            {onEditRule && <button type="button" className="link" onClick={onEditRule}>Cambiar método</button>}
          </div>
        </div>
        <p className="gb-explain">{book ? book.explain : explainFinal(classModel.model)}</p>
        <button type="button" className="gw-more" aria-expanded={rule} onClick={() => setRule(!rule)}>
          <Icon name="sliders" size={16} /><strong>Regla de la nota final</strong><span className="caption">Peso de cada tipo de actividad, lo no entregado y el periodo</span><span className="chev"><Icon name="right" size={14} strokeWidth={3} /></span>
        </button>
        {rule && draft && (
          <div className="gb-rule">
            <div className="gb-weights">
              {FINAL_KINDS.map((k) => {
                const total = FINAL_KINDS.reduce((n, x) => n + draft.weights[x.id], 0) || 1;
                return (
                  <label key={k.id} className="field gb-w"><span className="label">{k.label}</span>
                    <span className="gb-w-row"><input type="range" min="0" max="100" step="5" value={draft.weights[k.id]} onChange={(e) => setW(k.id, e.target.value)} aria-label={`Peso de ${k.label}`} /><b>{Math.round((draft.weights[k.id] / total) * 100)} %</b></span>
                  </label>
                );
              })}
            </div>
            <div className="gb-rule-row">
              <div className="field"><span className="label">Lo no entregado</span>
                <div className="segmented small" role="radiogroup" aria-label="Lo no entregado">
                  {[["zero", "Cuenta como 0"], ["skip", "No cuenta"]].map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={draft.missing === id} className={draft.missing === id ? "seg active" : "seg"} onClick={() => setDraft({ ...draft, missing: id })}>{l}</button>)}
                </div></div>
              <label className="field"><span className="label">Periodo desde</span><DateField value={draft.from ?? ""} onChange={(v) => setDraft({ ...draft, from: v || null })} placeholder="Desde el inicio" /></label>
              <label className="field"><span className="label">Hasta</span><DateField value={draft.to ?? ""} onChange={(v) => setDraft({ ...draft, to: v || null })} placeholder="Hasta hoy" /></label>
            </div>
            <div className="report-actions">
              {dirty && <button type="button" className="secondary" onClick={() => setDraft(savedFinal)}>Deshacer</button>}
              <button type="button" className="primary" disabled={!dirty} onClick={saveRule}>{dirty ? `Guardar regla para ${groupOf(course).name}` : "Guardada"}</button>
            </div>
            {dirty && <span className="caption">La tabla de abajo ya muestra cómo quedaría. Se guarda en la calificación de la clase.</span>}
          </div>
        )}
      </section>

      {!book && <p className="caption">Cargando notas…</p>}
      {book && (
        <section className="card t-card">
          <div className="section-head gb-head">
            <strong>{course.name} · {book.rows.length} estudiantes · {book.columns.length} actividades</strong>
            <span className="caption">{avgFinal.length ? `Nota final promedio ${book.rows.find((r) => r.final)?.final.display.includes("%") ? `${Math.round(avgFinal.reduce((a, b) => a + b, 0) / avgFinal.length)} %` : (avgFinal.reduce((a, b) => a + b, 0) / avgFinal.length).toLocaleString("es-CO", { maximumFractionDigits: 1 })}` : ""}{book.model.kind === "scale" && avgFinal.length ? ` · ${passing} de ${avgFinal.length} aprueban` : ""}</span>
          </div>
          {book.columns.length === 0 ? <p className="caption">Esta clase no tiene actividades en el periodo.</p> : (
            <div className="table-wrap gb-wrap">
              <table className="t-table gb-table">
                <thead>
                  <tr>
                    <th className="gb-sticky">Estudiante</th>
                    <th className="gb-final">Nota final</th>
                    <th className="gb-final">Aciertos ponderados</th>
                    {book.columns.map((c) => <th key={c.id} title={`${c.title} · ${describeModel(c.model)}`}><span className="gb-col">{c.title}</span><span className="caption">{KIND_SHORT[c.kind] ?? ""} · {c.weight ? "" : "no cuenta · "}{shortDate(c.due)}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="gb-sticky">{r.name}{r.missing > 0 && <span className="caption"> · {r.missing} sin entregar</span>}</td>
                      <td className={`gb-final ${r.final?.passed === false ? "gb-low" : ""}`}><strong>{r.final?.display ?? "—"}</strong>{scale && r.final && (() => { const l = desempeno(r.final.value, scale); return <span className={`gb-level l-${l}`}>{l}</span>; })()}</td>
                      <td className="gb-final">{r.finalPct == null ? "—" : `${r.finalPct} %`}</td>
                      {book.columns.map((c) => {
                        const cell = r.cells[c.id];
                        return <td key={c.id} className={cell.done ? (cell.passed === false ? "gb-low" : "") : "gb-miss"}>{cell.done ? cell.display : cell.display === "Abierta" ? "·" : "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="caption">— sin entregar (actividad cerrada) · · aún abierta. Cada actividad usa su propia calificación; pasa el mouse por el título para verla.</span>
          {scale && rows.length > 0 && book.columns.length > 0 && (() => {
            const c = desempenoCuts(scale);
            const f = (v) => v.toLocaleString("es-CO", { minimumFractionDigits: scale.decimals, maximumFractionDigits: scale.decimals });
            const counts = DESEMPENOS.map((l) => [l, rows.filter((r) => r.final && desempeno(r.final.value, scale) === l).length]);
            return (
              <p className="gb-levels caption">
                <span>Desempeño (Decreto 1290):</span>
                <span>Bajo &lt; {f(c.basico)} · {counts[0][1]}</span><span>Básico {f(c.basico)}–{f(c.alto)} · {counts[1][1]}</span>
                <span>Alto {f(c.alto)}–{f(c.superior)} · {counts[2][1]}</span><span>Superior desde {f(c.superior)} · {counts[3][1]}</span>
              </p>
            );
          })()}
          {rows.length > 0 && book.columns.length > 0 && <>
          <div className="report-actions gb-actions">
            <label className="field gb-order"><span className="label">Orden</span>
              <Select aria-label="Orden de los estudiantes" value={order} onChange={setSort} options={[{ value: "name", label: "Por nombre" }, { value: "surname", label: "Por apellido" }, { value: "grade", label: "Por nota" }]} /></label>
            <button type="button" className="secondary" onClick={copy}>{copied === "all" ? "Copiada" : "Copiar para Excel o Sheets"}</button>
            <button type="button" className="secondary" title="Una nota por línea, en el orden de la tabla: para pegar en la columna de la plataforma del colegio" onClick={() => copyText("final", finalColumn(rows))}>{copied === "final" ? "Notas copiadas" : "Copiar solo las notas finales"}</button>
            <button type="button" className="secondary" onClick={() => download(`Notas ${course.name}.csv`, gradebookTable(sorted))}>Descargar CSV</button>
            <button type="button" className="primary" onClick={() => setCards(true)} disabled={!rows.length}>Informes para padres</button>
          </div>
          <span className="caption">Antes de pegar solo las notas en la plataforma del colegio, revisa que el orden de la tabla sea el mismo de su lista («Por apellido» suele coincidir).</span>
          </>}
          {cards && <ReportCards api={api} course={course} teacherName={profile.full_name || ""} book={sorted} members={data.members} attempts={data.attempts} scale={scale} onClose={() => setCards(false)} />}
        </section>
      )}
    </div>
  );
}
