import { describe, expect, it } from "vitest";
import { studentCourses, studentSubjects, studentTasks } from "../src/lib/student.js";
import { groupBooklets, sessionOf, sessionTitle } from "../src/lib/booklets.js";
import { formatBooklet } from "../src/lib/exam.js";
import { achievements } from "../src/lib/achievements.js";
import { daysUntil } from "../src/lib/goal.js";

const now = Date.parse("2026-10-24T15:00:00Z");

describe("a course is not a subject", () => {
  // A class named after the group, with no subject: the school's "11-A" space.
  const classes = [
    { id: "g", name: "11-A", subject: null, teachers: ["Marcela Ríos"] },
    { id: "m", name: "Matemáticas 11A", subject: "Matemáticas", grade: "11", group_label: "A", teachers: ["Hernán Castaño"] },
  ];
  const assignments = [
    { id: "a1", course_id: "g", scope: "Inglés", title: "Reading", status: "published", due_at: "2026-10-27T00:00:00Z" },
    { id: "a2", course_id: "g", scope: "all", title: "Simulacro", status: "published", due_at: "2026-10-28T00:00:00Z" },
    { id: "a3", course_id: "g", scope: "Matemáticas", title: "Tablas", status: "published", due_at: "2026-10-26T00:00:00Z" },
    { id: "a4", course_id: "m", scope: "Matemáticas", title: "Funciones", status: "published", due_at: "2026-10-20T00:00:00Z" },
  ];
  const attempts = [{ assignment_id: "a4", submitted_at: "2026-10-19T00:00:00Z", mode: "practice", score: { keyed: true, correct: 9, answered: 10, total: 10 } }];

  it("files the course's tasks under the area they cover", () => {
    const s = studentSubjects({ classes, assignments, attempts, now });
    expect(s.map((x) => x.name)).toEqual(["Matemáticas", "Inglés", "Simulacros Saber 11"]);
    expect(s[0].assignmentIds.sort()).toEqual(["a3", "a4"]);
    expect(s[0].teacher).toBe("Hernán Castaño, Marcela Ríos");
    expect(s.some((x) => x.name === "11-A")).toBe(false);
  });

  it("names the course apart", () => {
    expect(studentCourses(classes)).toEqual(["11-A", "11A"]);
  });

  it("lists tasks pending first, then delivered with the student's score", () => {
    const s = studentSubjects({ classes, assignments, attempts, now });
    const t = studentTasks({ subjects: s, assignments, attempts, now });
    expect(t.map((x) => [x.a.id, x.status])).toEqual([["a3", "pending"], ["a1", "pending"], ["a2", "pending"], ["a4", "delivered"]]);
    expect(t[3].pct).toBe(90);
    expect(t[1].subject.name).toBe("Inglés");
  });
});

describe("cuadernillos and sessions", () => {
  it("groups the two sessions of a cuadernillo", () => {
    const b = groupBooklets([{ slug: "S11-A_1ra", status: "ready" }, { slug: "S11-A_2da", status: "ready" }, { slug: "S11-L_1ra", status: "ready" }]);
    expect(b.map((x) => [x.code, x.sessions.map((s) => s.n)])).toEqual([["S11-A", [1, 2]], ["S11-L", [1]]]);
    expect(sessionOf("S11-G1_2da")).toBe(2);
    expect(sessionTitle("S11-A_1ra")).toBe("S11-A · Sesión 1");
  });
  it("titles every booklet as a session of its cuadernillo", () => {
    expect(formatBooklet("S11-O 2da sesion")).toBe("S11-O · Sesión 2");
    expect(formatBooklet("S11-E 1ra Sesión.")).toBe("S11-E · Sesión 1");
    expect(formatBooklet("S11-M 1ra sesión (session 1)")).toBe("S11-M · Sesión 1");
  });
});

describe("logros and goal", () => {
  const D = 864e5;
  const row = (ago, answered, correct, area = "Matemáticas") => ({ at: now - ago * D, answered, outOf: answered, percent: (correct / answered) * 100, perArea: [{ name: area, answered, correct }] });
  it("counts streaks, questions and areas", () => {
    const b = Object.fromEntries(achievements({ history: [row(0, 12, 10), row(1, 10, 5, "Inglés"), row(2, 10, 6)] }).map((x) => [x.id, x]));
    expect(b.first.got).toBe(true);
    expect(b.streak3.got).toBe(true);
    expect(b.streak7.have).toBe(3);
    expect(b.sharp.got).toBe(true);
    expect(b.areas.have).toBe(2);
  });
  it("counts days to the exam", () => {
    expect(daysUntil("2026-10-30", Date.parse("2026-10-24T15:00:00"))).toBe(6);
    expect(daysUntil("", now)).toBe(null);
  });
});
