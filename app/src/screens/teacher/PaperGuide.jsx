import { useState } from "react";
import Icon from "../../components/Icon.jsx";

// Top of an activity's "En papel" tab: says whether the activity is on paper, when paper is the better choice, and
// lets an online activity move to paper (students stop seeing it in the app) or back.
export default function PaperGuide({ api, assignment, guard, onChanged }) {
  const paper = assignment.delivery === "paper";
  const [why, setWhy] = useState(!paper);
  const [busy, setBusy] = useState(false);
  const change = (delivery) => {
    setBusy(true);
    guard(async () => { await api.setAssignmentDelivery(assignment.id, delivery); await onChanged?.(); }).finally(() => setBusy(false));
  };
  return (
    <section className={paper ? "card pg pg-paper" : "card pg"}>
      <div className="pg-head">
        <span className="pg-ico" aria-hidden="true"><Icon name={paper ? "print" : "book"} size={22} /></span>
        <span className="pg-text">
          <strong>{paper ? "Esta actividad es en papel" : "Esta actividad es en línea"}</strong>
          <span className="caption">{paper
            ? "Los estudiantes la ven en su lista como «En papel, en el salón», sin las preguntas. Sus notas aparecen cuando escaneas las hojas."
            : "Los estudiantes la resuelven en la app. Si un día no hay dispositivos, imprímela igual: las hojas escaneadas cuentan junto a las respuestas en línea."}</span>
        </span>
        {api.setAssignmentDelivery && (
          paper
            ? <button type="button" className="link" disabled={busy} onClick={() => change("online")}>Pasarla a en línea</button>
            : <button type="button" className="secondary" disabled={busy} onClick={() => change("paper")}>Hacerla solo en papel</button>
        )}
      </div>
      <button type="button" className="link pg-toggle" aria-expanded={why} onClick={() => setWhy(!why)}>¿Cuándo conviene el papel?</button>
      {why && (
        <div className="pg-why">
          <div>
            <span className="label">Usa papel para</span>
            <ul>
              <li>Simulacros que se parezcan al ICFES real: cuadernillo, hoja de burbujas y tiempo controlado.</li>
              <li>Salones sin un celular o computador por estudiante.</li>
              <li>Exámenes donde no quieres pantallas: nadie busca la respuesta ni ve el banco antes.</li>
            </ul>
          </div>
          <div>
            <span className="label">Mejor en línea para</span>
            <ul>
              <li>Tareas en casa y prácticas con corrección inmediata, pistas y explicaciones.</li>
              <li>Ver el tiempo por pregunta, los cambios de respuesta y quién salió de la pestaña.</li>
            </ul>
          </div>
          <ol className="pg-steps">
            <li><b>1</b> Imprime el cuadernillo y las hojas</li>
            <li><b>2</b> Opcional: arma el plano del salón</li>
            <li><b>3</b> Los estudiantes marcan las burbujas</li>
            <li><b>4</b> Escanea las hojas con el celular</li>
          </ol>
        </div>
      )}
    </section>
  );
}
