import Icon from "../components/Icon.jsx";
import { SAMPLE_LEAGUE } from "../data/mock.js";
import { fmtInt } from "../lib/brand.js";

// Liga: a podium of three (first place in lime) and the ranked list. Sample data.
export default function League({ onBack }) {
  const ranked = [...SAMPLE_LEAGUE].sort((a, b) => b.xp - a.xp);
  const top = ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <section className="league">
      <header className="screen-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="left" />
        </button>
        <h1>Liga</h1>
      </header>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="seg active">Esta semana</button>
        <button type="button" role="tab" aria-selected="false" className="seg" disabled>Rachas · pronto</button>
      </div>

      <div className="podium">
        {order.map((r) => {
          const place = ranked.indexOf(r) + 1;
          return (
            <div key={r.name} className={place === 1 ? "podium-step first" : "podium-step"}>
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
            <span className="rank-name">{r.name}</span>
            <span className="rank-xp">{fmtInt(r.xp)} XP</span>
          </li>
        ))}
      </ol>
      <span className="caption">Datos de muestra. La liga real llegará con las cuentas.</span>
    </section>
  );
}
