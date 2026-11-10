import { DEMO_LABEL, setDemo } from "./mode.js";

// Always visible while the example school is on, so invented data is never mistaken for a real school's. It also
// switches between the two sides of the example (the coordinator's teacher panel and one student of 11 A) and
// turns the example off, back to the teacher's own school.
export default function DemoBanner({ side, onSide }) {
  return (
    <div className="demo-banner" role="status">
      <strong>{DEMO_LABEL}</strong>
      <span className="demo-banner-text">Colegio inventado. Nada se guarda ni toca tu colegio.</span>
      {onSide && (
        <div className="segmented demo-side" role="radiogroup" aria-label="Ver el ejemplo como">
          <button type="button" role="radio" aria-checked={side === "student"} className={side === "student" ? "seg active" : "seg"} onClick={() => onSide("student")}>Estudiante</button>
          <button type="button" role="radio" aria-checked={side === "teacher"} className={side === "teacher" ? "seg active" : "seg"} onClick={() => onSide("teacher")}>Docente</button>
        </div>
      )}
      <button type="button" className="demo-off" onClick={() => setDemo(false)}>Apagar</button>
    </div>
  );
}
