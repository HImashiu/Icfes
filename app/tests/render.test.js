import { describe, expect, it } from "vitest";
import { renderRich } from "../src/lib/render.js";

describe("renderRich", () => {
  it("turns $...$ into KaTeX markup", () => {
    const html = renderRich("<p>Valor $x^2$</p>");
    expect(html).toContain("katex");
    expect(html).not.toContain("$x^2$");
  });

  it("drops exam pictures and markdown image references (figures come from specs)", () => {
    const html = renderRich('<p>Mire</p><img alt="Figura 3" src="IMG:f3.png"> ![Figure 8.1](figure:p0008.png)');
    expect(html).toContain("Mire");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("figure:");
    expect(html).not.toContain("figure-slot");
  });

  it("removes scripts and event handlers", () => {
    const html = renderRich('<p onclick="x()">hola</p><script>alert(1)</script>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("returns an empty string for missing input", () => {
    expect(renderRich(null)).toBe("");
  });
});
