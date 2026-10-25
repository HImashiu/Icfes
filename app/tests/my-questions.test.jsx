import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuestionBuilder from "../src/screens/QuestionBuilder.jsx";
import { questionStats } from "../src/lib/questionStats.js";
import { draftFromRow, draftToRow, teacherExam } from "../src/lib/teacherExam.js";

afterEach(cleanup);
const row = (id, over = {}) => ({ id, owner_id: "me", visibility: "private", area: "Matemáticas", dificultad: 2, answer: "B", explanation: null, created_at: "2026-10-01",
  question_json: { stem_md: `<p>Pregunta ${id}</p>`, options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `Op ${l}` })) }, ...over });

describe("Mis preguntas", () => {
  it("flags a probable wrong key and keeps hint and feedback in the question", () => {
    const st = questionStats([1, 2, 3, 4, 5, 6].map((i) => ({ answers: { q1: i < 5 ? "C" : "B" } })), () => "B");
    expect(st.get("q1")).toMatchObject({ answered: 6, right: 2, pct: 33, suspect: "C" });
    const d = { ...draftFromRow(row("q1")), hint: "Mira la tabla", feedback: ["Confunde costo", "", "", ""] };
    const back = draftToRow(d, { schoolId: "s", ownerId: "me" });
    expect(back.question_json).toMatchObject({ hint: "Mira la tabla", feedback: { A: "Confunde costo" } });
    const ex = teacherExam([{ ...row("q1"), question_json: back.question_json }]);
    expect(ex.enrich["1"]).toMatchObject({ pista: "Mira la tabla", distractores: { A: "Confunde costo" }, hidden: false });
  });
  it("filters, shows answer stats and shares several at once", async () => {
    const api = {
      teacherQuestions: vi.fn().mockResolvedValue([row("q1"), row("q2", { area: "Inglés" })]),
      examAttempts: vi.fn().mockResolvedValue([{ answers: { q1: "B" } }, { answers: { q1: "A" } }]),
      saveTeacherQuestion: vi.fn().mockResolvedValue({}),
      listAssignments: vi.fn().mockResolvedValue([]), listCourses: vi.fn().mockResolvedValue([]),
    };
    render(<QuestionBuilder api={api} profile={{ id: "me" }} guard={async (fn) => fn()} setNotice={() => {}} />);
    expect(await screen.findByText(/2 respuestas · 50 % acierta/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Inglés/ }));
    await waitFor(() => expect(screen.queryByText("Pregunta q1")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /^Inglés/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Elegir todas las mías" }));
    fireEvent.click(screen.getByRole("button", { name: "Compartir con el colegio" }));
    await waitFor(() => expect(api.saveTeacherQuestion).toHaveBeenCalledTimes(2));
    expect(api.saveTeacherQuestion).toHaveBeenCalledWith({ visibility: "school" }, "q1");
  });
});
