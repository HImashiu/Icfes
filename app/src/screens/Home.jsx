import { useMemo } from "react";
import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import TaskRow, { dueText } from "../components/TaskRow.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { areaColor, fmtInt } from "../lib/brand.js";
import { formatClock, questionsFor } from "../lib/exam.js";
import { loadHistory } from "../lib/local.js";
import { pendingMisses } from "../lib/repechaje.js";
import { achievements } from "../lib/achievements.js";
import { scoreSummary } from "../lib/simulacro.js";
import ScoreCard from "../components/ScoreCard.jsx";
import { daysUntil, loadGoal, xpToday } from "../lib/goal.js";
import { practiceInsights, studentEvents, studentSubjects, studentTasks, teacherLabel } from "../lib/student.js";
import { areaShort } from "../lib/teaching.js";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

// Inicio: the next thing to do, today's goal, this week's tasks, each subject with its teacher, the countdown to the
// exam, the month and the student's own progress. Progress is measured against the student's goal and past self,
// never against classmates. Before the first practice the streak, XP and mastery are SAMPLE data (data/mock.js).
export default function Home({ exam, slug, resumable, onContinue, onPractice, onSetup, xpSession, assigned, classes, course, onStartAssigned, onLive, realName, signedOut, onGo, onOpenSubject, exams = [], onStartSession }) {
  const now = Date.now();
  const todayIndex = (new Date().getDay() + 6) % 7;
  const history = useMemo(() => loadHistory(), []);
  const ins = useMemo(() => practiceInsights(history, now), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  const goal = useMemo(() => loadGoal(), []);
  const score = useMemo(() => scoreSummary(history), [history]);
  const real = ins.sessions > 0;
  const streak = real ? ins.streak : SAMPLE_STUDENT.streak;
  const xp = (real ? ins.xp : SAMPLE_STUDENT.xp) + (xpSession ?? 0);
  const weekly = real ? ins.week : SAMPLE_STUDENT.weeklyXp;
  const mastery = real ? ins.areas.map((a) => [a.name, a.pct]).reverse() : Object.entries(SAMPLE_STUDENT.mastery);
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [assigned, classes]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => (assigned ? studentTasks({ subjects, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [subjects, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => (assigned ? studentEvents({ subjects, assignments: assigned.assignments, attempts: assigned.attempts, now }) : []), [subjects, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = tasks.filter((t) => t.status === "pending");
  const next = pending[0];
  const misses = slug ? pendingMisses(history, slug) : [];
  const today = xpToday(history, now) + (xpSession ?? 0);
  const goalPct = Math.min(1, today / goal.dailyXp);
  const left = daysUntil(goal.examDate, now);
  const badges = useMemo(() => achievements({ history, tasks }), [history, tasks]);
  const got = badges.filter((b) => b.got);
  const nextBadge = badges.filter((b) => !b.got).sort((a, b) => b.have / b.need - a.have / a.need)[0];

  // Weekly XP as a line in accent, with the daily goal as a dashed line.
  const w = 300, h = 96, max = Math.max(goal.dailyXp * 1.6, ...weekly);
  const pt = (v, i) => `${(i * (w / 6)).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`;
  const goalY = h - (goal.dailyXp / max) * h;

  const hero = resumable
    ? { kicker: "Sigue donde quedaste", title: resumable.scope === "all" ? "Examen completo" : resumable.scope, text: `${resumable.answered} de ${resumable.total} respondidas${resumable.mode === "timed" ? ` · ${formatClock(resumable.left)} restantes` : ""}`, cta: "Continuar", go: onContinue, progress: resumable.answered / resumable.total }
    : next
      ? { kicker: `${pending.length} ${pending.length === 1 ? "tarea pendiente" : "tareas pendientes"}`, title: next.a.title, text: `${next.subject?.name ?? ""}${next.subject?.teacher ? ` · ${next.subject.teacher}` : ""} · ${dueText(next.a.due_at, now)}`, cta: "Empezar", go: () => onStartAssigned(next.a) }
      : { kicker: ins.practicedToday ? "Ya practicaste hoy" : "Para hoy", title: ins.weakest ? `Repasa ${areaShort(ins.weakest.name)}` : "Empieza un simulacro", text: ins.weakest ? `Tu área con menos aciertos: ${ins.weakest.pct} %. Diez preguntas bastan.` : exam ? `${exam.title} · ${exam.questions.length} preguntas` : "Cargando cuadernillo…", cta: "Practicar", go: ins.weakest && exam?.sections.some((s) => s.name === ins.weakest.name) ? () => onSetup({ scope: ins.weakest.name, mode: "practice" }) : onPractice };

  return (
    <section className="home sh">
      <header className="home-head">
        <div className="avatar" aria-hidden="true">{(realName ?? SAMPLE_STUDENT.name)[0]}</div>
        <div className="greet">
          <span className="caption">{course ? `Curso ${course}` : realName ? "Tu colegio" : `${SAMPLE_STUDENT.course} · muestra`}</span>
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

      <div className="sh-top">
        <div className="sh-hero card">
          <Mascot size={84} pose={ins.practicedToday ? "happy" : "normal"} idle />
          <div className="sh-hero-text">
            <span className="label">{hero.kicker}</span>
            <strong>{hero.title}</strong>
            <span className="caption">{hero.text}</span>
            {hero.progress != null && <div className="progress thin"><span style={{ width: `${hero.progress * 100}%` }} /></div>}
          </div>
          <button type="button" className="primary" onClick={hero.go} disabled={!resumable && !next && !exam}>{hero.cta}</button>
        </div>

        <div className="sh-goal card">
          <svg className="sh-ring" viewBox="0 0 64 64" role="img" aria-label={`Meta de hoy: ${today} de ${goal.dailyXp} XP`}>
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--line)" strokeWidth="7" />
            <circle cx="32" cy="32" r="27" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${goalPct * 169.6} 169.6`} transform="rotate(-90 32 32)" />
            <text x="32" y="37" textAnchor="middle" className="sh-ring-text">{Math.round(goalPct * 100)}%</text>
          </svg>
          <div className="sh-goal-text">
            <span className="label">Meta de hoy</span>
            <strong>{fmtInt(today)} / {goal.dailyXp} XP</strong>
            <div className="week-row mini" aria-label={`Racha de ${streak} días`}>
              {DAYS.map((d, i) => {
                const state = real ? (i < todayIndex ? (weekly[i] > 0 ? "done" : "empty") : i === todayIndex ? (weekly[i] > 0 ? "done today" : "today") : "empty") : i < todayIndex ? "done" : i === todayIndex ? "today" : "empty";
                return <span key={d + i} className={`day ${state}`}>{d}</span>;
              })}
            </div>
          </div>
        </div>
      </div>

      <ScoreCard summary={score} target={goal.target} exams={exams} onStartSession={onStartSession} />

      <div className="sh-grid">
        <div className="sh-col">
          {assigned ? (
            <div className="card sh-card">
              <div className="section-head">
                <span className="label">Tus tareas</span>
                <button type="button" className="link" onClick={() => onGo?.("tasks")}>Ver todas ({tasks.length})</button>
              </div>
              {pending.length ? pending.slice(0, 4).map((t) => <TaskRow key={t.a.id} t={t} onStart={onStartAssigned} now={now} />) : (
                <div className="sh-allclear">
                  <Mascot size={52} pose="happy" />
                  <div><strong>Estás al día</strong><span className="caption">{tasks.length ? "No tienes tareas pendientes. Buen momento para practicar tu área más floja." : "Cuando tus docentes asignen tareas, aparecen aquí con su fecha de cierre."}</span></div>
                </div>
              )}
            </div>
          ) : (
            <div className="card sh-card sh-allclear">
              <Mascot size={52} />
              <div><strong>Tus materias y tareas</strong><span className="caption">Inicia sesión con la cuenta del colegio para ver cada materia con su docente, tus tareas y tus notas.</span></div>
              {onGo && <button type="button" className="secondary" onClick={() => onGo("login")}>Iniciar sesión</button>}
            </div>
          )}

          {subjects.length > 0 && (
            <div className="card sh-card">
              <div className="section-head"><span className="label">Mis materias</span><button type="button" className="link" onClick={() => onGo?.("subjects")}>Ver materias</button></div>
              <div className="sh-subjects">
                {subjects.map((s) => (
                  <button key={s.id} type="button" className="sh-subject" style={{ "--c": s.color }} onClick={() => onOpenSubject?.(s.id)}>
                    <span className="sh-subject-top"><strong>{s.name}</strong><b>{s.avg == null ? "—" : `${s.avg} %`}</b></span>
                    <span className="caption sh-teacher">{teacherLabel(s)}</span>
                    <span className="sh-subject-foot caption">
                      {s.pending ? <span className="sh-due">{s.pending} pendiente{s.pending === 1 ? "" : "s"}</span> : <span>{s.total ? "Al día" : "Sin tareas aún"}</span>}
                      {s.total > 0 && <span>{s.done}/{s.total} entregadas</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sh-quick">
            <button type="button" className="card sh-q" onClick={() => onSetup({ scope: "Matemáticas", mode: "practice" })} disabled={!exam}>
              <Icon name="bolt" /><span><strong>Reto del día</strong><span className="caption">{exam ? `${questionsFor(exam, "Matemáticas").length} de Matemáticas` : "Matemáticas"}</span></span>
            </button>
            <button type="button" className="card sh-q" onClick={() => onSetup({ scope: "all", mode: "timed" })} disabled={!exam}>
              <Icon name="clock" /><span><strong>Simulacro</strong><span className="caption">Con tiempo, como el examen</span></span>
            </button>
            <button type="button" className="card sh-q" onClick={() => onGo?.(misses.length ? "setup" : "progress")}>
              <Icon name={misses.length ? "flag" : "chart"} /><span><strong>{misses.length ? "Repechaje" : "Mi progreso"}</strong><span className="caption">{misses.length ? `${misses.length} por recuperar` : `${ins.sessions} intentos`}</span></span>
            </button>
          </div>

          <div className="card sh-card">
            <div className="section-head">
              <span className="label">Dominio por área</span>
              {real ? <button type="button" className="link" onClick={() => onGo?.("progress")}>Ver análisis</button> : <span className="caption">Muestra</span>}
            </div>
            <div className="sh-mastery">
              {mastery.map(([name, value]) => (
                <div key={name} className="sh-m">
                  <span className="sh-m-head"><span><span className="dot" style={{ background: areaColor(name) }} /> {areaShort(name)}</span><b>{value} %</b></span>
                  <div className="progress thin"><span style={{ width: `${value}%`, background: areaColor(name) }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sh-col">
          <button type="button" className="card sh-count" onClick={() => onGo?.("profile")}>
            <span className="sh-count-n">{left == null ? "?" : left < 0 ? "✓" : fmtInt(left)}</span>
            <span>
              <strong>{left == null ? "¿Cuándo es tu Saber 11?" : left < 0 ? "Ya presentaste el examen" : left === 0 ? "Hoy es tu Saber 11" : `${left === 1 ? "día" : "días"} para tu Saber 11`}</strong>
              <span className="caption">{left == null ? "Pon la fecha en tu perfil y ve la cuenta regresiva." : `Meta: ${goal.target} puntos · cambiar en Perfil`}</span>
            </span>
          </button>

          <div className="card sh-card">
            <MonthCalendar events={events.map((e) => ({ ...e, onClick: () => { const a = assigned?.assignments.find((x) => x.id === e.id); if (a) onStartAssigned(a); } }))}
              emptyText={assigned ? "No tienes entregas este mes." : "Inicia sesión para ver las tareas de tu curso."} />
          </div>

          <div className="card sh-card">
            <div className="section-head"><span className="label">Logros</span><button type="button" className="link" onClick={() => onGo?.("achievements")}>{got.length} de {badges.length}</button></div>
            <div className="sh-badges">
              {got.slice(-4).map((b) => <span key={b.id} className="badge got" title={b.desc}><Icon name={b.icon} size={20} /><span>{b.title}</span></span>)}
              {got.length === 0 && <span className="caption">Tu primer logro llega con tu primera práctica.</span>}
            </div>
            {nextBadge && (
              <div className="sh-next-badge">
                <span className="caption">Siguiente: <b>{nextBadge.title}</b> · {nextBadge.desc}</span>
                <div className="progress thin"><span style={{ width: `${(nextBadge.have / nextBadge.need) * 100}%` }} /></div>
              </div>
            )}
          </div>

          <div className="card sh-card">
            <div className="section-head">
              <span className="label">Esta semana</span>
              <span className="caption">XP por día · <span className="muted">meta {goal.dailyXp}</span></span>
            </div>
            <svg className="week-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="XP de la semana frente a tu meta diaria">
              {[h / 4, h / 2, (3 * h) / 4].map((y) => <line key={y} x1="0" x2={w} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />)}
              <line x1="0" x2={w} y1={goalY} y2={goalY} stroke="var(--text-2)" strokeWidth="2" strokeDasharray="4 4" />
              <polyline className="mine" points={(real ? weekly.slice(0, todayIndex + 1) : weekly).map(pt).join(" ")} fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" />
            </svg>
            <div className="week-axis">{DAYS.map((d, i) => <span key={d + i}>{d}</span>)}</div>
          </div>
        </div>
      </div>

      {!real && <span className="caption sample-note">Racha, XP y dominio son datos de muestra hasta tu primer simulacro.</span>}
    </section>
  );
}
