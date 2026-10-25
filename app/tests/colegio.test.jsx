import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { accessOf, auditText, buildFeed, grantText, parseInvites, parseLabels, schoolGrades, teacherStats } from "../src/lib/colegio.js";
import { buildContexts, classLabel, classMatrix, contextCourseIds, contextLabel, grantCovers, myClasses } from "../src/lib/teaching.js";
import ClassMatrix from "../src/screens/teacher/ClassMatrix.jsx";

afterEach(() => { cleanup(); window.localStorage.clear(); });

const courses = [
  { id: "m11a", name: "Matemáticas 11 A", subject: "Matemáticas", grade: "11", group_label: "A" },
  { id: "l11a", name: "Lectura crítica 11 A", subject: "Lectura crítica", grade: "11", group_label: "A" },
  { id: "f10b", name: "Física 10 B", subject: "Física", grade: "10", group_label: "B" },
];
const t = (course_id, profile_id, access = "edit") => ({ id: `${course_id}-${profile_id}`, course_id, profile_id, email: `${profile_id}@c.co`, full_name: profile_id, role: "teacher", access });
const st = (course_id, email) => ({ id: `${course_id}-${email}`, course_id, email, role: "student" });
const members = [t("m11a", "ana"), t("l11a", "leo"), t("l11a", "ana", "view"), st("m11a", "x@c.co"), st("l11a", "x@c.co"), st("m11a", "y@c.co")];

describe("course × subject", () => {
  it("names every class subject first, then the curso", () => {
    expect(classLabel(courses[0])).toBe("Matemáticas · 11A");
    expect(classLabel(courses[2])).toBe("Física · 10B");
    expect(classLabel({ name: "Club de lectura" })).toBe("Club de lectura");
  });

  it("marks view-only classes and honours subject grants", () => {
    const ana = myClasses({ courses, members, profile: { id: "ana", email: "ana@c.co", role: "teacher" } });
    expect(ana.find((c) => c.id === "m11a").readOnly).toBe(false);
    expect(ana.find((c) => c.id === "l11a").readOnly).toBe(true);
    const grants = [{ profile_id: "leo", area: "Ciencias naturales", grade: "10", access: "view" }];
    expect(grantCovers(grants[0], courses[2])).toBe(true);
    expect(grantCovers(grants[0], { ...courses[2], grade: "11" })).toBe(false);
    const leo = myClasses({ courses, members, grants, profile: { id: "leo", email: "leo@c.co", role: "teacher" } });
    expect(leo.find((c) => c.id === "f10b").readOnly).toBe(true);
    expect(leo.find((c) => c.id === "l11a").readOnly).toBe(false);
  });

  it("offers a context per curso with all its subjects", () => {
    const ctx = buildContexts({ courses, members, profile: { id: "boss", role: "school_admin" } });
    expect(ctx.groups.map((g) => g.name)).toEqual(["10B", "11A"]);
    expect(ctx.groups[1].classes.map((c) => c.name)).toEqual(["Lectura crítica", "Matemáticas"]);
    expect(contextCourseIds(ctx, { group: "11|A" }).sort()).toEqual(["l11a", "m11a"]);
    expect(contextLabel(ctx, { group: "11|A" })).toBe("11A · todas las materias");
  });

  it("lists empty cursos from their records and counts only editors as teachers", () => {
    const m = classMatrix({ courses, members, records: [{ grade: "9", label: "a" }] });
    expect(m.groups.map((g) => g.name)).toEqual(["9A", "10B", "11A"]);
    const cell = m.cell("11|A", "Lectura crítica")[0];
    expect(cell.teachers.map((x) => `${x.name}:${x.access}`)).toEqual(["leo:edit", "ana:view"]);
    expect(m.missingIn(m.groups.find((g) => g.name === "9A"))).toBe(5);
  });
});

describe("colegio helpers", () => {
  it("parses invitation lists in the usual shapes", () => {
    const { rows, bad } = parseInvites("Ana@Colegio.edu.co, Ana Pérez\nCarlos Ruiz <carlos@gmail.com>\nnope\nana@colegio.edu.co");
    expect(rows).toEqual([{ email: "ana@colegio.edu.co", name: "Ana Pérez" }, { email: "carlos@gmail.com", name: "Carlos Ruiz" }]);
    expect(bad).toEqual(["nope"]);
  });

  it("expands group letters and ranges", () => {
    expect(parseLabels("a, b c")).toEqual(["A", "B", "C"]);
    expect(parseLabels("A-D")).toEqual(["A", "B", "C", "D"]);
    expect(parseLabels("01 02")).toEqual(["01", "02"]);
  });

  it("uses the school's grades, else the ones in use", () => {
    expect(schoolGrades({ grades: ["11", "9"] })).toEqual(["9", "11"]);
    expect(schoolGrades({}, [{ grade: "10" }], [{ grade: "11" }])).toEqual(["10", "11"]);
    expect(schoolGrades(null)).toEqual(["6", "7", "8", "9", "10", "11"]);
  });

  it("describes access and per-teacher work without ranking", () => {
    const staff = [{ id: "ana", email: "ana@c.co", full_name: "Ana", role: "teacher" }, { id: "leo", email: "leo@c.co", full_name: "Leo", role: "teacher" }];
    expect(accessOf(staff[0], { courses, members }).map((a) => `${a.course.id}:${a.access}`)).toEqual(["l11a:view", "m11a:edit"]);
    const now = Date.parse("2026-10-25T00:00:00Z");
    const authorship = { assignments: [{ id: "a1", course_id: "m11a", created_by: "ana", created_at: "2026-10-20T00:00:00Z", kind: "homework", title: "Tarea 1" }] };
    const attempts = [{ assignment_id: "a1", profile_id: "p1", submitted_at: "x", mode: "timed", score: { keyed: true, correct: 3, total: 4 } }];
    const [ana, leo] = teacherStats({ staff, courses, members, authorship, attempts, now });
    expect(ana).toMatchObject({ classes: 1, viewOnly: 1, students: 2, activities: 1, recent: 1, completion: 50, avgPct: 75 });
    expect(leo).toMatchObject({ classes: 1, activities: 0, completion: null });
    expect(grantText({ area: "*", grade: "11" })).toBe("Todas las áreas en 11");
    const feed = buildFeed({ audit: [{ id: 1, actor: "boss", action: "invite", detail: { email: "z@c.co", role: "teacher" }, created_at: "2026-10-24T00:00:00Z" }], authorship, staff, courses });
    expect(feed.map((e) => e.text)).toEqual(["invitó a z@c.co como docente", "creó una tarea «Tarea 1» en Matemáticas · 11A"]);
    expect(auditText({ action: "access", detail: { course: "l11a", profile: "ana", access: "view" } }, { staff, courses })).toBe("cambió el permiso de Ana en Lectura crítica · 11A a «Solo ve»");
  });
});

describe("Cursos y materias screen", () => {
  const props = (over = {}) => {
    const made = [];
    return {
    api: { createGroups: vi.fn().mockResolvedValue([]), createCourse: vi.fn().mockImplementation(async (c) => { const row = { id: `${c.subject}-${c.groupLabel}`, name: c.name, grade: c.grade, subject: c.subject, group_label: c.groupLabel }; made.push(row); return row; }),
      listCourses: vi.fn().mockImplementation(async () => [...courses, ...made]), addStudents: vi.fn(), listMembers: vi.fn().mockResolvedValue([]), removeMember: vi.fn(), setGroupDirector: vi.fn() },
    profile: { id: "boss", school_id: "s1", role: "school_admin" }, courses, members, directors: [], records: [{ id: "g1", grade: "9", label: "A" }], grades: ["9", "10", "11"],
    staff: [{ id: "ana", email: "ana@c.co", full_name: "Ana", role: "teacher" }], guard: (fn) => fn(), setNotice: vi.fn(), reload: vi.fn(), onOpenClass: vi.fn(), log: vi.fn(), ...over,
    };
  };

  it("filters by grade (the old bug: changing the grade did nothing)", () => {
    render(<ClassMatrix {...props()} />);
    expect(screen.getByText("11A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^9/ }));
    expect(screen.queryByText("11A")).toBeNull();
    expect(screen.getByText("9A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^10mo/ }));
    expect(screen.getByText("10B")).toBeTruthy();
  });

  it("creates cursos with their five subjects", async () => {
    const p = props();
    render(<ClassMatrix {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo curso/ }));
    fireEvent.click(screen.getByRole("radio", { name: "10mo" }));
    fireEvent.change(screen.getByLabelText("Letras de los grupos"), { target: { value: "C, D" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear 2 cursos" }));
    await waitFor(() => expect(p.api.createCourse).toHaveBeenCalledTimes(10));
    expect(p.api.createGroups).toHaveBeenCalledWith([{ grade: "10", label: "C" }, { grade: "10", label: "D" }]);
    expect(p.api.createCourse.mock.calls[0][0]).toMatchObject({ grade: "10", groupLabel: "C", subject: "Lectura crítica", name: "Lectura crítica 10 C" });
    expect(p.log).toHaveBeenCalledWith("group_create", { groups: ["10C", "10D"] });
  });
});
