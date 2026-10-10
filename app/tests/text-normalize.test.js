import { describe, expect, it } from "vitest";
import { isMathSpan, normalizeField } from "../src/lib/text-normalize.js";
import { renderRich } from "../src/lib/render.js";

describe("normalizeField", () => {
  it("converts pipe tables to a table with a head and rows", () => {
    const counts = {};
    const out = normalizeField("Antes\n\n| Producto | Costo |\n|---|---|\n| Botas | $30.000 |\n\nDespués", { counts });
    expect(out).toContain('<table class="exam-table"><thead><tr><th>Producto</th><th>Costo</th></tr></thead>');
    expect(out).toContain("<td>Botas</td>");
    expect(counts.tables).toBe(1);
  });

  it("removes heading marks, escapes, key marks and a leading dot", () => {
    const counts = {};
    const out = normalizeField("#### Considere 1\\. ☒ texto\n· respuesta", { counts });
    expect(out).toBe("Considere 1. texto\nrespuesta");
    expect(counts).toMatchObject({ headings_removed: 1, escapes_removed: 1, key_marks_removed: 1, leading_dots_removed: 1 });
  });

  it("drops a leaked question number from the start of a stem", () => {
    expect(normalizeField("53 de acuerdo con el texto", { number: 53, leadingNumber: true })).toBe("de acuerdo con el texto");
  });

  it("converts single-asterisk italics and leaves bold alone", () => {
    expect(normalizeField("El término *moral* y **NO**")).toBe("El término <em>moral</em> y **NO**");
  });

  it("does not change TeX inside $...$", () => {
    expect(normalizeField("valor $\\frac{4.000}{3}\\pi$ y *x*")).toBe("valor $\\frac{4.000}{3}\\pi$ y <em>x</em>");
  });
});

describe("isMathSpan", () => {
  it("treats money as text and real TeX as math", () => {
    expect(isMathSpan("200.000 para cancelarlo")).toBe(false);
    expect(isMathSpan("3.210.000 / 12 = ")).toBe(false);
    expect(isMathSpan("y")).toBe(true);
    expect(isMathSpan("\\frac{1}{2}")).toBe(true);
  });
});

describe("renderRich currency", () => {
  it("keeps prices as plain text instead of italic letters", () => {
    const html = renderRich("un préstamo de $200.000, para cancelarlo en 5 pagos. Cada mes abona $40.000");
    expect(html).not.toContain("katex");
    expect(html).toContain("$200.000");
    expect(html).toContain("$40.000");
  });
});
