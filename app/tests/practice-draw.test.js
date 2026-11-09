// Free practice: a random draw within the daily allowance, and the local fallback of that allowance.
import { describe, expect, it, beforeEach } from "vitest";
import { drawPractice } from "../src/lib/practiceDraw.js";
import { DEFAULT_DAILY_QUESTIONS, localQuota, spendLocal, todayKey } from "../src/lib/practiceQuota.js";

// 12 questions in two areas; questions 3-4 share a text (group g1), 9-11 share another (g2).
const pool = Array.from({ length: 12 }, (_, i) => ({
  key: `Q${i + 1}`,
  number: i + 1,
  section: i < 6 ? "Matemáticas" : "Lectura crítica",
  group: i === 2 || i === 3 ? { id: "g1" } : i >= 8 && i <= 10 ? { id: "g2" } : null,
}));

describe("drawPractice", () => {
  it("draws the number the allowance gives, all from the booklet", () => {
    const { keys } = drawPractice(pool, 5, { seed: 7 });
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(5);
    keys.forEach((k) => expect(pool.some((q) => q.key === k)).toBe(true));
  });

  it("never goes over the allowance, even when texts are in the way", () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(drawPractice(pool, 7, { seed }).keys.length).toBe(7);
      expect(drawPractice(pool, 4, { seed }).keys.length).toBeLessThanOrEqual(4);
    }
  });

  it("does not come out in booklet order, and changes with the seed", () => {
    const a = drawPractice(pool, 12, { seed: 11 }).keys.join(",");
    const b = drawPractice(pool, 12, { seed: 99 }).keys.join(",");
    expect(a).not.toBe(pool.map((q) => q.key).join(","));
    expect(a).not.toBe(b);
  });

  it("keeps questions that share a text together", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { keys } = drawPractice(pool, 12, { seed });
      const at = (k) => keys.indexOf(k);
      expect(Math.abs(at("Q3") - at("Q4"))).toBe(1);
      expect(Math.abs(at("Q9") - at("Q10"))).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the chosen area order for a whole booklet run", () => {
    const { questions } = drawPractice(pool, 12, { areaOrder: ["Lectura crítica", "Matemáticas"], seed: 5 });
    const sections = questions.map((q) => q.section);
    expect(sections).toEqual([...Array(6).fill("Lectura crítica"), ...Array(6).fill("Matemáticas")]);
  });
});

describe("daily allowance kept in this browser", () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };
  });

  it("starts at the default and gives out questions until it is used up", () => {
    expect(localQuota().remaining).toBe(DEFAULT_DAILY_QUESTIONS);
    const first = spendLocal(30);
    expect(first.granted).toBe(30);
    const second = spendLocal(30);
    expect(second.granted).toBe(DEFAULT_DAILY_QUESTIONS - 30);
    expect(spendLocal(5).granted).toBe(0);
  });

  it("starts again on a new day", () => {
    spendLocal(DEFAULT_DAILY_QUESTIONS);
    const tomorrow = new Date(Date.now() + 2 * 86400000);
    expect(localQuota(DEFAULT_DAILY_QUESTIONS, tomorrow).remaining).toBe(DEFAULT_DAILY_QUESTIONS);
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads a configured limit", () => {
    expect(spendLocal(10, 8).granted).toBe(8);
  });
});
