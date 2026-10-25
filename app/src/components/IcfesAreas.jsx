import { areaColor } from "../lib/brand.js";
import { LEVEL_TEXT } from "../lib/icfesScore.js";

const ORDER = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"];

// The per-prueba part of an ICFES results report: score 0-100, nivel de desempeño (with its official range) and the
// national percentile. areas: bandFor(...).areas.
export default function IcfesAreas({ areas, title = "Como en tu reporte del ICFES" }) {
  const rows = [...areas].filter((a) => a.scale != null).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  if (!rows.length) return null;
  return (
    <div className="card icfes-areas">
      <span className="label">{title}</span>
      <div className="ia-head caption" aria-hidden="true"><span>Prueba</span><span>Puntaje</span><span>Nivel</span><span>Percentil</span></div>
      {rows.map((a) => (
        <div key={a.name} className="ia-row" style={{ "--c": areaColor(a.name) }}>
          <span className="ia-name"><span className="dot" />{a.name}</span>
          <span className="ia-score"><b>{a.scale}</b><small>/100</small></span>
          <span className="ia-level" title={a.level ? `${a.level.label}: puntaje ${a.level.range}${a.name === "Inglés" ? " (Marco Común Europeo)" : `. ${LEVEL_TEXT[a.level.n]}`}` : ""}>
            {a.level ? <><span className="ia-steps" aria-hidden="true">{Array.from({ length: a.level.of }, (_, i) => <i key={i} className={i < a.level.n ? "on" : ""} />)}</span>{a.level.label}</> : "—"}
          </span>
          <span className="ia-pct">{a.percentile != null ? <>P{a.percentile}</> : "—"}</span>
        </div>
      ))}
      <p className="footnote">Nivel de desempeño con los rangos oficiales del ICFES. Percentil: porcentaje de estudiantes del país con un puntaje menor. Clave preliminar.</p>
    </div>
  );
}
