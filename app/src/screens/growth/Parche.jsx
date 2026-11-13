import { useEffect, useState } from "react";
import {
  createStudyGroup, groupLink, joinStudyGroup, leaveStudyGroup, myStudyGroups, studyGroupPreview, whatsapp,
} from "../../lib/growth/app.js";
import { track } from "../../lib/growth/events.js";
import "./growth.css";

// F11 Parche de estudio (#parche, #parche/<code> to join): up to 12 friends with a shared weekly goal. Cooperative
// only: the group's total against its goal, and per member whether they practiced today. No ranking, members A-Z.
export default function Parche({ profile, code: joinCode, onExit }) {
  const first = String(profile?.full_name ?? "").split(" ")[0] || "Yo";
  const [groups, setGroups] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(300);
  const [display, setDisplay] = useState(first);
  const [msg, setMsg] = useState("");
  const load = () => myStudyGroups().then(setGroups, () => setGroups([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (joinCode) studyGroupPreview(joinCode).then(setPreview, () => setPreview(null)); }, [joinCode]);

  const err = (e) => ({ too_many_groups: "Ya estás en 5 parches.", full: "Ese parche ya tiene 12 personas.", unknown: "No encontramos ese parche.", too_many: "Ya creaste varios hoy." })[e] ?? "No pudimos hacerlo ahora.";
  const create = async () => {
    setMsg("");
    try {
      const r = await createStudyGroup(name.trim(), goal, display.trim());
      if (r?.error) return setMsg(err(r.error));
      track("parche:create", { g: goal });
      setName("");
      load();
    } catch { setMsg(err()); }
  };
  const join = async () => {
    setMsg("");
    try {
      const r = await joinStudyGroup(joinCode, display.trim());
      if (r?.error) return setMsg(err(r.error));
      track("parche:join", {});
      setPreview(null);
      window.location.hash = "#parche";
      load();
    } catch { setMsg(err()); }
  };

  return (
    <main className="frame gr-home">
      <header className="screen-head"><h1>Parche de estudio</h1></header>
      <p className="caption">Practiquen juntos: una meta de preguntas por semana para todo el parche. Aquí nadie compite: suman entre todos.</p>

      {joinCode && preview && (
        <div className="card sp-card">
          <b>Te invitaron a «{preview.name}»</b>
          <span className="caption">{preview.members} {preview.members === 1 ? "persona" : "personas"} · meta de {preview.weekly_goal} preguntas por semana</span>
          <div className="gr-grid2"><label><span className="caption">Tu nombre en el parche</span><input value={display} maxLength={30} onChange={(e) => setDisplay(e.target.value)} /></label></div>
          <button type="button" className="primary" onClick={join} disabled={!display.trim()}>Unirme</button>
        </div>
      )}
      {joinCode && preview === null && groups && <p className="notice">No encontramos ese parche. Pide el enlace otra vez.</p>}
      {msg && <p className="notice error" role="alert">{msg}</p>}

      {(groups ?? []).map((g) => (
        <div key={g.id} className="card sp-card">
          <div className="section-head"><span className="label">{g.name}</span><span className="caption">{g.week_total} de {g.weekly_goal} esta semana</span></div>
          <span className="gr-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * g.week_total) / Math.max(1, g.weekly_goal))}%` }} /></span>
          <ul className="gr-members">
            {g.members.map((m, i) => (
              <li key={i}><span>{m.name}{m.me ? " (tú)" : ""}</span><span className="caption">{m.today ? "Practicó hoy ✓" : "Aún no hoy"} · {m.days} {m.days === 1 ? "día" : "días"} esta semana</span></li>
            ))}
          </ul>
          <div className="gr-row" style={{ marginTop: 10 }}>
            <a className="primary" href={whatsapp(`Únete a mi parche «${g.name}» en Cóndor para practicar el ICFES juntos: ${groupLink(g.code)}`)} target="_blank" rel="noreferrer" onClick={() => track("share:parche", {})}>Invitar por WhatsApp</a>
            <button type="button" className="link" onClick={async () => { await leaveStudyGroup(g.id).catch(() => null); load(); }}>Salir del parche</button>
          </div>
        </div>
      ))}

      <div className="card sp-card">
        <div className="section-head"><span className="label">Crear un parche</span></div>
        <div className="gr-grid2">
          <label><span className="caption">Nombre</span><input value={name} maxLength={40} placeholder="Los de 11-B" onChange={(e) => setName(e.target.value)} /></label>
          <label><span className="caption">Meta semanal (preguntas entre todos)</span><input type="number" min={20} max={5000} value={goal} onChange={(e) => setGoal(Number(e.target.value) || 300)} /></label>
          <label><span className="caption">Tu nombre en el parche</span><input value={display} maxLength={30} onChange={(e) => setDisplay(e.target.value)} /></label>
        </div>
        <button type="button" className="primary" disabled={name.trim().length < 2} onClick={create}>Crear</button>
      </div>
      <button type="button" className="link" onClick={onExit}>Volver</button>
    </main>
  );
}
