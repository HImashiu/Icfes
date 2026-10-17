import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeacherLive from "../src/screens/TeacherLive.jsx";
import AssignedList from "../src/screens/AssignedList.jsx";

afterEach(cleanup);

const future = new Date(Date.now() + 5 * 864e5).toISOString();
const exam = (n) => ({ key: String(n), number: n, section: "Matemáticas" });
const fakeApi = (over = {}) => ({
  getProfile: vi.fn().mockResolvedValue({ id: "t1" }),
  listCourses: vi.fn().mockResolvedValue([{ id: "c1", name: "11-A", grade: "11" }]),
  listAssignments: vi.fn().mockResolvedValue([]),
  listMembers: vi.fn().mockResolvedValue([]),
  addStudents: vi.fn().mockResolvedValue(2),
  createCourse: vi.fn(),
  createAssignment: vi.fn().mockImplementation(async (a) => ({ ...a, id: "a1" })),
  ...over,
});
const auth = (api) => ({ api, profile: { id: "t1", school_id: "s1", role: "teacher", full_name: "Ana", email: "ana@c.co" } });

describe("TeacherLive", () => {
  it("imports a pasted roster and sends only the valid rows", async () => {
    const api = fakeApi();
    render(<TeacherLive auth={auth(api)} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Estudiantes" }));
    fireEvent.change(await screen.findByPlaceholderText(/nombre,apellidos,correo/), { target: { value: "nombre,apellidos,correo\nA,B,a@c.co\nC,D,nope\nE,F,e@c.co" } });
    expect(await screen.findByText(/2 válidos, 1 con problema/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agregar 2" }));
    await waitFor(() => expect(api.addStudents).toHaveBeenCalledWith("c1", [
      { email: "a@c.co", fullName: "A B", course: null },
      { email: "e@c.co", fullName: "E F", course: null },
    ]));
  });

  it("creates an assignment with a spread of question keys from the loaded exam", async () => {
    const api = fakeApi();
    const fetchExam = vi.fn().mockResolvedValue({ exam: { title: "S11-A", questions: [1, 2, 3, 4].map(exam), sections: [{ name: "Matemáticas", questions: [1, 2, 3, 4].map(exam) }] } });
    render(<TeacherLive auth={auth(api)} exams={[{ slug: "S11-A_1ra", status: "ready", sections: ["Matemáticas"] }]} fetchExam={fetchExam} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Asignaciones" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nueva asignación" }));
    fireEvent.change(screen.getByLabelText(/Cantidad de preguntas/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
    expect(api.createAssignment.mock.calls[0][0]).toMatchObject({ course_id: "c1", kind: "homework", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["1", "3"], status: "active" });
  });
});

describe("AssignedList", () => {
  const a = { id: "a1", title: "Tarea 1", scope: "all", kind: "homework", status: "active", due_at: future, opens_at: "2026-01-01T00:00:00Z", courses: { name: "11-A" } };
  it("offers Empezar until the task is delivered, then shows Entregada", () => {
    const onStart = vi.fn();
    const { rerender } = render(<AssignedList assignments={[a]} attempts={[]} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    expect(onStart).toHaveBeenCalledWith(a);
    rerender(<AssignedList assignments={[a]} attempts={[{ assignment_id: "a1", submitted_at: "2026-10-17T10:00:00Z" }]} onStart={onStart} />);
    expect(screen.getByText("Entregada")).toBeTruthy();
  });
  it("renders nothing when there are no open tasks", () => {
    const { container } = render(<AssignedList assignments={[]} attempts={[]} onStart={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
