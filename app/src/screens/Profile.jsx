import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { play, setSoundOn, soundOn } from "../lib/motion.js";
import { fmtInt } from "../lib/brand.js";
import { loadHistory } from "../lib/local.js";
import { practiceInsights, studentSubjects } from "../lib/student.js";
import { areaShort } from "../lib/teaching.js";

const MODE = { practice: "Práctica", timed: "Cronometrado" };
const ago = (t) => {
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

// Perfil: who you are, an analysis of your own practice by area and by subject (against your own past, never
// against classmates), then settings: theme, sounds, account, error reports and the teacher view.
export default function Profile({ theme, onTheme, onTeacher, onReports, onLogin, assigned, classes, onPracticeArea, onHistory }) {
  const auth = useAuth();
  const staff = auth.status === "ready" && auth.profile.role !== "student";
  const [sound, setSound] = useState(soundOn);
  const pickSound = (on) => { setSoundOn(on); setSound(on); if (on) play("correct"); };
  const ins = useMemo(() => practiceInsights(loadHistory()), []);
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts }) : []), [assigned, classes]);
  const name = auth.status === "ready" ? auth.profile.full_name || auth.profile.email : SAMPLE_STUDENT.name;

  return (
    <section className="profile sp">
      <header className="screen-head"><h1>Perfil</h1></header>

      <div className="sp-grid">
        <div className="sp-col">
          <div className="card profile-card sp-me">
            <div className="avatar big" aria-hidden="true">{name[0]}</div>
            <div className="profile-name">
              <strong>{name}</strong>
              <span className="caption">{auth.status === "ready" ? auth.profile.email : `${SAMPLE_STUDENT.course} · datos de muestra`}</span>
            </div>
            <div className="sp-kpis">
              <span><b className="flame-text">{ins.streak}</b><span className="caption">días de racha</span></span>
              <span><b className="accent-text">{fmtInt(ins.xp)}</b><span className="caption">XP</span></span>
              <span><b>{ins.sessions}</b><span className="caption">intentos</span></span>
              <span><b>{ins.pct == null ? "—" : `${ins.pct} %`}</b><span className="caption">aciertos</span></span>
            </div>
          </div>

          {ins.sessions === 0 ? (
            <div className="card sp-empty">
              <Mascot size={72} pose="thinking" />
              <div><strong>Tu análisis aparece con tu primer simulacro</strong><span className="caption">Verás tus aciertos por área, cómo vas cambiando y en qué te demoras más.</span></div>
            </div>
          ) : (
            <>
              <div className="sp-insights">
                {ins.weakest && (
                  <button type="button" className="card sp-insight" style={{ "--c": ins.weakest.color }} onClick={() => onPracticeArea?.(ins.weakest.name)}>
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
              </div>

              <div className="card sp-card">
                <div className="section-head"><span className="label">Análisis por área</span><span className="caption">Frente a ti mismo</span></div>
                <div className="sp-table" role="table" aria-label="Análisis por área">
                  <div className="sp-row head" role="row"><span role="columnheader">Área</span><span role="columnheader">Aciertos</span><span role="columnheader">Cambio</span><span role="columnheader">Últimos</span><span role="columnheader">Practicaste</span></div>
                  {[...ins.areas].reverse().map((a) => (
                    <button key={a.name} type="button" className="sp-row" role="row" onClick={() => onPracticeArea?.(a.name)}>
                      <span role="cell"><span className="dot" style={{ background: a.color }} /> {areaShort(a.name)}</span>
                      <span role="cell" className="sp-pct"><span className="td-track"><span style={{ width: `${a.pct}%`, background: a.color }} /></span><b>{a.pct} %</b></span>
                      <span role="cell" className={a.trend > 0 ? "sp-up" : a.trend < 0 ? "sp-down" : "caption"}>{a.trend == null ? "—" : `${a.trend > 0 ? "▲ +" : a.trend < 0 ? "▼ " : ""}${a.trend}`}</span>
                      <span role="cell" className="td-spark sp-spark" aria-hidden="true">{a.series.map((v, i) => <span key={i} style={{ height: `${Math.max(8, v)}%`, background: a.color, opacity: i === a.series.length - 1 ? 1 : 0.45 }} />)}</span>
                      <span role="cell" className="caption">{a.sessions} {a.sessions === 1 ? "vez" : "veces"} · {ago(a.last)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {subjects.length > 0 && (
            <div className="card sp-card">
              <div className="section-head"><span className="label">Por materia</span><span className="caption">Tareas de cada docente</span></div>
              {subjects.map((s) => (
                <div key={s.id} className="sp-subject" style={{ "--c": s.color }}>
                  <span className="sp-bar" aria-hidden="true" />
                  <span className="sp-subject-main"><strong>{s.name}</strong><span className="caption">{s.teacher || "Docente de la clase"} · {s.group}</span></span>
                  <span className="caption">{s.done}/{s.total} entregadas</span>
                  <b>{s.avg == null ? "—" : `${s.avg} %`}</b>
                </div>
              ))}
            </div>
          )}

          {ins.recent.length > 0 && (
            <div className="card sp-card">
              <div className="section-head"><span className="label">Últimos intentos</span><button type="button" className="link" onClick={onHistory}>Ver todos</button></div>
              {ins.recent.map((r) => (
                <div key={r.id} className="sp-recent">
                  <span><strong>{r.title}</strong><span className="caption"> · {MODE[r.mode] ?? r.mode} · {ago(r.at)}</span></span>
                  <b>{Math.round(r.percent)} %</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sp-col">
          <div className="card">
            <span className="label">Tema</span>
            <div className="segmented" role="radiogroup" aria-label="Tema">
              <button type="button" role="radio" aria-checked={theme === "dark"} className={theme === "dark" ? "seg active" : "seg"} onClick={() => onTheme("dark")}>Oscuro</button>
              <button type="button" role="radio" aria-checked={theme === "light"} className={theme === "light" ? "seg active" : "seg"} onClick={() => onTheme("light")}>Claro</button>
            </div>
          </div>

          <div className="card">
            <span className="label">Sonidos al responder</span>
            <div className="segmented" role="radiogroup" aria-label="Sonidos al responder">
              <button type="button" role="radio" aria-checked={sound} className={sound ? "seg active" : "seg"} onClick={() => pickSound(true)}>Activados</button>
              <button type="button" role="radio" aria-checked={!sound} className={!sound ? "seg active" : "seg"} onClick={() => pickSound(false)}>Silencio</button>
            </div>
          </div>

          {auth.status !== "demo" && (
            auth.status === "ready" ? (
              <button type="button" className="card quick-row" onClick={auth.signOut}>
                <Icon name="user" />
                <span>Cerrar sesión</span>
                <Icon name="right" />
              </button>
            ) : (
              <button type="button" className="card quick-row" onClick={onLogin} disabled={auth.status === "loading"}>
                <Icon name="user" />
                <span>Ingresar con la cuenta del colegio</span>
                <Icon name="right" />
              </button>
            )
          )}

          <button type="button" className="card quick-row" onClick={onReports}>
            <Icon name="flag" />
            <span>Mis reportes de errores</span>
            <Icon name="right" />
          </button>

          <button type="button" className="card quick-row" onClick={onTeacher}>
            <Icon name="user" />
            <span>{staff ? "Panel docente" : "Vista de docente (datos de muestra)"}</span>
            <Icon name="right" />
          </button>
        </div>
      </div>
    </section>
  );
}
