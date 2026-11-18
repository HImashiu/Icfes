import { beforeEach, describe, expect, it } from "vitest";
import { friendStatus, passDate, rewardLevels, rulesLine, simulacroLine } from "../src/lib/growth/rewards.js";
import { localSimulacros, simulacroExam, takeLocalSimulacro } from "../src/lib/practiceQuota.js";

describe("referral reward levels (migration 0053)", () => {
  it("names the next level and how many friends are missing", () => {
    expect(rewardLevels(undefined, 0).next.level).toBe(1);
    expect(rewardLevels(undefined, 0).need).toBe(1);
    const two = rewardLevels(undefined, 2);
    expect(two.levels.map((l) => l.reached)).toEqual([true, false, false]);
    expect(two.next.perk).toBe("150 preguntas al día");
    expect(two.need).toBe(1);
    expect(rewardLevels(undefined, 7).next).toBeNull();
  });
  it("follows the server's numbers", () => {
    const r = rewardLevels({ l1: 2, l1_questions: 100 }, 1);
    expect(r.levels[0].title).toBe("2 amigos");
    expect(r.levels[0].perk).toBe("100 preguntas al día");
  });
  it("says what each friend still needs", () => {
    expect(friendStatus({ state: "practicing", answers: 5, days: 0 }).text).toBe("Le falta: 15 preguntas y 2 días de práctica");
    expect(friendStatus({ state: "practicing", answers: 25, days: 1 }).text).toBe("Le falta: practicar otro día");
    expect(friendStatus({ state: "practicing", teacher: true }).text).toBe("Cuenta cuando cree su primer curso");
    expect(friendStatus({ state: "ok", teacher: true }).text).toBe("Cuenta como 2");
    expect(friendStatus({ state: "week_cap" }).tone).toBe("wait");
    expect(friendStatus({ state: "same_device" }).tone).toBe("bad");
  });
  it("words", () => {
    expect(rulesLine()).toContain("20 preguntas en 2 días distintos");
    expect(simulacroLine({ unlimited: true })).toContain("sin límite");
    expect(simulacroLine({ remaining: 1 })).toBe("Simulacros completos: te queda 1");
    expect(passDate("2027-01-17T15:00:00Z")).toMatch(/^17 de enero/);
    expect(passDate("nope")).toBeNull();
  });
});

describe("full simulacros without an account", () => {
  beforeEach(() => localStorage.clear());
  it("one a month, both sessions of a cuadernillo count once", () => {
    const now = new Date("2026-11-18T15:00:00Z");
    expect(simulacroExam("S11-A_2da")).toBe("S11-A");
    expect(takeLocalSimulacro("S11-A_1ra", now).how).toBe("month");
    expect(takeLocalSimulacro("S11-A_2da", now).how).toBe("again");
    expect(takeLocalSimulacro("S11-B_1ra", now).granted).toBe(false);
    expect(localSimulacros(now).remaining).toBe(0);
    expect(localSimulacros(new Date("2026-12-02T15:00:00Z")).remaining).toBe(1);
  });
});
