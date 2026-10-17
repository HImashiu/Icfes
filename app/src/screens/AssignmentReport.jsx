import { useEffect, useMemo, useState } from "react";
import { areaAverages, bandFor, histogram, itemsCsv, itemStats, mean, round } from "../lib/analytics.js";
import { assignmentState, progressRows, questionsForAttempt, resultsCsv } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";
import QuestionView from "../components/QuestionView.jsx";
import AutopsyCard from "../components/AutopsyCard.jsx";
import { Bars, Histogram, Kpi } from "./Dashboard.jsx";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Informe de una asignación: avance, distribución, áreas, análisis por pregunta y tabla de estudiantes.
export default function AssignmentReport({ api, assignment, fetchExam, guard, reload }) {
  const [data, setData] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [allItems, setAllItems] = useState(false);
  const [board, setBoard] = useState(null);

  useEffect(() => {
    guard(async () => {
      const [members, attempts, b] = await Promise.all([api.listMembers(assignment.course_id), api.assignmentAttempts(assignment.id), fetchExam(assignment.exam_slug, assignment.question_keys)]);
      setBundle(b);
      setData({ members, attempts });
    });
  }, [api, assignment, fetchExam, guard]);

  const view = useMemo(() => {
    if (!data) return null;
    const prog = progressRows(data.members, data.attempts);
    const questions = bundle ? questionsForAttempt(bundle.exam, { scope: assignment.scope, keys: assignment.question_keys }) : [];
    const delivered = data.attempts.filter((a) => a.submitted_at);
    const items = bundle ? itemStats(questions, bundle.key, delivered) : [];
    const timed = assignment.kind === "exam";
    const rows = prog.rows.map((r) => ({
      ...r,
      band: timed && r.attempt?.score?.keyed ? bandFor(r.attempt.score.perArea) : null,
      answers: r.attempt?.answers ?? {},
    }));
    const pcts = rows.map((r) => r.pct).filter((p) => p != null);
    return {
      prog, rows, questions, items, timed,
      avg: round(mean(pcts)),
      hist: histogram(pcts, 0, 100, 5),
      areas: areaAverages(rows.map((r) => r.attempt).filter(Boolean).map((a) => ({ ...a, profile_id: a.profile_id }))),
    };
  }, [data, bundle, assignment]);

  if (!view) return <p className="caption">Cargando avance…</p>;
  const { prog, rows, items, timed } = view;
  const sorted = [...items].filter((i) => i.pct != null).sort((a, b) => a.pct - b.pct);
  const shown = allItems ? sorted : sorted.slice(0, 10);

  const closeNow = () => guard(async () => { await api.setAssignmentStatus(assignment.id, "closed"); await reload(); });
  const remove = () => {
    if (window.confirm("¿Borrar esta asignación? Los intentos de los estudiantes se conservan.")) guard(async () => { await api.deleteAssignment(assignment.id); await reload(); });
  };
  const reinforce = () => {
    const keys = sorted.slice(0, 10).map((i) => i.key);
    if (keys.length === 0 || !window.confirm(`Crear una práctica nueva con las ${keys.length} preguntas más falladas para este curso?`)) return;
    guard(async () => {
      const me = await api.getProfile();
      await api.createAssignment({
        course_id: assignment.course_id, created_by: me.id, kind: "task", title: `Refuerzo · ${assignment.title}`.slice(0, 120),
        exam_slug: assignment.exam_slug, scope: assignment.scope, question_keys: keys,
        due_at: new Date(Date.now() + 7 * 864e5).toISOString(), reveal_policy: "after_submit", status: "active",
      });
      await reload();
    });
  };

  return (
    <div className="card t-card" id="report">
      <div className="section-head">
        <strong>{assignment.title}</strong>
        <span className="muted">{prog.done} de {prog.total} entregaron ({prog.completion} %)</span>
      </div>
      <div className="progress thin"><span style={{ width: `${prog.completion}%` }} /></div>
      {prog.done > 0 && (
        <>
          <div className="d-kpis">
            <Kpi label="Promedio" value={view.avg == null ? null : `${view.avg} %`} />
            <Kpi label="Entregaron" value={`${prog.done}/${prog.total}`} />
            {sorted[0] && <Kpi label="Pregunta más difícil" value={`N.° ${sorted[0].number}`} hint={`${sorted[0].pct} % acertó`} />}
          </div>
          <div className="d-two">
            <div><span className="label">Distribución de resultados</span>
              <Histogram bins={view.hist} format={(b) => `${b.from}–${b.to}`} /></div>
            <div><span className="label">Por área</span>
              <Bars rows={view.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} /></div>
          </div>
        </>
      )}

      <div className="table-wrap">
        <table className="t-table">
          <thead><tr><th>Estudiante</th><th>Estado</th><th>Puntaje</th>{timed && <th>Banda estimada</th>}<th>Entregado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.done ? "Entregado" : r.joined ? "Pendiente" : "Sin ingresar"}</td>
                <td>{r.pct == null ? "—" : `${r.pct} %`}</td>
                {timed && <td>{r.band?.global == null ? "—" : `${r.band.low}–${r.band.high}`}</td>}
                <td>{r.at ? shortDate(r.at) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="caption">El curso no tiene estudiantes.</td></tr>}
          </tbody>
        </table>
      </div>
      {timed && <span className="caption">La banda (0–500) usa una curva provisional y la clave preliminar: es un estimado, no el puntaje oficial.</span>}

      {sorted.length > 0 && (
        <div>
          <span className="label">Análisis por pregunta · las más falladas primero</span>
          <div className="table-wrap">
            <table className="t-table">
              <thead><tr><th>N.°</th><th>Área</th><th>Acierto</th><th>Respuestas (A · B · C · D)</th><th>Clave</th><th /></tr></thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.key}>
                    <td>{i.number}</td>
                    <td>{i.section}</td>
                    <td>{i.pct} %</td>
                    <td>{["A", "B", "C", "D"].map((l) => <span key={l} className={l === i.keyed ? "d-opt key" : "d-opt"}>{l} {i.dist[l] ?? 0}</span>)}</td>
                    <td>{i.keyed ?? "—"}</td>
                    <td>{i.suspect && <span className="badge pending" title="La mayoría eligió otra opción: revisa la clave, que es preliminar.">Revisar clave</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-actions no-print"><button type="button" className="secondary" onClick={() => setBoard(0)}>Proyectar la autopsia de las más falladas</button></div>
          {sorted.length > 10 && <button type="button" className="link" onClick={() => setAllItems(!allItems)}>{allItems ? "Ver solo las 10 más falladas" : `Ver las ${sorted.length}`}</button>}
        </div>
      )}

      {board !== null && sorted[board] && bundle && (() => {
        const it = sorted[board];
        const q = view.questions.find((x) => x.key === it.key);
        const top5 = sorted.slice(0, 5);
        return (
          <div className="b-modal" role="dialog" aria-modal="true" aria-label="Autopsia de la pregunta">
            <div className="b-modal-card">
              <div className="section-head">
                <strong>Pregunta {it.number} · {board + 1} de {top5.length}</strong>
                <span>
                  <button type="button" className="link" disabled={board === 0} onClick={() => setBoard(board - 1)}>Anterior</button>{" "}
                  <button type="button" className="link" disabled={board >= top5.length - 1} onClick={() => setBoard(board + 1)}>Siguiente</button>{" "}
                  <button type="button" className="link" onClick={() => setBoard(null)}>Cerrar</button>
                </span>
              </div>
              <AutopsyCard counts={Object.fromEntries((q?.options ?? []).map((o) => [o.letter, it.dist[o.letter] ?? 0]))} correct={it.keyed ? [it.keyed] : []} enrichRow={bundle.enrich?.[String(it.number)]} meta={bundle.enrichMeta} />
              {q && <QuestionView question={q} answer={null} graded review={{ correctLetter: it.keyed }} figures={bundle.figures} examLabel={bundle.exam.title} report={false} />}
            </div>
          </div>
        );
      })()}

      <span className="caption">Puntaje según la clave preliminar, no oficial.</span>
      <div className="report-actions no-print">
        <button type="button" className="secondary" onClick={() => download(`${assignment.title}.csv`, resultsCsv(assignment.title, prog.rows))}>Exportar CSV</button>
        <button type="button" className="secondary" disabled={!bundle || prog.done === 0} onClick={() => download(`${assignment.title} · por pregunta.csv`, itemsCsv(assignment.title, view.questions, bundle.key, rows.filter((r) => r.done)))}>CSV por pregunta</button>
        <button type="button" className="secondary" onClick={() => window.print()}>Imprimir o PDF</button>
        {sorted.length >= 3 && <button type="button" className="secondary" onClick={reinforce}>Crear refuerzo con las más falladas</button>}
        {assignmentState(assignment) !== "closed" && <button type="button" className="secondary" onClick={closeNow}>Cerrar ahora</button>}
        <button type="button" className="link" onClick={remove}>Borrar</button>
      </div>
    </div>
  );
}
