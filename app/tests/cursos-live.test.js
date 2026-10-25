import { describe, expect, it, vi } from "vitest";
import { gradeGroupFromName, groupOf } from "../src/lib/teaching.js";
import { completeCurso } from "../src/lib/colegio.js";
import { isOpenNow, liveMessage, slotLabel, TIME_SLOTS, whenLabel } from "../src/lib/live.js";
import { createApi } from "../src/lib/api.js";
import { createDemoClient } from "../src/demo/client.js";

describe("every curso has its five subjects", () => {
  it("reads grade and group from class names made without them", () => {
    expect(gradeGroupFromName("Matemáticas 11 A")).toEqual({ grade: "11", label: "A" });
    expect(gradeGroupFromName("11-A")).toEqual({ grade: "11", label: "A" });
    expect(gradeGroupFromName("Curso Preparación Saber 11 C")).toEqual({ grade: "11", label: "C" });
    expect(gradeGroupFromName("Inglés 10 01")).toEqual({ grade: "10", label: "01" });
    expect(gradeGroupFromName("Simulacro 2026")).toBeNull();
    expect(gradeGroupFromName("Taller de lectura")).toBeNull();
    expect(groupOf({ name: "Lectura crítica 11 B" }).name).toBe("11B");
    expect(groupOf({ name: "Lectura crítica 11 B", grade: "10" }).name).toBe("Grado 10mo");
  });

  it("creates the missing subjects and puts the curso's students in all of them when the database cannot", async () => {
    const courses = [{ id: "m", name: "Matemáticas 11 A", subject: "Matemáticas", grade: "11", group_label: "A" }, { id: "x", name: "11-A" }];
    const members = { m: [{ id: "1", role: "student", email: "ana@c.co", full_name: "Ana" }], x: [{ id: "2", role: "student", email: "beto@c.co", full_name: "Beto" }] };
    const api = {
      completeCurso: vi.fn().mockResolvedValue(null), // migration 0025 not run
      listCourses: vi.fn(async () => courses),
      createCourse: vi.fn(async (c) => { const row = { id: c.subject, name: c.name, subject: c.subject, grade: c.grade, group_label: c.groupLabel }; courses.push(row); members[row.id] = [{ id: `t-${row.id}`, role: "teacher", profile_id: "boss", email: "boss@c.co" }]; return row; }),
      listMembers: vi.fn(async (id) => members[id] ?? []),
      removeMember: vi.fn(),
      addStudents: vi.fn(),
    };
    expect(await completeCurso(api, { profile: { id: "boss", school_id: "s" }, grade: "11", label: "a" })).toBe(4);
    expect(api.createCourse.mock.calls.map((c) => c[0].name)).toEqual(["Lectura crítica 11 A", "Sociales y ciudadanas 11 A", "Ciencias naturales 11 A", "Inglés 11 A"]);
    expect(api.removeMember).toHaveBeenCalledTimes(4);
    // Matemáticas gets Beto; each new subject gets both; the course-wide "11-A" stays as it is.
    const added = Object.fromEntries(api.addStudents.mock.calls.map(([id, rows]) => [id, rows.map((r) => r.email).sort()]));
    expect(added.m).toEqual(["beto@c.co"]);
    expect(added["Inglés"]).toEqual(["ana@c.co", "beto@c.co"]);
    expect(added.x).toBeUndefined();
  });

  it("uses the database when migration 0025 ran", async () => {
    const api = { completeCurso: vi.fn().mockResolvedValue(3), listCourses: vi.fn() };
    expect(await completeCurso(api, { profile: { id: "boss" }, grade: "11", label: "B" })).toBe(3);
    expect(api.listCourses).not.toHaveBeenCalled();
  });

  it("in the demo, a student added to one class joins every subject of the curso", async () => {
    const tables = {
      courses: [
        { id: "m", name: "Matemáticas 11 A", subject: "Matemáticas", grade: "11", group_label: "A" },
        { id: "i", name: "Inglés 11 A", subject: "Inglés", grade: "11", group_label: "A" },
        { id: "g", name: "Simulacros 11 A", subject: "Todas las áreas", grade: "11", group_label: "A" },
        { id: "b", name: "Inglés 11 B", subject: "Inglés", grade: "11", group_label: "B" },
      ],
      course_members: [], school_groups: [],
    };
    const api = createApi(createDemoClient({ tables, profile: { id: "boss", school_id: "s" } }));
    await api.addStudents("m", [{ email: "ana@c.co", fullName: "Ana" }]);
    expect(tables.course_members.map((r) => r.course_id).sort()).toEqual(["i", "m"]);
  });
});

describe("programmed live games", () => {
  const now = new Date(2026, 9, 25, 9, 0).getTime();
  it("says when a game opens", () => {
    expect(whenLabel(new Date(2026, 9, 25, 10, 30).toISOString(), now)).toMatch(/^hoy a las 10:30/);
    expect(whenLabel(new Date(2026, 9, 26, 7, 0).toISOString(), now)).toMatch(/^mañana a las 7:00/);
    expect(whenLabel(null, now)).toBeNull();
    expect(isOpenNow({ scheduled_at: null }, now)).toBe(true);
    expect(isOpenNow({ scheduled_at: new Date(2026, 9, 25, 10, 30).toISOString() }, now)).toBe(false);
    expect(isOpenNow({ scheduled_at: new Date(2026, 9, 25, 8, 59).toISOString() }, now)).toBe(true);
  });
  it("offers times every 15 minutes, written as people say them", () => {
    expect(TIME_SLOTS[0]).toBe("06:00");
    expect(TIME_SLOTS.at(-1)).toBe("21:45");
    expect(slotLabel("14:15")).toBe("2:15 p. m.");
    expect(slotLabel("06:00")).toBe("6:00 a. m.");
    expect(liveMessage(new Error("not_open_yet"))).toMatch(/todavía no abre/);
  });
});
