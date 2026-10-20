import logoUrl from "../assets/owl-logo.svg";
import { APP_NAME } from "../lib/brand.js";

// The Cóndor logo: the owl (vector trace of Juan's drawing, 2026-10-20) on a white circle.
export default function Logo({ size = 36, className = "" }) {
  return <img src={logoUrl} width={size} height={size} alt={APP_NAME} className={`logo ${className}`.trim()} draggable="false" />;
}
