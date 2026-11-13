import { describe, expect, it } from "vitest";
import {
  copyRows, datesError, datesPatch, desempeno, extendChoices, finalColumn, missingStudents, reminderText, repeatsIn,
  reportCard, sortRows, splitWeeks, suggestedComment, surnameKey, weekDates,
} from "../src/lib/teacherTime.js";
import { activityProgress } from "../src/screens/teacher/Activities.jsx";

const scale = { min: 1, max: 5, pass: 3, decimals: 1 };

describe("dates", () => {
  it("reopens a closed activity when the new due date is ahead", () => {
    const p = datesPatch({ status: "closed" }, { opens: "2026-11-01", due: "2099-01-10" });
    expect(p.status).toBe("active");
    expect(p.due_at).toMatch(/^2099-01-1[01]T/);
  });
  it("keeps a draft a draft and allows no due date", () => {
    const p = datesPatch({ status: "draft" }, { opens: "2026-11-01", due: null });
    expect(p.status).toBeUndefined();
    expect(p.due_at).toBeNull();
  });
  it("rejects a past due date and a due before opening", () => {
    expect(datesError({ opens: "2026-11-10", due: "2026-11-09" }, "2026-11-01")).toMatch(/antes/);
    expect(datesError({ opens: "2026-11-01", due: "2026-10-30" }, "2026-11-01")).toMatch(/pasó/);
    expect(datesError({ opens: "2026-11-01", due: "2026-11-05" }, "2026-11-01")).toBeNull();
  });
  it("extends from the due date, or from today when it already passed", () => {
    expect(extendChoices({ due_at: "2026-11-20T23:59:00" }, "2026-11-13").map((c) => c.due)).toEqual(["2026-11-21", "2026-11-23", "2026-11-27"]);
    expect(extendChoices({ due_at: "2026-11-01T23:59:00" }, "2026-11-13")[0].due).toBe("2026-11-14");
  });
});

describe("reminders", () => {
  const members = [
    { id: "m1", course_id: "c", role: "student", full_name: "Ana Pérez", profile_id: "p1" },
    { id: "m2", course_id: "c", role: "student", full_name: "Luis Gómez", profile_id: null },
    { id: "m3", course_id: "c", role: "student", full_name: "Sara Ruiz", profile_id: "p3" },
    { id: "m4", course_id: "c", role: "teacher", full_name: "Profe" },
    { id: "m5", course_id: "x", role: "student", full_name: "Otra Clase" },
  ];
  it("lists who has not delivered (signed-in or paper)", () => {
    const missing = missingStudents(members, [{ profile_id: "p1", submitted_at: "x" }, { profile_id: "p3", submitted_at: null }], "c");
    expect(missing.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(missing[0].joined).toBe(false);
    expect(missingStudents(members, [{ member_id: "m2", submitted_at: "x" }], "c").map((m) => m.id)).toEqual(["m1", "m3"]);
  });
  it("writes the message with or without names", () => {
    const now = new Date("2026-11-13T10:00:00").getTime();
    const a = { title: "Razonamiento", due_at: new Date("2026-11-14T23:59:00").toISOString() };
    const t = reminderText({ assignment: a, className: "11A", missing: [{ name: "Luis Gómez" }], total: 3, now });
    expect(t).toContain("Faltan 1 de 3");
    expect(t).toContain("Cierra mañana");
    expect(t).not.toContain("Luis");
    expect(reminderText({ assignment: a, className: "11A", missing: [{ name: "Luis Gómez" }], total: 3, withNames: true, now })).toContain("Luis Gómez");
  });
});

describe("reuse in another class", () => {
  const a = { id: "a", title: "Quiz", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["q1", "q2"], kind: "homework", allow_hints: true, instant_feedback: false, delivery: "online", reveal_policy: "after_close" };
  it("copies settings, sends optional columns only when needed", () => {
    const [r] = copyRows(a, ["c2"], { opens: "2026-11-13", due: "2026-11-20", title: " " }, "u1");
    expect(r).toMatchObject({ course_id: "c2", created_by: "u1", title: "Quiz", question_keys: ["q1", "q2"], instant_feedback: false, status: "active" });
    expect("allow_hints" in r).toBe(false);
    expect("delivery" in r).toBe(false);
    expect("id" in r).toBe(false);
  });
  it("warns about classes that already saw the questions", () => {
    const others = [{ id: "b", course_id: "c2", exam_slug: "S11-A_1ra", question_keys: ["q2", "q9"] }, { id: "c", course_id: "c3", exam_slug: "S11-A_1ra", question_keys: ["q7"] }];
    expect(repeatsIn(a, others, ["c2", "c3"])).toEqual(["c2"]);
  });
});

describe("weekly routine", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, groupId: i >= 4 && i < 7 ? "g" : null }));
  const keys = items.map((i) => i.key);
  it("splits evenly and keeps a reading text together", () => {
    const w = splitWeeks(keys, items, 3);
    expect(w).toHaveLength(3);
    expect(w.flat()).toEqual(keys);
    const holder = w.find((x) => x.includes("k4"));
    expect(holder).toEqual(expect.arrayContaining(["k4", "k5", "k6"]));
  });
  it("never makes an empty week", () => {
    expect(splitWeeks(["a", "b"], [], 2)).toEqual([["a"], ["b"]]);
    expect(splitWeeks(["a"], [], 4)).toEqual([["a"]]);
  });
  it("schedules one week after another without overlap", () => {
    expect(weekDates("2026-11-16", "2026-11-30", 3)).toEqual([
      { opens: "2026-11-16", due: "2026-11-22" }, { opens: "2026-11-23", due: "2026-11-29" }, { opens: "2026-11-30", due: "2026-12-06" },
    ]);
  });
});

describe("planilla", () => {
  it("maps the 1,0-5,0 scale to the Decreto 1290 levels", () => {
    expect([2.9, 3.0, 3.9, 4.0, 4.5, 4.6, 5].map((v) => desempeno(v, scale))).toEqual(["Bajo", "Básico", "Básico", "Alto", "Alto", "Superior", "Superior"]);
    expect(desempeno(null, scale)).toBeNull();
  });
  it("orders by surname and copies final grades only", () => {
    const rows = [{ name: "Juan Esteban Duarte Martínez", final: { display: "3,5" } }, { name: "Ana Cárdenas Reyes", final: { display: "4,1" } }, { name: "Zoe Abad", final: null }];
    expect(surnameKey("Juan Esteban Duarte Martínez")).toBe("duarte martínez juan esteban");
    expect(sortRows(rows, "surname").map((r) => r.name)).toEqual(["Zoe Abad", "Ana Cárdenas Reyes", "Juan Esteban Duarte Martínez"]);
    expect(finalColumn(sortRows(rows, "surname"))).toBe("\n4,1\n3,5");
  });
  it("builds a report card and a comment", () => {
    const columns = [{ id: "a1", title: "T1", open: false }, { id: "a2", title: "T2", open: false }];
    const row = { id: "m1", name: "Ana", missing: 1, finalPct: 40, final: { value: 2.2, display: "2,2" }, cells: { a1: { done: true, display: "3,0", passed: true }, a2: { done: false, display: "Sin entregar" } } };
    const attempts = [{ submitted_at: "x", mode: "practice", score: { keyed: true, answered: 10, correct: 5, total: 10, perArea: [{ name: "Matemáticas", correct: 5, total: 10 }, { name: "Inglés", correct: 8, total: 10 }] } }];
    const card = reportCard({ row, columns, attempts, scale });
    expect(card).toMatchObject({ level: "Bajo", delivered: 1, missing: 1, avgPct: 50, weakest: "Matemáticas", strongest: "Inglés" });
    expect(card.activities[1].value).toBe("Sin entregar");
    expect(suggestedComment(card)).toMatch(/falta entregar 1.*refuerzo.*Matemáticas/);
  });
});

describe("activity cards", () => {
  it("counts each student once with their best result", () => {
    const members = [{ course_id: "c", role: "student" }, { course_id: "c", role: "student" }, { course_id: "c", role: "teacher" }];
    const attempts = [
      { assignment_id: "a", profile_id: "p1", submitted_at: "x", mode: "practice", score: { keyed: true, answered: 10, correct: 4 } },
      { assignment_id: "a", profile_id: "p1", submitted_at: "x", mode: "practice", score: { keyed: true, answered: 10, correct: 8 } },
      { assignment_id: "a", profile_id: "p2", submitted_at: null },
    ];
    const p = activityProgress([{ id: "a", course_id: "c" }, { id: "b", course_id: "c" }], members, attempts);
    expect(p.get("a")).toEqual({ done: 1, total: 2, avg: 80 });
    expect(p.get("b")).toEqual({ done: 0, total: 2, avg: null });
    expect(activityProgress([], null, [])).toBeNull();
  });
});
