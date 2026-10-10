import Icon from "../components/Icon.jsx";
import { SAMPLE_LEAGUE } from "../data/mock.js";
import { areaColor, fmtInt } from "../lib/brand.js";

// Other students take area colors in rotation; the current user stays lime.
const ROTATION = ["Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
const avatarStyle = (r, i) =>
  r.me
    ? { background: "var(--accent)", color: "var(--on-accent)" }
    : { background: areaColor(ROTATION[i % ROTATION.length]), color: "#0D110F" };

// Liga: a podium of three (first place in lime) and the ranked list. Sample data.
export default function League({ onBack }) {
  const ranked = [...SAMPLE_LEAGUE].sort((a, b) => b.xp - a.xp);
  const top = ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <section className="league">
      <header className="screen-head league-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="left" />
        </button>
        <h1>Liga</h1>
      </header>

      <div className="segmented league-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="seg active">Esta semana</button>
        <button type="button" role="tab" aria-selected="false" className="seg" disabled>Rachas · pronto</button>
      </div>

      <div className="podium card">
        {order.map((r) => {
          const place = ranked.indexOf(r) + 1;
          return (
            <div key={r.name} className={place === 1 ? "podium-step first" : "podium-step"}>
              <span className="avatar podium-av" aria-hidden="true" style={avatarStyle(r, place - 1)}>{r.name[0]}</span>
              <span className="podium-name">{r.name}</span>
              <div className="podium-block">{place}</div>
              <span className="caption">{fmtInt(r.xp)} XP</span>
            </div>
          );
        })}
      </div>

      <ol className="rank-list">
        {ranked.map((r, i) => (
          <li key={r.name} className={r.me ? "rank-row me" : "rank-row"}>
            <span className="rank-n">{i + 1}</span>
            <span className="avatar sm" aria-hidden="true" style={avatarStyle(r, i)}>{r.name[0]}</span>
            <div className="rank-main">
              <span className="rank-name">{r.name}</span>
              <span className="caption">{fmtInt(r.streak)} {r.streak === 1 ? "día" : "días"} de racha</span>
              <div className="progress thin"><span style={{ width: `${(r.xp / ranked[0].xp) * 100}%`, background: r.me ? "var(--accent)" : "var(--text-2)" }} /></div>
            </div>
            <span className="rank-xp">{fmtInt(r.xp)} XP</span>
          </li>
        ))}
      </ol>
      <span className="caption league-note">Datos de muestra. La liga real llegará con las cuentas.</span>
    </section>
  );
}
