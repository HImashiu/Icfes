import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { draftToRow, emptyDraft, teacherExam, validateDraft } from "../src/lib/teacherExam.js";
import QuestionBuilder from "../src/screens/QuestionBuilder.jsx";

afterEach(cleanup);

const row = (id, answer, over = {}) => ({
  id, area: "Matemáticas", competencia: "Razonamiento", tema: null, dificultad: 2, answer, explanation: null, visibility: "private", owner_id: "t1",
  question_json: { stem_md: `Enunciado ${id}`, stimulus_md: "", options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `Opción ${l}` })), traced: [] }, ...over,
});

describe("teacher exam", () => {
  it("builds an exam in the assignment's order with the teacher's key and a teacher source line", () => {
    const t = teacherExam([row("a", "B"), row("b", "D")], ["b", "a", "gone"]);
    expect(t.exam.questions.map((q) => q.key)).toEqual(["b", "a"]);
    expect(t.exam.questions[0]).toMatchObject({ number: 1, section: "Matemáticas", sourceLine: "Pregunta de tu docente" });
    expect(t.key.get("b")).toBe("D");
    expect(t.enrich["1"]).toMatchObject({ competencia: "Razonamiento", dificultad: 2 });
  });
  it("validates a draft and turns it into a row", () => {
    const d = emptyDraft();
    expect(validateDraft(d)).toEqual(expect.arrayContaining(["Escribe el enunciado.", "Falta la opción A.", "Marca cuál es la respuesta correcta."]));
    Object.assign(d, { stem: " 2+2 ", options: ["1", "2", "3", "3"], answer: "B" });
    expect(validateDraft(d)).toEqual(["Hay opciones repetidas."]);
    d.options[3] = "4";
    expect(validateDraft(d)).toEqual([]);
    expect(draftToRow(d, { schoolId: "s", ownerId: "o" })).toMatchObject({ school_id: "s", owner_id: "o", answer: "B", area: "Matemáticas", visibility: "private", question_json: { stem_md: "2+2", options: [{ letter: "A", text_md: "1" }, expect.anything(), expect.anything(), { letter: "D", text_md: "4" }] } });
  });
});

describe("QuestionBuilder", () => {
  const guard = async (fn) => fn();
  const profile = { id: "t1", school_id: "s1", role: "teacher" };
  it("saves a valid new question and refuses an incomplete one", async () => {
    const api = { teacherQuestions: vi.fn().mockResolvedValue([]), saveTeacherQuestion: vi.fn().mockResolvedValue({}), deleteTeacherQuestion: vi.fn() };
    render(<QuestionBuilder api={api} profile={profile} guard={guard} setNotice={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Nueva pregunta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Escribe el enunciado.")).toBeTruthy();
    expect(api.saveTeacherQuestion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Enunciado/), { target: { value: "¿Cuánto es 2+2?" } });
    ["1", "2", "3", "4"].forEach((t, i) => fireEvent.change(screen.getByLabelText(`Texto de la opción ${"ABCD"[i]}`), { target: { value: t } }));
    fireEvent.click(screen.getByLabelText("Opción D es la correcta"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.saveTeacherQuestion).toHaveBeenCalled());
    const [saved, id] = api.saveTeacherQuestion.mock.calls[0];
    expect(id).toBeNull();
    expect(saved).toMatchObject({ answer: "D", school_id: "s1", owner_id: "t1" });
  });
});
