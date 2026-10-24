import { useMemo } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import History from "./History.jsx";
import { fmtInt } from "../lib/brand.js";
import { loadHistory } from "../lib/local.js";
import { achievements } from "../lib/achievements.js";
import { practiceInsights, studentSubjects, studentTasks } from "../lib/student.js";
import { areaShort, contextColor } from "../lib/teaching.js";

const ago = (t) => {
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};
const TABS = [{ id: "resumen", label: "Resumen" }, { id: "logros", label: "Logros" }, { id: "historial", label: "Historial" }];

// Progreso: the student's own analysis (by area, over time, pace), their logros and every finished attempt.
// Always against the student's own past, never against classmates.
export default function Progress({ tab = "resumen", onTab, assigned, classes, onPracticeArea, onNew, onOpen }) {
  const history = useMemo(() => loadHistory(), []);
  const ins = useMemo(() => practiceInsights(history), [history]);
  const tasks = useMemo(() => {
    if (!assigned) return [];
    const subjects = studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts });
    return studentTasks({ subjects, assignments: assigned.assignments, attempts: assigned.attempts });
  }, [assigned, classes]);
  const badges = useMemo(() => achievements({ history, tasks }), [history, tasks]);

  return (
    <section className="progress-screen">
      <header className="screen-head"><h1>Progreso</h1></header>
      <div className="segmented sj-tabs" role="tablist" aria-label="Secciones de progreso">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "seg active" : "seg"} onClick={() => onTab(t.id)}>
            {t.label}{t.id === "logros" && <span className="muted"> {badges.filter((b) => b.got).length}/{badges.length}</span>}
          </button>
        ))}
      </div>
      {tab === "logros" && <Badges badges={badges} />}
      {tab === "historial" && <History embedded onNew={onNew} onOpen={onOpen} />}
      {tab !== "logros" && tab !== "historial" && <Summary ins={ins} history={history} onPracticeArea={onPracticeArea} onNew={onNew} />}
    </section>
  );
}

function Summary({ ins, history, onPracticeArea, onNew }) {
  if (ins.sessions === 0) {
    return (
      <div className="card sh-allclear">
        <Mascot size={72} pose="thinking" />
        <div><strong>Tu análisis aparece con tu primer simulacro</strong><span className="caption">Verás tus aciertos por área, cómo vas cambiando y en qué te demoras más.</span></div>
        <button type="button" className="primary" onClick={onNew}>Practicar</button>
      </div>
    );
  }
  // Every attempt, oldest to newest, as a dot at its percent; the line joins them.
  const rows = [...history].filter((h) => h.keyed !== false).sort((a, b) => a.at - b.at).slice(-20);
  const w = 600, h = 160, pad = 8;
  const x = (i) => pad + (rows.length > 1 ? (i * (w - 2 * pad)) / (rows.length - 1) : (w - 2 * pad) / 2);
  const y = (p) => pad + (1 - p / 100) * (h - 2 * pad);
  const main = (r) => [...(r.perArea ?? [])].sort((a, b) => b.answered - a.answered)[0]?.name;
  return (
    <div className="sh-grid">
      <div className="sh-col">
        <div className="pg-kpis">
          <span className="card"><b>{fmtInt(ins.answered)}</b><span className="caption">preguntas</span></span>
          <span className="card"><b>{ins.pct == null ? "—" : `${ins.pct} %`}</b><span className="caption">aciertos</span></span>
          <span className="card"><b className="flame-text">{ins.streak}</b><span className="caption">días de racha</span></span>
          <span className="card"><b>{ins.secPerQuestion ? `${ins.secPerQuestion} s` : "—"}</b><span className="caption">por pregunta</span></span>
        </div>

        <div className="card sh-card">
          <div className="section-head"><span className="label">Tu evolución</span><span className="caption">últimos {rows.length} intentos</span></div>
          <svg className="pg-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Porcentaje de aciertos en cada intento">
            {[25, 50, 75].map((p) => <line key={p} x1="0" x2={w} y1={y(p)} y2={y(p)} stroke="var(--line)" strokeWidth="1" />)}
            <polyline points={rows.map((r, i) => `${x(i)},${y(r.percent)}`).join(" ")} fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinejoin="round" opacity="0.6" />
            {rows.map((r, i) => <circle key={r.id} cx={x(i)} cy={y(r.percent)} r="6" fill={contextColor(main(r))} stroke="var(--surface)" strokeWidth="2"><title>{`${r.title}: ${Math.round(r.percent)} %`}</title></circle>)}
          </svg>
          <div className="pg-legend">{ins.areas.map((a) => <span key={a.name}><span className="dot" style={{ background: a.color }} /> {areaShort(a.name)}</span>)}</div>
        </div>

        <div className="card sp-card">
          <div className="section-head"><span className="label">Análisis por área</span><span className="caption">Toca un área para practicarla</span></div>
          <div className="sp-table" role="table" aria-label="Análisis por área">
            <div className="sp-row head" role="row"><span role="columnheader">Área</span><span role="columnheader">Aciertos</span><span role="columnheader">Cambio</span><span role="columnheader">Últimos</span><span role="columnheader">Practicaste</span></div>
            {[...ins.areas].reverse().map((a) => (
              <button key={a.name} type="button" className="sp-row" role="row" onClick={() => onPracticeArea(a.name)}>
                <span role="cell"><span className="dot" style={{ background: a.color }} /> {areaShort(a.name)}</span>
                <span role="cell" className="sp-pct"><span className="td-track"><span style={{ width: `${a.pct}%`, background: a.color }} /></span><b>{a.pct} %</b></span>
                <span role="cell" className={a.trend > 0 ? "sp-up" : a.trend < 0 ? "sp-down" : "caption"}>{a.trend == null ? "—" : `${a.trend > 0 ? "▲ +" : a.trend < 0 ? "▼ " : ""}${a.trend}`}</span>
                <span role="cell" className="td-spark sp-spark" aria-hidden="true">{a.series.map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: a.color, opacity: i === a.series.length - 1 ? 1 : 0.45 }} />)}</span>
                <span role="cell" className="caption">{a.sessions} {a.sessions === 1 ? "vez" : "veces"} · {ago(a.last)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sh-col">
        {ins.weakest && (
          <button type="button" className="card sp-insight" style={{ "--c": ins.weakest.color }} onClick={() => onPracticeArea(ins.weakest.name)}>
            <span className="label">Para reforzar</span>
            <strong>{areaShort(ins.weakest.name)} · {ins.weakest.pct} %</strong>
            <span className="caption">{ins.weakest.answered} preguntas respondidas. Practícala hoy <Icon name="right" size={12} strokeWidth={3} /></span>
          </button>
        )}
        {ins.strongest && (
          <div className="card sp-insight" style={{ "--c": ins.strongest.color }}>
            <span className="label">Tu punto fuerte</span>
            <strong>{areaShort(ins.strongest.name)} · {ins.strongest.pct} %</strong>
            <span className="caption">{ins.strongest.trend > 0 ? `Subiste ${ins.strongest.trend} puntos` : "Mantén el ritmo"}</span>
          </div>
        )}
        <div className="card sp-insight" style={{ "--c": "var(--accent)" }}>
          <span className="label">Tu ritmo</span>
          <strong>{ins.secPerQuestion ? `${ins.secPerQuestion} s por pregunta` : "Sin tiempos aún"}</strong>
          <span className="caption">El día del examen hay unos 2 min por pregunta</span>
        </div>
        <div className="card sh-card">
          <div className="section-head"><span className="label">XP por semana</span><span className="caption">esta semana</span></div>
          <div className="pg-week">{ins.week.map((v, i) => <span key={i} title={`${v} XP`}><i style={{ height: `${Math.min(100, (v / Math.max(100, ...ins.week)) * 100)}%` }} /><em>{"LMXJVSD"[i]}</em></span>)}</div>
        </div>
      </div>
    </div>
  );
}

function Badges({ badges }) {
  const got = badges.filter((b) => b.got);
  return (
    <>
      <div className="card pg-badge-head">
        <Mascot size={64} pose={got.length ? "happy" : "normal"} />
        <div><strong>{got.length} de {badges.length} logros</strong><span className="caption">Cada logro se gana practicando y entregando a tiempo. Solo cuentas tú: nadie compite contra nadie.</span></div>
      </div>
      <div className="pg-badges">
        {badges.map((b) => (
          <div key={b.id} className={b.got ? "card pg-badge got" : "card pg-badge"}>
            <span className="pg-medal" aria-hidden="true"><Icon name={b.icon} size={26} /></span>
            <strong>{b.title}</strong>
            <span className="caption">{b.desc}</span>
            {!b.got && <span className="pg-badge-prog"><span className="progress thin"><span style={{ width: `${(b.have / b.need) * 100}%` }} /></span><span className="caption">{fmtInt(b.have)}/{fmtInt(b.need)}</span></span>}
            {b.got && <span className="pg-badge-done"><Icon name="check" size={14} strokeWidth={3} /> Logrado</span>}
          </div>
        ))}
      </div>
    </>
  );
}
