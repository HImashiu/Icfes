// Inline SVGs of Juan's owl (src/components/owlArt.js) for the static site, so the site's CSS can move its parts.
//   owlPeek()       head only, cut under the eyes: peeks over the sample question card
//   owlFull(cls)    the whole owl, parts classed for CSS poses (ow-wing-l/-r, ow-head, ow-eyes, ow-pupils, ow-happy, ow-tassel)
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export async function owlBuilders(appRoot) {
  const owl = await import(pathToFileURL(join(appRoot, "src", "components", "owlArt.js")).href);
  const { OWL_PATHS: P, OWL_ELLIPSES: E, OWL_COLORS: C, OWL_VIEWBOX } = owl;
  const ell = (e, fill) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${fill}"/>`;
  const arc = (e) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx + 6}" ry="${e.ry + 6}" fill="${C.face}"/><path d="M${e.cx - 66} ${e.cy + 24}Q${e.cx} ${e.cy - 74} ${e.cx + 66} ${e.cy + 24}" fill="none" stroke="${C.pupil}" stroke-width="30" stroke-linecap="round"/>`;
  const at = (x, y) => `style="transform-origin:${x}px ${y}px"`;

  function owlPeek() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 -14 900 704" focusable="false">`
      + `<path d="${P.board}" fill="${C.board}"/><path d="${P.hood}" fill="${C.hood}"/><path d="${P.face}" fill="${C.face}"/>`
      + E.blush.map((e) => ell(e, C.blush)).join("")
      + `<g class="pk-eyes"><g class="pk-open">${E.eyes.map((e) => ell(e, C.eye)).join("")}<g class="pk-pupils"><path d="${P.pupilL}" fill="${C.pupil}"/><path d="${P.pupilR}" fill="${C.pupil}"/></g></g>`
      + `<g class="pk-happy">${E.eyes.map(arc).join("")}</g></g>`
      + `<path d="${P.beak}" fill="${C.beak}"/><path d="${P.crown}" fill="${C.crown}"/>`
      + `<g class="pk-tassel"><path d="${P.cord}" fill="${C.tassel}"/><path d="${P.bell}" fill="${C.tassel}"/></g></svg>`;
  }

  function owlFull(cls = "") {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="ow ${cls}" viewBox="${OWL_VIEWBOX}" focusable="false" aria-hidden="true">`
      + `<g class="ow-all" ${at(458, 1231)}>`
      + `<path class="ow-wing-l" d="${P.wingL}" fill="${C.wing}" ${at(215, 780)}/>`
      + `<path class="ow-wing-r" d="${P.wingR}" fill="${C.wing}" ${at(701, 780)}/>`
      + `<path d="${P.base}" fill="${C.wing}"/><path d="${P.panelL}" fill="${C.robe}"/><path d="${P.panelR}" fill="${C.robe}"/><path d="${P.bib}" fill="${C.white}"/>`
      + `<g class="ow-head" ${at(458, 790)}>`
      + `<path d="${P.board}" fill="${C.board}"/><path d="${P.hood}" fill="${C.hood}"/><path d="${P.face}" fill="${C.face}"/>`
      + E.blush.map((e) => ell(e, C.blush)).join("")
      + `<g class="ow-eyes" ${at(458, 532)}><g class="ow-open">${E.eyes.map((e) => ell(e, C.eye)).join("")}<g class="ow-pupils"><path d="${P.pupilL}" fill="${C.pupil}"/><path d="${P.pupilR}" fill="${C.pupil}"/></g></g>`
      + `<g class="ow-happy">${E.eyes.map(arc).join("")}</g></g>`
      + `<path d="${P.beak}" fill="${C.beak}"/><path d="${P.crown}" fill="${C.crown}"/>`
      + `<g class="ow-tassel" ${at(849, 140)}><path d="${P.cord}" fill="${C.tassel}"/><path d="${P.bell}" fill="${C.tassel}"/></g>`
      + `</g></g></svg>`;
  }

  // Replaces <!--OWL_PEEK--> and every <!--OWL_FULL--> / <!--OWL_FULL:class names--> in a page.
  const fillOwls = (text) => text
    .replace("<!--OWL_PEEK-->", owlPeek())
    .replace(/<!--OWL_FULL(?::([a-z0-9 _-]+))?-->/g, (m, cls) => owlFull(cls ?? ""));

  return { owlPeek, owlFull, fillOwls };
}
