import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { loadGoal } from "../../lib/goal.js";
import { loadHistory } from "../../lib/local.js";
import { practiceInsights } from "../../lib/student.js";
import {
  activeNotices, answeredHere, canInstall, daysAway, firstSteps, isInstalled, myStudyGroups, onInstallChange, promptInstall,
} from "../../lib/growth/app.js";
import { track } from "../../lib/growth/events.js";
import "./growth.css";

// Growth cards on the student's Inicio (docs/growth/LEDGER.md):
//   F29 campaign notices (season dates, the national mock day) from active_notices('app')
//   F35 welcome back: a 5-question warm-up in the weakest area after 3+ days away
//   F36 Primeros pasos: a self-ticking checklist for new students, hidden once done or dismissed
//   F11 the student's study group (Parche): this week's total against the group goal
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };

export default function GrowthHome({ signedIn, onSetup, onGo }) {
  const [notices, setNotices] = useState([]);
  const [groups, setGroups] = useState(null);
  const [installable, setInstallable] = useState(canInstall());
  const [hideSteps, setHideSteps] = useState(() => get("condor:hide:steps") === "1");
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(get("condor:hide:notices") || "[]"); } catch { return []; } });
  const away = useMemo(() => daysAway(), []);
  const ins = useMemo(() => practiceInsights(loadHistory()), []);
  const weakest = ins.weakest?.name ?? ins.areas?.[0]?.name ?? null;

  useEffect(() => { activeNotices().then(setNotices); }, []);
  useEffect(() => { if (signedIn) myStudyGroups().then(setGroups, () => setGroups([])); }, [signedIn]);
  useEffect(() => onInstallChange(setInstallable), []);

  const answered = Math.max(answeredHere(), ins.answered ?? 0);
  const goal = loadGoal();
  const steps = firstSteps({
    answered, hasGoal: !!goal?.examDate, invited: !!get("condor:invited"), installed: isInstalled(), grouped: (groups?.length ?? 0) > 0,
  });
  const left = steps.filter((s) => !s.done).length;
  const showSteps = !hideSteps && left > 0 && answered < 60;
  const notice = notices.find((n) => !hidden.includes(n.id));

  const stepAction = (id) => {
    track("steps:tap", { s: id });
    if (id === "q1" || id === "q5") return onSetup?.({ scope: "all", mode: "practice" });
    if (id === "goal") return onGo?.("profile");
    if (id === "group") { window.location.hash = "#parche"; return null; }
    if (id === "install") return installable ? promptInstall() : onGo?.("profile");
    return null;
  };

  return (
    <div className="gr-home">
      {notice && (
        <div className="card gr-notice" role="note">
          <Icon name="bell" />
          <div><b>{notice.title}</b>{notice.body && <span className="caption">{notice.body}</span>}</div>
          <div className="gr-row">
            {notice.cta_url && <a className="primary small" href={notice.cta_url} onClick={() => track("notice:click", { id: notice.id })}>{notice.cta_label || "Ver"}</a>}
            <button type="button" className="link" aria-label="Ocultar aviso" onClick={() => { const next = [...hidden, notice.id]; setHidden(next); set("condor:hide:notices", JSON.stringify(next)); }}><Icon name="x" /></button>
          </div>
        </div>
      )}

      {away >= 3 && answered > 0 && (
        <div className="card gr-back">
          <div>
            <b>¡Qué bueno verte otra vez!</b>
            <span className="caption">Llevas {away} días sin practicar. Arranca suave con unas preguntas{weakest ? ` de ${weakest}` : ""} y vuelves al ritmo.</span>
          </div>
          <button type="button" className="primary" onClick={() => { track("back:warmup", { d: away }); onSetup?.({ scope: weakest ?? "all", mode: "practice" }); }}>Calentar</button>
        </div>
      )}

      {showSteps && (
        <div className="card gr-steps">
          <div className="section-head"><span className="label">Primeros pasos</span><span className="caption">{steps.length - left} de {steps.length}</span></div>
          <ol>
            {steps.map((s) => (
              <li key={s.id} className={s.done ? "done" : ""}>
                <button type="button" disabled={s.done} onClick={() => stepAction(s.id)}>
                  <span className="gr-tick" aria-hidden="true">{s.done ? <Icon name="check" /> : null}</span>
                  <span>{s.label}</span>
                  {!s.done && <Icon name="right" />}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="link small" onClick={() => { setHideSteps(true); set("condor:hide:steps", "1"); }}>Ocultar</button>
        </div>
      )}

      {signedIn && groups && groups.length > 0 && (
        <a className="card gr-parche-mini" href="#parche">
          <Icon name="users" />
          <div>
            <b>{groups[0].name}</b>
            <span className="caption">Esta semana llevan {groups[0].week_total} de {groups[0].weekly_goal} preguntas · {groups[0].members.filter((m) => m.today).length} de {groups[0].members.length} practicaron hoy</span>
            <span className="gr-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * groups[0].week_total) / Math.max(1, groups[0].weekly_goal))}%` }} /></span>
          </div>
          <Icon name="right" />
        </a>
      )}
    </div>
  );
}
