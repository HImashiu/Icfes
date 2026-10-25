import { describe, expect, it } from "vitest";
import { classesFrom, practiceInsights, studentEvents, studentSubjects } from "../src/lib/student.js";

const now = Date.parse("2026-10-24T15:00:00Z");
const D = 864e5;

describe("student subjects", () => {
  const classes = [{ id: "m", name: "Matemáticas 11A", subject: "Matemáticas", grade: "11", group_label: "A", teachers: ["Hernán Castaño"] }, { id: "i", name: "Inglés 11A", subject: "Inglés", grade: "11", group_label: "A", teachers: ["Eva Ruiz"] }];
  const assignments = [
    { id: "a1", course_id: "m", title: "Taller", status: "active", opens_at: "2026-10-01T00:00:00Z", due_at: "2026-10-26T00:00:00Z" },
    { id: "a2", course_id: "m", title: "Quiz", status: "active", opens_at: "2026-10-01T00:00:00Z", due_at: "2026-10-20T00:00:00Z" },
    { id: "a3", course_id: "i", title: "Reading", status: "active", opens_at: "2026-10-01T00:00:00Z", due_at: "2026-10-28T00:00:00Z" },
  ];
  const attempts = [{ assignment_id: "a2", submitted_at: "2026-10-19T00:00:00Z", score: { correct: 8, total: 10, answered: 10, keyed: true } }];

  it("shows each subject with its teacher, pending work and the student's own average", () => {
    const s = studentSubjects({ classes, assignments, attempts, now }).filter((x) => !x.noClass);
    expect(s.map((x) => [x.name, x.teacher, x.pending, x.group])).toEqual([["Matemáticas", "Hernán Castaño", 1, "11A"], ["Inglés", "Eva Ruiz", 1, "11A"]]);
    expect(s[0].next.id).toBe("a1");
    expect(s[0].avg).toBe(80);
  });

  it("falls back to the course names on the assignments before migration 0018", () => {
    expect(classesFrom({ classes: null, assignments: [{ course_id: "x", courses: { name: "Física 11B" } }] })).toEqual([{ id: "x", name: "Física 11B", teachers: [] }]);
  });

  it("puts undelivered tasks on the calendar in their subject color", () => {
    const s = studentSubjects({ classes, assignments, attempts, now });
    const ev = studentEvents({ subjects: s, assignments, attempts, now });
    expect(ev.map((e) => e.id).sort()).toEqual(["a1", "a3"]);
    expect(ev.find((e) => e.id === "a3").label).toBe("Reading · Inglés");
  });
});

describe("practice insights", () => {
  const row = (daysAgo, name, correct, xp = 50) => ({ id: String(daysAgo), at: now - daysAgo * D, keyed: true, xp, percent: correct * 5, perArea: [{ name, correct, answered: 20 }], snapshot: { times: { 1: 40, 2: 80 } } });
  it("measures areas, trend, streak and pace from the history", () => {
    const ins = practiceInsights([row(0, "Inglés", 14), row(1, "Inglés", 8), row(2, "Matemáticas", 16), row(5, "Matemáticas", 10)], now);
    expect(ins.streak).toBe(3);
    expect(ins.weakest.name).toBe("Inglés");
    expect(ins.areas.find((a) => a.name === "Inglés").trend).toBe(30);
    expect(ins.secPerQuestion).toBe(60);
    expect(ins.week.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
  it("is empty before the first attempt", () => {
    expect(practiceInsights([], now)).toMatchObject({ sessions: 0, streak: 0, weakest: null, pct: null });
  });
});
