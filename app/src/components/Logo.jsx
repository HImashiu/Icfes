import logoUrl from "../assets/condor-512.png";
import { APP_NAME } from "../lib/brand.js";

// The Cóndor logo: Cóndi in his green circle (drawing chosen by Juan, 2026-10-17).
export default function Logo({ size = 36, className = "" }) {
  return <img src={logoUrl} width={size} height={size} alt={APP_NAME} className={`logo ${className}`.trim()} draggable="false" />;
}
