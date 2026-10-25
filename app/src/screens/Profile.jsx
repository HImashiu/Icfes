import Icon from "../components/Icon.jsx";
import Mascot from "../components/Mascot.jsx";
import { SAMPLE_STUDENT } from "../data/mock.js";
import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { play, setSoundOn, soundOn } from "../lib/motion.js";
import { fmtInt } from "../lib/brand.js";
import { loadHistory } from "../lib/local.js";
import { practiceInsights, studentSubjects } from "../lib/student.js";
import { DateField, Select } from "../components/Controls.jsx";
import { DAILY_GOALS, TARGETS, daysUntil, loadGoal, saveGoal } from "../lib/goal.js";


// Perfil: who you are, your goal (exam date, daily XP, target score), your subjects with their teachers, then
// settings: theme, sounds, account, error reports and the teacher view. The analysis lives in Progreso.
export default function Profile({ theme, onTheme, onTeacher, onReports, onLogin, assigned, classes, course, onGo }) {
  const auth = useAuth();
  const staff = auth.status === "ready" && auth.profile.role !== "student";
  const [sound, setSound] = useState(soundOn);
  const pickSound = (on) => { setSoundOn(on); setSound(on); if (on) play("correct"); };
  const ins = useMemo(() => practiceInsights(loadHistory()), []);
  const subjects = useMemo(() => (assigned ? studentSubjects({ classes, assignments: assigned.assignments, attempts: assigned.attempts }) : []), [assigned, classes]);
  const [goal, setGoalState] = useState(loadGoal);
  const setGoal = (patch) => { const next = { ...goal, ...patch }; setGoalState(next); saveGoal(next); };
  const left = daysUntil(goal.examDate);
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
              <span className="caption">{auth.status === "ready" ? `${course ? `Curso ${course} · ` : ""}${auth.profile.email}` : `${SAMPLE_STUDENT.course} · datos de muestra`}</span>
            </div>
            <div className="sp-kpis">
              <span><b className="flame-text">{ins.streak}</b><span className="caption">días de racha</span></span>
              <span><b className="accent-text">{fmtInt(ins.xp)}</b><span className="caption">XP</span></span>
              <span><b>{ins.sessions}</b><span className="caption">intentos</span></span>
              <span title="Solo preguntas nuevas para ti: repetir no lo sube"><b>{ins.pct == null ? "—" : `${ins.pct} %`}</b><span className="caption">{ins.pct == null ? "aciertos: faltan datos" : "aciertos en primer intento"}</span></span>
            </div>
          </div>

          <div className="card sp-card">
            <div className="section-head"><span className="label">Mi meta</span><span className="caption">Solo la ves tú</span></div>
            <div className="sp-goal">
              <label><span className="caption">Fecha de mi Saber 11</span>
                <DateField value={goal.examDate} onChange={(v) => setGoal({ examDate: v ?? "" })} min={new Date().toISOString().slice(0, 10)} aria-label="Fecha de mi Saber 11" />
              </label>
              <label><span className="caption">Meta diaria</span>
                <Select value={String(goal.dailyXp)} onChange={(v) => setGoal({ dailyXp: Number(v) })} aria-label="Meta diaria de XP">
                  {DAILY_GOALS.map((g) => <option key={g} value={String(g)}>{g} XP al día</option>)}
                </Select>
              </label>
              <label><span className="caption">Puntaje que quiero</span>
                <Select value={String(goal.target)} onChange={(v) => setGoal({ target: Number(v) })} aria-label="Puntaje meta">
                  {TARGETS.map((g) => <option key={g} value={String(g)}>{g} de 500</option>)}
                </Select>
              </label>
            </div>
            {left != null && left >= 0 && <span className="caption">{left === 0 ? "Hoy es tu examen. ¡Tú puedes!" : `Faltan ${left} ${left === 1 ? "día" : "días"}. Con ${goal.dailyXp} XP al día llegas con ${Math.round((left * goal.dailyXp) / 10)} preguntas más practicadas.`}</span>}
          </div>

          <div className="sp-links">
            <button type="button" className="card quick-row" onClick={() => onGo?.("progress")}><Icon name="chart" /><span>Mi progreso y análisis por área</span><Icon name="right" /></button>
            <button type="button" className="card quick-row" onClick={() => onGo?.("achievements")}><Icon name="trophy" /><span>Mis logros</span><Icon name="right" /></button>
          </div>

          {subjects.length > 0 && (
            <div className="card sp-card">
              <div className="section-head"><span className="label">Por materia</span><span className="caption">Tareas de cada docente</span></div>
              {subjects.map((s) => (
                <div key={s.id} className="sp-subject" style={{ "--c": s.color }}>
                  <span className="sp-bar" aria-hidden="true" />
                  <span className="sp-subject-main"><strong>{s.name}</strong><span className="caption">{s.teacher || "Docente de la clase"} · {s.group}</span></span>
                  <span className="caption">{s.done}/{s.total} entregadas</span>
                  <b title="Resultado de tu última actividad">{s.last == null ? "—" : `${s.last} %`}</b>
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
