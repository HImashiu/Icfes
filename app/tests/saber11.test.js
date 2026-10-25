import { describe, expect, it } from "vitest";
import {
  eapTheta, globalFrom, globalPercentile, itemParams, levelDistribution, levelFor, percentileOf, scoreSaber11, scoreTest,
} from "../src/lib/saber11.js";
import { simulacros } from "../src/lib/simulacro.js";

const FULL = { "Lectura crítica": 41, "Matemáticas": 50, "Sociales y ciudadanas": 50, "Ciencias naturales": 58, "Inglés": 55 };
const at = (share) => Object.entries(FULL).map(([name, total]) => ({ name, total, correct: Math.round(share * total) }));

describe("Saber 11 official rules", () => {
  it("global is round(5 × weighted mean) with Inglés weighing 1 and the rest 3", () => {
    const areas = [
      { name: "Lectura crítica", scale: 60 }, { name: "Matemáticas", scale: 70 }, { name: "Sociales y ciudadanas", scale: 55 },
      { name: "Ciencias naturales", scale: 65 }, { name: "Inglés", scale: 80 },
    ];
    expect(globalFrom(areas)).toBe(Math.round((5 * (3 * 60 + 3 * 70 + 3 * 55 + 3 * 65 + 80)) / 13));
    // Without Inglés the four others weigh the same.
    expect(globalFrom(areas.slice(0, 4))).toBe(Math.round(5 * ((60 + 70 + 55 + 65) / 4)));
  });

  it("levels use the official cut points per test", () => {
    expect(levelFor("Lectura crítica", 35).code).toBe("1");
    expect(levelFor("Lectura crítica", 36).code).toBe("2");
    expect(levelFor("Lectura crítica", 66).code).toBe("4");
    expect(levelFor("Matemáticas", 70).code).toBe("3");
    expect(levelFor("Matemáticas", 71).code).toBe("4");
    expect(levelFor("Sociales y ciudadanas", 40).code).toBe("1");
    expect(levelFor("Sociales y ciudadanas", 41).code).toBe("2");
    expect(levelFor("Ciencias naturales", 56).code).toBe("3");
    expect(levelFor("Inglés", 36).label).toBe("Pre A1");
    expect(levelFor("Inglés", 57).label).toBe("A1");
    expect(levelFor("Inglés", 70).label).toBe("A2");
    expect(levelFor("Inglés", 71).label).toBe("B1");
  });

  it("percentiles come from the national distribution and grow with the score", () => {
    expect(globalPercentile(250)).toBeGreaterThanOrEqual(45);
    expect(globalPercentile(250)).toBeLessThanOrEqual(55);
    expect(globalPercentile(370)).toBeGreaterThanOrEqual(98);
    expect(percentileOf("Matemáticas", 50)).toBeLessThan(percentileOf("Matemáticas", 60));
  });
});

describe("Saber 11 estimate", () => {
  it("is monotone in the share right and reaches 500 with every answer right", () => {
    let prev = -1;
    for (const s of [0.2, 0.4, 0.6, 0.8, 0.9]) {
      const g = scoreSaber11(at(s)).global;
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    expect(scoreSaber11(at(1)).global).toBe(500);
    const mid = scoreSaber11(at(0.45));
    expect(mid.global).toBeGreaterThan(220);
    expect(mid.global).toBeLessThan(280);
    expect(mid.low).toBeLessThan(mid.global);
    expect(mid.high).toBeGreaterThan(mid.global);
  });

  it("scores by pattern: right answers on hard items are worth more", () => {
    const hard = itemParams({ dificultad: 5 });
    const easy = itemParams({ dificultad: 1 });
    const a = eapTheta([...Array(10)].flatMap(() => [{ r: 1, ...hard }, { r: 0, ...easy }]));
    const b = eapTheta([...Array(10)].flatMap(() => [{ r: 0, ...hard }, { r: 1, ...easy }]));
    expect(a.theta).not.toBe(b.theta);
    // A guessable 3-option item gives less evidence than a 4-option one.
    expect(itemParams({ options: 3 }).c).toBeGreaterThan(itemParams({ options: 4 }).c);
  });

  it("uses the stored pattern when there is one", () => {
    const resp = [...Array(20)].map((_, i) => [i < 12 ? 1 : 0, 4]);
    const r = scoreTest({ name: "Matemáticas", correct: 12, total: 20, resp });
    expect(r.scale).toBe(scoreTest({ name: "Matemáticas", correct: 12, total: 20 }).scale);
    expect(r.level).toBeTruthy();
  });

  it("joins both sessions' patterns into one simulacro", () => {
    const row = (id, slug, correct) => ({
      id, at: Number(id), mode: "timed", keyed: true, total: 10, answered: 10,
      perArea: [{ name: "Matemáticas", correct, total: 10, resp: [...Array(10)].map((_, i) => [i < correct ? 1 : 0, 4]) }],
      snapshot: { slug, scope: "all" },
    });
    const [sim] = simulacros([row("1", "S11-A_1ra", 6), row("2", "S11-A_2da", 8)]);
    expect(sim.complete).toBe(true);
    expect(sim.areas[0].total).toBe(20);
    expect(sim.percentile).not.toBeNull();
  });

  it("gives the group's share per level", () => {
    const sims = [scoreSaber11(at(0.3)), scoreSaber11(at(0.9))];
    const rows = levelDistribution(sims);
    const ma = rows.find((r) => r.name === "Matemáticas");
    expect(ma.n).toBe(2);
    expect(ma.levels.reduce((n, l) => n + l.n, 0)).toBe(2);
  });
});
