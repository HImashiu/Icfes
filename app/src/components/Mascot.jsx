import artUrl from "../assets/condor-512.png";
import { MASCOT_NAME } from "../lib/brand.js";

// The owl is Juan's own drawing (the app icon), never a redraw. Only a few small pieces are drawn on top of it,
// in its colors, so it can blink and make faces; the whole drawing moves gently. Poses:
//   "normal"      blinks; breathes and bobs when `idle`
//   "happy"       a correct answer: smiling eyes, a small hop
//   "celebrating" a good result: smiling eyes, hops and wiggles
//   "sad"         a wrong answer or a low score: droopy lids, head tilted, still kind
const SKIN = "#E69D74";
const INK = "#181110";
const EYES = [
  { cx: 50.75, outer: -1 },
  { cx: 69.25, outer: 1 },
];
const EYE_Y = 39.6;

export default function Mascot({ pose = "normal", size = 96, idle = false }) {
  const smiling = pose === "happy" || pose === "celebrating";
  const cls = ["mascot", `pose-${pose}`, idle && pose === "normal" ? "idle" : "", pose === "celebrating" ? "celebrating" : ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${MASCOT_NAME}, la mascota`}>
      <g className="m-art">
        <image href={artUrl} width="120" height="120" />
        {EYES.map(({ cx, outer }) => (
          <g key={cx}>
            {smiling && (
              <>
                <circle cx={cx} cy={EYE_Y} r="7.6" fill={SKIN} />
                <path d={`M${cx - 5.2} ${EYE_Y + 1.6} Q${cx} ${EYE_Y - 5.4} ${cx + 5.2} ${EYE_Y + 1.6}`} fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
                <ellipse className="m-cheek" cx={cx + outer * 6.5} cy={EYE_Y + 9.5} rx="3" ry="1.8" fill="#F08A7A" opacity="0.75" />
              </>
            )}
            {pose === "sad" && (
              <path
                d={`M${cx - 7.8} ${EYE_Y - 7.8} H${cx + 7.8} V${EYE_Y - (outer > 0 ? 1.2 : 4.6)} L${cx - 7.8} ${EYE_Y - (outer > 0 ? 4.6 : 1.2)}Z`}
                fill={SKIN}
              />
            )}
            {pose === "sad" && (
              <path d={`M${cx - 6.6} ${EYE_Y - (outer > 0 ? 4.2 : 1.4)} L${cx + 6.6} ${EYE_Y - (outer > 0 ? 1.4 : 4.2)}`} stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
            )}
            {!smiling && (
              <g className="m-lid">
                <circle cx={cx} cy={EYE_Y} r="7.6" fill={SKIN} />
                <path d={`M${cx - 5.4} ${EYE_Y + 0.5} Q${cx} ${EYE_Y + 3.6} ${cx + 5.4} ${EYE_Y + 0.5}`} fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
              </g>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}
