import { describe, expect, it } from "vitest";
import { firstTries, seenBefore } from "../src/lib/firstTry.js";
import { practiceInsights } from "../src/lib/student.js";
import { simulacros } from "../src/lib/simulacro.js";
import { activityEstimate } from "../src/lib/saber11.js";

const row = (id, at, slug, right, missed, area = "Matemáticas", extra = {}) => ({
  id, at, mode: "practice", keyed: true, right, missed, total: right.length + missed.length, answered: right.length + missed.length, xp: 0,
  perArea: [{ name: area, correct: right.length, answered: right.length + missed.length, total: right.length + missed.length }],
  snapshot: { slug, scope: area }, ...extra,
});
const ks = (a, b) => Array.from({ length: b - a }, (_, i) => String(a + i));

describe("first tries only", () => {
  it("marks an attempt on questions already answered as a repeat", () => {
    const h = [row("1", 1, "S11-A_1ra", ks(1, 6), ks(6, 21)), row("2", 2, "S11-A_1ra", ks(1, 21), [])];
    const m = firstTries(h);
    expect(m.get(h[0]).first).toBe(true);
    expect(m.get(h[1]).first).toBe(false);
    expect(seenBefore(h, "S11-A_1ra", ks(1, 21), 2)).toBe(1);
  });

  it("repeating questions does not raise the analysis by area", () => {
    const base = [row("1", 1, "S11-A_1ra", ks(1, 21), ks(21, 51))];
    const again = [...base, row("2", 2, "S11-A_1ra", ks(1, 51), [])];
    expect(practiceInsights(again).areas[0].pct).toBe(practiceInsights(base).areas[0].pct);
    expect(practiceInsights(again).repeats).toBe(1);
  });

  it("shows an area's share only with enough new questions", () => {
    const few = practiceInsights([row("1", 1, "S11-A_1ra", ks(1, 6), ks(6, 11))]);
    expect(few.areas[0].enough).toBe(false);
    expect(few.weakest).toBeNull();
    expect(few.pct).toBeNull();
  });

  it("a redone session does not make a new simulacro score", () => {
    const sess = (id, at, slug, right) => ({ id, at, mode: "timed", keyed: true, total: 10, answered: 10, right, missed: [], perArea: [{ name: "Matemáticas", correct: right.length, total: 10 }], snapshot: { slug, scope: "all" } });
    const s = simulacros([sess("1", 1, "S11-A_1ra", ks(1, 5)), sess("2", 2, "S11-A_2da", ks(1, 5)), sess("3", 3, "S11-A_1ra", ks(1, 11))]);
    expect(s.length).toBe(1);
    expect(s[0].complete).toBe(true);
  });
});

describe("activity estimate", () => {
  const qs = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), section: "Matemáticas", options: [1, 2, 3, 4] }));
  const key = new Map(qs.map((q) => [q.key, "A"]));
  it("scores one activity per test, without a global unless asked", () => {
    const answers = Object.fromEntries(qs.slice(0, 9).map((q) => [q.key, "A"]));
    const r = activityEstimate(qs, answers, key, { mode: "practice" });
    expect(r.areas[0].total).toBe(9);
    expect(r.areas[0].scale).toBe(100);
    expect(r.global).toBeNull();
    const timed = activityEstimate(qs, answers, key, { mode: "timed", withGlobal: true });
    expect(timed.areas[0].total).toBe(12);
    expect(timed.global).not.toBeNull();
  });
  it("gives no ICFES score with too few questions", () => {
    const r = activityEstimate(qs.slice(0, 5), { 1: "A" }, key, { mode: "timed" });
    expect(r.areas).toEqual([]);
  });
});
