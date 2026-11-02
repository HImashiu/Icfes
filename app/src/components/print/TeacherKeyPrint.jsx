import { SOURCE_LINE } from "../../lib/exam.js";
import { keyRows } from "../../lib/lesson.js";

const PER_COL = 34;

// The teacher's key of one booklet version on one page: the letter of each question, grouped by area, with the
// question's number in the ICFES booklet (so the versions can be compared). Never handed to students.
export default function TeacherKeyPrint({ questions, bundle, title, course, version, paper, zoom = 1 }) {
  const rows = keyRows(questions, bundle);
  const cols = [];
  rows.forEach((r, i) => {
    if (i % PER_COL === 0) cols.push([]);
    cols.at(-1).push(r);
  });
  const missing = rows.filter((r) => !r.letter).length;
  return (
    <div className="bkk" style={{ "--bkk-w": `${paper.w}mm`, "--bkk-cols": Math.max(3, cols.length), minHeight: `${paper.h}mm`, zoom }}>
      <h1>Clave del docente{version ? ` · Versión ${version}` : ""}</h1>
      <p className="bkk-meta">{title}{course ? ` · ${course}` : ""} · {rows.length} preguntas · {SOURCE_LINE}, {bundle.exam.title}</p>
      <div className="bkk-grid">
        {cols.map((col, c) => (
          <table key={c}>
            <thead><tr><th>N.º</th><th>Resp.</th><th>Área</th><th>ICFES</th></tr></thead>
            <tbody>
              {col.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td>
                  <td className="l">{r.letter ?? "—"}</td>
                  <td className="o">{short(r.section)}</td>
                  <td className="o">{r.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p className="bkk-note">
        Clave preliminar, no oficial: resuelta y revisada por Cóndor, no publicada por el ICFES.{missing ? ` ${missing} ${missing === 1 ? "pregunta no tiene" : "preguntas no tienen"} clave confirmada (—).` : ""}
        {version ? " Cada versión tiene su propia clave: califica cada hoja con la clave de su versión (el escáner de Cóndor lo hace solo)." : ""}
        {" "}La columna ICFES es el número de la pregunta en el cuadernillo original.
      </p>
    </div>
  );
}

const SHORT = { "Lectura crítica": "Lectura", "Matemáticas": "Matem.", "Sociales y ciudadanas": "Sociales", "Ciencias naturales": "Ciencias", "Inglés": "Inglés" };
const short = (s) => SHORT[s] ?? s;
