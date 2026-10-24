import { OWL_COLORS as C, OWL_ELLIPSES as EL, OWL_PATHS as P, OWL_VIEWBOX } from "./owlArt.js";
import { MASCOT_NAME } from "../lib/brand.js";

// The owl is Juan's final drawing (2026-10-24), drawn part by part in his own order. Poses move parts, never redraw them:
//   "normal"      blinks; with `idle` he also bobs and his tassel sways
//   "happy"       a correct answer: hop, wing flap, tassel swing, smiling eyes
//   "celebrating" a good result: two hops, flapping wings, smiling eyes, a wiggle
//   "thinking"    a wrong answer, a hint or a low score: head tilt, eyes look up, a wing tap. Kind, never sad.
// "sad" is accepted as an old name for "thinking".
const Ell = ({ e, fill, className }) => <ellipse className={className} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={fill} />;
const at = (x, y) => ({ transformOrigin: `${x}px ${y}px` });

function Eye({ white, pupil }) {
  const { cx, cy } = white;
  return (
    <g className="o-eye">
      <g className="o-eye-open" style={at(cx, cy)}>
        <Ell e={white} fill={C.eye} />
        <path className="o-pupil" d={pupil} fill={C.pupil} />
      </g>
      <g className="o-eye-happy" style={at(cx, cy)}>
        <ellipse cx={cx} cy={cy} rx={white.rx + 6} ry={white.ry + 6} fill={C.face} />
        <path d={`M${cx - 66} ${cy + 24}Q${cx} ${cy - 74} ${cx + 66} ${cy + 24}`} fill="none" stroke={C.pupil} strokeWidth="30" strokeLinecap="round" />
      </g>
    </g>
  );
}

export default function Mascot({ pose = "normal", size = 96, idle = false }) {
  const p = pose === "sad" ? "thinking" : pose;
  const cls = ["mascot", "owl", `pose-${p}`, idle && p === "normal" ? "idle" : ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} width={size} height={size} viewBox={OWL_VIEWBOX} role="img" aria-label={`${MASCOT_NAME}, la mascota`}>
      <g className="o-all" style={at(458, 1231)}>
        <path className="o-wing o-wing-l" d={P.wingL} fill={C.wing} style={at(215, 780)} />
        <path className="o-wing o-wing-r" d={P.wingR} fill={C.wing} style={at(701, 780)} />
        <path d={P.base} fill={C.wing} />
        <path d={P.panelL} fill={C.robe} />
        <path d={P.panelR} fill={C.robe} />
        <path d={P.bib} fill={C.white} />
        <g className="o-head" style={at(458, 790)}>
          <path className="o-board" d={P.board} fill={C.board} />
          <path d={P.hood} fill={C.hood} />
          <path d={P.face} fill={C.face} />
          <g className="o-blush">
            {EL.blush.map((e, i) => <Ell key={i} e={e} fill={C.blush} className="o-cheek" />)}
          </g>
          <Eye white={EL.eyes[0]} pupil={P.pupilL} />
          <Eye white={EL.eyes[1]} pupil={P.pupilR} />
          <path className="o-beak" d={P.beak} fill={C.beak} />
          <path className="o-crown" d={P.crown} fill={C.crown} />
          <g className="o-tassel" style={at(849, 140)}>
            <path d={P.cord} fill={C.tassel} />
            <path d={P.bell} fill={C.tassel} />
          </g>
        </g>
      </g>
    </svg>
  );
}
