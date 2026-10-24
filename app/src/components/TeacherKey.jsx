import { SOURCE_LINE } from "../lib/exam.js";
import { keyRows } from "../lib/lesson.js";

// The teacher's printed key: letter per question, the skill and, only where the key is settled, the explanation.
// Never handed to students. The key is preliminary, not official.
export default function TeacherKey({ questions, bundle, title, course }) {
  const rows = keyRows(questions, bundle);
  return (
    <div className="pk">
      <h1>Clave del docente · {title}</h1>
      <p>{course ? `${course} · ` : ""}{rows.length} {rows.length === 1 ? "pregunta" : "preguntas"} · {SOURCE_LINE}, {bundle.exam.title}</p>
      <table>
        <thead><tr><th>N.º</th><th>Resp.</th><th>Área y habilidad</th><th>Explicación</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td>{r.n}</td>
              <td className="pk-letter">{r.letter ?? "—"}</td>
              <td>{r.section}{r.skill ? ` · ${r.skill}` : ""}</td>
              <td>{r.letter ? r.explanation ?? "Sin explicación confirmada." : "Sin clave."}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pk-note">Clave preliminar, no oficial. Las explicaciones son generadas con IA y solo aparecen donde la clave está confirmada.</p>
    </div>
  );
}
