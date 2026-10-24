import { versionLabel } from "../lib/seating.js";

// The room as a grid: the board at the top, one cell per seat with the student's name and booklet version.
// `onToggle` (teacher editing the layout) turns a seat into an empty spot; without it the chart is read-only.
export default function SeatingChart({ rows, cols, blocked, seatVersion = {}, seats = {}, names = {}, onToggle = null, picked = null, title = null, course = null, counts = null }) {
  const blockedSet = new Set(blocked);
  const cells = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const id = `${r},${c}`;
    const off = blockedSet.has(id);
    const v = seatVersion[id];
    const who = seats[id];
    const cls = ["seat", off ? "is-blocked" : v != null ? `v${v}` : "", !off && v != null && !who ? "is-empty" : "", picked === id ? "is-picked" : ""].join(" ").trim();
    const inner = off ? <span>Sin puesto</span> : v == null ? <span>Puesto</span> : (
      <>
        <strong>{versionLabel(v)}</strong>
        <span>{who ? names[who] ?? "" : "vacío"}</span>
      </>
    );
    const label = off ? `Fila ${r + 1}, puesto ${c + 1}: sin puesto` : `Fila ${r + 1}, puesto ${c + 1}${who ? `: ${names[who] ?? ""}, versión ${versionLabel(v)}` : ""}`;
    cells.push(onToggle
      ? <button key={id} type="button" className={cls} aria-label={label} aria-pressed={picked != null ? picked === id : off} onClick={() => onToggle(id)}>{inner}</button>
      : <div key={id} className={cls} role="img" aria-label={label}>{inner}</div>);
  }
  const body = (
    <>
      <div className="seat-board">Tablero</div>
      <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{cells}</div>
    </>
  );
  if (!title) return body;
  return (
    <div className="seat-chart-page">
      <h1>Plano del salón · {title}</h1>
      <p>{course}</p>
      {body}
      {counts && <p className="seat-legend">Copias del cuadernillo: {counts.map((n, v) => `Versión ${versionLabel(v)}: ${n}`).join(" · ")}. Ningún estudiante tiene al lado, adelante, atrás ni en diagonal a alguien con su misma versión.</p>}
    </div>
  );
}
