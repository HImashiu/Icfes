// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { checkRendered, leftoverIssues } from "../src/lib/reviewChecks.js";

const html = (s) => { const d = document.createElement("div"); d.innerHTML = s; document.body.append(d); return d; };
const opts = (texts) => `<ul class="options">${texts.map((t, i) => `<li><button class="option"><span class="letter-tile">${"ABCD"[i]}</span><span class="option-text">${t}</span></button></li>`).join("")}</ul>`;

describe("leftoverIssues", () => {
  it("finds markup the page should have converted", () => {
    expect(leftoverIssues("Figura **1**")).toContain("negritas «**» sin convertir");
    expect(leftoverIssues("ver [[figura:q1-a]]")).toContain("marca [[figura:…]] sin resolver");
    expect(leftoverIssues("x = \\frac{1}{2}")).toContain("comando LaTeX visible");
    expect(leftoverIssues("Guitarra $130.000 y Batería $150.000")).toEqual([]);
    expect(leftoverIssues("vale $x^2 + 1$ aquí")).toContain("fórmula $…$ sin dibujar");
    expect(leftoverIssues("Texto normal con 20.000 kW y 5 % de interés.")).toEqual([]);
  });
});

describe("checkRendered", () => {
  it("passes a clean question", () => {
    const root = html(`<div><p class="stem">¿Cuánto es 2 + 2?</p>${opts(["1", "2", "3", "4"])}</div>`);
    expect(checkRendered(root, { expected_options: 4, stem_md: "x", options: [{}, {}, {}, {}] })).toEqual([]);
  });
  it("reports an empty option, a wrong count and leftover bold markers", () => {
    const root = html(`<div><p class="stem">Lea **esto**</p>${opts(["uno", "", "tres"])}</div>`);
    const codes = checkRendered(root, { expected_options: 4, stem_md: "x", options: [] }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["leftover", "options-count", "option-empty"]));
  });
  it("reports a broken picture", () => {
    const root = html(`<div><p class="stem">x</p><img src="nope.png">${opts(["a", "b", "c", "d"])}</div>`);
    const img = root.querySelector("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    expect(checkRendered(root, { expected_options: 4, stem_md: "x", options: [] }).map((i) => i.code)).toContain("img-broken");
  });
});
