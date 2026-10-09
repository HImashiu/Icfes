// Figure specs (icfes-figure/1) drawn by the shared renderer in icfes_figures/render.js.
// That file is a UMD module with no imports.
import engine from "../../../icfes_figures/render.js";
import DOMPurify from "dompurify";
const FIGURE_FORMAT = "icfes-figures-specs/1";

// Returns Map: question number (string) -> figure entries. Group-level figures go under "group:<id>".
// Entries whose spec fails validation are kept with `error` set, so the caller can fall back to the crop.
export function parseFigureSpecs(raw) {
  const byKey = new Map();
  if (!raw) return byKey;
  if (raw.format !== FIGURE_FORMAT) throw new Error(`Expected format ${FIGURE_FORMAT}`);
  for (const fig of raw.figures ?? []) {
    const loc = fig.location ?? {};
    const keys = [];
    if (loc.question != null) keys.push(String(loc.question));
    if (loc.group) keys.push(`group:${loc.group}`);
    const errors = fig.spec ? engine.validate(fig.spec) : ["no spec"];
    const entry = {
      id: fig.id,
      kind: fig.kind,
      spec: errors.length ? null : fig.spec,
      error: errors.length ? errors.join("; ") : null,
      fallbackCrop: fig.fallback_crop ?? null,
      fidelity: fig.fidelity ?? "draft",
      target: loc.stem_or_option ?? "stem",
    };
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), entry]);
  }
  return byKey;
}

// Charts come back as SVG, tables as HTML. Both are sanitized before they reach the page.
export function drawFigure(spec) {
  const markup = engine.render(spec);
  return DOMPurify.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true, html: true } });
}
