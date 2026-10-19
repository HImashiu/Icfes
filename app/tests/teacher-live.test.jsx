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
  allMembers: vi.fn().mockResolvedValue([]),
  allAttempts: vi.fn().mockResolvedValue([]),
  assignmentAttempts: vi.fn().mockResolvedValue([]),
  examAttempts: vi.fn().mockResolvedValue([]),
  listStaff: vi.fn().mockResolvedValue([]),
  schoolConsents: vi.fn().mockResolvedValue([]),
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
    fireEvent.click(screen.getByRole("button", { name: "Espacios de clase" }));
    fireEvent.click(await screen.findByRole("button", { name: "Estudiantes" }));
    fireEvent.change(await screen.findByPlaceholderText(/nombre,apellidos,correo/), { target: { value: "nombre,apellidos,correo\nA,B,a@c.co\nC,D,nope\nE,F,e@c.co" } });
    expect(await screen.findByText(/2 válidos, 1 con problema/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agregar 2" }));
    await waitFor(() => expect(api.addStudents).toHaveBeenCalledWith("c1", [
      { email: "a@c.co", fullName: "A B", course: null },
      { email: "e@c.co", fullName: "E F", course: null },
    ]));
  });

  const bundle = () => {
    const qs = [1, 2, 3, 4].map((n) => ({ ...exam(n), key: String(n), stem_md: `<p>Pregunta ${n}</p>`, group: null }));
    return { exam: { title: "S11-A", questions: qs, sections: [{ name: "Matemáticas", questions: qs }] }, key: new Map(qs.map((q) => [q.key, "A"])), enrich: null, figures: null };
  };
  const openBuilder = async (api) => {
    render(<TeacherLive auth={auth(api)} exams={[{ slug: "S11-A_1ra", title: "S11-A", status: "ready", sections: ["Matemáticas"] }]} fetchExam={vi.fn().mockResolvedValue(bundle())} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Asignaciones" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nueva asignación" }));
    await screen.findByLabelText("Elegir pregunta 1");
  };

  it("hand-picks questions, reorders them and saves the keys in that order with the chosen rules", async () => {
    const api = fakeApi();
    await openBuilder(api);
    fireEvent.click(screen.getByLabelText("Elegir pregunta 3"));
    fireEvent.click(screen.getByLabelText("Elegir pregunta 1"));
    fireEvent.click(screen.getByLabelText("Subir pregunta 1"));
    fireEvent.click(screen.getByLabelText("Intentos permitidos"));
    fireEvent.click(screen.getByRole("option", { name: "2" }));
    fireEvent.click(screen.getByLabelText("Mostrar respuestas y explicaciones"));
    fireEvent.click(screen.getByRole("option", { name: "Cuando cierre la asignación" }));
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
    expect(api.createAssignment.mock.calls[0][0]).toMatchObject({
      course_id: "c1", kind: "homework", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["1", "3"], max_attempts: 2, reveal_policy: "after_close", status: "active",
    });
  });

  it("auto-fills a number of questions from the filtered bank", async () => {
    const api = fakeApi();
    await openBuilder(api);
    fireEvent.change(screen.getByLabelText("Cantidad automática"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Elegir automáticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
    expect(api.createAssignment.mock.calls[0][0].question_keys).toEqual(["1", "3"]);
  });

  it("refuses to assign with no questions", async () => {
    const api = fakeApi();
    await openBuilder(api);
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    expect(await screen.findByText("Elige al menos una pregunta.")).toBeTruthy();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });
});

describe("Dashboard and report", () => {
  const correct = (n) => ({ perArea: [{ name: "Matemáticas", correct: n, answered: 4, total: 4 }], correct: n, answered: 4, total: 4, keyed: true });
  const stu = (id, email) => ({ id: `m-${id}`, course_id: "c1", profile_id: id, email, full_name: email, role: "student" });

  it("shows school numbers: students, deliveries, average and the weakest area", async () => {
    const api = fakeApi({
      allMembers: vi.fn().mockResolvedValue([stu("p1", "a@c.co"), stu("p2", "b@c.co"), { ...stu("t", "t@c.co"), role: "teacher" }]),
      listAssignments: vi.fn().mockResolvedValue([{ id: "a1", course_id: "c1", kind: "task", title: "T", status: "active", due_at: future, opens_at: "2026-01-01T00:00:00Z", courses: { name: "11-A" } }]),
      allAttempts: vi.fn().mockResolvedValue([
        { profile_id: "p1", client_id: "x", assignment_id: "a1", submitted_at: "2026-10-17T10:00:00Z", mode: "practice", score: correct(3) },
        { profile_id: "p2", client_id: "y", assignment_id: "a1", submitted_at: "2026-10-17T10:00:00Z", mode: "practice", score: correct(1) },
      ]),
    });
    render(<TeacherLive auth={{ api, profile: { id: "t1", school_id: "s1", role: "school_admin", full_name: "Rec", email: "r@c.co" } }} exams={[]} fetchExam={vi.fn()} onExit={() => {}} />);
    expect(await screen.findByText("Resumen del colegio")).toBeTruthy();
    expect(await screen.findByText("50 %", { selector: "strong" })).toBeTruthy();
    expect(screen.getAllByText(/Matemáticas/).length).toBeGreaterThan(0);
  });

  it("lists the questions the class failed most, with a key warning when most chose another option", async () => {
    const qs = [1, 2].map((n) => ({ key: String(n), number: n, section: "Matemáticas" }));
    const answers = (a, b) => ({ 1: a, 2: b });
    const at = (id, ans) => ({ profile_id: id, client_id: id, assignment_id: "a1", submitted_at: "2026-10-17T10:00:00Z", mode: "practice", score: correct(2), answers: ans });
    const api = fakeApi({
      listAssignments: vi.fn().mockResolvedValue([{ id: "a1", course_id: "c1", kind: "task", title: "Tarea mate", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["1", "2"], status: "active", due_at: future, opens_at: "2026-01-01T00:00:00Z", courses: { name: "11-A" } }]),
      listMembers: vi.fn().mockResolvedValue(["p1", "p2", "p3", "p4", "p5"].map((p) => stu(p, `${p}@c.co`))),
      assignmentAttempts: vi.fn().mockResolvedValue(["p1", "p2", "p3", "p4", "p5"].map((p) => at(p, answers("A", "C")))),
    });
    const fetchExam = vi.fn().mockResolvedValue({ exam: { title: "S11-A", questions: qs, sections: [{ name: "Matemáticas", questions: qs }] }, key: new Map([["1", "A"], ["2", "B"]]) });
    render(<TeacherLive auth={auth(api)} exams={[]} fetchExam={fetchExam} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Asignaciones" }));
    fireEvent.click(await screen.findByText("Tarea mate"));
    expect(await screen.findByText("Análisis por pregunta · las más falladas primero")).toBeTruthy();
    expect(await screen.findByText("Revisar clave")).toBeTruthy();
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
  it("explains where tasks will appear when there are none", () => {
    const { container } = render(<AssignedList assignments={[]} attempts={[]} onStart={() => {}} />);
    expect(container.textContent).toMatch(/aparecerá aquí/);
  });
});
