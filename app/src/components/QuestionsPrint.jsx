import { useState } from "react";
import PrintBooklet from "./PrintBooklet.jsx";
import TeacherKey from "./TeacherKey.jsx";
import { Overlay } from "../screens/Paper.jsx";

// Any set of bank questions printed straight away: a worksheet for the class or its key for the teacher.
// keys: in the order chosen. Nothing is saved; to keep the set, make it a class or an activity.
export default function QuestionsPrint({ bundle, keys, title, course = "", onClose }) {
  const [what, setWhat] = useState("worksheet");
  const byKey = new Map((bundle?.exam?.questions ?? []).map((q) => [q.key, q]));
  const questions = keys.map((k) => byKey.get(k)).filter(Boolean);
  const label = title || `Hoja de trabajo · ${questions.length} preguntas`;
  return (
    <Overlay title={what === "worksheet" ? "Hoja de trabajo" : "Clave del docente"} hint={what === "worksheet" ? `${questions.length} preguntas · A4` : "Solo para ti: no la repartas"} onClose={onClose} page="14mm 14mm 16mm">
      <div className="segmented small no-print qp-switch" role="tablist" aria-label="Qué imprimir">
        {[["worksheet", "Hoja para estudiantes"], ["key", "Clave del docente"]].map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={what === id} className={what === id ? "seg active" : "seg"} onClick={() => setWhat(id)}>{l}</button>
        ))}
      </div>
      {what === "worksheet"
        ? <PrintBooklet variant="worksheet" questions={questions} figures={bundle.figures} examLabel={bundle.exam.title} title={label} course={course} />
        : <TeacherKey questions={questions} bundle={bundle} title={label} course={course} />}
    </Overlay>
  );
}
