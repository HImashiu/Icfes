import { describe, expect, it } from "vitest";
import { createApi } from "../src/lib/api.js";
import { buildDemo } from "../src/demo/seed.js";
import { createDemoClient } from "../src/demo/client.js";
import { buildFacts } from "../src/lib/chartBuilder.js";

// A made-up booklet: 2 areas, 40 questions, no real exam text.
function fakeBundle() {
  const questions = Array.from({ length: 40 }, (_, i) => ({
    number: String(i + 1), key: String(i + 1), section: i < 20 ? "Matemáticas" : "Lectura crítica", stem_md: `Pregunta ${i + 1}`, stimulus_md: "",
    options: ["A", "B", "C", "D"].map((letter) => ({ letter, text_md: `Opción ${letter}` })), group: null,
  }));
  const exam = { title: "Prueba", sections: [{ name: "Matemáticas", questions: questions.slice(0, 20) }, { name: "Lectura crítica", questions: questions.slice(20) }], questions };
  const key = new Map(questions.map((q, i) => [q.key, "ABCD"[i % 4]]));
  const enrich = Object.fromEntries(questions.map((q, i) => [q.number, { competencia: "Interpretación", componente: "Numérico", tema: i % 2 ? "Tablas" : "Funciones", dificultad: (i % 5) + 1 }]));
  return { exam, key, enrich };
}

describe("demo school", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const { tables, profile } = buildDemo({ bundles: new Map([["X_1", fakeBundle()]]), now });

  it("has 3 class spaces and 120 students with unique names", () => {
    const students = tables.course_members.filter((m) => m.role === "student");
    expect(tables.courses).toHaveLength(3);
    expect(students).toHaveLength(120);
    expect(new Set(students.map((s) => s.full_name)).size).toBe(120);
    expect(students.every((s) => s.email.endsWith("@demo.invalid"))).toBe(true);
  });

  it("spans about 8 weeks of assignments with times, hints and alerts data", () => {
    const delivered = tables.attempts.filter((a) => a.submitted_at);
    const first = Math.min(...delivered.map((a) => Date.parse(a.submitted_at)));
    expect((now - first) / 864e5).toBeGreaterThan(45);
    expect(delivered.length).toBeGreaterThan(300);
    expect(delivered.some((a) => Object.keys(a.activity.hints).length)).toBe(true);
    expect(delivered.every((a) => Object.keys(a.times).length || a.device === "paper")).toBe(true);
    expect(tables.proctor_events.length).toBeGreaterThan(0);
    expect(tables.grading_models.length).toBeGreaterThanOrEqual(4);
    expect(tables.saved_charts.length).toBe(3);
    expect(tables.lessons).toHaveLength(2);
    expect(Object.keys(tables.paper_seating[0].plan.seats).length).toBeGreaterThan(30);
  });

  it("feeds the teacher API and the chart builder, and writes stay in memory", async () => {
    const api = createApi(createDemoClient({ tables: structuredClone(tables), profile }));
    const [courses, assignments, attempts, members] = await Promise.all([api.listCourses(), api.listAssignments(), api.chartAttempts(), api.allMembers()]);
    expect(courses).toHaveLength(3);
    expect(assignments.length).toBeGreaterThanOrEqual(15);
    const bundle = fakeBundle();
    const facts = buildFacts({ attempts, assignments, members, courses, bundles: new Map([["X_1", bundle]]) });
    expect(facts.length).toBeGreaterThan(2000);
    const made = await api.createCourse({ schoolId: "demo-school", userId: profile.id, name: "Nuevo", grade: "10", subject: "Inglés", groupLabel: "A" });
    expect((await api.listCourses())).toHaveLength(4);
    expect(made.id).toMatch(/^demo-/);
  });

  it("is deterministic", () => {
    const again = buildDemo({ bundles: new Map([["X_1", fakeBundle()]]), now });
    expect(again.tables.attempts.length).toBe(tables.attempts.length);
    expect(again.tables.course_members[5].full_name).toBe(tables.course_members[5].full_name);
  });
});
