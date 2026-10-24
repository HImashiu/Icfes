import { describe, expect, it } from "vitest";
import {
  advance, appendKeys, assignmentRow, bodyBlocks, buildDeck, cleanConfig, cleanItems, cleanSettings, configSummary, explanationOf,
  formatClock, jumpStage, keyRows, nextLabel, retreat, stagesFor,
} from "../src/lib/lesson.js";

const q = (n, section = "Matemáticas") => ({ key: String(n), number: n, section, options: [] });
const bundle = {
  exam: { title: "S11-A", questions: [q(1), q(2), q(3)] },
  key: new Map([["1", "B"], ["2", "C"]]),
  enrich: {
    1: { competencia: "Razonamiento", tema: "Álgebra", explicacion: "Porque sí.", distractores: { A: "no" } },
    2: { explicacion: "Oculta", hidden: true },
  },
};
const lesson = { id: "l1", title: "Repaso", exam_slug: "S11-A_1ra", settings: {}, items: [
  { type: "q", key: "1" }, { type: "text", title: "Pausa", body: "- uno\n- dos\nFin" }, { type: "q", key: "2" }, { type: "q", key: "3" }, { type: "q", key: "99" },
] };

describe("lesson items", () => {
  it("cleans items and keeps only valid ones", () => {
    expect(cleanItems([{ type: "q", key: 4 }, { type: "text", title: " ", body: "" }, { type: "x" }, null, { type: "text", title: "A", body: "b" }]))
      .toEqual([{ type: "q", key: "4" }, { type: "text", title: "A", body: "b" }]);
  });
  it("appends only new keys", () => {
    expect(appendKeys([{ type: "q", key: "1" }], ["1", "2"])).toEqual([{ type: "q", key: "1" }, { type: "q", key: "2" }]);
  });
  it("turns text into paragraphs and bullet lists", () => {
    expect(bodyBlocks("Hola\n- uno\n- dos\n\nFin")).toEqual([{ type: "p", text: "Hola" }, { type: "ul", items: ["uno", "dos"] }, { type: "p", text: "Fin" }]);
  });
  it("clamps settings", () => {
    expect(cleanSettings({ seconds: 5, hideOptions: true })).toEqual({ hideOptions: true, seconds: 60, titleSlide: true });
    expect(cleanSettings({ seconds: 90, titleSlide: false }).titleSlide).toBe(false);
  });
});

describe("reveal stages", () => {
  it("needs a key for the answer and a settled explanation for the explanation", () => {
    expect(stagesFor({ hasKey: false, explainable: true, hideOptions: false })).toEqual(["question"]);
    expect(stagesFor({ hasKey: true, explainable: false, hideOptions: false })).toEqual(["question", "answer"]);
    expect(stagesFor({ hasKey: true, explainable: true, hideOptions: true })).toEqual(["question", "options", "answer", "explanation"]);
  });
  it("never explains a question whose key is not settled", () => {
    expect(explanationOf(bundle.enrich[2])).toBeNull();
    expect(explanationOf({ explicacion: "  " })).toBeNull();
    expect(explanationOf(bundle.enrich[1]).text).toBe("Porque sí.");
  });
});

describe("deck navigation", () => {
  const deck = buildDeck(lesson, bundle);
  it("builds title, slides in order, skipping questions missing from the booklet, and an end slide", () => {
    expect(deck.map((s) => s.type)).toEqual(["title", "question", "text", "question", "question", "end"]);
    expect(deck[0].count).toBe(3);
    expect(deck[1].stages).toEqual(["question", "answer", "explanation"]);
    expect(deck[3].stages).toEqual(["question", "answer"]); // key but hidden explanation
    expect(deck[4].stages).toEqual(["question"]); // no key
  });
  it("can skip the title slide", () => {
    expect(buildDeck({ ...lesson, settings: { titleSlide: false } }, bundle)[0].type).toBe("question");
  });
  it("reveals each step before moving on, and backs up the same way", () => {
    let pos = { i: 1, s: 0 };
    pos = advance(deck, pos); expect(pos).toEqual({ i: 1, s: 1 });
    pos = advance(deck, pos); expect(pos).toEqual({ i: 1, s: 2 });
    pos = advance(deck, pos); expect(pos).toEqual({ i: 2, s: 0 });
    pos = retreat(deck, pos); expect(pos).toEqual({ i: 1, s: 2 });
    expect(retreat(deck, { i: 0, s: 0 })).toEqual({ i: 0, s: 0 });
    expect(advance(deck, { i: 5, s: 0 })).toEqual({ i: 5, s: 0 });
  });
  it("jumps to a named step only when it exists", () => {
    expect(jumpStage(deck, { i: 1, s: 0 }, "explanation")).toEqual({ i: 1, s: 2 });
    expect(jumpStage(deck, { i: 4, s: 0 }, "answer")).toEqual({ i: 4, s: 0 });
  });
  it("labels the main button with what comes next", () => {
    expect(nextLabel(deck, { i: 1, s: 0 })).toBe("Mostrar respuesta");
    expect(nextLabel(deck, { i: 1, s: 2 })).toBe("Siguiente");
    expect(nextLabel(deck, { i: 5, s: 0 })).toBe("Terminar");
  });
  it("formats the clock", () => { expect(formatClock(65)).toBe("1:05"); expect(formatClock(-3)).toBe("0:00"); });
});

describe("activity formats", () => {
  it("normalizes a config and summarizes it", () => {
    expect(cleanConfig({ kind: "bogus", attempts: "0", limit: 30 })).toMatchObject({ kind: "homework", attempts: "", limit: "" });
    expect(cleanConfig({ kind: "exam", limit: "45" }).limit).toBe(45);
    expect(configSummary({ kind: "exam", limit: 45, attempts: 1, proctor: true })).toContain("45 min");
  });
  it("builds the assignment row from the lesson keys, sending optional rules only when they differ", () => {
    const base = { lesson, courseId: "c1", userId: "u1", title: " ", opens: "2026-10-25", due: "2026-11-01" };
    const plain = assignmentRow({ ...base, config: { kind: "homework", instant: true, hints: true, reveal: "after_submit" } });
    expect(plain).toMatchObject({ course_id: "c1", kind: "homework", title: "Repaso", exam_slug: "S11-A_1ra", scope: "all", question_keys: ["1", "2", "3", "99"], max_attempts: null, status: "active", lesson_id: "l1" });
    expect("allow_hints" in plain || "proctor" in plain || "instant_feedback" in plain).toBe(false);
    const strict = assignmentRow({ ...base, config: { kind: "exam", limit: 40, proctor: true } });
    expect(strict).toMatchObject({ kind: "exam", time_limit_min: 40, max_attempts: 1, proctor: true });
    expect("allow_hints" in strict).toBe(false); // exams ignore hints, as in the assignment builder
    expect("instant_feedback" in strict).toBe(false);
    const quiz = assignmentRow({ ...base, config: { kind: "homework", instant: false, hints: false, attempts: 2 } });
    expect(quiz).toMatchObject({ max_attempts: 2, allow_hints: false, instant_feedback: false });
  });
});

describe("teacher's key", () => {
  it("lists letters and only settled explanations", () => {
    const rows = keyRows(bundle.exam.questions, bundle);
    expect(rows[0]).toMatchObject({ n: 1, letter: "B", skill: "Razonamiento · Álgebra", explanation: "Porque sí." });
    expect(rows[1]).toMatchObject({ letter: "C", explanation: null });
    expect(rows[2].letter).toBeNull();
  });
});
