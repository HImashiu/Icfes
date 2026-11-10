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

  it("keeps **bold** when money $ signs sit in two different paragraphs", () => {
    const html = renderRich("<p>**Paso 2.** Tasa de ($200.000).</p>\n\n<p>**Paso 3.** Pago extra ($100.000) por metro.</p>");
    expect(html).not.toContain("**");
    expect(html).toContain("<strong>Paso 3.</strong>");
  });

  it("draws an example box that was written over several lines as one box", () => {
    const html = renderRich("<p>Places</p>\n\n[[ejemplo:C|0.\n\na container for liquids.]]\n\n<p>85. next</p>");
    expect(html).not.toContain("[[");
    expect(html).toContain("0. a container for liquids.");
    expect(html).not.toContain("0. 0.");
  });
});
