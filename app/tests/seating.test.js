import { describe, expect, it } from "vitest";
import { swapSeats, reusePlan, apartViolations, generatePlan, orderForVersion, planMatches, sameVersionNeighbours, versionCounts, versionOfMember } from "../src/lib/seating.js";

const ids = (n) => Array.from({ length: n }, (_, i) => `s${i}`);
const q = (key, section, gid) => ({ key, section, group: gid ? { id: gid } : null });

describe("seating plan", () => {
  it.each([4, 5, 6])("never puts the same version next to each other with %i versions", (versions) => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const plan = generatePlan({ rows: 6, cols: 7, versions, studentIds: ids(34), seed });
      expect(sameVersionNeighbours(plan)).toEqual([]);
      expect(Object.keys(plan.seats)).toHaveLength(34);
    }
  });

  it("respects blocked seats and refuses when there are too many students", () => {
    const plan = generatePlan({ rows: 3, cols: 3, blocked: ["1,1"], studentIds: ids(8), seed: 3 });
    expect(plan.seats["1,1"]).toBeUndefined();
    expect(sameVersionNeighbours(plan)).toEqual([]);
    expect(() => generatePlan({ rows: 3, cols: 3, blocked: ["1,1"], studentIds: ids(9) })).toThrow(/solo 8 puestos/);
  });

  it("keeps pairs apart when the room allows it", () => {
    const apart = [["s0", "s1"], ["s2", "s3"]];
    const plan = generatePlan({ rows: 5, cols: 6, versions: 5, studentIds: ids(20), apart, seed: 11 });
    expect(apartViolations(plan)).toEqual([]);
    expect(sameVersionNeighbours(plan)).toEqual([]);
  });

  it("counts copies per version and detects roster changes", () => {
    const plan = generatePlan({ rows: 4, cols: 4, studentIds: ids(16), seed: 2 });
    expect(versionCounts(plan).reduce((a, b) => a + b, 0)).toBe(16);
    expect(versionOfMember(plan, "s0")).toBeGreaterThanOrEqual(0);
    expect(planMatches(plan, ids(16))).toBe(true);
    expect(planMatches(plan, ids(17))).toBe(false);
  });
});

describe("booklet versions", () => {
  const qs = [q("a", "L"), q("b", "L", "g"), q("c", "L", "g"), q("d", "L"), q("e", "L"), q("f", "M"), q("g", "M"), q("h", "M")];
  it("keeps version A as is, groups together and in order, and areas in place", () => {
    expect(orderForVersion(qs, 0, 7)).toBe(qs);
    for (let v = 1; v < 6; v += 1) {
      const out = orderForVersion(qs, v, 7);
      expect(out.map((x) => x.key).sort()).toEqual(qs.map((x) => x.key).sort());
      const keys = out.map((x) => x.key);
      expect(keys.indexOf("c") - keys.indexOf("b")).toBe(1);
      expect(out.slice(0, 5).every((x) => x.section === "L")).toBe(true);
      expect(orderForVersion(qs, v, 7).map((x) => x.key)).toEqual(keys);
    }
    expect(new Set([1, 2, 3, 4, 5].map((v) => orderForVersion(qs, v, 7).map((x) => x.key).join()))).not.toHaveProperty("size", 1);
  });
});

describe("moving students", () => {
  it("swaps two students or moves one to an empty seat without breaking the version rule", () => {
    const plan = generatePlan({ rows: 3, cols: 4, studentIds: ids(10), seed: 9 });
    const [s1, s2] = Object.keys(plan.seats);
    const swapped = swapSeats(plan, s1, s2);
    expect(swapped.seats[s1]).toBe(plan.seats[s2]);
    expect(swapped.seats[s2]).toBe(plan.seats[s1]);
    const empty = Object.keys(plan.seatVersion).find((s) => !plan.seats[s]);
    const moved = swapSeats(plan, s1, empty);
    expect(moved.seats[s1]).toBeUndefined();
    expect(moved.seats[empty]).toBe(plan.seats[s1]);
    expect(sameVersionNeighbours(moved)).toEqual([]);
    expect(swapSeats(plan, s1, "9,9")).toBe(plan);
  });
  it("reuses a plan with a fresh question order", () => {
    const plan = generatePlan({ rows: 2, cols: 2, studentIds: ids(4), seed: 1, orderSeed: 5 });
    expect(reusePlan(plan, 77)).toMatchObject({ seats: plan.seats, seatVersion: plan.seatVersion, orderSeed: 77 });
  });
});
