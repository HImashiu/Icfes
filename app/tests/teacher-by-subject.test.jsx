import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { areaOf, buildContexts, classMatrix, contextCourseIds, contextLabel, groupOf, scopeApi, validContext } from "../src/lib/teaching.js";
import { crumbs, normalize, parseRoute, routeHash } from "../src/lib/teacherRoutes.js";
import { loadReceipts, markSeen, saveReceipt, scanReceipt } from "../src/lib/receipts.js";
import { todayModel } from "../src/lib/today.js";
import TeacherLive from "../src/screens/TeacherLive.jsx";

afterEach(() => { cleanup(); window.location.hash = ""; window.localStorage.clear(); });

const courses = [
  { id: "m11a", name: "Matemáticas 11A", subject: "Matemáticas", grade: "11", group_label: "A" },
  { id: "m11b", name: "Matemáticas 11B", subject: "Matemáticas", grade: "11", group_label: "B" },
  { id: "f11a", name: "Física 11A", subject: "Física", grade: "11", group_label: "A" },
  { id: "i11a", name: "Inglés 11A", subject: "Inglés", grade: "11", group_label: "A" },
];
const t = (course_id, profile_id, email) => ({ id: `${course_id}-${profile_id}`, course_id, profile_id, email, role: "teacher" });
const s = (course_id, email) => ({ id: `${course_id}-${email}`, course_id, email, role: "student" });
const members = [t("m11a", "ana", "ana@c.co"), t("m11b", "ana", "ana@c.co"), t("f11a", "leo", "leo@c.co"), t("i11a", "eva", "eva@c.co"), s("m11a", "x@c.co"), s("f11a", "x@c.co"), s("m11b", "y@c.co")];

describe("teaching contexts", () => {
  it("groups classes by ICFES area: Física counts as Naturales, Español as Lectura", () => {
    expect(areaOf({ subject: "Física" })).toBe("Ciencias naturales");
    expect(areaOf({ subject: "Español" })).toBe("Lectura crítica");
    expect(areaOf({ name: "Inglés 9 B" })).toBe("Inglés");
    expect(groupOf(courses[0])).toMatchObject({ key: "11|A", name: "11A" });
  });

  it("gives coordination every subject and a teacher the classes the database returned", () => {
    const admin = buildContexts({ courses, members, profile: { id: "boss", role: "school_admin" } });
    expect(admin.admin).toBe(true);
    expect(admin.subjects.map((x) => x.key)).toEqual(["Matemáticas", "Ciencias naturales", "Inglés"]);
    expect(contextLabel(admin, { subject: null })).toBe("Todo el colegio");
    const ana = buildContexts({ courses: courses.slice(0, 2), members, profile: { id: "ana", role: "teacher", email: "ana@c.co" } });
    expect(ana.subjects[0].classes.map((c) => c.name)).toEqual(["11A", "11B"]);
    expect(contextLabel(ana, { subject: "Matemáticas", courseId: "m11b" })).toBe("Matemáticas · 11B");
    expect(contextCourseIds(ana, { subject: "Matemáticas" })).toEqual(["m11a", "m11b"]);
  });

  it("marks a directed group's other subjects read only", () => {
    const ctx = buildContexts({ courses: [courses[0], courses[2]], members, profile: { id: "ana", role: "teacher" }, directors: [{ grade: "11", group_label: "A", profile_id: "ana" }] });
    const fis = ctx.subjects.find((x) => x.key === "Ciencias naturales").classes[0];
    expect(fis.readOnly).toBe(true);
    expect(ctx.subjects.find((x) => x.key === "Matemáticas").classes[0].readOnly).toBe(false);
  });

  it("falls back to everything when a saved context no longer exists", () => {
    const ctx = buildContexts({ courses, members, profile: { id: "boss", role: "school_admin" } });
    expect(validContext(ctx, { subject: "Sociales y ciudadanas" })).toEqual({ subject: null, courseId: null });
    expect(validContext(ctx, { subject: "Inglés", courseId: "gone" })).toEqual({ subject: "Inglés", courseId: null });
  });

  it("builds the groups × areas table without listing the coordinator as teacher", () => {
    const m = classMatrix({ courses, members: [...members, t("i11a", "boss", "boss@c.co")], staffRoles: { boss: "school_admin" } });
    expect(m.groups.map((g) => g.name)).toEqual(["11A", "11B"]);
    expect(m.groups[0].students).toBe(1);
    expect(m.cell("11|A", "Inglés")[0].teachers.map((x) => x.email)).toEqual(["eva@c.co"]);
    expect(m.cell("11|B", "Inglés")).toEqual([]);
    expect(m.missing).toBe(2 + 4);
  });

  it("narrows every list through scopeApi", async () => {
    const api = {
      listCourses: vi.fn().mockResolvedValue(courses),
      listAssignments: vi.fn().mockResolvedValue([{ id: "a1", course_id: "m11a" }, { id: "a2", course_id: "i11a" }]),
      allMembers: vi.fn().mockResolvedValue(members),
      allAttempts: vi.fn().mockResolvedValue([{ assignment_id: "a1" }, { assignment_id: "a2" }]),
    };
    const scoped = scopeApi(api, ["m11a"]);
    expect((await scoped.listCourses()).map((c) => c.id)).toEqual(["m11a"]);
    expect((await scoped.listAssignments()).map((a) => a.id)).toEqual(["a1"]);
    expect((await scoped.allAttempts()).map((a) => a.assignment_id)).toEqual(["a1"]);
    expect(scopeApi(api, null)).toBe(api);
  });
});

describe("teacher routes", () => {
  it("parses and writes addresses, defaulting unknown parts", () => {
    expect(parseRoute("#docente/actividad/a1/papel")).toEqual({ section: "actividad", id: "a1", tab: "papel" });
    expect(parseRoute("#docente/resultados/xx")).toEqual({ section: "resultados", tab: "resumen", id: null });
    expect(parseRoute("#otra")).toMatchObject({ section: "hoy" });
    expect(routeHash({ section: "estudiantes", tab: "clases" })).toBe("#docente/estudiantes/clases");
    expect(normalize({ section: "actividad" })).toMatchObject({ section: "actividades", tab: "lista" });
  });
  it("builds breadcrumbs with links on every crumb but the last", () => {
    const c = crumbs({ section: "actividad", id: "a1", tab: "papel" }, { activityTitle: "Simulacro 2" });
    expect(c.map((x) => x.label)).toEqual(["Actividades", "Simulacro 2", "En papel"]);
    expect(c[0].route).toEqual({ section: "actividades" });
  });
});

describe("receipts", () => {
  it("says where scanned sheets went and keeps a week of them", () => {
    const r = scanReceipt({ assignment: { id: "a1", title: "Simulacro 2", scope: "Inglés", courses: { name: "Inglés 11A" } }, course: courses[3], count: 32, average: 63 });
    expect(r.title).toBe("32 hojas guardadas");
    expect(r.where[0].route).toEqual({ section: "actividad", id: "a1", tab: "resultados" });
    const now = Date.parse("2026-10-24T10:00:00Z");
    saveReceipt("u", r, { now });
    expect(loadReceipts("u", { now })[0].seen).toBe(false);
    expect(markSeen("u", { now })[0].seen).toBe(true);
    expect(loadReceipts("u", { now: now + 8 * 864e5 })).toEqual([]);
  });
});

describe("todayModel", () => {
  it("flags an activity that closes soon and counts deliveries", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    const a = { id: "a1", course_id: "m11a", title: "Taller", status: "active", opens_at: "2026-10-20T00:00:00Z", due_at: "2026-10-25T00:00:00Z", courses: { name: "Matemáticas 11A" } };
    const m = todayModel({ courses: [courses[0]], assignments: [a], attempts: [], roster: [], now });
    expect(m.kpis.active).toBe(1);
    expect(m.attention.some((x) => x.kind === "closing")).toBe(true);
  });
});

describe("new teacher shell", () => {
  const api = () => ({
    listCourses: vi.fn().mockResolvedValue(courses), listAssignments: vi.fn().mockResolvedValue([]), allMembers: vi.fn().mockResolvedValue(members),
    allAttempts: vi.fn().mockResolvedValue([]), listMembers: vi.fn().mockResolvedValue([]), gradingModels: vi.fn().mockResolvedValue([]),
    listStaff: vi.fn().mockResolvedValue([]), groupDirectors: vi.fn().mockResolvedValue([]), schoolConsents: vi.fn().mockResolvedValue([]),
  });
  const auth = (a) => ({ api: a, profile: { id: "boss", school_id: "s1", role: "school_admin", full_name: "Rita Coord", email: "boss@c.co" } });

  it("has Juego en vivo and Nueva actividad in the top bar and moves by address", async () => {
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Juego en vivo" }));
    expect(window.location.hash).toBe("#docente/actividades/vivo");
    fireEvent.click(await screen.findByRole("button", { name: "Nueva actividad" }));
    expect(window.location.hash).toBe("#docente/actividades/nueva");
  });

  it("switches the subject and remembers it", async () => {
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Todo el colegio/ }));
    fireEvent.click(await screen.findByRole("option", { name: /^Inglés/ }));
    expect(JSON.parse(window.localStorage.getItem("condor:ctx:boss"))).toEqual({ subject: "Inglés", courseId: null });
  });

  it("shows coordination who teaches what, by curso and subject", async () => {
    window.location.hash = "#docente/colegio/cursos";
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Cursos y materias" })).toBeTruthy();
    expect(await screen.findByText("eva@c.co")).toBeTruthy();
    expect(screen.getByText("11B")).toBeTruthy();
  });
});
