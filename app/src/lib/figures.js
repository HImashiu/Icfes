// Figure specs (icfes-figure/1) drawn by the shared renderer in icfes_figures/render.js.
// That file is a UMD module with no imports.
import engine from "../../../icfes_figures/render.js";
import DOMPurify from "dompurify";
const FIGURE_FORMAT = "icfes-figures-specs/1";

// Returns Map: question number (string) -> figure entries. Group-level figures go under "group:<id>".
// Option figures are also keyed by question; their `option` letter tells the caller which choice they belong to.
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
    // A kind "image" figure is a picture (map, photo, geometry) shown as its crop, referenced by src.
    const isImage = fig.kind === "image";
    const errors = isImage || !fig.spec ? [] : engine.validate(fig.spec);
    if (!isImage && !fig.spec) errors.push("no spec");
    const entry = {
      id: fig.id,
      kind: fig.kind,
      spec: errors.length || isImage ? null : fig.spec,
      error: errors.length ? errors.join("; ") : null,
      src: isImage ? fig.spec?.src ?? fig.src ?? null : null,
      fallbackCrop: fig.fallback_crop ?? null,
      fidelity: fig.fidelity ?? "draft",
      target: loc.stem_or_option ?? "stem",
      option: loc.option ?? null,
    };
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), entry]);
  }
  return byKey;
}

// Text that the scan printed inside a passage as chart axis labels, for example "Título eje y1".
// It is only the chart's leftovers, so it is hidden once a native figure replaces the chart.
const AXIS_LEAK = /t[ií]tulo eje/i;
const stripAxisLeaks = (html) => html.replace(/<p>[\s\S]*?<\/p>/g, (p) => (AXIS_LEAK.test(p) ? "" : p));

// Returns the exam with passage leftovers removed from every group that has a native stem figure.
export function prepareExam(exam, figures) {
  if (!figures || figures.size === 0) return exam;
  const cleanGroups = new Set();
  for (const q of exam.questions) {
    const native = (figures.get(q.key) ?? []).some((f) => f.spec && f.target === "stem");
    if (native && q.group) cleanGroups.add(q.group.id);
  }
  if (cleanGroups.size === 0) return exam;
  const groups = new Map();
  for (const q of exam.questions) {
    if (q.group && cleanGroups.has(q.group.id) && !groups.has(q.group.id)) {
      groups.set(q.group.id, { ...q.group, stimulus_md: stripAxisLeaks(q.group.stimulus_md) });
    }
  }
  return {
    ...exam,
    questions: exam.questions.map((q) => {
      if (!q.group || !groups.has(q.group.id)) return q;
      // A question's own stimulus is often a copy of its passage, so it gets the same cleanup.
      return { ...q, group: groups.get(q.group.id), stimulus_md: stripAxisLeaks(q.stimulus_md ?? "") };
    }),
  };
}

// Charts come back as SVG, tables as HTML. Both are sanitized before they reach the page.
export function drawFigure(spec) {
  const markup = engine.render(spec);
  return DOMPurify.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true, html: true } });
}
