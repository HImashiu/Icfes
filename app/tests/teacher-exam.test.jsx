import { describe, expect, it } from "vitest";
import { draftToRow, emptyDraft, teacherExam, validateDraft } from "../src/lib/teacherExam.js";


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
