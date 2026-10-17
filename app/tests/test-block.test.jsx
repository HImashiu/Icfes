import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

afterEach(cleanup);
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

const longText = `<p>${"Texto largo del pasaje. ".repeat(30)}</p><p>Hay un [[hueco:1]] aquí y otro [[hueco:2]] allá.</p>`;
const longRaw = {
  format: "icfes-golden/1",
  groups: [{ id: "g1", from: 1, to: 2, stimulus_md: longText, directions: "" }],
  questions: raw.questions.slice(0, 2).map((q) => ({ ...q, stem_md: `<p>Blank (${q.number}): choose</p>` })),
};

function LongHarness() {
  const [attempt, setAttempt] = useState({ current: 0, answers: {}, checked: {}, flags: {}, xp: 0, startedAt: Date.now(), durationSec: null });
  return (
    <Test
      title="Prueba"
      examLabel="S11-X"
      questions={parseExam(longRaw).questions}
      attempt={attempt}
      answerKey={null}
      onChange={(fn) => setAttempt((a) => (typeof fn === "function" ? fn(a) : fn))}
      onSubmit={() => {}}
      onExit={() => {}}
      figures={new Map()}
    />
  );
}

describe("Test screen long text (phone)", () => {
  it("opens a new text on the text tab, with one question at a time behind the other tab", () => {
    const { container } = render(<LongHarness />);
    expect(container.querySelector(".toggle-text .stimulus")).toBeTruthy();
    expect(container.querySelector(".test-main.view-text")).toBeTruthy();
    expect(container.querySelectorAll(".block-q")).toHaveLength(1);
    expect(container.textContent.split("Texto largo del pasaje.").length - 1).toBe(30);
  });

  it("switches between the text and the question with the tabs", () => {
    const { container } = render(<LongHarness />);
    fireEvent.click(screen.getByRole("tab", { name: "Pregunta 1" }));
    expect(container.querySelector(".test-main.view-text")).toBeNull();
    expect(container.querySelector(".toggle-text").hidden).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Texto" }));
    expect(container.querySelector(".test-main.view-text")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a la pregunta 1" }));
    expect(container.querySelector(".test-main.view-text")).toBeNull();
  });

  it("jumps to the question of a blank tapped in the text, and fills the blank with the chosen word", () => {
    const { container } = render(<LongHarness />);
    fireEvent.click(container.querySelector('.toggle-text .gap[data-gap="2"]'));
    expect(container.querySelector(".block-q.current")?.dataset.qkey).toBe("2");
    expect(container.querySelector(".test-main.view-text")).toBeNull();
    fireEvent.click(within(container.querySelector('[data-qkey="2"]')).getByText("C"));
    expect(container.querySelector('.toggle-text .gap[data-gap="2"] .gap-fill')?.textContent).toBe("Opción C de 2");
  });
});

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
