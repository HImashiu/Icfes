import { describe, expect, it } from "vitest";
import tiny from "./fixtures/tiny.golden.json";
import tinyKey from "./fixtures/tiny.key.json";
import {
  AREA_MINUTES, ExamFormatError, formatClock, parseExam, parseKey, questionsFor, scoreAttempt, timedSeconds,
} from "../src/lib/exam.js";

describe("parseExam", () => {
  it("rejects other formats", () => {
    expect(() => parseExam({ format: "other" })).toThrow(ExamFormatError);
  });

  it("attaches shared passages to their questions and keeps numeric order", () => {
    const exam = parseExam(tiny);
    expect(exam.questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(exam.questions[0].group.directions).toMatch(/preguntas 1 y 2/);
    expect(exam.questions[2].group).toBeNull();
  });

  it("groups questions into areas in cover order", () => {
    const exam = parseExam(tiny);
    expect(exam.sections.map((s) => [s.name, s.questions.length])).toEqual([
      ["Área A", 2],
      ["Área B", 1],
    ]);
  });
});

describe("parseKey", () => {
  it("returns null when there is no key file", () => {
    expect(parseKey(null)).toBeNull();
  });

  it("keeps only valid letters and skips pending answers", () => {
    const key = parseKey(tinyKey);
    expect(key.get("1")).toBe("B");
    expect(key.has("3")).toBe(false);
  });

  it("rejects a file with the wrong format", () => {
    expect(() => parseKey({ format: "icfes-key/9", answers: {} })).toThrow(ExamFormatError);
  });
});

describe("scoring", () => {
  const exam = parseExam(tiny);

  it("reports answered counts without a key and no correct counts", () => {
    const score = scoreAttempt(exam.questions, { 1: "A" }, null);
    expect(score.keyed).toBe(false);
    expect(score.answered).toBe(1);
    expect(score.correct).toBe(0);
    expect(score.total).toBe(3);
  });

  it("counts correct answers per area", () => {
    const key = parseKey(tinyKey);
    const score = scoreAttempt(exam.questions, { 1: "B", 2: "B", 3: "A" }, key);
    expect(score.correct).toBe(1);
    expect(score.perArea.find((a) => a.name === "Área A")).toMatchObject({ answered: 2, correct: 1, total: 2 });
    expect(score.perArea.find((a) => a.name === "Área B")).toMatchObject({ answered: 1, correct: 0, total: 1 });
  });

  it("does not mark a question correct when the key is pending for it", () => {
    const key = parseKey(tinyKey);
    expect(scoreAttempt(exam.questions, { 3: "A" }, key).correct).toBe(0);
  });
});

describe("scoping and timing", () => {
  const exam = parseExam(tiny);

  it("limits a test to one area", () => {
    expect(questionsFor(exam, "Área B").map((q) => q.number)).toEqual([3]);
    expect(questionsFor(exam, "all")).toHaveLength(3);
  });

  it("sums practice minutes for the areas in scope", () => {
    // Unknown areas fall back to 45 minutes, so the synthetic area gets the default.
    expect(timedSeconds(questionsFor(exam, "Área A"))).toBe(45 * 60);
    expect(timedSeconds(questionsFor(exam, "all"))).toBe(2 * 45 * 60);
    expect(AREA_MINUTES["Matemáticas"]).toBe(60);
  });

  it("formats clock time with hours only when needed", () => {
    expect(formatClock(75)).toBe("01:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-4)).toBe("00:00");
  });
});
