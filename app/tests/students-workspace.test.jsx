import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TeacherLive from "../src/screens/TeacherLive.jsx";

afterEach(() => { cleanup(); window.localStorage.clear(); });

const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const names = ["Ana Pérez", "Beto Ruiz", "Carolina Díaz", "Daniel Gómez", "Elena Mora"];
const members = names.flatMap((n, i) => {
  const email = `${n.split(" ")[0].toLowerCase()}@c.co`;
  const rows = [{ id: `m${i}`, course_id: "c1", profile_id: i === 4 ? null : `p${i}`, email, full_name: n, role: "student" }];
  if (i === 0) rows.push({ id: "m0b", course_id: "c2", profile_id: "p0", email, full_name: n, role: "student" });
  return rows;
});
const assignments = [
  { id: "a1", course_id: "c1", title: "Simulacro 1", kind: "exam", status: "active", due_at: day(4), opens_at: day(20), courses: { name: "11-A" } },
  { id: "a2", course_id: "c2", title: "Lectura corta", kind: "task", status: "active", due_at: day(-3), opens_at: day(5), courses: { name: "Inglés 11" } },
];
const attempt = (pid, aid, d, correct) => ({ profile_id: pid, assignment_id: aid, submitted_at: day(d), mode: "exam", duration_sec: 1200, score: { keyed: true, correct, total: 10, answered: 10, perArea: [{ name: "Matemáticas", correct, total: 10 }] } });
const missing = () => Promise.reject(Object.assign(new Error("relation does not exist"), { code: "missing" }));

const fakeApi = () => ({
  listCourses: vi.fn().mockResolvedValue([{ id: "c1", name: "11-A", grade: "11" }, { id: "c2", name: "Inglés 11", grade: "11" }]),
  listAssignments: vi.fn().mockResolvedValue(assignments),
  allMembers: vi.fn().mockResolvedValue(members),
  allAttempts: vi.fn().mockResolvedValue([attempt("p0", "a1", 5, 8), attempt("p1", "a1", 5, 3)]),
  reportAttempts: vi.fn().mockResolvedValue([attempt("p0", "a1", 5, 8), attempt("p1", "a1", 5, 3)]),
  listMembers: vi.fn().mockResolvedValue([]),
  assignmentAttempts: vi.fn().mockResolvedValue([]),
  schoolConsents: vi.fn().mockResolvedValue([]),
  wsList: vi.fn().mockImplementation(missing),
});
const auth = (api) => ({ api, profile: { id: "t1", school_id: "s1", role: "teacher", full_name: "Docente Ana", email: "doc@c.co" } });

async function openWorkspace() {
  const api = fakeApi();
  window.location.hash = "#docente/estudiantes/lista";
  render(<TeacherLive auth={auth(api)} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
  await screen.findByRole("heading", { name: "Estudiantes" });
  return api;
}
const rowNames = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector(".ws-name strong")?.textContent).filter(Boolean);

describe("Estudiantes workspace", () => {
  it("lists every student once across spaces and searches them", async () => {
    await openWorkspace();
    expect(rowNames()).toEqual(["Ana Pérez", "Beto Ruiz", "Carolina Díaz", "Daniel Gómez", "Elena Mora"]);
    expect(screen.getByText(/solo en este navegador/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar estudiante"), { target: { value: "ingles" } });
    expect(rowNames()).toEqual(["Ana Pérez"]);
    fireEvent.change(screen.getByLabelText("Buscar estudiante"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Sin ingresar/ }));
    expect(rowNames()).toEqual(["Elena Mora"]);
  });

  it("saves a view and gives statuses and follow-up to several students at once", async () => {
    await openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Necesitan atención/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar vista/ }));
    fireEvent.change(screen.getByLabelText("Nombre de la vista"), { target: { value: "Atención" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("button", { name: "Atención" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Estados" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar los sugeridos" }));
    await screen.findByText("Necesita apoyo");
    fireEvent.click(screen.getByRole("tab", { name: "Lista" }));
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));

    fireEvent.click(screen.getByLabelText("Seleccionar a Beto Ruiz"));
    fireEvent.click(screen.getByLabelText("Seleccionar a Elena Mora"));
    const bar = screen.getByRole("region", { name: "Acciones para los seleccionados" });
    expect(within(bar).getByText("2 seleccionados")).toBeTruthy();
    fireEvent.click(within(bar).getByLabelText("Poner estado"));
    fireEvent.click(await screen.findByRole("option", { name: "Necesita apoyo" }));
    await waitFor(() => expect(screen.getAllByText("Necesita apoyo").length).toBeGreaterThan(1));
    fireEvent.click(within(bar).getByRole("button", { name: /Seguimiento/ }));
    await screen.findByText(/2 estudiantes en seguimiento/);

    fireEvent.click(screen.getByRole("tab", { name: /Seguimiento/ }));
    const queue = screen.getByText("Cola de seguimiento").closest("section");
    expect(within(queue).getByText("Beto Ruiz")).toBeTruthy();
    expect(within(queue).getByText("Elena Mora")).toBeTruthy();
  });

  it("opens a full profile, moves to the next student and keeps notes", async () => {
    await openWorkspace();
    fireEvent.click(screen.getByText("Ana Pérez"));
    expect(await screen.findByRole("heading", { name: "Ana Pérez" })).toBeTruthy();
    expect(screen.getAllByText("Simulacro 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Lectura corta")).toBeTruthy();
    expect(screen.getByText("1 de 5")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nueva nota"), { target: { value: "Va muy bien en matemáticas." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    expect(await screen.findByText("Va muy bien en matemáticas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Estudiante siguiente" }));
    expect(await screen.findByRole("heading", { name: "Beto Ruiz" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Estudiante anterior" }));
    expect(await screen.findByText("Va muy bien en matemáticas.")).toBeTruthy();
  });

  it("opens a student from the alerts in Resumen", async () => {
    const api = fakeApi();
    window.location.hash = "#docente/resultados/resumen";
    render(<TeacherLive auth={auth(api)} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    expect(await screen.findByText("Resumen de la semana")).toBeTruthy();
    fireEvent.click((await screen.findAllByRole("button", { name: "Elena Mora" }))[0]);
    expect(await screen.findByRole("heading", { name: "Elena Mora" })).toBeTruthy();
  });
});
