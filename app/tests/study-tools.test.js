import { describe, expect, it } from "vitest";
import { causeSummary, filterNotebook, notebook, practiceGroups } from "../src/lib/errors.js";
import { areaRotation, phaseOf, weekPlan } from "../src/lib/studyPlan.js";
import { matching, pickKeys, questionHistory } from "../src/lib/customPractice.js";

const h = (at, missed, right, answers = {}, extra = {}) => ({ at, missed, right, title: "S11-A", snapshot: { slug: "A", answers, flags: {} }, ...extra });

describe("error notebook", () => {
  it("keeps each miss once, counts repeats and marks it recovered after a later right answer", () => {
    const list = notebook([h(1, ["3", "5"], [], { 3: "A" }), h(2, ["3"], ["5"]), h(3, [], ["9"])], { "A|3": { cause: "two" } });
    expect(list.map((e) => [e.key, e.times, e.recovered])).toEqual([["3", 2, false], ["5", 1, true]]);
    expect(list[0]).toMatchObject({ cause: "two", chosen: "A" });
    expect(filterNotebook(list, { area: "", cause: "", state: "pending" }).map((e) => e.key)).toEqual(["3"]);
    expect(causeSummary(list)).toMatchObject({ pending: 1, recovered: 1, untagged: 0, main: { id: "two" } });
    expect(practiceGroups(list)).toEqual([{ slug: "A", title: "S11-A", keys: ["3"] }]);
  });
});

describe("study plan", () => {
  it("picks the phase from the days left and gives the weakest area the most days", () => {
    expect([phaseOf(null), phaseOf(120), phaseOf(60), phaseOf(10)]).toEqual(["open", "base", "intensive", "final"]);
    const rot = areaRotation([{ name: "Matemáticas", pct: 20 }, { name: "Inglés", pct: 90 }]);
    expect(rot.filter((a) => a === "Matemáticas").length).toBe(3);
    expect(rot.filter((a) => a === "Inglés").length).toBe(1);
    const now = new Date(2026, 9, 21, 12).getTime(); // a Wednesday
    const plan = weekPlan({ goal: { dailyXp: 150 }, insights: { areas: [] }, history: [{ at: new Date(2026, 9, 19, 9).getTime(), perArea: ["Matemáticas", "Lectura crítica", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"].map((name) => ({ name, answered: 5 })) }], now, daysLeft: 120 });
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0]).toMatchObject({ kind: "area", done: true, questions: 15 });
    expect(plan.today.today).toBe(true);
    expect(plan.phase).toBe("base");
  });
});

describe("custom practice", () => {
  const items = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), number: n, section: n < 4 ? "Matemáticas" : "Lectura", hasKey: true, competencia: "X", dificultad: n, groupId: n >= 4 ? "g" : null }));
  it("filters by source and keeps shared-text groups whole", () => {
    const qh = questionHistory([h(1, ["2"], [], { 1: "A", 2: "B" })], "A");
    expect(matching(items, { source: "unseen" }, qh).map((i) => i.key)).toEqual(["3", "4", "5"]);
    expect(matching(items, { source: "missed" }, qh).map((i) => i.key)).toEqual(["2"]);
    const keys = pickKeys(items, { count: 5, order: "booklet", seed: 3 });
    expect(keys).toEqual(["1", "2", "3", "4", "5"]);
    expect(pickKeys(items, { count: 5, order: "easy", seed: 3 })[0]).toBe("1");
  });
});
