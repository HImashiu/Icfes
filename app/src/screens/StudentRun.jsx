import { useMemo, useState } from "react";
import { areaColor } from "../lib/brand.js";
import { fmtDuration, studentRun } from "../lib/studentRun.js";
import { Kpi } from "./Dashboard.jsx";

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const VERDICT = { ok: "Correcta", bad: "Incorrecta", blank: "Sin responder", open: "Respondida" };
const FILTERS = [["all", "Todas"], ["bad", "Falladas"], ["slow", "Más lentas"], ["hint", "Con pista"]];

// One student's whole run of an assignment: what they answered, whether it was right, how long each question took,
// and where they asked for a hint or changed their mind. `avgTimes` is the class average per question.
export default function StudentRun({ name, attempts, questions, answerKey, avgTimes, onClose }) {
  const [index, setIndex] = useState(attempts.length - 1);
  const [filter, setFilter] = useState("all");
  const attempt = attempts[Math.min(index, attempts.length - 1)];
  const run = useMemo(() => studentRun(questions, answerKey, attempt, avgTimes), [questions, answerKey, attempt, avgTimes]);
  const rows = run.rows.filter((r) => filter === "all" || (filter === "bad" ? r.verdict === "bad" : filter === "slow" ? r.slow : r.hint));
  const maxSec = Math.max(1, ...run.rows.map((r) => r.sec ?? 0), ...run.rows.map((r) => r.avg ?? 0));
  const paper = attempt?.mode === "paper";

  return (
    <div className="card t-card student-run" id="student-run" aria-label={`Detalle de ${name}`}>
      <div className="section-head">
        <strong>{name}</strong>
        <button type="button" className="link" onClick={onClose}>Cerrar</button>
      </div>
      {attempts.length > 1 && (
        <label className="field">
          <span className="label">Intento</span>
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))} aria-label="Intento">
            {attempts.map((a, i) => <option key={a.client_id ?? i} value={i}>Intento {i + 1} de {attempts.length} · {stamp(a.submitted_at)}</option>)}
          </select>
        </label>
      )}
      <p className="caption">
        {paper ? "Entregó en papel" : `Empezó ${stamp(attempt?.started_at)}`} · Entregó {stamp(attempt?.submitted_at)}
        {attempts.length > 1 ? ` · ${attempts.length} intentos` : ""}
      </p>
      <div className="d-kpis">
        <Kpi label="Aciertos" value={`${run.correct}/${questions.length}`} hint={`${run.wrong} falladas · ${run.blank} en blanco`} />
        <Kpi label="Tiempo total" value={fmtDuration(attempt?.duration_sec)} />
        <Kpi label="Por pregunta" value={run.hasTimes ? fmtDuration(run.avgSec) : null} hint={run.hasTimes ? "promedio" : undefined} />
        <Kpi label="Pistas" value={String(run.hints)} hint={run.changed ? `${run.changed} con respuesta cambiada` : undefined} />
      </div>
      {run.slowest.length > 0 && (
        <p className="caption">Donde más tardó: {run.slowest.map((r) => `N.° ${r.number} (${fmtDuration(r.sec)})`).join(" · ")}.</p>
      )}
      {!run.hasTimes && <p className="caption">{paper ? "Los intentos en papel no registran el tiempo por pregunta." : "Este intento se entregó antes de que la plataforma registrara el tiempo por pregunta."}</p>}

      <div className="segmented small" role="tablist" aria-label="Filtrar preguntas">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "seg active" : "seg"} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="t-table">
          <thead>
            <tr><th>N.°</th><th>Área</th><th>Respondió</th><th>Clave</th><th>Resultado</th><th>Tiempo</th><th>Curso</th><th>Pista</th><th>Cambios</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`run-${r.verdict}`}>
                <td>{r.number}</td>
                <td><span className="area-dot" style={{ background: areaColor(r.section) }} />{r.section}</td>
                <td>{r.given ?? "—"}</td>
                <td>{r.keyed ?? "—"}</td>
                <td><span className={`run-verdict ${r.verdict}`}>{VERDICT[r.verdict]}</span></td>
                <td>
                  <span className="run-time">
                    <span className="run-bar"><span className={r.slow ? "slow" : ""} style={{ width: `${r.sec == null ? 0 : (r.sec / maxSec) * 100}%` }} /></span>
                    {fmtDuration(r.sec)}{r.slow ? " · lenta" : ""}
                  </span>
                </td>
                <td className="muted">{r.avg == null ? "—" : fmtDuration(r.avg)}</td>
                <td>{r.hint ? "Sí" : "—"}</td>
                <td>{r.changes || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="caption">Ninguna pregunta coincide con este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <span className="caption">Resultado según la clave preliminar, no oficial. «Lenta» marca las preguntas donde tardó casi el doble que el promedio del curso.</span>
    </div>
  );
}
