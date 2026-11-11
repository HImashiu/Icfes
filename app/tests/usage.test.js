import { describe, expect, it } from "vitest";
import { answerChanges } from "../src/lib/usage.js";
import { inAppBrowser } from "../src/lib/quickStart.js";

describe("answerChanges", () => {
  const questions = [{ key: "1", section: "Matemáticas" }, { key: "2", section: "Inglés" }];
  const attempt = { startedAt: 5, slug: "S11-A_2da", mode: "practice", answers: { 1: "B" } };
  it("sends a new answer once, then again when its right/wrong becomes known", () => {
    const seen = new Map();
    const first = answerChanges(attempt, questions, null, seen);
    expect(first).toEqual([{ attempt: "5", slug: "S11-A_2da", key: "1", area: "Matemáticas", mode: "practice", assignment: null, answer: "B", correct: null }]);
    expect(answerChanges(attempt, questions, null, seen)).toEqual([]);
    const graded = answerChanges(attempt, questions, new Map([["1", "C"]]), seen);
    expect(graded).toHaveLength(1);
    expect(graded[0].correct).toBe(false);
  });
  it("skips blanks and questions outside the run", () => {
    expect(answerChanges({ ...attempt, answers: { 1: "", 9: "A" } }, questions, null, new Map())).toEqual([]);
  });
});

describe("inAppBrowser", () => {
  it("spots Facebook's browser on Android", () => {
    const old = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (Linux; Android 13; wv) Chrome/120 Mobile [FB_IAB/FB4A;FBAV/440.0]" }, configurable: true });
    expect(inAppBrowser()).toMatchObject({ app: "Facebook", android: true });
    Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1" }, configurable: true });
    expect(inAppBrowser()).toBeNull();
    if (old) Object.defineProperty(globalThis, "navigator", old);
  });
});
