import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import AssignedList from "./AssignedList.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { areaColor, fmtDec, fmtInt, fmtPct } from "../lib/brand.js";
import { formatClock, questionsFor } from "../lib/exam.js";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

// Inicio: streak, continue, quick cards, weekly XP, mastery by area. No class ranking: progress is measured
// against the student's own goal, never against classmates.
// Streak, XP, weekly and mastery values are SAMPLE data (see data/mock.js).
export default function Home({ exam, resumable, onContinue, onPractice, onSetup, xpSession, assigned, onStartAssigned, onLive, realName, signedOut, onGo }) {
  const todayIndex = (new Date().getDay() + 6) % 7;
  const xp = SAMPLE_STUDENT.xp + (xpSession ?? 0);

  // Weekly XP as a line in accent, with the daily goal as a dashed line.
  const w = 300, h = 120, max = 200;
  const pt = (v, i) => `${(i * (w / 6)).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`;
  const mine = SAMPLE_STUDENT.weeklyXp.map(pt).join(" ");
  const goalY = h - (SAMPLE_STUDENT.dailyGoal / max) * h;

  return (
    <section className="home">
      <header className="home-head">
        <div className="avatar" aria-hidden="true">E</div>
        <div className="greet">
          <span className="caption">{realName ? "Tu colegio" : SAMPLE_STUDENT.course}</span>
          <strong>Hola, {realName ?? SAMPLE_STUDENT.name}</strong>
        </div>
        {signedOut && onGo && <button type="button" className="primary login-btn" onClick={() => onGo("login")}>Iniciar sesión</button>}
        <div className="pills">
          <span className="pill"><Icon name="flame" size={16} className="flame-ico" /><b className="flame-text">{SAMPLE_STUDENT.streak}</b></span>
          <span className="pill"><Icon name="bolt" size={16} className="accent-ico" /><b className="accent-text">{fmtInt(xp)}</b></span>
        </div>
      </header>

      {onLive && (
        <button type="button" className="card quick-row" onClick={onLive}>
          <Icon name="bolt" size={20} className="accent-ico" />
          <span><strong>Juego en vivo</strong><br /><span className="caption">Entra con el código que proyecta tu docente</span></span>
        </button>
      )}

      {assigned && <AssignedList assignments={assigned.assignments} attempts={assigned.attempts} onStart={onStartAssigned} />}

      <div className="card streak-card">
        <Mascot size={72} idle />
        <div>
          <span className="label">Racha</span>
          <strong className="display">{SAMPLE_STUDENT.streak} días</strong>
          <div className="week-row" aria-label="Esta semana">
            {DAYS.map((d, i) => {
              const state = i < todayIndex ? "done" : i === todayIndex ? "today" : "empty";
              return <span key={d} className={`day ${state}`}>{d}</span>;
            })}
          </div>
        </div>
      </div>

      {resumable ? (
        <div className="card continue-card">
          <div>
            <span className="label">Sigue donde quedaste</span>
            <strong>{resumable.scope === "all" ? "Examen completo" : resumable.scope}</strong>
            <span className="caption">{resumable.answered} de {resumable.total} respondidas{resumable.mode === "timed" ? ` · ${formatClock(resumable.left)} restantes` : ""}</span>
            <div className="progress thin"><span style={{ width: `${(resumable.answered / resumable.total) * 100}%` }} /></div>
          </div>
          <button type="button" className="primary" onClick={onContinue}>Continuar</button>
        </div>
      ) : (
        <div className="card continue-card">
          <div>
            <span className="label">Hoy</span>
            <strong>Empieza un simulacro</strong>
            <span className="caption">{exam ? `${exam.title} · ${exam.questions.length} preguntas` : "Cargando cuadernillo…"}</span>
          </div>
          <button type="button" className="primary" onClick={onPractice} disabled={!exam}>Practicar</button>
        </div>
      )}

      <div className="quick-grid">
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
        <button type="button" className="card quick quick-wide" onClick={() => onSetup({ scope: "all", mode: "timed" })} disabled={!exam}>
          <Icon name="clock" />
          <strong>Simulacro completo</strong>
          <span className="caption">{exam ? `Las ${fmtInt(exam.questions.length)} preguntas, con tiempo` : "Con tiempo, como el día del examen"}</span>
        </button>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="label">Progreso semanal</span>
          <span className="caption">XP por día · <span className="accent-text">tú</span> · <span className="muted">meta diaria ({SAMPLE_STUDENT.dailyGoal})</span></span>
        </div>
        <svg className="week-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="XP de la semana frente a tu meta diaria">
          {[30, 60, 90].map((y) => <line key={y} x1="0" x2={w} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />)}
          <line x1="0" x2={w} y1={goalY} y2={goalY} stroke="var(--text-2)" strokeWidth="2" strokeDasharray="4 4" />
          <polyline className="mine" points={mine} fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        <div className="week-axis">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="label">Dominio por área</span>
          <span className="caption">Muestra</span>
        </div>
        {Object.entries(SAMPLE_STUDENT.mastery).map(([name, value]) => (
          <div key={name} className="area-row">
            <div className="area-row-head">
              <span><span className="dot" style={{ background: areaColor(name) }} /> {name}</span>
              <span className="muted">{fmtPct(value)}</span>
            </div>
            <div className="progress thin"><span style={{ width: `${value}%`, background: areaColor(name) }} /></div>
          </div>
        ))}
      </div>

      <span className="caption sample-note">Racha, XP y dominio son datos de muestra.</span>
    </section>
  );
}
