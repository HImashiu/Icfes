import { DEMO_LABEL } from "./mode.js";

// Always visible while demo mode is on, so invented data is never mistaken for a real school's.
export default function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <strong>{DEMO_LABEL}</strong>
      <span>Colegio y estudiantes inventados. Lo que cambies no se guarda.</span>
    </div>
  );
}
