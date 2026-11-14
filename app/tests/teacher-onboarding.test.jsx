import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeacherLive from "../src/screens/TeacherLive.jsx";
import { firstSteps } from "../src/screens/teacher/Onboarding.jsx";
import { markTourSeen, tourSeen } from "../src/components/tour/Tour.jsx";
import { STUDENT_TOUR_IDS, TEACHER_TOUR_IDS, studentTour, studioTour, teacherFeatureIndex, teacherTour, teacherTourId, tourFrom } from "../src/lib/tours.jsx";

afterEach(() => { cleanup(); window.location.hash = ""; window.localStorage.clear(); });

const api = (extra = {}) => ({
  listCourses: vi.fn().mockResolvedValue([]), listAssignments: vi.fn().mockResolvedValue([]), allMembers: vi.fn().mockResolvedValue([]),
  allAttempts: vi.fn().mockResolvedValue([]), listMembers: vi.fn().mockResolvedValue([]), gradingModels: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]), groupDirectors: vi.fn().mockResolvedValue([]), schoolConsents: vi.fn().mockResolvedValue([]),
  ...extra,
});
const auth = (a, role = "teacher") => ({ api: a, profile: { id: "t1", school_id: "s1", role, full_name: "Lina Pérez", email: "lina@c.co" } });

describe("teacher onboarding", () => {
  it("never opens a guide by itself; «?» opens Ayuda and a function takes you to its screen", async () => {
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    await screen.findAllByText("Crea tu clase");
    await new Promise((r) => setTimeout(r, 800));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Ayuda: todas las funciones" })[0]);
    expect(await screen.findByRole("heading", { name: "¿Qué quieres ver?" })).toBeTruthy();
    expect(screen.getByText("Estás aquí")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tableros" }));
    expect(await screen.findByText(/Guía · Resultados · \d+ de \d+/)).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toContain("resultados"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el tutorial" }));
    expect(tourSeen("docente", "t1", "resultados")).toBe(true);
    expect(screen.queryByRole("heading", { name: "¿Qué quieres ver?" })).toBeNull();
  });

  it("walks every step of Hoy on request and ends on the first steps with the example-data switch off", async () => {
    render(<TeacherLive auth={auth(api(), "school_admin")} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Ver el tutorial otra vez/ }, { timeout: 3000 }))[0]);
    await screen.findByRole("heading", { name: "¡Hola, Lina!" });
    const titles = [];
    for (let i = 0; i < 15; i++) {
      const done = screen.queryByRole("button", { name: "Entendido" });
      titles.push(screen.getByRole("dialog", { name: /.+/ }).querySelector("h2").textContent);
      if (done) break;
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    }
    expect(titles).toContain("Estamos en beta");
    expect(titles.at(-1)).toBe("¡Listo para empezar!");
    const switches = screen.getAllByRole("switch", { name: "Datos de ejemplo" });
    expect(switches.every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(tourSeen("docente", "t1", "hoy")).toBe(true);
  });

  it("Ayuda finds a function by any word of its guide", async () => {
    window.location.hash = "#docente/resultados/resumen";
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    await new Promise((r) => setTimeout(r, 800));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Ayuda: todas las funciones" })[0]);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Buscar una función" }), { target: { value: "grafica tablero" } });
    expect(screen.getByRole("button", { name: "Tableros" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Banco de preguntas" })).toBeNull();
  });

  it("a new school sees first steps, not invented data, and the trial's days and seats", async () => {
    for (const id of TEACHER_TOUR_IDS) markTourSeen("docente", "t1", id);
    const expires = new Date(Date.now() + 5.5 * 864e5).toISOString();
    render(<TeacherLive auth={auth(api({ myTrial: vi.fn().mockResolvedValue({ school_name: "Colegio X", expires_at: expires, max_teachers: 15, teachers: 3 }) }))} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    expect((await screen.findAllByText("Crea tu clase")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Asigna la primera actividad").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText(/Quedan 6 días · 3 de 15 docentes/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Estudiante 07|Marcela/)).toBeNull();
  });

  it("ticks the steps from real data", () => {
    const s = firstSteps({ admin: false, courses: [{ id: "c" }], assignments: [] });
    expect(s.map((x) => x.done)).toEqual([true, false, false]);
    expect(firstSteps({ admin: true, courses: [], assignments: [] })[0].to).toEqual({ section: "colegio", tab: "cursos" });
  });

  it("every tutorial has steps, every teacher route maps to one, and coordination sees Colegio", () => {
    const ctx = { admin: true, name: "Lina", sample: "a1", paper: "p1", first: null, openTour: () => {} };
    for (const id of TEACHER_TOUR_IDS) expect(teacherTour(id, ctx).steps.length).toBeGreaterThan(0);
    for (const id of STUDENT_TOUR_IDS) expect(studentTour(id).steps.length).toBeGreaterThan(0);
    expect(teacherTourId({ section: "actividades", tab: "nueva" })).toBe("nueva");
    expect(teacherTourId({ section: "actividad", id: "x" })).toBe("actividad");
    const index = teacherFeatureIndex(ctx);
    expect(index.map((s) => s.id)).toContain("colegio");
    expect(index.every((s) => s.items.length > 0)).toBe(true);
    expect(teacherFeatureIndex({ ...ctx, admin: false }).map((s) => s.id)).not.toContain("colegio");
    // Opening a section at a later step still moves the app to that section's screen.
    const steps = teacherTour("biblioteca", ctx).steps;
    for (const it of index.find((s) => s.id === "biblioteca").items) expect(tourFrom(steps, it.start)[it.start].route).toBeTruthy();
    expect(studioTour({ versions: true }).map((s) => s.id)).toContain("s-ver");
  });
});
