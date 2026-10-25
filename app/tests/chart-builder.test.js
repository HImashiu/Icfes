import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, applyFilters, buildFacts, cleanSpec, pivot, pivotCsv, valuesOf, weekStart } from "../src/lib/chartBuilder.js";

const q = (n, section, extra = {}) => ({ key: String(n), number: n, section, stem_md: `s${n}`, options: [], traced: [], ...extra });
const questions = [q(1, "Matemáticas"), q(2, "Matemáticas"), q(3, "Inglés", { group: { id: "g" } }), q(4, "Inglés", { traced: [{}] })];
const bundle = {
  exam: { questions }, key: new Map([["1", "A"], ["2", "B"], ["3", "C"], ["4", "D"]]),
  enrich: { 1: { tema: "Álgebra", dificultad: 2 }, 2: { tema: "Geometría", dificultad: 4 }, 3: { tema: "Lectura", dificultad: 3 }, 4: { tema: "Lectura", dificultad: 3 } },
};
const assignments = [{ id: "a1", course_id: "c1", kind: "task", title: "Tarea 1", exam_slug: "s", courses: { name: "Mate 9A" } }, { id: "a2", course_id: "c2", kind: "exam", title: "Examen", exam_slug: "s", courses: { name: "Mate 9B" } }];
const members = [{ id: "m1", profile_id: "p1", full_name: "Ana", email: "a@x", course_id: "c1" }, { id: "m2", profile_id: "p2", full_name: "Beto", email: "b@x", course_id: "c2" }];
const at = (who, aid, answers, times, when = "2026-10-12T15:00:00Z") => ({ profile_id: who, assignment_id: aid, submitted_at: when, answers, times });
const attempts = [
  at("p1", "a1", { 1: "A", 2: "A", 3: "C", 4: "D" }, { 1: 20, 2: 100 }),
  at("p2", "a2", { 1: "B", 2: "B" }, { 1: 40, 2: 200 }, "2026-10-20T15:00:00Z"),
  { profile_id: "p1", assignment_id: "a1", submitted_at: null, answers: { 1: "A" } },
];
const facts = buildFacts({ attempts, assignments, members, courses: [], bundles: new Map([["s", bundle]]) });

describe("chart builder facts", () => {
  it("makes one fact per answered question of delivered attempts", () => {
    expect(facts).toHaveLength(6);
    expect(facts[0]).toMatchObject({ student: "Ana", space: "Mate 9A", area: "Matemáticas", tema: "Álgebra", correct: true, qtype: "Independiente" });
    expect(facts.find((f) => f.qkey === "3").qtype).toBe("Con texto compartido");
    expect(facts.find((f) => f.qkey === "4").qtype).toBe("Con figura o gráfico");
    expect(facts.find((f) => f.qkey === "2" && f.studentId === "p1")).toMatchObject({ result: "Error", timeBucket: "1 a 2 min" });
  });
  it("puts each student's workspace groups on the facts", () => {
    const ws = { groups: [{ id: "g1", name: "Refuerzo" }], groupMembers: [{ group_id: "g1", email: "A@x" }] };
    const withGroups = buildFacts({ attempts, assignments, members, courses: [], bundles: new Map([["s", bundle]]), ws });
    expect(valuesOf(withGroups, "group")).toEqual(["Refuerzo", "Sin grupo"]);
    expect(withGroups.find((f) => f.studentId === "p1").group).toBe("Refuerzo");
  });
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-18T12:00:00Z")).toBe("2026-10-12");
    expect(weekStart("2026-10-19T12:00:00Z")).toBe("2026-10-19");
  });
  it("lists the values of a dimension", () => {
    expect(valuesOf(facts, "area")).toEqual(["Inglés", "Matemáticas"]);
    expect(valuesOf(facts, "difficulty")[0]).toBe("2 · Fácil");
  });
});

describe("pivot", () => {
  it("computes accuracy per area, weakest first", () => {
    const p = pivot(facts, { ...DEFAULT_SPEC, rows: "area" });
    expect(p.rows).toEqual(["Matemáticas", "Inglés"]);
    expect(p.cell("Matemáticas", "").value).toBe(50);
    expect(p.cell("Inglés", "").value).toBe(100);
  });
  it("crosses two dimensions and filters", () => {
    const spec = { ...DEFAULT_SPEC, rows: "tema", cols: "space", filters: { area: ["Matemáticas"] }, sort: "name" };
    const p = pivot(facts, spec);
    expect(p.cols).toEqual(["Mate 9A", "Mate 9B"]);
    expect(p.cell("Álgebra", "Mate 9A").value).toBe(100);
    expect(p.cell("Geometría", "Mate 9A").value).toBe(0);
    expect(p.cell("Geometría", "Mate 9B").value).toBe(100);
    expect(applyFilters(facts, spec)).toHaveLength(4);
  });
  it("averages and sums time, ignoring answers without it", () => {
    expect(pivot(facts, { ...DEFAULT_SPEC, rows: "space", metric: "avgSec", sort: "name" }).cell("Mate 9A", "").value).toBe(60);
    expect(pivot(facts, { ...DEFAULT_SPEC, rows: "week", cols: "space", metric: "totalMin", sort: "name" }).cell("2026-10-19", "Mate 9B").value).toBe(4);
  });
  it("hides cells below the minimum sample", () => {
    const p = pivot(facts, { ...DEFAULT_SPEC, rows: "area", minN: 5 });
    expect(p.cell("Matemáticas", "").value).toBeNull();
  });
  it("cuts by period", () => {
    const now = new Date("2026-10-21T00:00:00Z").getTime();
    expect(applyFilters(facts, { ...DEFAULT_SPEC, range: 7 }, now)).toHaveLength(2);
  });
  it("never orders students by score", () => {
    const p = pivot(facts, { ...DEFAULT_SPEC, rows: "student", sort: "value-desc" });
    expect(p.rows).toEqual(["Ana", "Beto"]);
  });
  it("counts students and attempts", () => {
    expect(pivot(facts, { ...DEFAULT_SPEC, rows: "area", metric: "students", sort: "name" }).cell("Inglés", "").value).toBe(1);
    expect(pivot(facts, { ...DEFAULT_SPEC, rows: "kind", metric: "attempts", sort: "name" }).cell("Examen", "").value).toBe(1);
  });
  it("exports csv and cleans stale specs", () => {
    const csv = pivotCsv(pivot(facts, { ...DEFAULT_SPEC, rows: "area" }), { ...DEFAULT_SPEC, rows: "area" });
    expect(csv).toContain("Matemáticas,50,4");
    expect(cleanSpec({ rows: "nope", metric: "zzz", filters: { area: ["x"], bad: ["y"] } })).toMatchObject({ rows: "area", metric: "acc", filters: { area: ["x"] } });
  });
});
