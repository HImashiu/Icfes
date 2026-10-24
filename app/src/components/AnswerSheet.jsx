import { FID_CENTERS, FID_SIZE, idBits, LETTERS } from "../lib/omr.js";

// Hoja de respuestas de un estudiante: marcas negras en las esquinas, código del estudiante y burbujas A-D.
export default function AnswerSheet({ layout, title, course, student, index, version = null, seat = null }) {
  const bits = idBits(index);
  return (
    <svg className="sheet-page" viewBox="0 0 210 297" width="210mm" height="297mm" style={{ display: "block", background: "#fff", breakAfter: "page", pageBreakAfter: "always" }} role="img" aria-label={`Hoja de respuestas de ${student}`}>
      {FID_CENTERS.map(([x, y]) => <rect key={`${x}-${y}`} x={x - FID_SIZE / 2} y={y - FID_SIZE / 2} width={FID_SIZE} height={FID_SIZE} fill="#000" />)}
      <text x="105" y="14" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#000">{title}</text>
      <text x="30" y="26" fontSize="4" fill="#000">Estudiante: {student}</text>
      <text x="30" y="32" fontSize="4" fill="#000">Curso: {course} · N.º {index + 1}</text>
      {version && <text x="30" y="38" fontSize="4" fontWeight="700" fill="#000">Cuadernillo versión {version}{seat ? ` · Puesto ${seat}` : ""}</text>}
      <text x="30" y="60" fontSize="3" fill="#000">Marca cada respuesta rellenando el círculo por completo con lápiz oscuro. Una sola respuesta por pregunta.</text>
      <text x="30" y="64" fontSize="3" fill="#000">No dobles ni arrugues la hoja. No escribas sobre las marcas negras ni sobre la franja de cuadros.</text>
      <text x="57" y="40" fontSize="2.5" fill="#000">Código del estudiante (no tocar)</text>
      {layout.idCells.map((c) => <rect key={c.i} x={c.x - 2.5} y={c.y - 2.5} width="5" height="5" fill={bits[c.i] ? "#000" : "none"} stroke="#000" strokeWidth="0.25" />)}
      {Array.from({ length: layout.cols }, (_, col) => LETTERS.map((l, li) => (
        <text key={`${col}${l}`} x={22 + col * 33 + 9 + li * 6.5} y="74" textAnchor="middle" fontSize="3" fill="#000">{l}</text>
      )))}
      {layout.labels.map((l) => <text key={l.q} x={l.x} y={l.y + 1.3} textAnchor="end" fontSize="3.2" fill="#000">{l.q + 1}</text>)}
      {layout.bubbles.map((b) => <circle key={`${b.q}${b.letter}`} cx={b.x} cy={b.y} r={layout.bubbleR} fill="none" stroke="#000" strokeWidth="0.25" />)}
    </svg>
  );
}

