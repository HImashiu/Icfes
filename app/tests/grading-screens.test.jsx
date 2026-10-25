import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import GradingSettings, { targetsFor } from "../src/screens/GradingSettings.jsx";
import TeacherReports from "../src/screens/TeacherReports.jsx";
import { attemptForAssignment } from "../src/lib/assignments.js";
import { attemptXp, xpFor } from "../src/lib/xp.js";
import { xpFactor } from "../src/lib/grading.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mount = async (el) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  return { host, unmount: () => act(async () => root.unmount()) };
};
const profile = { id: "u1", school_id: "s1", role: "school_admin" };
const courses = [{ id: "c1", name: "Inglés 9no A" }];
const assignments = [{ id: "a1", course_id: "c1", title: "Tarea 1", status: "active", courses: { name: "Inglés 9no A" } }];

describe("grading settings screen", () => {
  it("lists school, class spaces and assignments for a coordinator, and no school level for a teacher", () => {
    expect(targetsFor({ profile, courses, assignments }).map((t) => t.scope)).toEqual(["school", "course", "assignment"]);
    expect(targetsFor({ profile: { ...profile, role: "teacher" }, courses, assignments }).map((t) => t.scope)).toEqual(["course", "assignment"]);
  });
  it("shows a preview and saves the class space's model (inheriting the school's until then)", async () => {
    const api = { saveGradingModel: vi.fn().mockResolvedValue(undefined), clearGradingModel: vi.fn() };
    const guard = (fn) => fn();
    const reloadModels = vi.fn().mockResolvedValue(undefined);
    const models = [{ id: "m", scope: "school", scope_id: "s1", model: { kind: "scale" } }];
    const { host, unmount } = await mount(<GradingSettings api={api} profile={{ ...profile, role: "teacher" }} courses={courses} assignments={assignments} models={models} reloadModels={reloadModels} guard={guard} />);
    expect(host.textContent).toContain("Así cambiarían las notas");
    expect(host.textContent).toContain("Perfecto");
    expect(host.textContent).toContain("30 de 50 aciertos"); // every method card shows a worked example
    expect(host.textContent).toContain("Escala propia"); // the chain says the school's scale applies until the class has its own
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Guardar para la clase");
    expect(save.disabled).toBe(false);
    await act(async () => { save.click(); });
    expect(api.saveGradingModel).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "s1", scope: "course", scopeId: "c1", model: expect.objectContaining({ kind: "scale" }) }));
    expect(reloadModels).toHaveBeenCalled();
    await unmount();
  });
});

describe("teacher reports use the grading model", () => {
  it("shows the class grade next to the share right", async () => {
    const members = [{ id: "m1", course_id: "c1", profile_id: "p1", email: "a@x.co", full_name: "Ana", role: "student" }];
    const attempts = [{ profile_id: "p1", assignment_id: "a1", submitted_at: "2026-10-20T10:00:00Z", mode: "practice", duration_sec: 600, score: { keyed: true, correct: 8, answered: 10, total: 10, perArea: [{ name: "Inglés", total: 10, answered: 10, correct: 8 }] }, answers: { 1: "A" } }];
    const api = { allMembers: vi.fn().mockResolvedValue(members), reportAttempts: vi.fn().mockResolvedValue(attempts) };
    const models = [{ scope: "school", scope_id: "s1", model: { kind: "scale", scale: { min: 1, max: 5, pass: 3, passPct: 60, decimals: 1 } } }];
    const fetchExam = vi.fn().mockRejectedValue(new Error("no booklet"));
    const { host, unmount } = await mount(<TeacherReports api={api} profile={profile} courses={courses} assignments={assignments} models={models} fetchExam={fetchExam} guard={(fn) => fn()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(host.textContent).toContain("Nota media");
    expect(host.textContent).toContain("4,0"); // 80 % on a 1-5 scale passing at 60 %
    await unmount();
  });
});

describe("diminishing XP", () => {
  it("scales XP per correct answer and never below 1", () => {
    expect(xpFor("Matemáticas")).toBe(10);
    expect(xpFor("Matemáticas", 0.5)).toBe(5);
    expect(xpFor("Matemáticas", 0.01)).toBe(1);
  });
  it("applies the attempt's factor when a timed attempt is graded", () => {
    const questions = [{ key: "1", section: "Matemáticas" }, { key: "2", section: "Matemáticas" }];
    const key = new Map([["1", "A"], ["2", "B"]]);
    const base = attemptForAssignment({ id: "a1", kind: "exam", exam_slug: "x", scope: "all" }, questions);
    const first = { ...base, answers: { 1: "A", 2: "B" }, xpFactor: xpFactor({ xp: { decay: 1, floor: 0.1 } }, 1) };
    const third = { ...first, xpFactor: xpFactor({ xp: { decay: 1, floor: 0.1 } }, 3) };
    expect(attemptXp(questions, first, key)).toBe(20);
    expect(attemptXp(questions, third, key)).toBe(6);
  });
});
