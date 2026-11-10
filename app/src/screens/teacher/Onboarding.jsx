import Icon from "../../components/Icon.jsx";
import { demoEnabled, setDemo } from "../../demo/mode.js";

// First visit to the teacher panel (the tutorials live in lib/tours.js): a "first steps" list
// that ticks itself as the school sets up, and the switch that opens the example school (invented students and
// results) so a new teacher can see every tool with data before importing anything.

// The example school: off for every real school; a teacher turns it on to look around and off to come back.
export function ExampleDataSwitch({ className = "" }) {
  const on = demoEnabled;
  return (
    <div className={`ob-switch ${className}`}>
      <span className="ob-switch-text">
        <strong>Datos de ejemplo</strong>
        <span className="caption">{on
          ? "Estás viendo un colegio inventado. Apágalo para volver al tuyo."
          : "Mira cómo se ven las herramientas con estudiantes y resultados inventados, sin importar nada. Tu colegio no cambia."}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label="Datos de ejemplo" className={on ? "aj-switch on" : "aj-switch"} onClick={() => setDemo(!on)} />
    </div>
  );
}

// What a new teacher does first. Each step ticks itself from the real data and opens where it is done.
export function firstSteps({ admin, courses, assignments }) {
  return [
    admin
      ? { id: "cursos", done: courses.length > 0, title: "Arma los cursos del colegio", text: "Cada curso (por ejemplo 11 A) se crea con sus cinco materias del ICFES.", to: { section: "colegio", tab: "cursos" } }
      : { id: "clase", done: courses.length > 0, title: "Crea tu clase", text: "Ponle nombre y pega la lista de estudiantes con su correo.", to: { section: "estudiantes", tab: "clases" } },
    { id: "actividad", done: assignments.length > 0, title: "Asigna la primera actividad", text: "Un simulacro diagnóstico o una tarea corta, en línea o en papel.", to: { section: "actividades", tab: "nueva" } },
    { id: "resultados", done: false, title: "Revisa los resultados", text: "Puntaje como el ICFES, por competencia y por estudiante.", to: { section: "resultados" } },
  ];
}

export function FirstSteps({ steps, go, onTour }) {
  const next = steps.find((s) => !s.done);
  return (
    <section className="ob-steps" aria-label="Primeros pasos">
      <ol>
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? "done" : s === next ? "next" : ""}>
            <button type="button" onClick={() => go(s.to)}>
              <span className="ob-num" aria-hidden="true">{s.done ? <Icon name="check" size={15} strokeWidth={3.2} /> : i + 1}</span>
              <span className="ob-step-text"><strong>{s.title}</strong><span className="caption">{s.text}</span></span>
              <Icon name="right" size={16} strokeWidth={3} />
            </button>
          </li>
        ))}
      </ol>
      <ExampleDataSwitch />
      {onTour && <button type="button" className="link ob-replay" onClick={onTour}><Icon name="play" size={14} /> Ver el tutorial otra vez</button>}
    </section>
  );
}
