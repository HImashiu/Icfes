import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Test from "../src/screens/Test.jsx";
import { parseExam } from "../src/lib/exam.js";

const opts = (n) => ["A", "B", "C", "D"].map((letter) => ({ letter, text_md: `Opción ${letter} de ${n}` }));
const raw = {
  format: "icfes-golden/1",
  groups: [],
  questions: [{ number: 1, section: "Inglés", group_id: null, stem_md: "<p>Pregunta uno</p>", options: opts(1) }],
};
const questions = parseExam(raw).questions;
const attempt = { current: 0, answers: { 1: "B" }, checked: { 1: true }, flags: {}, xp: 0, startedAt: Date.now(), durationSec: null };
const enrich = {
  1: { competencia: "Lectura crítica", explicacion: "La explicación de la IA", distractores: { A: "Porque no.", B: "Es la correcta." }, pista: "Mira el texto", dificultad: 2 },
};

function renderPractice(key, row) {
  return render(
    <Test
      title="Prueba"
      examLabel="S11-X"
      questions={questions}
      attempt={attempt}
      answerKey={new Map([["1", key]])}
      onChange={() => {}}
      onSubmit={() => {}}
      onExit={() => {}}
      figures={new Map()}
      enrich={{ 1: row }}
      enrichMeta={{ estimated: false }}
    />,
  );
}

describe("practice verdict and AI analysis", () => {
  afterEach(cleanup);

  it("shows the explanation under the verdict when the model agrees with the key", () => {
    renderPractice("B", enrich[1]);
    expect(screen.getByText("Análisis con IA · preliminar")).toBeTruthy();
    expect(screen.getByText("La explicación de la IA")).toBeTruthy();
    expect(screen.getByText("Porque no.")).toBeTruthy();
    expect(screen.getByText("Mira el texto")).toBeTruthy();
  });

  it("hides the explanation when the model disagrees with the key", () => {
    renderPractice("B", { ...enrich[1], disagree: true });
    expect(screen.getByText(/La IA no coincide con la clave/)).toBeTruthy();
    expect(screen.queryByText("La explicación de la IA")).toBeNull();
  });
});
