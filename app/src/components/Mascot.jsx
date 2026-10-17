import logoUrl from "../assets/condor-512.png";
import { MASCOT_NAME } from "../lib/brand.js";

// Cóndi, drawn as the Cóndor logo (Juan, 2026-10-17: "use this icon for everything").
// `idle` makes it breathe and "celebrating" makes it hop; the pose no longer changes the drawing.
// Never shown on the question screen.
export default function Mascot({ pose = "normal", size = 96, idle = false }) {
  const up = pose === "celebrating";
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt={`${MASCOT_NAME}, la mascota`}
      draggable="false"
      className={`mascot${up ? " celebrating" : idle ? " idle" : ""}`}
      style={{ borderRadius: "50%" }}
    />
  );
}
