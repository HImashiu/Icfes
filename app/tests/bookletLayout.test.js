import { describe, expect, it } from "vitest";
import { geometry, padPages, paginate, saddleOrder, splitBlocks, splitLongParagraph } from "../src/lib/bookletLayout.js";

const h = (list) => (a) => list[a];
const block = (...chains) => ({ type: "block", chains });

describe("saddleOrder", () => {
  it("puts the first and last page on the outside of the first sheet", () => {
    expect(saddleOrder(8)).toEqual([[7, 0], [1, 6], [5, 2], [3, 4]]);
  });
  it("uses every page once", () => {
    const flat = saddleOrder(16).flat().sort((a, b) => a - b);
    expect(flat).toEqual([...Array(16).keys()]);
  });
  it("refuses a count that does not fold", () => {
    expect(() => saddleOrder(6)).toThrow();
  });
});

describe("padPages", () => {
  it("adds blanks before the back cover", () => {
    expect(padPages(["c", "1", "2", "4", "5", "b"], 4, "x")).toEqual(["c", "1", "2", "4", "5", "x", "x", "b"]);
    expect(padPages(["c", "1", "2", "b"], 4, "x")).toEqual(["c", "1", "2", "b"]);
  });
});

describe("paginate", () => {
  it("starts every area on a new page with its banner", () => {
    const pages = paginate([{ type: "section", name: "A" }, block([0]), { type: "section", name: "B" }, block([1])], h([10, 10]), { colH: 100, bannerH: 10 });
    expect(pages.map((p) => [p.section, p.banner])).toEqual([["A", true], ["B", true]]);
  });
  it("never splits a chain and moves a block to the next column when little room is left", () => {
    const pages = paginate([{ type: "section", name: "A" }, block([0]), block([1, 2])], h([80, 30, 30]), { colH: 100 });
    expect(pages[0].columns).toEqual([[0], [1, 2]]);
  });
  it("lets a block's chains flow when moving it would leave a column half empty", () => {
    const pages = paginate([{ type: "section", name: "A" }, block([0]), block([1], [2, 3])], h([40, 30, 30, 30]), { colH: 100 });
    expect(pages[0].columns).toEqual([[0, 1], [2, 3]]);
  });
  it("fills two columns, then a new page", () => {
    const flow = [{ type: "section", name: "A" }, ...[0, 1, 2, 3, 4].map((i) => block([i]))];
    const pages = paginate(flow, () => 60, { colH: 100 });
    expect(pages.map((p) => p.columns)).toEqual([[[0], [1]], [[2], [3]], [[4], []]]);
  });
  it("flags a piece taller than a column", () => {
    const pages = paginate([block([0])], () => 150, { colH: 100 });
    expect(pages[0].over).toBe(true);
  });
});

describe("geometry", () => {
  it("imposes a folded carta booklet on doble carta, landscape", () => {
    const g = geometry("Carta", "plegado");
    expect(g.sheet.w).toBeCloseTo(431.8);
    expect(g.cols).toBe(2);
  });
  it("uses one column on half-size pages", () => {
    const g = geometry("A4", "pequeno");
    expect(g.page.w).toBe(148);
    expect(g.sheet.w).toBe(297);
    expect(g.cols).toBe(1);
  });
});

describe("text blocks", () => {
  it("splits a passage into its top-level blocks", () => {
    expect(splitBlocks("<p>Uno</p>\n\n<table><tr><td>1</td></tr></table>\n\n<p>Dos</p>").length).toBe(3);
  });
  it("cuts a very long paragraph at sentence ends", () => {
    const long = `<p>${"Una oración bastante larga para la prueba. ".repeat(40)}</p>`;
    const parts = splitLongParagraph(long, 300);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[1]).toContain('data-cont="1"');
  });
});

describe("paginate, oversize chains", () => {
  it("breaks a chain taller than a column between its pieces", () => {
    const pages = paginate([block([0, 1])], h([90, 30]), { colH: 100 });
    expect(pages[0].columns).toEqual([[0], [1]]);
    expect(pages[0].over).toBe(false);
  });
});
