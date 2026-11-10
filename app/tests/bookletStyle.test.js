import { describe, expect, it } from "vitest";
import { geometry, padPages, paginate } from "../src/lib/bookletLayout.js";
import { DEFAULT_STYLE, PRESETS, cleanStyle, presetOf, sidesFor } from "../src/lib/bookletStyle.js";
import { optionAcross } from "../src/components/print/bookletFlow.jsx";

const h = (list) => (a) => list[a];
const block = (...chains) => ({ type: "block", chains });

describe("cleanStyle", () => {
  it("fills defaults and drops junk", () => {
    expect(cleanStyle({ size: "Tabloide", fontSize: 99, junk: 1 })).toEqual(DEFAULT_STYLE);
  });
  it("cannot fold oficio (there is no double oficio sheet)", () => {
    expect(cleanStyle({ size: "Oficio", binding: "plegado" }).binding).toBe("sueltas");
  });
  it("forces both sides on a folded booklet", () => {
    expect(cleanStyle({ binding: "plegado", sides: "simplex" }).sides).toBe("duplex");
  });
  it("clamps custom margins", () => {
    expect(cleanStyle({ margins: "custom", custom: { top: 2, bottom: 90, inner: "15", outer: "x" } }).custom).toEqual({ top: 6, bottom: 40, inner: 15, outer: 14 });
  });
  it("every preset is a valid style that is recognised again", () => {
    for (const p of PRESETS) expect(presetOf(cleanStyle({ ...DEFAULT_STYLE, ...p.style }))).toBe(p.id);
  });
});

describe("geometry with a style", () => {
  it("keeps the old (size, binding) call", () => {
    expect(geometry("A4", "plegado").sheet).toEqual({ w: 420, h: 297 });
  });
  it("prints oficio pages", () => {
    const g = geometry({ size: "Oficio" });
    expect(g.page.h).toBeCloseTo(330.2);
    expect(g.duplex).toBe(true);
  });
  it("one-sided loose pages are not duplex", () => {
    expect(geometry({ sides: "simplex" }).duplex).toBe(false);
  });
  it("narrow margins give a taller body, one column a wider one", () => {
    expect(geometry({ margins: "estrecho" }).bodyH).toBeGreaterThan(geometry({}).bodyH);
    const one = geometry({ cols: 1 });
    expect(one.cols).toBe(1);
    expect(one.colW).toBe(one.bodyW);
  });
  it("custom margins are used as given, with room for the running head", () => {
    const g = geometry({ margins: "custom", custom: { top: 8, bottom: 8, inner: 20, outer: 10 } });
    expect(g.margins).toEqual({ top: 12, bottom: 12, inner: 20, outer: 10 });
  });
});

describe("paginate options", () => {
  it("lets an area follow in the same column under its heading when areaBreak is flow", () => {
    const flow = [{ type: "section", name: "A", head: 9 }, block([0]), { type: "section", name: "B", head: 8 }, block([1])];
    const pages = paginate(flow, h([10, 10, 0, 0, 0, 0, 0, 0, 5, 5]), { colH: 100, bannerH: 10, areaBreak: "flow" });
    expect(pages).toHaveLength(1);
    expect(pages[0].columns[0]).toEqual([0, 8, 1]);
  });
  it("gives the first page less room when the cover is a header", () => {
    const flow = [{ type: "section", name: "A" }, block([0]), block([1])];
    const pages = paginate(flow, h([40, 40]), { colH: 100, cols: 1, firstH: 30 });
    expect(pages).toHaveLength(2);
  });
});

describe("padPages without a back cover", () => {
  it("adds the blanks at the end", () => {
    expect(padPages(["1", "2", "3"], 4, "x", false)).toEqual(["1", "2", "3", "x"]);
  });
});

describe("sidesFor (printing one side at a time)", () => {
  it("splits fronts and backs", () => {
    expect(sidesFor(5, "front", true)).toEqual([0, 2, 4]);
    expect(sidesFor(5, "back", true)).toEqual([1, 3]);
    expect(sidesFor(3, "back", false)).toEqual([0, 1, 2]);
  });
});

describe("optionAcross", () => {
  const opts = (...t) => t.map((text_md, i) => ({ letter: "ABCD"[i], text_md }));
  it("puts numbers four across, short words two across, sentences in a list", () => {
    expect(optionAcross(opts("12", "15", "18", "21"), 85)).toBe(4);
    expect(optionAcross(opts("la fotosíntesis", "la respiración", "la digestión", "la excreción"), 85)).toBe(2);
    expect(optionAcross(opts("Porque el autor quiere mostrar que la ciudad cambió mucho con los años.", "b", "c", "d"), 85)).toBe(1);
  });
  it("keeps math and tables in a list", () => {
    expect(optionAcross(opts("$x^2$", "2", "3", "4"), 85)).toBe(1);
  });
});
