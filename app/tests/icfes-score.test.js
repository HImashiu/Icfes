import { describe, expect, it } from "vitest";
import { globalPercentile, globalScore, groupDifficulties, levelOf, partialGlobal, percentileOf, pruebaIndex, schoolCategory, scoreCounts, scorePattern } from "../src/lib/icfesScore.js";
import { bandFor } from "../src/lib/analytics.js";
import { gradeMany } from "../src/lib/grading.js";

describe("Saber 11 scoring like ICFES", () => {
  it("uses the official global formula, with and without English", () => {
    // ICFES's own worked example: LC 56, M 45, SC 44, CN 49, IN 58 -> 246.
    expect(globalScore({ "Lectura crítica": 56, "Matemáticas": 45, "Sociales y ciudadanas": 44, "Ciencias naturales": 49, "Inglés": 58 })).toBe(246);
    expect(globalScore({ "Lectura crítica": 60, "Matemáticas": 60, "Sociales y ciudadanas": 60, "Ciencias naturales": 60 })).toBe(300);
    expect(globalScore({ "Lectura crítica": 60, "Matemáticas": 60 })).toBeNull();
    expect(partialGlobal({ "Matemáticas": 70 })).toBe(350);
  });

  it("places scores in the official performance levels", () => {
    expect(levelOf("Matemáticas", 35).label).toBe("Nivel 1");
    expect(levelOf("Matemáticas", 70).label).toBe("Nivel 3");
    expect(levelOf("Matemáticas", 71).label).toBe("Nivel 4");
    expect(levelOf("Lectura crítica", 66).n).toBe(4);
    expect(levelOf("Sociales y ciudadanas", 40).range).toBe("0–40");
    expect(levelOf("Ciencias naturales", 56).range).toBe("56–70");
    expect(levelOf("Inglés", 36).label).toBe("A-");
    expect(levelOf("Inglés", 57).label).toBe("A1");
    expect(levelOf("Inglés", 75).label).toBe("B1");
  });

  it("gives national percentiles, not positions in a class", () => {
    expect(percentileOf("Ciencias naturales", 50)).toBe(50);
    expect(percentileOf("Matemáticas", 76)).toBeGreaterThan(95);
    expect(globalPercentile(254)).toBe(50);
    expect(globalPercentile(370)).toBeGreaterThan(95);
  });

  it("scores the pattern, not the count: missing an easy question costs more than missing a hard one", () => {
    const items = (hardRight) => [
      ...Array.from({ length: 10 }, () => ({ right: true, dificultad: 3 })),
      { right: !hardRight, dificultad: 1 },
      { right: hardRight, dificultad: 5 },
    ];
    expect(scorePattern("Matemáticas", items(false)).score).toBeGreaterThan(scorePattern("Matemáticas", items(true)).score);
    expect(scorePattern("Matemáticas", items(true).slice(0, 3))).toBeNull();
  });

  it("puts an average student near the national mean and a strong one near 370", () => {
    const sim = (pct) => globalScore(Object.fromEntries([["Lectura crítica", 41], ["Matemáticas", 50], ["Sociales y ciudadanas", 50], ["Ciencias naturales", 58], ["Inglés", 55]].map(([a, n]) => [a, scoreCounts(a, Math.round((pct * n) / 100), n).score])));
    expect(Math.abs(sim(45) - 254)).toBeLessThan(15);
    expect(sim(90)).toBeGreaterThan(355);
    expect(sim(90)).toBeLessThan(395);
    expect(sim(100)).toBe(500);
    expect(sim(25)).toBeLessThan(230); // guessing alone
  });

  it("reports levels, percentiles and completeness in bandFor", () => {
    const b = bandFor([{ name: "Matemáticas", correct: 40, total: 50 }, { name: "Lectura crítica", correct: 30, total: 41 }]);
    expect(b.complete).toBe(false);
    expect(b.areas[0].level.label).toMatch(/Nivel/);
    expect(b.areas[0].percentile).toBeGreaterThan(50);
    expect(b.low).toBeLessThan(b.global);
  });
});

describe("a strong school keeps its level", () => {
  // The old IRT scored each group against itself (mean 50), so a school averaging 370 came out at 250.
  it("does not pull a strong group down to the national average", () => {
    const qs = Array.from({ length: 30 }, (_, i) => ({ key: String(i + 1), section: "Matemáticas", dificultad: 1 + (i % 5) }));
    const key = new Map(qs.map((q) => [q.key, "A"]));
    // 20 students who each miss 2 or 3 of 30 (about 90 % right).
    const group = Array.from({ length: 20 }, (_, i) => ({ id: i, mode: "timed", answers: Object.fromEntries(qs.map((q, j) => [q.key, (j + i) % 12 === 0 || (j * 7 + i) % 29 === 0 ? "B" : "A"])) }));
    const out = gradeMany(group, { kind: "irt" }, { questions: qs, key });
    const avg = out.reduce((n, r) => n + r.value, 0) / out.length;
    expect(avg).toBeGreaterThan(340);
  });

  it("only takes the order of difficulty from the group, not its level", () => {
    const rows = Array.from({ length: 20 }, () => [1, 1, 1, 1, 1, 0]);
    const prior = [0, 0, 0, 0, 0, 0];
    const b = groupDifficulties(rows, prior);
    expect(b[5]).toBeGreaterThan(b[0]);
    expect(Math.abs(b.reduce((n, v) => n + v, 0) / b.length)).toBeLessThan(1e-9);
  });
});

describe("school category (Res. 677/2021)", () => {
  const school = (score, n = 30) => Array.from({ length: n }, (_, i) => ({ "Lectura crítica": score + (i % 5) - 2, "Matemáticas": score, "Sociales y ciudadanas": score, "Ciencias naturales": score, "Inglés": score }));
  it("drops the lowest 20 % and needs at least 9 students", () => {
    expect(pruebaIndex([80, 80, 80, 80, 80, 80, 80, 80])).toBeNull();
    expect(pruebaIndex([...Array(12).fill(80), 0, 0, 0])).toBeCloseTo(0.8, 2);
    expect(pruebaIndex([...Array(8).fill(80), 0, 0])).toBeLessThan(0.7); // 9 kept, so one 0 stays in
  });
  it("cuts the global index into A+ to D", () => {
    expect(schoolCategory(school(80)).category).toBe("A+");
    expect(schoolCategory(school(74)).category).toBe("A");
    expect(schoolCategory(school(50)).category).toBe("D");
    expect(schoolCategory(school(80, 5))).toBeNull();
  });
});
