import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { SAMPLE_LEAGUE, SAMPLE_STUDENT } from "../data/mock.js";
import { areaColor, fmtDec, fmtInt, fmtPct } from "../lib/brand.js";
import { formatClock, questionsFor } from "../lib/exam.js";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

// Inicio: streak, continue, quick cards, weekly XP, mastery by area, league teaser.
// Streak, XP, weekly, mastery and league values are SAMPLE data (see data/mock.js).
export default function Home({ exam, resumable, onContinue, onPractice, onLeague, onGo, xpSession }) {
  const todayIndex = (new Date().getDay() + 6) % 7;
  const xp = SAMPLE_STUDENT.xp + (xpSession ?? 0);
  const me = SAMPLE_LEAGUE.find((r) => r.me);
  const pos = [...SAMPLE_LEAGUE].sort((a, b) => b.xp - a.xp).findIndex((r) => r.me) + 1;

  // Weekly XP as a line: you in accent, class average in text-2.
  const w = 300, h = 120, max = 200;
  const pt = (v, i) => `${(i * (w / 6)).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`;
  const mine = SAMPLE_STUDENT.weeklyXp.map(pt).join(" ");
  const avg = SAMPLE_STUDENT.classXp.map(pt).join(" ");

  return (
    <section className="home">
      <header className="home-head">
        <div className="avatar" aria-hidden="true">E</div>
        <div className="greet">
          <span className="caption">{SAMPLE_STUDENT.course}</span>
          <strong>Hola, {SAMPLE_STUDENT.name}</strong>
        </div>
        <div className="pills">
          <span className="pill"><Icon name="flame" size={16} className="flame-ico" /><b className="flame-text">{SAMPLE_STUDENT.streak}</b></span>
          <span className="pill"><Icon name="bolt" size={16} className="accent-ico" /><b className="accent-text">{fmtInt(xp)}</b></span>
        </div>
      </header>

      <div className="card streak-card">
        <Mascot size={72} />
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
        <button type="button" className="card quick" onClick={() => onGo("setup")}>
          <Icon name="bolt" />
          <strong>Reto del día</strong>
          <span className="caption">{exam ? `${questionsFor(exam, "Matemáticas").length} preguntas de Matemáticas` : "Matemáticas"}</span>
        </button>
        <button type="button" className="card quick" onClick={() => onGo("setup")}>
          <Icon name="book" />
          <strong>Practicar por área</strong>
          <span className="caption">Escoge un área y empieza</span>
        </button>
      </div>

      <div className="card">
        <div className="section-head">
          <span className="label">Progreso semanal</span>
          <span className="caption">XP por día · <span className="accent-text">tú</span> · <span className="muted">promedio</span></span>
        </div>
        <svg className="week-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="XP de la semana frente al promedio del curso">
          <polyline points={avg} fill="none" stroke="var(--text-2)" strokeWidth="2" strokeDasharray="4 4" />
          <polyline points={mine} fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" />
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

      <button type="button" className="card league-teaser" onClick={onLeague}>
        <Icon name="trophy" />
        <div>
          <strong>Liga de la semana</strong>
          <span className="caption">Vas {pos}.º con {fmtInt(me.xp)} XP</span>
        </div>
        <Icon name="right" />
      </button>
      <span className="caption sample-note">Racha, XP, liga y dominio son datos de muestra.</span>
    </section>
  );
}
