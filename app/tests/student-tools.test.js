import { describe, expect, it } from "vitest";
import { cleanGlossary, findTerms } from "../src/lib/glossary.js";
import { moveArea, normalizeOrder, orderQuestions } from "../src/lib/order.js";
import { missedKeys, pendingMisses, repechajeKeys } from "../src/lib/repechaje.js";
import { paceOf, timeSummary } from "../src/lib/timing.js";
import { locate, mergeItems, visible } from "../src/lib/annotations.js";
import { questionsForAttempt } from "../src/lib/assignments.js";

const q = (n, section) => ({ key: String(n), number: n, section });

describe("area order", () => {
  it("keeps booklet order inside each area and moves areas", () => {
    const qs = [q(1, "A"), q(2, "B"), q(3, "A"), q(4, "C")];
    expect(orderQuestions(qs, ["C", "A", "B"]).map((x) => x.number)).toEqual([4, 1, 3, 2]);
    expect(moveArea(["A", "B", "C"], 2, -1)).toEqual(["A", "C", "B"]);
    expect(normalizeOrder(["C", "X"], ["A", "B", "C"])).toEqual(["C", "A", "B"]);
  });
  it("applies to full-scope attempts only", () => {
    const exam = { questions: [q(1, "A"), q(2, "B")], sections: [{ name: "A", questions: [q(1, "A")] }, { name: "B", questions: [q(2, "B")] }] };
    expect(questionsForAttempt(exam, { scope: "all", order: ["B", "A"] }).map((x) => x.number)).toEqual([2, 1]);
    expect(questionsForAttempt(exam, { scope: "A", order: ["B", "A"] }).map((x) => x.number)).toEqual([1]);
  });
});

describe("repechaje", () => {
  const key = new Map([["1", "A"], ["2", "B"], ["3", "C"]]);
  it("finds misses; blanks count only when timed", () => {
    const qs = [q(1), q(2), q(3)];
    expect(missedKeys(qs, { 1: "A", 2: "C" }, key, "practice")).toEqual(["2"]);
    expect(missedKeys(qs, { 1: "A", 2: "C" }, key, "timed")).toEqual(["2", "3"]);
  });
  it("a later right answer clears a miss", () => {
    const h = [
      { at: 1, snapshot: { slug: "s" }, missed: ["1", "2"], right: [] },
      { at: 2, snapshot: { slug: "s" }, missed: [], right: ["1"] },
      { at: 3, snapshot: { slug: "other" }, missed: ["9"], right: [] },
    ];
    expect(pendingMisses(h, "s")).toEqual(["2"]);
    expect(repechajeKeys(["10", "2", "1"], 2)).toEqual(["1", "2"]);
  });
});

describe("glossary", () => {
  it("matches whole words ignoring case and accents, longest first", () => {
    const g = cleanGlossary([{ term: "global", def: "x" }, { term: "Calentamiento global", def: "y" }, { term: "", def: "z" }]);
    expect(g.map((x) => x.term)).toEqual(["Calentamiento global", "global"]);
    const hits = findTerms("El calentamiento Global y globalización", g);
    expect(hits).toHaveLength(1);
    expect([hits[0].start, hits[0].end]).toEqual([3, 23]);
  });
});

describe("time per question", () => {
  it("summarizes and flags pace", () => {
    const s = timeSummary([q(1, "A"), q(2, "A"), q(3, "B")], { 1: 10, 2: 50, 3: 20 });
    expect(s.total).toBe(80);
    expect(s.slowest[0].number).toBe(2);
    expect(s.perArea.find((a) => a.name === "A").avg).toBe(30);
    expect(paceOf(60, 20)).toBe("slow");
    expect(paceOf(5, 20)).toBe("fast");
  });
});

describe("annotations", () => {
  it("merges by newest, keeps deletions, relocates text", () => {
    const merged = mergeItems([{ id: "a", at: 1, note: "old" }, { id: "b", at: 5 }], [{ id: "a", at: 3, note: "new" }, { id: "b", at: 6, gone: true }]);
    expect(merged.find((i) => i.id === "a").note).toBe("new");
    expect(visible(merged).map((i) => i.id)).toEqual(["a"]);
    expect(locate("hola mundo bello", { start: 0, end: 3, text: "mundo" })).toEqual([5, 10]);
  });
});
