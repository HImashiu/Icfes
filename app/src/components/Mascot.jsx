import { MASCOT_NAME } from "../lib/brand.js";

// Cóndi. "normal" is the default; "celebrating" raises the wings and closes the eyes.
// Never shown on the question screen.
export default function Mascot({ pose = "normal", size = 96 }) {
  const up = pose === "celebrating";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${MASCOT_NAME}, la mascota`}>
      <circle cx="60" cy="64" r="54" style={{ fill: "var(--accent-soft)" }} />
      <path d="M24 72 C10 62 8 88 22 100 C30 96 34 86 36 78Z" fill="#2E3430" stroke="#0D110F" strokeWidth="2"
        transform={up ? "rotate(-28 36 80)" : undefined} />
      <path d="M96 72 C110 62 112 88 98 100 C90 96 86 86 84 78Z" fill="#2E3430" stroke="#0D110F" strokeWidth="2"
        transform={up ? "rotate(28 84 80)" : undefined} />
      <ellipse cx="60" cy="84" rx="32" ry="28" fill="#2E3430" stroke="#0D110F" strokeWidth="2" />
      <path d="M30 68 Q60 86 90 68 Q88 82 60 84 Q32 82 30 68Z" fill="#F7F6F1" stroke="#0D110F" strokeWidth="2" />
      <circle cx="60" cy="50" r="21" fill="#D9A08F" stroke="#0D110F" strokeWidth="2" />
      {up ? (
        <>
          <path d="M46 49 Q52 44 58 49" fill="none" stroke="#0D110F" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M62 49 Q68 44 74 49" fill="none" stroke="#0D110F" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="52" cy="48" r="6" fill="#FFFFFF" />
          <circle cx="68" cy="48" r="6" fill="#FFFFFF" />
          <circle cx="53" cy="49" r="3" fill="#0D110F" />
          <circle cx="69" cy="49" r="3" fill="#0D110F" />
        </>
      )}
      <path d="M55 56 Q60 53 65 56 Q65 64 60 68 Q57 63 55 59Z" fill="#F2E3B8" stroke="#0D110F" strokeWidth="1.5" />
      <path d="M36 30 L60 19 L84 30 L60 41Z" fill="#C8F04A" stroke="#0D110F" strokeWidth="2" strokeLinejoin="round" />
      <path d="M84 30 L86 44" stroke="#C8F04A" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
