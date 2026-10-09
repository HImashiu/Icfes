import { describe, expect, it } from "vitest";
import { parseFigureSpecs } from "../src/lib/figures.js";
import { drawFigure } from "../src/lib/figures.js";

// Made-up spec, not exam content.
const bar = {
  kind: "bar", title: "Ventas",
  categories: ["Enero", "Febrero"],
  series: [{ name: "Agua", values: [5, 7] }],
  y: { label: "Unidades", min: 0, max: 10, step: 2 },
};

describe("parseFigureSpecs", () => {
  it("indexes valid specs by question number", () => {
    const map = parseFigureSpecs({
      format: "icfes-figures-specs/1",
      figures: [{ id: "f1", kind: "bar", spec: bar, fidelity: "verified", location: { question: 7, stem_or_option: "stem" } }],
    });
    expect(map.get("7")[0]).toMatchObject({ id: "f1", error: null, spec: bar });
  });

  it("keeps an invalid spec with its error so the crop can be used instead", () => {
    const map = parseFigureSpecs({
      format: "icfes-figures-specs/1",
      figures: [{ id: "bad", kind: "bar", spec: { ...bar, series: [{ values: [1] }] }, fallback_crop: "crops/x.png", location: { question: 3 } }],
    });
    const [entry] = map.get("3");
    expect(entry.spec).toBeNull();
    expect(entry.error).toMatch(/one entry per category/);
    expect(entry.fallbackCrop).toBe("crops/x.png");
  });

  it("returns an empty map when there is no file", () => {
    expect(parseFigureSpecs(null).size).toBe(0);
  });

  it("rejects another format", () => {
    expect(() => parseFigureSpecs({ format: "nope", figures: [] })).toThrow();
  });
});

describe("drawFigure", () => {
  it("draws a bar chart as sanitized SVG", () => {
    const svg = drawFigure(bar);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Enero");
    expect(svg).not.toContain("<script");
  });
});
