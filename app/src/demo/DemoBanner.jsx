import { DEMO_LABEL } from "./mode.js";

// Always visible while demo mode is on, so invented data is never mistaken for a real school's. It also switches
// between the two sides of the demo: the coordinator's teacher panel and one student of 11 A.
export default function DemoBanner({ side, onSide }) {
  return (
    <div className="demo-banner" role="status">
      <strong>{DEMO_LABEL}</strong>
      <span className="demo-banner-text">Colegio y estudiantes inventados. Lo que cambies no se guarda.</span>
      {onSide && (
        <div className="segmented demo-side" role="radiogroup" aria-label="Ver la demostración como">
          <button type="button" role="radio" aria-checked={side === "student"} className={side === "student" ? "seg active" : "seg"} onClick={() => onSide("student")}>Estudiante</button>
          <button type="button" role="radio" aria-checked={side === "teacher"} className={side === "teacher" ? "seg active" : "seg"} onClick={() => onSide("teacher")}>Docente</button>
        </div>
      )}
    </div>
  );
}
