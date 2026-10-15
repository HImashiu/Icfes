import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import Test from "../src/screens/Test.jsx";
import { parseExam } from "../src/lib/exam.js";

const opts = (n) => ["A", "B", "C", "D"].map((letter) => ({ letter, text_md: `Opción ${letter} de ${n}` }));
const raw = {
  format: "icfes-golden/1",
  groups: [{ id: "g1", from: 1, to: 2, stimulus_md: "<p>Texto compartido del pasaje</p>", directions: "" }],
  questions: [
    { number: 1, section: "Inglés", group_id: "g1", stem_md: "<p>Pregunta uno</p>", options: opts(1) },
    { number: 2, section: "Inglés", group_id: "g1", stem_md: "<p>Pregunta dos</p>", options: opts(2) },
    { number: 3, section: "Inglés", group_id: null, stem_md: "<p>Pregunta tres</p>", options: opts(3) },
  ],
};

function Harness() {
  const [attempt, setAttempt] = useState({ current: 0, answers: {}, checked: {}, flags: {}, xp: 0, startedAt: Date.now(), durationSec: null });
  const questions = parseExam(raw).questions;
  return (
    <Test
      title="Prueba"
      examLabel="S11-X"
      questions={questions}
      attempt={attempt}
      answerKey={null}
      onChange={(fn) => setAttempt((a) => (typeof fn === "function" ? fn(a) : fn))}
      onSubmit={() => {}}
      onExit={() => {}}
      figures={new Map()}
    />
  );
}

describe("Test screen blocks", () => {
  it("shows the shared text once with every question of its block", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll(".block-q")).toHaveLength(2);
    expect(container.textContent.split("Texto compartido del pasaje").length - 1).toBe(1);
    expect(screen.getByText("Pregunta uno")).toBeTruthy();
    expect(screen.getByText("Pregunta dos")).toBeTruthy();
  });

  it("moves the current question when an option of another block question is tapped", () => {
    const { container } = render(<Harness />);
    const second = container.querySelector('[data-qkey="2"]');
    fireEvent.click(within(second).getByText("B"));
    expect(container.querySelector(".block-q.current")?.dataset.qkey).toBe("2");
  });
});
