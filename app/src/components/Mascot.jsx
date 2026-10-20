import { OWL_COLORS as C, OWL_ELLIPSES as EL, OWL_PATHS as P, OWL_VIEWBOX } from "./owlArt.js";
import { MASCOT_NAME } from "../lib/brand.js";

// The owl, traced from Juan's drawing (2026-10-20). Each part is its own shape, so poses move parts, never redraw them:
//   "normal"      blinks; with `idle` he also bobs and his tassel sways
//   "happy"       a correct answer: hop, wing flap, tassel swing, smiling eyes
//   "celebrating" a good result: two hops, flapping wings, smiling eyes, a wiggle
//   "thinking"    a wrong answer, a hint or a low score: head tilt, eyes look up, a wing to the chin. Kind, never sad.
// "sad" is accepted as an old name for "thinking".
const Ell = ({ e, fill, className }) => (
  <ellipse className={className} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={fill} transform={e.rot ? `rotate(${e.rot} ${e.cx} ${e.cy})` : undefined} />
);
const at = (x, y) => ({ transformOrigin: `${x}px ${y}px` });

function Eye({ eye }) {
  const { white, pupil, shine } = eye;
  const { cx, cy } = white;
  return (
    <g className="o-eye">
      <g className="o-eye-open" style={at(cx, cy)}>
        <Ell e={white} fill={C.white} />
        <g className="o-pupil">
          <Ell e={pupil} fill={C.hood} />
          <Ell e={shine} fill={C.white} />
        </g>
      </g>
      <g className="o-eye-happy" style={at(cx, cy)}>
        <ellipse cx={cx} cy={cy} rx={white.rx + 0.5} ry={white.ry + 0.5} fill={C.face} />
        <path d={`M${cx - 6.6} ${cy + 2.4}Q${cx} ${cy - 7.4} ${cx + 6.6} ${cy + 2.4}`} fill="none" stroke={C.hood} strokeWidth="3.2" strokeLinecap="round" />
      </g>
    </g>
  );
}

export default function Mascot({ pose = "normal", size = 96, idle = false }) {
  const p = pose === "sad" ? "thinking" : pose;
  const cls = ["mascot", "owl", `pose-${p}`, idle && p === "normal" ? "idle" : ""].filter(Boolean).join(" ");
  return (
    <svg className={cls} width={size} height={size} viewBox={OWL_VIEWBOX} role="img" aria-label={`${MASCOT_NAME}, la mascota`}>
      <g className="o-all" style={at(72, 133)}>
        <path d={P.base} fill={C.wing} />
        <path className="o-wing o-wing-l" d={P.wingL} fill={C.wing} style={at(44, 89)} />
        <path className="o-wing o-wing-r" d={P.wingR} fill={C.wing} style={at(100, 89)} />
        <path d={P.panelL} fill={C.robe} />
        <path d={P.panelR} fill={C.robe} />
        <path d={P.bib} fill={C.white} />
        <g className="o-head" style={at(72, 92)}>
          <path d={P.hood} fill={C.hood} />
          <path d={P.face} fill={C.face} />
          <g className="o-blush">
            {EL.blush.map((e, i) => <Ell key={i} e={e} fill={C.blush} className="o-cheek" />)}
          </g>
          {EL.eyes.map((eye, i) => <Eye key={i} eye={eye} />)}
          <g className="o-beak">
            <path d={P.beak} fill={C.beak} />
            <path d={P.crease} fill={C.hood} />
          </g>
          <g className="o-cap" style={at(72, 40)}>
            <path d={P.board} fill={C.board} />
            <path d={P.crown} fill={C.crown} />
            <g className="o-tassel" style={at(111, 24)}>
              <path d={P.cord} fill={C.tassel} />
              <Ell e={EL.knot} fill={C.tassel} />
              <path d={P.bell} fill={C.tassel} />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
