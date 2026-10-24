import { useMemo } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import AssignedList from "./AssignedList.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { areaColor, fmtInt, fmtPct } from "../lib/brand.js";
import { formatClock, questionsFor } from "../lib/exam.js";
import { loadHistory } from "../lib/local.js";
import { pendingMisses } from "../lib/repechaje.js";
import { practiceInsights, studentEvents, studentSubjects } from "../lib/student.js";
import { areaShort } from "../lib/teaching.js";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const shortDue = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
const dueText = (iso, now = Date.now()) => {
  const days = Math.ceil((new Date(iso) - now) / 864e5);
  if (days <= 0) return "cierra hoy";
  if (days === 1) return "cierra mañana";
  return `cierra ${shortDue(iso)}`;
};

// Inicio: what is due, each subject with its teacher, the month, and the student's own progress. Progress is
// measured against the student's goal and past self, never against classmates. Before the first practice the
// streak, XP and mastery are SAMPLE data (data/mock.js), and the page says so.
export default function Home({ exam, slug, resumable, onContinue, onPractice, onSetup, xpSession, assigned, classes, onStartAssigned, onLive, realName, signedOut, onGo }) {
  const now = Date.now();
  const todayIndex = (new Date().getDay() + 6) % 7;
  const history = useMemo(() => loadHistory(), []);
  const ins = useMemo(() => practiceInsights(history, now), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  const real = ins.sessions > 0;
  const streak = real ? ins.streak : SAMPLE_STUDENT.streak;
  const xp = (real ? ins.xp : SAMPLE_STUDENT.xp) + (xpSession ?? 0);
  const weekly = real ? ins.week : SAMPLE_STUDENT.weeklyXp;
  const mastery = real ? ins.areas.map((a) => [a.name, a.pct]) : Object.entries(SAMPLE_STUDENT.mastery);
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [assigned, classes]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => (assigned ? studentEvents({ subjects, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [subjects, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = subjects.reduce((n, s) => n + s.pending, 0);
  const next = subjects.map((s) => s.next && { ...s.next, subject: s }).filter(Boolean).sort((a, b) => new Date(a.due_at ?? 8.64e15) - new Date(b.due_at ?? 8.64e15))[0];
  const misses = slug ? pendingMisses(history, slug) : [];

  // Weekly XP as a line in accent, with the daily goal as a dashed line.
  const w = 300, h = 110, max = Math.max(200, ...weekly);
  const pt = (v, i) => `${(i * (w / 6)).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`;
  const goalY = h - (SAMPLE_STUDENT.dailyGoal / max) * h;

  const hero = resumable
    ? { kicker: "Sigue donde quedaste", title: resumable.scope === "all" ? "Examen completo" : resumable.scope, text: `${resumable.answered} de ${resumable.total} respondidas${resumable.mode === "timed" ? ` · ${formatClock(resumable.left)} restantes` : ""}`, cta: "Continuar", go: onContinue, progress: resumable.answered / resumable.total }
    : next
      ? { kicker: `${pending} ${pending === 1 ? "tarea pendiente" : "tareas pendientes"}`, title: next.title, text: `${next.subject.name}${next.subject.teacher ? ` · ${next.subject.teacher}` : ""}${next.due_at ? ` · ${dueText(next.due_at, now)}` : ""}`, cta: "Empezar", go: () => onStartAssigned(next) }
      : { kicker: ins.practicedToday ? "Ya practicaste hoy" : "Hoy", title: ins.weakest ? `Repasa ${areaShort(ins.weakest.name)}` : "Empieza un simulacro", text: ins.weakest ? `Tu área con menos aciertos: ${ins.weakest.pct} %` : exam ? `${exam.title} · ${exam.questions.length} preguntas` : "Cargando cuadernillo…", cta: "Practicar", go: ins.weakest && exam?.sections.some((s) => s.name === ins.weakest.name) ? () => onSetup({ scope: ins.weakest.name, mode: "practice" }) : onPractice };

  return (
    <section className="home sh">
      <header className="home-head">
        <div className="avatar" aria-hidden="true">{(realName ?? SAMPLE_STUDENT.name)[0]}</div>
        <div className="greet">
          <span className="caption">{realName ? "Tu colegio" : SAMPLE_STUDENT.course}</span>
          <strong>Hola, {realName ?? SAMPLE_STUDENT.name}</strong>
        </div>
        {onLive && (
          <button type="button" className="tl-live sh-live" onClick={onLive} aria-label="Juego en vivo">
            <Icon name="bolt" size={15} /><span>Juego en vivo</span>
          </button>
        )}
        {signedOut && onGo && <button type="button" className="primary login-btn" onClick={() => onGo("login")}>Iniciar sesión</button>}
        <div className="pills">
          <span className="pill" title="Racha"><Icon name="flame" size={16} className="flame-ico" /><b className="flame-text">{streak}</b></span>
          <span className="pill" title="XP"><Icon name="bolt" size={16} className="accent-ico" /><b className="accent-text">{fmtInt(xp)}</b></span>
        </div>
      </header>

      <div className="sh-hero card">
        <Mascot size={84} pose={ins.practicedToday ? "happy" : "normal"} idle />
        <div className="sh-hero-text">
          <span className="label">{hero.kicker}</span>
          <strong>{hero.title}</strong>
          <span className="caption">{hero.text}</span>
          {hero.progress != null && <div className="progress thin"><span style={{ width: `${hero.progress * 100}%` }} /></div>}
          <div className="week-row" aria-label={`Racha de ${streak} días`}>
            {DAYS.map((d, i) => {
              const state = real ? (i < todayIndex ? (weekly[i] > 0 ? "done" : "empty") : i === todayIndex ? "today" : "empty") : i < todayIndex ? "done" : i === todayIndex ? "today" : "empty";
              return <span key={d + i} className={`day ${state}`}>{d}</span>;
            })}
          </div>
        </div>
        <button type="button" className="primary" onClick={hero.go} disabled={!resumable && !next && !exam}>{hero.cta}</button>
      </div>

      <div className="sh-grid">
        <div className="sh-col">
          {assigned && <AssignedList assignments={assigned.assignments} attempts={assigned.attempts} onStart={onStartAssigned} />}

          {subjects.length > 0 && (
            <div className="card sh-card">
              <div className="section-head"><span className="label">Mis materias</span><span className="caption">{subjects.length} {subjects.length === 1 ? "clase" : "clases"}</span></div>
              <div className="sh-subjects">
                {subjects.map((s) => (
                  <button key={s.id} type="button" className="sh-subject" style={{ "--c": s.color }} onClick={() => (s.next ? onStartAssigned(s.next) : onGo?.("profile"))} title={s.full}>
                    <span className="sh-subject-top"><strong>{s.name}</strong><b>{s.avg == null ? "—" : `${s.avg} %`}</b></span>
                    <span className="caption">{s.teacher || "Docente de la clase"} · {s.group}</span>
                    <span className="td-spark" aria-hidden="true">{(s.series.length ? s.series : [0]).map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: s.color, opacity: i === s.series.length - 1 ? 1 : 0.45 }} />)}</span>
                    <span className="sh-subject-foot caption">
                      {s.next ? <><span className="sh-due">{s.pending} pendiente{s.pending === 1 ? "" : "s"}</span> {s.next.due_at ? dueText(s.next.due_at, now) : ""}</> : <span>{s.done} de {s.total} entregadas</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="quick-grid sh-quick">
            <button type="button" className="card quick" onClick={() => onSetup({ scope: "Matemáticas", mode: "practice" })} disabled={!exam}>
              <Icon name="bolt" />
              <strong>Reto del día</strong>
              <span className="caption">{exam ? `${questionsFor(exam, "Matemáticas").length} preguntas de Matemáticas` : "Matemáticas"}</span>
            </button>
            <button type="button" className="card quick" onClick={() => onSetup({ scope: "area", mode: "practice" })} disabled={!exam}>
              <Icon name="book" />
              <strong>Practicar por área</strong>
              <span className="caption">Escoge un área y empieza</span>
            </button>
            <button type="button" className="card quick" onClick={() => onSetup({ scope: "all", mode: "timed" })} disabled={!exam}>
              <Icon name="clock" />
              <strong>Simulacro completo</strong>
              <span className="caption">{exam ? `Las ${fmtInt(exam.questions.length)} preguntas, con tiempo` : "Con tiempo, como el día del examen"}</span>
            </button>
            <button type="button" className="card quick" onClick={() => onGo?.(misses.length ? "setup" : "history")}>
              <Icon name={misses.length ? "flag" : "map"} />
              <strong>{misses.length ? "Repechaje" : "Mis simulacros"}</strong>
              <span className="caption">{misses.length ? `${misses.length} ${misses.length === 1 ? "pregunta" : "preguntas"} para una segunda oportunidad` : `${ins.sessions} ${ins.sessions === 1 ? "intento guardado" : "intentos guardados"}`}</span>
            </button>
          </div>

          <div className="card sh-card">
            <div className="section-head">
              <span className="label">Dominio por área</span>
              {real ? <button type="button" className="link" onClick={() => onGo?.("profile")}>Ver análisis</button> : <span className="caption">Muestra</span>}
            </div>
            {mastery.map(([name, value]) => (
              <div key={name} className="area-row">
                <div className="area-row-head">
                  <span><span className="dot" style={{ background: areaColor(name) }} /> {name}</span>
                  <span className="muted">{fmtPct(value)}</span>
                </div>
                <div className="progress thin"><span style={{ width: `${value}%`, background: areaColor(name) }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="sh-col">
          <div className="card sh-card">
            <MonthCalendar events={events.map((e) => ({ ...e, onClick: () => { const a = assigned?.assignments.find((x) => x.id === e.id); if (a) onStartAssigned(a); } }))}
              emptyText={assigned ? "No tienes entregas este mes." : "Inicia sesión para ver las tareas de tu curso."} />
          </div>

          <div className="card sh-card">
            <div className="section-head">
              <span className="label">Esta semana</span>
              <span className="caption">XP por día · <span className="muted">meta {SAMPLE_STUDENT.dailyGoal}</span></span>
            </div>
            <svg className="week-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="XP de la semana frente a tu meta diaria">
              {[h / 4, h / 2, (3 * h) / 4].map((y) => <line key={y} x1="0" x2={w} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />)}
              <line x1="0" x2={w} y1={goalY} y2={goalY} stroke="var(--text-2)" strokeWidth="2" strokeDasharray="4 4" />
              <polyline className="mine" points={(real ? weekly.slice(0, todayIndex + 1) : weekly).map(pt).join(" ")} fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" />
            </svg>
            <div className="week-axis">{DAYS.map((d, i) => <span key={d + i}>{d}</span>)}</div>
          </div>

          {real && (
            <div className="card sh-card sh-stats">
              <div><span className="label">Preguntas</span><strong>{fmtInt(ins.answered)}</strong></div>
              <div><span className="label">Aciertos</span><strong>{ins.pct == null ? "—" : `${ins.pct} %`}</strong></div>
              <div><span className="label">Por pregunta</span><strong>{ins.secPerQuestion ? `${ins.secPerQuestion} s` : "—"}</strong></div>
            </div>
          )}
        </div>
      </div>

      {!real && <span className="caption sample-note">Racha, XP y dominio son datos de muestra hasta tu primer simulacro.</span>}
    </section>
  );
}
