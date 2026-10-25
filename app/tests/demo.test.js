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

  it("has every curso with its five subjects (11 A, B, C with students; 10 A, B empty) and 120 students with unique names", () => {
    const members = tables.course_members.filter((m) => m.role === "student");
    const students = [...new Map(members.map((m) => [m.profile_id, m])).values()];
    expect(tables.courses).toHaveLength(26);
    for (const [grade, label] of [["11", "A"], ["11", "B"], ["11", "C"], ["10", "A"], ["10", "B"]]) {
      const subjects = tables.courses.filter((c) => c.grade === grade && c.group_label === label && c.subject !== "Todas las áreas").map((c) => c.subject).sort();
      expect(subjects).toEqual(["Ciencias naturales", "Inglés", "Lectura crítica", "Matemáticas", "Sociales y ciudadanas"]);
    }
    // Every student of a curso is in all five of its subjects.
    for (const label of ["A", "B", "C"]) {
      const ids = tables.courses.filter((c) => c.grade === "11" && c.group_label === label && c.subject !== "Todas las áreas").map((c) => c.id);
      const counts = ids.map((id) => tables.course_members.filter((m) => m.course_id === id && m.role === "student").length);
      expect(counts).toEqual([40, 40, 40, 40, 40]);
    }
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
    expect(courses).toHaveLength(26);
    expect(assignments.length).toBeGreaterThanOrEqual(15);
    const bundle = fakeBundle();
    const facts = buildFacts({ attempts, assignments, members, courses, bundles: new Map([["X_1", bundle]]) });
    expect(facts.length).toBeGreaterThan(2000);
    const made = await api.createCourse({ schoolId: "demo-school", userId: profile.id, name: "Nuevo", grade: "10", subject: "Inglés", groupLabel: "A" });
    expect((await api.listCourses())).toHaveLength(27);
    // A whole new curso gets its other four subjects at once.
    expect(await api.completeCurso("10", "A")).toBe(0);
    expect(await api.completeCurso("9", "C")).toBe(5);
    expect((await api.listCourses())).toHaveLength(32);
    expect(made.id).toMatch(/^demo-/);
  });

  it("is deterministic", () => {
    const again = buildDemo({ bundles: new Map([["X_1", fakeBundle()]]), now });
    expect(again.tables.attempts.length).toBe(tables.attempts.length);
    expect(again.tables.course_members[5].full_name).toBe(tables.course_members[5].full_name);
  });
});

describe("demo student", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const { tables, student } = buildDemo({ bundles: new Map([["X_1", fakeBundle()]]), now });

  it("is one student of 11 A with practice history", () => {
    expect(student.profile.role).toBe("student");
    expect(tables.course_members.filter((m) => m.profile_id === student.profile.id).map((m) => m.course_id).sort()).toEqual(["demo-c1", "demo-c4", "demo-c5", "demo-c6", "demo-c7"]);
    expect(student.history.length).toBeGreaterThan(5);
    expect(student.history.every((h) => h.snapshot.slug === "X_1")).toBe(true);
  });

  it("delivered every closed task and has one pending task per subject", () => {
    const mine = tables.attempts.filter((a) => a.profile_id === student.profile.id && a.submitted_at);
    const groupA = tables.assignments.filter((a) => ["demo-c1", "demo-c4", "demo-c5", "demo-c6", "demo-c7"].includes(a.course_id));
    const open = groupA.filter((a) => Date.parse(a.due_at) > now);
    expect(open.length).toBeGreaterThan(0);
    expect(mine.every((a) => !open.some((o) => o.id === a.assignment_id))).toBe(true);
    expect(mine.length).toBe(groupA.length - open.length);
  });
});
