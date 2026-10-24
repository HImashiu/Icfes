import { useMemo, useState } from "react";
import Icon from "./Icon.jsx";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// A month at a glance: today is filled, days with something due carry a colored underline, and the list under it
// names what comes next. events: [{ at: ISO, color, label, onClick }].
export default function MonthCalendar({ events = [], now = new Date(), upcoming = 4, emptyText = "Nada programado este mes." }) {
  const [offset, setOffset] = useState(0);
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const k = dayKey(new Date(e.at));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);
  const todayKey = dayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 1).getTime();
  const from = offset === 0 ? startOfToday : first.getTime();
  const next = events.filter((e) => { const t = new Date(e.at).getTime(); return t >= from && t < monthEnd; })
    .sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, upcoming);
  const title = first.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  return (
    <div className="mc">
      <div className="mc-head">
        <h2>{title[0].toUpperCase() + title.slice(1)}</h2>
        <div className="mc-nav">
          <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => setOffset(offset - 1)}><Icon name="left" size={16} strokeWidth={3} /></button>
          <button type="button" className="icon-btn" aria-label="Mes siguiente" onClick={() => setOffset(offset + 1)}><Icon name="right" size={16} strokeWidth={3} /></button>
        </div>
      </div>
      <div className="mc-grid" role="grid" aria-label={title}>
        {WEEK.map((d, i) => <span key={`h${i}`} className="mc-wd" aria-hidden="true">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(first.getFullYear(), first.getMonth(), i + 1);
          const k = dayKey(d);
          const evs = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          const label = `${i + 1}${evs.length ? `: ${evs.map((e) => e.label).join(", ")}` : ""}`;
          return (
            <span key={k} role="gridcell" aria-label={label} title={evs.map((e) => e.label).join("\n") || undefined}
              className={["mc-day", isToday && "today", evs.length && "has"].filter(Boolean).join(" ")}
              style={evs.length && !isToday ? { "--mc-c": evs[0].color } : undefined}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <ul className="mc-list">
        {next.length === 0 && <li className="caption">{emptyText}</li>}
        {next.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="mc-dot" style={{ background: e.color }} aria-hidden="true" />
            {e.onClick ? <button type="button" className="link-row" onClick={e.onClick}>{e.label}</button> : <span>{e.label}</span>}
            <span className="caption">{new Date(e.at).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
