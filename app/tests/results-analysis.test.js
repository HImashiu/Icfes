import { describe, expect, it } from "vitest";
import { activityFindings, difficultyOf, discrimination, groupRows, questionDetail, scoreStats } from "../src/lib/resultsAnalysis.js";
import { computeGradebook, explainFinal } from "../src/lib/gradebook.js";
import { applyFilters, colLetter, columnStats, formulaValues, parseFilter, pivotTable, tableColumns } from "../src/lib/sheet.js";
import { courseAreaGrid, questionDifficulty, weakest } from "../src/lib/insights.js";
import { normalizeModel } from "../src/lib/grading.js";

describe("results analysis", () => {
  it("summarises a spread with median and quartiles", () => {
    const s = scoreStats([10, 20, 30, 40, null, 50]);
    expect(s.n).toBe(5);
    expect(s.median).toBe(30);
    expect(s.q1).toBe(20);
    expect(s.q3).toBe(40);
  });
  it("labels difficulty and finds questions that separate who masters the topic", () => {
    expect(difficultyOf(30).label).toBe("Difícil");
    expect(difficultyOf(55).label).toBe("Media");
    expect(difficultyOf(90).label).toBe("Fácil");
    // The 5 best got it right, the 5 worst got it wrong.
    const rows = Array.from({ length: 10 }, (_, i) => ({ pct: i * 10, done: true, name: `E${i}`, answers: { q: i >= 5 ? "A" : "B" } }));
    expect(discrimination("q", "A", rows)).toBe(1);
    const d = questionDetail({ key: "q", number: 1, keyed: "A", dist: { A: 5, B: 5 }, answered: 10, pct: 50, topWrong: "B" }, rows);
    expect(d.who.A).toHaveLength(5);
    expect(d.discInfo.label).toBe("Separa bien");
    expect(d.reading.join(" ")).toContain("La opción B atrajo al 50 %");
  });
  it("groups rows by class and writes findings", () => {
    const g = groupRows([{ pct: 40, done: true, c: "11B" }, { pct: 60, done: true, c: "11A" }, { pct: 80, done: true, c: "11A" }], (r) => r.c);
    expect(g.map((x) => [x.name, x.n, x.avg])).toEqual([["11A", 2, 70], ["11B", 1, 40]]);
    const f = activityFindings({ rows: [{ done: true, pct: 20 }, { done: false }], items: [{ pct: 30 }], areas: [], stats: scoreStats([20]) });
    expect(f.map((x) => x.text).join(" ")).toMatch(/Faltan 1 entrega/);
  });
});

describe("gradebook", () => {
  const members = [{ id: "m1", course_id: "c1", role: "student", full_name: "Ana" }, { id: "m2", course_id: "c1", role: "student", full_name: "Beto" }];
  const sc = (c) => ({ keyed: true, correct: c, answered: 10, total: 10, perArea: [{ name: "Matemáticas", total: 10, answered: 10, correct: c }] });
  const assignments = [
    { id: "t", course_id: "c1", kind: "homework", title: "Tarea", status: "active", due_at: "2026-01-02T00:00:00Z" },
    { id: "e", course_id: "c1", kind: "exam", title: "Simulacro", status: "active", due_at: "2026-01-03T00:00:00Z" },
  ];
  const attempts = [
    { member_id: "m1", assignment_id: "t", submitted_at: "2026-01-01", mode: "practice", score: sc(10) },
    { member_id: "m1", assignment_id: "e", submitted_at: "2026-01-02", mode: "timed", score: sc(5) },
    { member_id: "m2", assignment_id: "e", submitted_at: "2026-01-02", mode: "timed", score: sc(8) },
  ];
  const models = [{ scope: "course", scope_id: "c1", model: { kind: "scale", final: { weights: { task: 0, homework: 50, exam: 50 }, missing: "zero" } } }];
  it("weights each kind of activity and counts missing closed work as zero", () => {
    const book = computeGradebook({ members, assignments, attempts, models, schoolId: "s", courseId: "c1", now: Date.parse("2026-02-01") });
    const ana = book.rows.find((r) => r.name === "Ana");
    const beto = book.rows.find((r) => r.name === "Beto");
    expect(ana.finalPct).toBe(75); // (100 + 50) / 2
    expect(beto.finalPct).toBe(40); // (0 + 80) / 2: the homework was not delivered
    expect(beto.missing).toBe(1);
    expect(ana.final.display).toBe("3,8");
    expect(explainFinal(models[0].model, book.columns)).toContain("tareas 50 %");
  });
  it("can leave missing work out", () => {
    const skip = [{ ...models[0], model: { ...models[0].model, final: { ...models[0].model.final, missing: "skip" } } }];
    const book = computeGradebook({ members, assignments, attempts, models: skip, schoolId: "s", courseId: "c1", now: Date.parse("2026-02-01") });
    expect(book.rows.find((r) => r.name === "Beto").finalPct).toBe(80);
  });
  it("keeps the final rule through normalizeModel", () => {
    expect(normalizeModel({ final: { weights: { exam: 70 }, missing: "skip", from: "2026-01-01" } }).final).toEqual({ weights: { task: 30, homework: 30, exam: 70 }, missing: "skip", from: "2026-01-01", to: null });
  });
});

describe("sheet", () => {
  const rows = [{ Nombre: "Ana", Curso: "11A", Pct: 80 }, { Nombre: "Beto", Curso: "11B", Pct: 40 }, { Nombre: "Íngrid", Curso: "11A", Pct: 60 }];
  const columns = tableColumns(rows, ["Nombre", "Curso", "Pct"]);
  it("names columns like a spreadsheet", () => {
    expect([0, 25, 26, 27].map(colLetter)).toEqual(["A", "Z", "AA", "AB"]);
    expect(columns.map((c) => c.type)).toEqual(["text", "text", "num"]);
  });
  it("filters like Excel", () => {
    expect(applyFilters(rows, { Pct: ">50" }).map((r) => r.Nombre)).toEqual(["Ana", "Íngrid"]);
    expect(applyFilters(rows, { Pct: "40..60" })).toHaveLength(2);
    expect(applyFilters(rows, { Nombre: "ingrid" })).toHaveLength(1);
    expect(applyFilters(rows, { Curso: "=11b" })).toHaveLength(1);
    expect(parseFilter("")).toBe(null);
  });
  it("computes formula columns by letter, stats and a pivot", () => {
    expect(formulaValues("=C/20", rows, columns).values).toEqual([4, 2, 3]);
    expect(formulaValues("=Z+1", rows, columns).error).toBeTruthy();
    expect(columnStats(rows, "Pct")).toMatchObject({ sum: 180, avg: 60, min: 40, max: 80, n: 3 });
    const p = pivotTable(rows, { row: "Curso", value: "Pct", how: "avg" });
    expect(p.rows.map((r) => [r.Curso, r["Promedio de Pct"], r.n])).toEqual([["11A", 70, 2], ["11B", 40, 1]]);
  });
});

describe("insights", () => {
  const f = (course, area, correct, extra = {}) => ({ course, area, correct, tema: "T", assignment: "A", qkey: "1", studentId: "s", ...extra });
  it("crosses courses and areas, and finds weak topics and hard questions", () => {
    const facts = [...Array(20)].map((_, i) => f("11A", "Matemáticas", i < 5)).concat([...Array(20)].map((_, i) => f("11B", "Matemáticas", i < 15)));
    const g = courseAreaGrid(facts);
    expect(g.cell("11A", "Matemáticas").pct).toBe(25);
    expect(g.cell("11B", "Matemáticas").pct).toBe(75);
    expect(weakest(facts, "tema")[0]).toMatchObject({ name: "T", pct: 50, n: 40 });
    expect(questionDifficulty(facts).total).toBe(1);
  });
});
