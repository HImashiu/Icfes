import { describe, expect, it } from "vitest";
import { drawFigure, parseFigureSpecs, prepareExam } from "../src/lib/figures.js";
import { parseExam } from "../src/lib/exam.js";
import tiny from "./fixtures/tiny.golden.json";

// Made-up spec, not exam content.
const bar = {
  kind: "bar", title: "Ventas",
  categories: ["Enero", "Febrero"],
  series: [{ name: "Agua", values: [5, 7] }],
  x: { label: "Mes" },
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

describe("option figures and passage cleanup", () => {
  it("keys option figures by letter", () => {
    const map = parseFigureSpecs({
      format: "icfes-figures-specs/1",
      figures: [{ id: "o-a", kind: "bar", spec: bar, location: { question: 2, stem_or_option: "option", option: "A" } }],
    });
    expect(map.get("2")[0]).toMatchObject({ target: "option", option: "A" });
  });

  it("removes axis-label leftovers from a passage once a native figure replaces the chart", () => {
    const exam = parseExam({
      ...tiny,
      groups: [{ id: "g1-2", from: 1, to: 2, directions: "d", stimulus_md: "<p>Texto real.</p><p>250 14 Titulo eje y1 Título eje y2 0</p>", crop: null }],
    });
    const figures = parseFigureSpecs({
      format: "icfes-figures-specs/1",
      figures: [{ id: "f1", kind: "bar", spec: bar, location: { question: 1, stem_or_option: "stem" } }],
    });
    const prepared = prepareExam(exam, figures);
    const stim = prepared.questions[0].group.stimulus_md;
    expect(stim).toContain("Texto real.");
    expect(stim).not.toMatch(/eje y/i);
    // The original exam object is left unchanged.
    expect(exam.questions[0].group.stimulus_md).toMatch(/eje y/i);
  });

  it("leaves passages alone when no native figure exists", () => {
    const exam = parseExam(tiny);
    expect(prepareExam(exam, new Map())).toBe(exam);
  });
});

describe("image figures", () => {
  it("keeps the src of an image figure without treating it as an error", () => {
    const map = parseFigureSpecs({
      format: "icfes-figures-specs/1",
      figures: [{ id: "img", kind: "image", src: "crops/S11-O_2da/q033.png", location: { question: 33 } }],
    });
    expect(map.get("33")[0]).toMatchObject({ kind: "image", src: "crops/S11-O_2da/q033.png", error: null, spec: null });
  });
});
