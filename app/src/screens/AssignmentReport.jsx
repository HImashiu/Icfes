import { useEffect, useMemo, useState } from "react";
import { areaAverages, bandFor, histogram, itemsCsv, itemStats, mean, round } from "../lib/analytics.js";
import { assignmentState, progressRows, questionsForAttempt, resultsCsv } from "../lib/assignments.js";
import { areaColor } from "../lib/brand.js";
import { DEFAULT_MODEL, MODEL_KINDS, describeModel, formatValue, gradeMany, isAdjusted, itemFromRow, valueRange } from "../lib/grading.js";
import QuestionView from "../components/QuestionView.jsx";
import AutopsyCard from "../components/AutopsyCard.jsx";
import { Bars, Histogram, Kpi } from "./Dashboard.jsx";
import StudentRun from "./StudentRun.jsx";
import { sampleRunAttempt } from "../lib/studentRun.js";
import { classTimes, fmtDuration } from "../lib/studentRun.js";
import { familyPayload, reportUrl, whatsappLink } from "../lib/family.js";
import ProctorPanel from "./ProctorPanel.jsx";
import { confirmDialog } from "../components/Controls.jsx";

const shortDate = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Informe de una asignación: avance, distribución, áreas, análisis por pregunta y tabla de estudiantes.
export default function AssignmentReport({ api, assignment, fetchExam, guard, reload, model = DEFAULT_MODEL }) {
  const [data, setData] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [allItems, setAllItems] = useState(false);
  const [board, setBoard] = useState(null);
  const [share, setShare] = useState(null);
  const [familyMsg, setFamilyMsg] = useState(null);
  const [student, setStudent] = useState(null);
  const [sample, setSample] = useState(false);

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
    const ctx = bundle ? { questions, key: bundle.key } : {};
    const graded = prog.rows.filter((r) => r.attempt);
    // The group is graded together (IRT needs it); each student's best delivered attempt counts, like the percent column.
    const grades = gradeMany(graded.map((r) => itemFromRow(r.attempt, r.attempts.indexOf(r.attempt) + 1)), model, ctx);
    const gradeOf = new Map(graded.map((r, i) => [r.id, grades[i]]));
    const rows = prog.rows.map((r) => ({
      ...r,
      grade: gradeOf.get(r.id) ?? null,
      band: timed && r.attempt?.score?.keyed ? bandFor(r.attempt.score.perArea) : null,
      answers: r.attempt?.answers ?? {},
    }));
    const values = rows.map((r) => r.grade?.value).filter((v) => v != null);
    const range = valueRange(model) ?? (values.length ? [Math.min(...values), Math.max(...values) + 1e-9] : [0, 1]);
    const pcts = rows.map((r) => r.pct).filter((p) => p != null);
    return {
      prog, rows, questions, items, timed,
      avgTimes: classTimes(questions, delivered),
      avg: round(mean(pcts)),
      gradeAvg: values.length ? mean(values) : null,
      hist: histogram(values, range[0], range[1], 5),
      areas: areaAverages(rows.map((r) => r.attempt).filter(Boolean).map((a) => ({ ...a, profile_id: a.profile_id }))),
    };
  }, [data, bundle, assignment, model]);

  if (!view) return <p className="caption">Cargando avance…</p>;
  const { prog, rows, items, timed } = view;
  const sorted = [...items].filter((i) => i.pct != null).sort((a, b) => a.pct - b.pct);
  const shown = allItems ? sorted : sorted.slice(0, 10);

  const openStudent = (id) => {
    setStudent(id);
    setTimeout(() => document.getElementById("student-run")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const closeNow = () => guard(async () => { await api.setAssignmentStatus(assignment.id, "closed"); await reload(); });
  const remove = async () => {
    if (await confirmDialog("¿Borrar esta asignación? Los intentos de los estudiantes se conservan.", { confirmLabel: "Borrar", danger: true })) guard(async () => { await api.deleteAssignment(assignment.id); await reload(); });
  };
  const family = (r) => {
    const profileId = r.attempt?.profile_id ?? data.members.find((m) => m.id === r.id)?.profile_id;
    if (!profileId) { setFamilyMsg(`${r.name} todavía no ha ingresado a la plataforma: el informe familiar necesita una cuenta. Cuando ingrese con su correo, sus resultados en papel quedan en su cuenta.`); return; }
    setFamilyMsg(null);
    guard(async () => {
      try {
        const attempts = await api.studentAttempts(profileId);
        const token = await api.createFamilyReport(profileId, familyPayload({ studentName: r.name, attempts }));
        setShare({ token, name: r.name });
      } catch (e) {
        if (String(e.message).includes("no_guardian_authorization")) { setFamilyMsg("Antes de compartir informes con familias, la coordinación debe registrar la autorización de acudientes en Ajustes."); return; }
        throw e;
      }
    });
  };
  const reinforce = async () => {
    const keys = sorted.slice(0, 10).map((i) => i.key);
    if (keys.length === 0 || !(await confirmDialog(`¿Crear una práctica nueva con las ${keys.length} preguntas más falladas para este curso?`, { confirmLabel: "Crear práctica" }))) return;
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
            <Kpi label="Promedio" value={view.gradeAvg == null ? null : formatValue(model, view.gradeAvg)} hint={isAdjusted(model) && view.avg != null ? `${view.avg} % de aciertos` : undefined} />
            <Kpi label="Entregaron" value={`${prog.done}/${prog.total}`} />
            {sorted[0] && <Kpi label="Pregunta más difícil" value={`N.° ${sorted[0].number}`} hint={`${sorted[0].pct} % acertó`} />}
          </div>
          <div className="d-two">
            <div><span className="label">Distribución de resultados</span>
              <Histogram bins={view.hist} format={(b) => `${formatValue(model, b.from)}–${formatValue(model, b.to)}`} /></div>
            <div><span className="label">Por área</span>
              <Bars rows={view.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} /></div>
          </div>
        </>
      )}

      <div className="table-wrap">
        <table className="t-table">
          <thead><tr><th>Estudiante</th><th>Estado</th><th>{model.kind === "percent" ? "Puntaje" : "Nota"}</th>{isAdjusted(model) && <th>Aciertos</th>}{timed && <th>Banda estimada</th>}<th>Entregado</th><th>Tiempo</th><th>Intentos</th><th className="no-print" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.done ? <button type="button" className="link" onClick={() => openStudent(r.id)}>{r.name}</button> : r.name}</td>
                <td>{r.done ? (r.paper ? "Entregado (papel)" : "Entregado") : r.joined ? "Pendiente" : "Sin ingresar"}</td>
                <td title={r.grade?.error ?? r.grade?.note ?? undefined}>{r.grade ? r.grade.display : "—"}{r.grade?.passed === false && <span className="badge pending"> no aprueba</span>}</td>
                {isAdjusted(model) && <td>{r.pct == null ? "—" : `${r.pct} %`}</td>}
                {timed && <td>{r.band?.global == null ? "—" : `${r.band.low}–${r.band.high}`}</td>}
                <td>{r.at ? shortDate(r.at) : "—"}</td>
                <td>{r.done && !r.paper ? fmtDuration(r.attempt?.duration_sec) : "—"}</td>
                <td>{r.attempts.length || "—"}</td>
                <td className="no-print">{r.done && <button type="button" className="link" onClick={() => openStudent(r.id)}>Ver detalle</button>}{r.done && <button type="button" className="link" onClick={() => family(r)}>Informe familiar</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="caption">El curso no tiene estudiantes.</td></tr>}
          </tbody>
        </table>
      </div>
      {prog.done === 0 && bundle && view.questions.length > 0 && (
        sample ? (
          <StudentRun name="Estudiante de ejemplo (datos inventados)" attempts={[sampleRunAttempt(view.questions.slice(0, 20), bundle.key)]} questions={view.questions.slice(0, 20)} answerKey={bundle.key} avgTimes={new Map()} onClose={() => setSample(false)} />
        ) : (
          <button type="button" className="secondary no-print" onClick={() => setSample(true)}>Ver un ejemplo de reporte individual</button>
        )
      )}
      {assignment.proctor && <ProctorPanel api={api} assignment={assignment} members={data.members} />}
      {student && (() => {
        const row = rows.find((r) => r.id === student);
        return row && row.attempts.length > 0 && bundle ? (
          <StudentRun key={student} name={row.name} attempts={row.attempts} questions={view.questions} answerKey={bundle.key} avgTimes={view.avgTimes} onClose={() => setStudent(null)} />
        ) : null;
      })()}
      {familyMsg && <p className="notice no-print" role="alert">{familyMsg}</p>}
      {share && (
        <div className="notice no-print" role="status" style={{ display: "grid", gap: 8 }}>
          <strong>Informe de {share.name} listo</strong>
          <input readOnly aria-label="Enlace del informe" value={reportUrl(share.token)} onFocus={(e) => e.target.select()} />
          <div className="report-actions">
            <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(reportUrl(share.token))}>Copiar enlace</button>
            <a className="secondary" href={whatsappLink(reportUrl(share.token), share.name)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
            <a className="secondary" href={reportUrl(share.token)} target="_blank" rel="noreferrer">Ver como la familia</a>
            <button type="button" className="link" onClick={() => guard(async () => { await api.revokeFamilyReport(share.token); setShare(null); })}>Retirar enlace</button>
          </div>
          <span className="caption">Quien tenga el enlace puede ver el informe, sin iniciar sesión. Envíalo solo a la familia.</span>
        </div>
      )}
      {isAdjusted(model) && <span className="caption no-print">Modelo de calificación: {describeModel(model)}. Se puede cambiar en «Calificación».{rows.find((r) => r.grade?.provisional)?.grade.note ? ` ${rows.find((r) => r.grade?.provisional).grade.note}` : ""}</span>}
      {timed && <span className="caption">La banda (0–500) usa una curva provisional y la clave preliminar: es un estimado, no el puntaje oficial.</span>}

      {sorted.length > 0 && (
        <div>
          <span className="label">Análisis por pregunta · las más falladas primero</span>
          <div className="table-wrap">
            <table className="t-table">
              <thead><tr><th>N.°</th><th>Área</th><th>Acierto</th><th>Respuestas (A · B · C · D)</th><th>Clave</th><th>Error común</th><th>Tiempo medio</th><th /></tr></thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.key}>
                    <td>{i.number}</td>
                    <td>{i.section}</td>
                    <td>{i.pct} %</td>
                    <td>{["A", "B", "C", "D"].map((l) => <span key={l} className={l === i.keyed ? "d-opt key" : "d-opt"}>{l} {i.dist[l] ?? 0}</span>)}</td>
                    <td>{i.keyed ?? "—"}</td>
                    <td>{i.topWrong ? `${i.topWrong} (${i.dist[i.topWrong]})` : "—"}</td>
                    <td>{i.avgSec == null ? "—" : fmtDuration(i.avgSec)}</td>
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
        <button type="button" className="secondary" onClick={() => download(`${assignment.title}.csv`, resultsCsv(assignment.title, rows, isAdjusted(model) ? { label: `Nota (${MODEL_KINDS.find((k) => k.id === model.kind).label})`, of: (r) => r.grade?.display } : null))}>Exportar CSV</button>
        <button type="button" className="secondary" disabled={!bundle || prog.done === 0} onClick={() => download(`${assignment.title} · por pregunta.csv`, itemsCsv(assignment.title, view.questions, bundle.key, rows.filter((r) => r.done)))}>CSV por pregunta</button>
        <button type="button" className="secondary" onClick={() => window.print()}>Imprimir o PDF</button>
        {sorted.length >= 3 && <button type="button" className="secondary" onClick={reinforce}>Crear refuerzo con las más falladas</button>}
        {assignmentState(assignment) !== "closed" && <button type="button" className="secondary" onClick={closeNow}>Cerrar ahora</button>}
        <button type="button" className="link" onClick={remove}>Borrar</button>
      </div>
    </div>
  );
}
