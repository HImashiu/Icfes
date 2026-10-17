import { describe, expect, it } from "vitest";
import { assignmentState, attemptForAssignment, attemptRow, pickQuestionKeys, progressRows, questionsForAttempt, resultsCsv, scorePct } from "../src/lib/assignments.js";

const q = (n, section = "Matemáticas") => ({ key: String(n), number: n, section });
const exam = {
  questions: [q(1), q(2), q(3), q(4), q(5, "Inglés")],
  sections: [{ name: "Matemáticas", questions: [q(1), q(2), q(3), q(4)] }, { name: "Inglés", questions: [q(5, "Inglés")] }],
};

describe("question selection", () => {
  it("null means every question; a count spreads over the whole scope in order", () => {
    const qs = Array.from({ length: 10 }, (_, i) => q(i + 1));
    expect(pickQuestionKeys(qs, "")).toBeNull();
    expect(pickQuestionKeys(qs, 10)).toBeNull();
    expect(pickQuestionKeys(qs, 20)).toBeNull();
    expect(pickQuestionKeys(qs, 5)).toEqual(["1", "3", "5", "7", "9"]);
  });
  it("an attempt keeps only the assignment keys, in the teacher order", () => {
    expect(questionsForAttempt(exam, { scope: "all", keys: ["4", "2", "99"] }).map((x) => x.key)).toEqual(["4", "2"]);
    expect(questionsForAttempt(exam, { scope: "Inglés", keys: null }).map((x) => x.key)).toEqual(["5"]);
  });
});

describe("assignment state", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("derives active, scheduled and closed from dates and status", () => {
    expect(assignmentState({ status: "active", due_at: "2026-10-20T00:00:00Z", opens_at: "2026-10-01T00:00:00Z" }, now)).toBe("active");
    expect(assignmentState({ status: "active", opens_at: "2026-10-18T00:00:00Z" }, now)).toBe("scheduled");
    expect(assignmentState({ status: "active", due_at: "2026-10-16T00:00:00Z" }, now)).toBe("closed");
    expect(assignmentState({ status: "closed" }, now)).toBe("closed");
    expect(assignmentState({ status: "draft" }, now)).toBe("draft");
  });
});

describe("attempts", () => {
  const a = { id: "A1", kind: "exam", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["1", "2"], time_limit_min: 30 };
  it("an exam is timed with the teacher's limit, homework is untimed practice", () => {
    expect(attemptForAssignment(a, [], 1000)).toMatchObject({ mode: "timed", durationSec: 1800, keys: ["1", "2"], assignmentId: "A1" });
    expect(attemptForAssignment({ ...a, kind: "homework" }, [], 1000)).toMatchObject({ mode: "practice", durationSec: null });
  });
  it("the stored row scores against the key and is idempotent by client id", () => {
    const att = { ...attemptForAssignment(a, [], 1000), answers: { 1: "A", 2: "C" }, submittedAt: 61000 };
    const row = attemptRow(att, [q(1), q(2)], new Map([["1", "A"], ["2", "B"]]), "preliminary");
    expect(row).toMatchObject({ client_id: "1000", assignment_id: "A1", duration_sec: 60, key_status: "preliminary" });
    expect(row.score).toMatchObject({ keyed: true, correct: 1, answered: 2, total: 2 });
    expect(scorePct(row)).toBe(50);
  });
  it("without a key there is no score", () => {
    const att = { ...attemptForAssignment(a, [], 1000), answers: { 1: "A" }, submittedAt: 2000 };
    expect(scorePct(attemptRow(att, [q(1)], null, null))).toBeNull();
  });
});

describe("progress and export", () => {
  const members = [
    { id: "m1", profile_id: "p1", email: "a@c.co", full_name: "Ana", role: "student" },
    { id: "m2", profile_id: "p2", email: "b@c.co", full_name: "Beto", role: "student" },
    { id: "m3", profile_id: null, email: "c@c.co", full_name: "", role: "student" },
    { id: "m4", profile_id: "p9", email: "t@c.co", full_name: "Docente", role: "teacher" },
  ];
  const attempts = [
    { profile_id: "p1", submitted_at: "2026-10-17T10:00:00Z", mode: "practice", score: { keyed: true, correct: 1, answered: 4, total: 4 } },
    { profile_id: "p1", submitted_at: "2026-10-17T11:00:00Z", mode: "practice", score: { keyed: true, correct: 3, answered: 4, total: 4 } },
    { profile_id: "p2", submitted_at: null, mode: "practice", score: null },
  ];
  it("counts only students, keeps the best delivered attempt and ignores unsent ones", () => {
    const p = progressRows(members, attempts);
    expect(p).toMatchObject({ done: 1, total: 3, completion: 33 });
    expect(p.rows.find((r) => r.id === "m1").pct).toBe(75);
    expect(p.rows.find((r) => r.id === "m3")).toMatchObject({ joined: false, name: "c@c.co" });
  });
  it("exports a spreadsheet-safe CSV with the states in Spanish", () => {
    const csv = resultsCsv('Tarea "1"', progressRows(members, attempts).rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Tarea ""1"""');
    expect(csv).toContain("Ana,a@c.co,Entregado,75");
    expect(csv).toContain("Pendiente");
    expect(csv).toContain("Sin ingresar");
  });
});

describe("assignment hints", () => {
  it("offers hints unless the teacher switched them off", () => {
    const a = { id: "x", kind: "practice", exam_slug: "s", scope: "all", question_keys: null };
    expect(attemptForAssignment(a, []).hints).toBe(true);
    expect(attemptForAssignment({ ...a, allow_hints: false }, []).hints).toBe(false);
  });
});
