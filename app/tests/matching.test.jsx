import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuestionView from "../src/components/QuestionView.jsx";
import PrintBooklet from "../src/components/PrintBooklet.jsx";
import { isMatching } from "../src/lib/matching.js";

const WORDS = ["banana", "coconut", "grape", "lime", "mango", "pear", "pineapple", "watermelon"];
const opts = WORDS.map((text, i) => ({ letter: "ABCDEFGH"[i], text_md: text }));
const group = {
  id: "g85-89",
  from: 85,
  to: 89,
  stimulus_md: "<p>Lea las descripciones y las palabras.</p><p>[[ejemplo:A|This fruit is long, and monkeys like it a lot.]]</p>",
  directions: "",
};
const q = (number, stem) => ({
  key: `k${number}`,
  number,
  section: "Inglés",
  part: "PARTE 2",
  item_type: "matching",
  group,
  stem_md: `<p>${stem}</p>`,
  stimulus_md: group.stimulus_md,
  options: opts,
});

describe("matching questions (English Parte 2)", () => {
  it("recognizes matching items only when they carry a word list", () => {
    expect(isMatching(q(85, "A very fine slender piece of metal."))).toBe(true);
    expect(isMatching({ item_type: "sign_picture", options: opts })).toBe(false);
    expect(isMatching({ item_type: "matching", options: [] })).toBe(false);
  });

  it("draws the word list once in the context column and only letters under the stem", () => {
    const onAnswer = vi.fn();
    const { container } = render(<QuestionView question={q(85, "A very fine slender piece of metal.")} answer={null} onAnswer={onAnswer} figures={new Map()} report={false} />);
    expect(container.querySelectorAll(".word-bank li")).toHaveLength(8);
    expect(container.querySelector(".word-bank").textContent).toMatch(/watermelon/);
    expect(container.querySelectorAll(".match-letters .option")).toHaveLength(8);
    expect(container.querySelectorAll(".match-letters .option .option-text")).toHaveLength(0);
    expect(container.querySelector(".match-letters .option").textContent).toBe("A");
    fireEvent.click(container.querySelectorAll(".match-letters .option")[6]);
    expect(onAnswer).toHaveBeenCalledWith("G");
  });

  it("shows the word list once per group in the printed booklet", () => {
    const qs = [q(85, "one"), q(86, "two"), q(87, "three")];
    const { container } = render(<PrintBooklet questions={qs} figures={new Map()} examLabel="S11-A" title="Simulacro" course="11-A" />);
    expect(container.querySelectorAll(".pb-bank li")).toHaveLength(8);
    expect(container.querySelectorAll(".pb-options")).toHaveLength(0);
    expect(container.querySelectorAll(".pb-num")).toHaveLength(3);
  });
});
