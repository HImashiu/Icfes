import { describe, expect, it } from "vitest";
import { alerts, cohortProjection, reinforcementSet, schoolCategory, studentSummaries } from "../src/lib/students.js";

const NOW = new Date("2026-10-17T12:00:00Z").getTime();
const day = (n) => new Date(NOW - n * 864e5).toISOString();
const at = (pid, d, correct, total = 10, mode = "practice") => ({ profile_id: pid, submitted_at: day(d), mode, score: { keyed: true, correct, total, answered: total, perArea: [{ name: "Matemáticas", correct, total }] } });
const m = (id, over = {}) => ({ id, role: "student", profile_id: id, email: `${id}@c.co`, full_name: id, course_id: "c1", ...over });

describe("early-warning alerts", () => {
  const members = [m("drop"), m("gone"), m("low"), m("fine"), m("new", { profile_id: null }), m("silent")];
  const attempts = [
    at("drop", 20, 8), at("drop", 12, 8), at("drop", 2, 3),
    at("gone", 40, 7), at("gone", 30, 7),
    at("low", 5, 2), at("low", 3, 3),
    at("fine", 6, 6), at("fine", 2, 7),
  ];
  const list = alerts(studentSummaries(members, attempts), { now: NOW });
  it("flags drops, inactivity, low averages and people who never entered, most urgent first", () => {
    expect(list.map((a) => [a.name, a.kind])).toEqual([["drop", "drop"], ["low", "low"], ["gone", "inactive"], ["silent", "inactive"], ["new", "never"]]);
    expect(list[0].reason).toMatch(/Bajó 5\d puntos/);
    expect(list[0].area).toMatch(/Matemáticas/);
    expect(list.find((a) => a.name === "gone").reason).toMatch(/hace 30 días/);
  });
  it("does not flag students who are doing fine", () => {
    expect(list.some((a) => a.name === "fine")).toBe(false);
  });
});

describe("reinforcement set", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), competencia: i < 6 ? "Razonamiento" : "Interpretación", hasKey: true }));
  const key = new Map(items.map((i) => [i.key, "A"]));
  it("retries missed questions of the weakest competencies and adds unseen ones", () => {
    const attempt = { submitted_at: day(1), answers: { 1: "B", 2: "B", 3: "B", 4: "A", 7: "A", 8: "A", 9: "A" } };
    const r = reinforcementSet(items, key, [attempt], { size: 5 });
    expect(r.competencias).toEqual(["Razonamiento", "Interpretación"]);
    expect(r.keys.slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(r.keys).toHaveLength(5);
  });
  it("returns nothing when there is not enough evidence", () => {
    expect(reinforcementSet(items, key, [{ answers: { 1: "B" } }]).keys).toEqual([]);
  });
});

describe("school category", () => {
  it("maps the mean band to a category and the distance to the next one", () => {
    expect(schoolCategory(305)).toEqual({ id: "A", toNext: 25, next: "A+" });
    expect(schoolCategory(350)).toEqual({ id: "A+", toNext: 0, next: null });
    expect(schoolCategory(null)).toBeNull();
  });
  it("projects a cohort from the latest timed band of each student", () => {
    const s = [{ band: { global: 300 } }, { band: { global: 260 } }, { band: null }];
    expect(cohortProjection(s)).toEqual({ n: 2, mean: 280, category: { id: "B", toNext: 20, next: "A" } });
  });
});
