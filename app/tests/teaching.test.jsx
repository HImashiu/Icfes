import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TeacherLive from "../src/screens/TeacherLive.jsx";
import Presenter from "../src/screens/Presenter.jsx";

afterEach(cleanup);

const mkq = (n) => ({
  key: String(n), number: n, section: "Matemáticas", group: null, stimulus_md: "", stem_md: `<p>Enunciado ${n}</p>`,
  options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `<p>Opción ${l}${n}</p>` })),
});
const bundle = () => {
  const qs = [1, 2, 3].map(mkq);
  return {
    exam: { title: "S11-A", questions: qs, sections: [{ name: "Matemáticas", questions: qs }] },
    key: new Map([["1", "B"], ["2", "C"]]),
    enrich: { 1: { explicacion: "Porque B es la única válida.", distractores: { A: "No cumple." } }, 2: { explicacion: "NO DEBE SALIR", hidden: true } },
    figures: new Map(),
  };
};
const lessonRow = (over = {}) => ({
  id: "l1", owner_id: "t1", title: "Repaso de álgebra", exam_slug: "S11-A_1ra", visibility: "private", updated_at: new Date().toISOString(),
  settings: {}, items: [{ type: "q", key: "1" }, { type: "text", title: "Pausa", body: "- respiren" }, { type: "q", key: "2" }, { type: "q", key: "3" }], ...over,
});
const fakeApi = (over = {}) => ({
  listCourses: vi.fn().mockResolvedValue([{ id: "c1", name: "11-A", grade: "11" }]),
  listAssignments: vi.fn().mockResolvedValue([]),
  lessons: vi.fn().mockResolvedValue([lessonRow()]),
  saveLesson: vi.fn().mockImplementation(async (row, id) => ({ id: id ?? "new1", owner_id: "t1", updated_at: new Date().toISOString(), ...row })),
  deleteLesson: vi.fn(),
  activityFormats: vi.fn().mockResolvedValue([]),
  saveActivityFormat: vi.fn().mockResolvedValue({}),
  createAssignment: vi.fn().mockImplementation(async (a) => ({ ...a, id: "a1" })),
  liveCreate: vi.fn().mockResolvedValue({ id: "s1", code: "123456", title: "x", state: "lobby", current_index: -1, question_keys: ["1"], seconds_per_question: 60, exam_slug: "S11-A_1ra" }),
  liveSession: vi.fn(), livePlayers: vi.fn().mockResolvedValue([]), liveAnswers: vi.fn().mockResolvedValue([]), liveNow: vi.fn().mockResolvedValue(new Date().toISOString()),
  getProfile: vi.fn().mockResolvedValue({ id: "t1" }),
  ...over,
});
const auth = (api) => ({ api, profile: { id: "t1", school_id: "s1", role: "teacher", full_name: "Ana", email: "ana@c.co" } });
const exams = [{ slug: "S11-A_1ra", title: "S11-A", status: "ready", sections: ["Matemáticas"] }];

const openLesson = async (api) => {
  window.location.hash = "#docente/biblioteca/clases";
  render(<TeacherLive auth={auth(api)} exams={exams} fetchExam={vi.fn().mockResolvedValue(bundle())} onExit={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Repaso de álgebra" }));
  await screen.findByText(/1\. Enunciado 1/);
};

describe("Presenter", () => {
  const lesson = { ...lessonRow(), settings: { hideOptions: true } };
  const press = (key) => fireEvent.keyDown(window, { key });

  it("reveals options, answer and explanation one step at a time and hides unsettled explanations", async () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} start={1} />);
    expect(screen.getByText("Enunciado 1")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull(); // options hidden at first
    press(" ");
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.queryByText("Clave preliminar, no oficial.")).toBeNull();
    press(" ");
    expect(screen.getByText("Clave preliminar, no oficial.")).toBeTruthy();
    expect(screen.queryByText("Porque B es la única válida.")).toBeNull();
    press(" ");
    expect(screen.getByText("Porque B es la única válida.")).toBeTruthy();
    press(" "); // next slide: the text slide
    expect(screen.getByRole("heading", { name: "Pausa" })).toBeTruthy();
    expect(screen.getByText("respiren")).toBeTruthy();
  });

  it("jumps to the answer with A and never shows a hidden explanation", () => {
    render(<Presenter lesson={{ ...lesson, settings: {} }} bundle={bundle()} onExit={() => {}} start={3} />);
    expect(screen.getByText("Enunciado 2")).toBeTruthy();
    press("e"); // no settled explanation: stays on the question
    expect(screen.queryByText("Clave preliminar, no oficial.")).toBeNull();
    press("a");
    expect(screen.getByText("Clave preliminar, no oficial.")).toBeTruthy();
    press("e");
    expect(screen.queryByText("NO DEBE SALIR")).toBeNull();
  });

  it("says when a question has no key, blanks the screen with B and leaves with Escape", () => {
    const onExit = vi.fn();
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={onExit} start={4} />);
    expect(screen.getByText(/no tiene clave/)).toBeTruthy();
    press("b");
    expect(screen.getByRole("button", { name: "Quitar pantalla en blanco" })).toBeTruthy();
    press("x");
    expect(screen.queryByRole("button", { name: "Quitar pantalla en blanco" })).toBeNull();
    press("Escape");
    expect(onExit).toHaveBeenCalled();
  });

  it("shows no ranking or student names", () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} start={1} />);
    expect(document.body.textContent).not.toMatch(/ranking|podio|posici[óo]n/i);
  });

  it("starts a countdown with the timer button", () => {
    render(<Presenter lesson={lesson} bundle={bundle()} onExit={() => {}} start={1} />);
    fireEvent.click(screen.getByRole("button", { name: /Cronómetro de 60 segundos/ }));
    expect(screen.getByRole("timer").textContent).toMatch(/^[01]:\d\d$/);
  });
});

describe("Clases", () => {
  it("creates a lesson from picked bank questions", async () => {
    const api = fakeApi({ lessons: vi.fn().mockResolvedValue([]) });
    window.location.hash = "#docente/biblioteca/clases";
    render(<TeacherLive auth={auth(api)} exams={exams} fetchExam={vi.fn().mockResolvedValue(bundle())} onExit={() => {}} />);
      fireEvent.click(await screen.findByRole("button", { name: /Nueva clase/ }));
    await screen.findByLabelText("Elegir pregunta 1");
    fireEvent.click(screen.getByLabelText("Elegir pregunta 3"));
    fireEvent.click(screen.getByLabelText("Elegir pregunta 1"));
    fireEvent.change(screen.getByPlaceholderText(/Repaso de álgebra/), { target: { value: "Funciones" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear clase" }));
    await waitFor(() => expect(api.saveLesson).toHaveBeenCalled());
    expect(api.saveLesson.mock.calls[0][0]).toMatchObject({
      title: "Funciones", exam_slug: "S11-A_1ra", school_id: "s1", owner_id: "t1", visibility: "private",
      items: [{ type: "q", key: "3" }, { type: "q", key: "1" }],
    });
  });

  it("explains a missing migration instead of failing", async () => {
    const api = fakeApi({ lessons: vi.fn().mockResolvedValue(null) });
    window.location.hash = "#docente/biblioteca/clases";
    render(<TeacherLive auth={auth(api)} exams={exams} fetchExam={vi.fn()} onExit={() => {}} />);
      expect(await screen.findByText(/migración 0017/)).toBeTruthy();
  });

  it("adds a text slide and saves the lesson with it", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.change(screen.getByLabelText("Título de la nueva diapositiva"), { target: { value: "Objetivo" } });
    fireEvent.change(screen.getByLabelText("Texto de la nueva diapositiva"), { target: { value: "Resolver ecuaciones" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar diapositiva" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.saveLesson).toHaveBeenCalled());
    const [row, id] = api.saveLesson.mock.calls[0];
    expect(id).toBe("l1");
    expect(row.items.at(-1)).toEqual({ type: "text", title: "Objetivo", body: "Resolver ecuaciones" });
    expect(row.items.filter((i) => i.type === "q").map((i) => i.key)).toEqual(["1", "2", "3"]);
  });

  it("turns the lesson into an assignment with a chosen format", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.click(screen.getByRole("button", { name: "Convertir en actividad" }));
    fireEvent.click(await screen.findByRole("button", { name: /Quiz sin pistas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
    expect(api.createAssignment.mock.calls[0][0]).toMatchObject({
      course_id: "c1", created_by: "t1", kind: "homework", title: "Repaso de álgebra", exam_slug: "S11-A_1ra", question_keys: ["1", "2", "3"],
      max_attempts: 1, reveal_policy: "after_close", allow_hints: false, instant_feedback: false, lesson_id: "l1", status: "active",
    });
  });

  it("saves the current settings as your own format", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.click(screen.getByRole("button", { name: "Convertir en actividad" }));
    fireEvent.click(await screen.findByRole("button", { name: /Examen con tiempo/ }));
    fireEvent.change(screen.getByLabelText("Nombre del formato"), { target: { value: "Parcial" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar formato" }));
    await waitFor(() => expect(api.saveActivityFormat).toHaveBeenCalled());
    expect(api.saveActivityFormat.mock.calls[0][0]).toMatchObject({ name: "Parcial", owner_id: "t1", config: { kind: "exam", proctor: true, attempts: 1 } });
  });

  it("opens a live room with the lesson's questions", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.click(screen.getByRole("button", { name: "Jugar en vivo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Crear sala" }));
    await waitFor(() => expect(api.liveCreate).toHaveBeenCalledWith({ title: "Repaso de álgebra", exam: "S11-A_1ra", keys: ["1", "2", "3"], seconds: 60, course: "" }));
  });

  it("prints a teacher's key with settled explanations only", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.click(screen.getByRole("button", { name: "Clave del docente" }));
    const key = (await screen.findByText(/Clave del docente · Repaso/)).closest(".pk");
    expect(within(key).getByText("Porque B es la única válida.")).toBeTruthy();
    expect(key.textContent).not.toContain("NO DEBE SALIR");
    expect(within(key).getByText("Sin clave.")).toBeTruthy();
  });

  it("prints the worksheet header for students", async () => {
    const api = fakeApi();
    await openLesson(api);
    fireEvent.click(screen.getByRole("button", { name: "Hoja de trabajo" }));
    expect(await screen.findByText(/Encierra en un círculo la letra/)).toBeTruthy();
  });

  it("lets a colleague's lesson be presented and duplicated but not edited", async () => {
    const api = fakeApi({ lessons: vi.fn().mockResolvedValue([lessonRow({ owner_id: "other", visibility: "school" })]) });
    await openLesson(api);
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByLabelText("Nueva diapositiva de texto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    await waitFor(() => expect(api.saveLesson).toHaveBeenCalled());
    expect(api.saveLesson.mock.calls[0][0]).toMatchObject({ owner_id: "t1", title: "Copia de Repaso de álgebra", visibility: "private" });
  });
});
