import { useId } from "react";
import { MASCOT_NAME } from "../lib/brand.js";

// Cóndi, the owl in his green circle, redrawn as vector parts so each part can move
// (Juan's drawing, 2026-10-17). Poses:
//   "normal"      breathes when `idle`, blinks and sways the tassel
//   "happy"       a correct answer: closed smiling eyes and a small hop
//   "celebrating" a good result: wings up, hop, tassel spinning
//   "sad"         a wrong answer or a low score: looks down, head tilted, still kind
export default function Mascot({ pose = "normal", size = 96, idle = false }) {
  const clip = `m-clip-${useId().replace(/:/g, "")}`;
  const smiling = pose === "happy" || pose === "celebrating";
  const cls = ["mascot", `pose-${pose}`, idle && pose === "normal" ? "idle" : "", pose === "celebrating" ? "celebrating" : ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${MASCOT_NAME}, la mascota`}>
      <defs>
        <clipPath id={clip}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill="#2C4A26" />
      <g clipPath={`url(#${clip})`}>
        <g className="m-body">
          <g className="m-wing m-wing-l">
            <ellipse cx="17" cy="82" rx="9.5" ry="16.5" transform="rotate(-18 17 82)" fill="#33383B" stroke="#111" strokeWidth="1.8" />
          </g>
          <g className="m-wing m-wing-r">
            <ellipse cx="103" cy="82" rx="9.5" ry="16.5" transform="rotate(18 103 82)" fill="#33383B" stroke="#111" strokeWidth="1.8" />
          </g>
          <ellipse cx="60" cy="92" rx="36" ry="29" fill="#33383B" stroke="#111" strokeWidth="1.8" />
          <path d="M60 99 V121" stroke="#111" strokeWidth="1.5" />
          <path d="M36 77 Q48 92 60 99 Q72 92 84 77" fill="none" stroke="#25292C" strokeWidth="1.2" />
          <path d="M30 56 Q44 64 60 64 Q76 64 90 56 Q80 76 60 82 Q40 76 30 56Z" fill="#E59C73" />
          <path d="M24.5 52 Q30 58 34 60 Q44 74 60 80 L60 90 Q38 82 28 64 Q25 58 24.5 52Z" fill="#F7F6F1" stroke="#111" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M95.5 52 Q90 58 86 60 Q76 74 60 80 L60 90 Q82 82 92 64 Q95 58 95.5 52Z" fill="#F7F6F1" stroke="#111" strokeWidth="1.7" strokeLinejoin="round" />
        </g>
      </g>
      <g className="m-head">
        <circle cx="60.5" cy="43" r="23.5" fill="#E69F73" stroke="#111" strokeWidth="1.9" />
        <path d="M39 50 Q60 66 82 50 Q80 63 60.5 66.5 Q41 63 39 50Z" fill="#D88A62" />
        <g className="m-eyes">
          {smiling ? (
            <>
              <path d="M44.5 41 Q50.6 34.5 56.5 41" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M63.8 41 Q69.6 34.5 75.5 41" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" />
            </>
          ) : (
            <g className="m-open">
              <circle cx="50.6" cy="40" r="7.7" fill="#fff" stroke="#111" strokeWidth="1.6" />
              <circle cx="69.6" cy="40" r="7.7" fill="#fff" stroke="#111" strokeWidth="1.6" />
              <g className="m-pupils">
                <circle cx="51.6" cy="40.8" r="3.4" fill="#111" />
                <circle cx="70.2" cy="40.8" r="3.4" fill="#111" />
                <circle cx="52.8" cy="39.4" r="1.1" fill="#fff" />
                <circle cx="71.4" cy="39.4" r="1.1" fill="#fff" />
              </g>
            </g>
          )}
        </g>
        {pose === "sad" && (
          <>
            <path d="M45 31.5 L55 33.5" stroke="#111" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M76 31.5 L66 33.5" stroke="#111" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}
        <path d="M54 50.5 Q60.5 45 67 50.5 L60.5 61.5Z" fill="#E6CFA5" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M54 50.5 Q57 47.6 60.5 47 L60.5 61.5Z" fill="#CAB38A" />
        {smiling && <ellipse className="m-cheek" cx="43" cy="49" rx="3.2" ry="2" fill="#F08A7A" opacity="0.7" />}
        {smiling && <ellipse className="m-cheek" cx="78" cy="49" rx="3.2" ry="2" fill="#F08A7A" opacity="0.7" />}
        <g className="m-cap">
          <path d="M45 22 L76 22 L74 29.5 Q60 27 47 29.5Z" fill="#8DB54E" stroke="#111" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M31.5 18.5 L60 6 L86.5 18.5 L60 30.5Z" fill="#A0C55E" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
          <g className="m-tassel">
            <path d="M86 19 L88 39" stroke="#A4CB60" strokeWidth="1.8" strokeLinecap="round" />
            <ellipse cx="87.7" cy="33" rx="1.6" ry="2" fill="#A4CB60" />
            <path d="M86.4 39 L89.6 39 L89.2 44 L86.8 44Z" fill="#A4CB60" />
          </g>
        </g>
      </g>
    </svg>
  );
}
