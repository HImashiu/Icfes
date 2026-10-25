import { useMemo } from "react";
import { areaColor } from "../lib/brand.js";
import { TIME_BUCKETS } from "../lib/chartBuilder.js";
import { courseAreaGrid, questionDifficulty, summaryFindings, timeVsAccuracy, weakest, weeklyByArea } from "../lib/insights.js";
import { Bars, Kpi } from "./Dashboard.jsx";
import { useFacts } from "./useFacts.js";
import "./results.css";

const weekLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const heat = (p) => (p == null ? "transparent" : p < 40 ? "var(--bad-soft)" : p < 60 ? "rgba(255, 159, 67, 0.16)" : p < 75 ? "rgba(200, 240, 74, 0.12)" : "var(--ok-soft)");

// Resumen, a level deeper: what every answer says about courses, areas, topics, time and the questions themselves.
export default function ResultsInsights({ api, courses, assignments, fetchExam, ws, onOpenSheet }) {
  const facts = useFacts({ api, assignments, courses, fetchExam, ws });
  const v = useMemo(() => {
    if (!facts?.length) return null;
    const grid = courseAreaGrid(facts);
    const weekly = weeklyByArea(facts);
    const topics = weakest(facts, "tema");
    const comps = weakest(facts, "competencia", { limit: 5 });
    const time = timeVsAccuracy(facts, TIME_BUCKETS);
    const diff = questionDifficulty(facts);
    const keyed = facts.filter((f) => f.correct != null);
    return { grid, weekly, topics, comps, time, diff, findings: summaryFindings({ grid, weekly, topics, time, diff }), answers: facts.length, right: keyed.length ? Math.round((keyed.filter((f) => f.correct).length / keyed.length) * 100) : null, students: new Set(facts.map((f) => f.studentId)).size, hints: facts.filter((f) => f.hint).length };
  }, [facts]);

  if (!facts) return <section className="card t-card"><span className="caption">Analizando todas las respuestas…</span></section>;
  if (!v) return null;
  return (
    <div className="ri">
      <div className="section-head ri-head"><h2>Lo que dicen todas las respuestas</h2>{onOpenSheet && <button type="button" className="link" onClick={onOpenSheet}>Abrir en la hoja de datos</button>}</div>
      <div className="d-kpis">
        <Kpi label="Respuestas analizadas" value={v.answers.toLocaleString("es-CO")} hint={`de ${v.students} estudiantes`} />
        <Kpi label="Acierto general" value={v.right == null ? null : `${v.right} %`} hint="clave preliminar" />
        <Kpi label="Preguntas difíciles" value={`${v.diff.hard}/${v.diff.total}`} hint="las acierta menos del 40 %" />
        {v.time.rushedShare != null && <Kpi label="Respuestas apresuradas" value={`${v.time.rushedShare} %`} hint="en menos de 15 s" />}
      </div>

      {v.findings.length > 0 && (
        <section className="card t-card">
          <strong>Hallazgos</strong>
          <ul className="ar2-findings">{v.findings.map((f, i) => <li key={i} className={`tone-${f.tone}`}>{f.text}</li>)}</ul>
        </section>
      )}

      <div className="d-two">
        <section className="card t-card">
          <strong>Áreas por curso</strong>
          <div className="table-wrap">
            <table className="t-table ri-heat">
              <thead><tr><th>Curso</th>{v.grid.cols.map((c) => <th key={c}><span className="dot" style={{ background: areaColor(c) }} /> {c.split(" ")[0]}</th>)}</tr></thead>
              <tbody>
                {v.grid.rows.map((r) => (
                  <tr key={r}><td><strong>{r}</strong></td>{v.grid.cols.map((c) => { const x = v.grid.cell(r, c); return <td key={c} style={{ background: heat(x?.pct) }} title={x ? `${x.n} respuestas` : "Sin respuestas"}>{x?.pct == null ? (x ? "·" : "") : `${Math.round(x.pct)} %`}</td>; })}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="caption">% de aciertos. «·» = menos de 20 respuestas, muy pocas para concluir.</span>
        </section>
        <section className="card t-card">
          <strong>Evolución semanal por área</strong>
          <WeekLines data={v.weekly} />
        </section>
      </div>

      <div className="d-two">
        <section className="card t-card">
          <strong>Temas más bajos</strong>
          {v.topics.length ? <Bars rows={v.topics.map((t) => ({ label: t.name, value: Math.round(t.pct), color: t.pct < 40 ? "var(--bad)" : "var(--flame)" }))} /> : <span className="caption">Las preguntas aún no tienen temas etiquetados.</span>}
          {v.comps.length > 0 && <><span className="label ar2-sub">Competencias más bajas</span><Bars rows={v.comps.map((t) => ({ label: t.name, value: Math.round(t.pct), color: "var(--flame)" }))} /></>}
        </section>
        <section className="card t-card">
          <strong>Tiempo por pregunta y acierto</strong>
          {v.time.n ? (
            <>
              <Bars rows={v.time.buckets.filter((b) => b.n).map((b) => ({ label: b.name, value: b.pct == null ? null : Math.round(b.pct), color: "var(--accent)" }))} />
              <span className="caption">Acierto según cuánto tardaron en cada pregunta ({v.time.n.toLocaleString("es-CO")} respuestas con tiempo). Si las rápidas aciertan mucho menos, hay respuestas al azar.</span>
            </>
          ) : <span className="caption">Aún no hay tiempos por pregunta (las hojas en papel no los tienen).</span>}
          <span className="label ar2-sub">Preguntas que casi nadie acierta</span>
          <ul className="ri-hard">
            {v.diff.hardest.map((q) => <li key={q.key}><span className="ri-pct" style={{ background: heat(q.pct) }}>{Math.round(q.pct)} %</span><span><strong>{q.assignment}</strong> · <span className="caption">{q.area}{q.tema && q.tema !== "Sin etiquetar" ? ` · ${q.tema}` : ""} · {q.n} respuestas</span></span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}

function WeekLines({ data }) {
  if (data.labels.length < 2) return <p className="caption">Con dos semanas de respuestas se dibuja la evolución.</p>;
  const w = 520, h = 210, l = 34, b = 28, t = 10;
  const n = data.labels.length;
  const x = (i) => l + (i * (w - l - 10)) / (n - 1);
  const y = (p) => t + (1 - p / 100) * (h - t - b);
  return (
    <>
      <ul className="cb-legend">{data.series.map((s) => <li key={s.name}><span className="dot" style={{ background: areaColor(s.name) }} />{s.name}</li>)}</ul>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Acierto semanal por área">
        {[25, 50, 75].map((p) => <g key={p}><line x1={l} x2={w - 6} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeDasharray="3 4" /><text x={l - 6} y={y(p) + 3} fontSize="10" textAnchor="end" fill="var(--text-2)">{p}%</text></g>)}
        {data.series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
          return <g key={s.name}><polyline fill="none" stroke={areaColor(s.name)} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => p.join(",")).join(" ")} />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={areaColor(s.name)} />)}</g>;
        })}
        {data.labels.map((lb, i) => (i % Math.max(1, Math.ceil(n / 6)) === 0 || i === n - 1 ? <text key={lb} x={x(i)} y={h - 8} fontSize="10" textAnchor="middle" fill="var(--text-2)">{weekLabel(lb)}</text> : null))}
      </svg>
    </>
  );
}
