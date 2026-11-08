import logoUrl from "../assets/condor-mark.svg";
import { APP_NAME } from "../lib/brand.js";

// The Cóndor mark (2026-11-07): Juan's owl simplified to the head, face, eyes, beak and mortarboard so it reads small.
export default function Logo({ size = 36, className = "" }) {
  return <img src={logoUrl} width={size} height={size} alt={APP_NAME} className={`logo ${className}`.trim()} draggable="false" />;
}
