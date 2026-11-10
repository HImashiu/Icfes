import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeacherLive from "../src/screens/TeacherLive.jsx";
import { firstSteps, markTourSeen, tourSeen } from "../src/screens/teacher/Onboarding.jsx";

afterEach(() => { cleanup(); window.location.hash = ""; window.localStorage.clear(); });

const api = (extra = {}) => ({
  listCourses: vi.fn().mockResolvedValue([]), listAssignments: vi.fn().mockResolvedValue([]), allMembers: vi.fn().mockResolvedValue([]),
  allAttempts: vi.fn().mockResolvedValue([]), listMembers: vi.fn().mockResolvedValue([]), gradingModels: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]), groupDirectors: vi.fn().mockResolvedValue([]), schoolConsents: vi.fn().mockResolvedValue([]),
  ...extra,
});
const auth = (a, role = "teacher") => ({ api: a, profile: { id: "t1", school_id: "s1", role, full_name: "Lina Pérez", email: "lina@c.co" } });

describe("teacher onboarding", () => {
  it("opens the tour on the first visit only, and it can be replayed", async () => {
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    expect(await screen.findByRole("heading", { name: "¡Hola, Lina!" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(tourSeen("t1")).toBe(true);
    expect(screen.queryByRole("heading", { name: "¡Hola, Lina!" })).toBeNull();
    cleanup();
    render(<TeacherLive auth={auth(api())} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    await screen.findAllByText("Crea tu clase");
    expect(screen.queryByRole("heading", { name: "¡Hola, Lina!" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Ver el recorrido/ })[0]);
    expect(await screen.findByRole("heading", { name: "¡Hola, Lina!" })).toBeTruthy();
  });

  it("walks every step and ends on the first steps with the example-data switch off", async () => {
    render(<TeacherLive auth={auth(api(), "school_admin")} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "¡Hola, Lina!" });
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    const titles = [];
    for (let i = 0; i < 12; i++) {
      const done = screen.queryByRole("button", { name: "Terminar" });
      titles.push(screen.getByRole("dialog", { name: /.+/ }).querySelector("h2").textContent);
      if (done) break;
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    }
    expect(titles).toContain("Colegio"); // coordination sees its own step
    expect(titles.at(-1)).toBe("¡Listo para empezar!");
    const switches = screen.getAllByRole("switch", { name: "Datos de ejemplo" });
    expect(switches.every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
    expect(tourSeen("t1")).toBe(true);
  });

  it("a new school sees first steps, not invented data, and the trial's days and seats", async () => {
    markTourSeen("t1");
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
});
