import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseQuestionText, splitOptions, toSource, toVisual } from "../src/lib/builder/richSource.js";
import { answerKeyFrom, groupLines, orderLines } from "../src/lib/builder/pdfSource.js";
import { draftFromRow, draftToRow, emptyDraft, teacherExam, validateDraft } from "../src/lib/teacherExam.js";
import QuestionBuilder from "../src/screens/QuestionBuilder.jsx";

afterEach(cleanup);

const roundTrip = (src) => {
  const div = document.createElement("div");
  div.innerHTML = toVisual(src, { f1: "data:image/png;base64,AAA" });
  return toSource(div);
};

describe("builder text fields", () => {
  it("keeps the exam format through the Word-style field", () => {
    const src = "Un **tanque** con $\\frac{1}{2}$ de agua y <em>sal</em>.\n\n[[figura:f1]]\n\n<div class=\"cita\">Una cita</div>\n\nEl [[hueco]] final";
    expect(roundTrip(src)).toBe(src);
  });
  it("draws formulas, blanks and figures as chips", () => {
    const html = toVisual("Área $x^2$ y [[hueco]]\n\n[[figura:f1]]", { f1: "data:x" });
    expect(html).toContain('class="mathchip"');
    expect(html).toContain('class="gapchip"');
    expect(html).toContain('data-fig="f1"');
  });
  it("splits options and a whole question read from a page", () => {
    expect(splitOptions("¿Cuánto es?\nA. 5\nB. 10\nc.15\nD. 20")).toMatchObject({ head: "¿Cuánto es?", A: "5", B: "10", C: "15", D: "20" });
    expect(splitOptions("en el año 300 a.C. no había nada")).toBeNull();
    const q = parseQuestionText("12. La gráfica muestra las ventas.\n\n¿En qué mes fueron mayores?\nA. Enero\nB. Febrero\nC. Marzo\nD. Abril");
    expect(q).toEqual({ stimulus: "La gráfica muestra las ventas.", stem: "¿En qué mes fueron mayores?", options: ["Enero", "Febrero", "Marzo", "Abril"] });
  });
});

describe("builder documents", () => {
  it("groups text items into lines and reads two columns in order", () => {
    const items = [
      { text: "1. Uno", x0: 40, x1: 200, base: 100, h: 10 },
      { text: "3. Tres", x0: 320, x1: 500, base: 100, h: 10 },
      { text: "A. sí", x0: 40, x1: 100, base: 115, h: 10 },
      { text: "A. no", x0: 320, x1: 380, base: 115, h: 10 },
      { text: "2. Dos", x0: 40, x1: 200, base: 130, h: 10 },
      { text: "B. tal", x0: 320, x1: 380, base: 130, h: 10 },
    ];
    const lines = groupLines(items, 600, 800);
    expect(lines).toHaveLength(6);
    expect(orderLines(lines).map((l) => l.text)).toEqual(["1. Uno", "A. sí", "2. Dos", "3. Tres", "A. no", "B. tal"]);
  });
  it("reads an answer key only when it covers most questions", () => {
    expect(answerKeyFrom("…\nClave de respuestas: 1. B 2. D 3-A", [1, 2, 3])).toEqual({ 1: "B", 2: "D", 3: "A" });
    expect(answerKeyFrom("Ningún 3 A aquí", [1, 2, 3])).toEqual({});
  });
});

describe("builder drafts", () => {
  it("stores option images and a shared text, and numbers the group in an exam", () => {
    const base = { stem: "¿Cuál?", options: ["", "b", "c", "d"], optionImages: ["data:a", null, null, null], answer: "A", groupId: "g1", groupText: "Lectura", groupFigures: [{ id: "f9", url: "data:f" }] };
    const d1 = emptyDraft(base);
    expect(validateDraft(d1)).toEqual([]);
    const row = draftToRow(d1, { schoolId: "s", ownerId: "o" });
    expect(row.question_json.options[0]).toMatchObject({ letter: "A", text_md: "", traced: { url: "data:a" } });
    expect(row.question_json.group).toEqual({ id: "g1", stimulus_md: "Lectura\n\n[[figura:f9]]", traced: [{ figure_id: "f9", url: "data:f" }] });
    const back = draftFromRow({ ...row, id: "r1" });
    expect(back).toMatchObject({ id: "r1", optionImages: ["data:a", null, null, null], groupId: "g1" });
    const t = teacherExam([{ ...row, id: "r1" }, { ...row, id: "r2" }]);
    expect(t.exam.questions[1].group).toMatchObject({ id: "g1", from: 1, to: 2 });
    expect(t.exam.questions[0].options[0].traced.url).toBe("data:a");
  });
});

describe("QuestionBuilder workspace", () => {
  const guard = async (fn) => fn();
  const profile = { id: "t1", school_id: "s1", role: "teacher" };
  const type = (name, html) => {
    const box = screen.getByRole("textbox", { name });
    box.innerHTML = html;
    fireEvent.input(box);
  };
  it("refuses an incomplete question and saves a complete one", async () => {
    const api = { teacherQuestions: vi.fn().mockResolvedValue([]), saveTeacherQuestion: vi.fn().mockResolvedValue({ id: "new1" }), deleteTeacherQuestion: vi.fn() };
    render(<QuestionBuilder api={api} profile={profile} guard={guard} setNotice={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Nueva pregunta" }));
    expect(screen.getByRole("button", { name: "Abrir PDF o fotos" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
    expect(await screen.findByText("Escribe el enunciado.")).toBeTruthy();
    expect(api.saveTeacherQuestion).not.toHaveBeenCalled();
    type("Enunciado", "¿Cuánto es <b>2+2</b>?");
    ["1", "2", "3", "4"].forEach((t, i) => type(`Opción ${"ABCD"[i]}`, t));
    fireEvent.click(screen.getByRole("button", { name: "Opción D es la correcta" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
    await waitFor(() => expect(api.saveTeacherQuestion).toHaveBeenCalled());
    const [saved, id] = api.saveTeacherQuestion.mock.calls[0];
    expect(id).toBeNull();
    expect(saved).toMatchObject({ answer: "D", school_id: "s1", owner_id: "t1", question_json: { stem_md: "¿Cuánto es **2+2**?" } });
  });
});
