import { describe, expect, it } from "vitest";
import { isFullSession, latestScore, nextSession, scoreSummary, simulacros, studentScores } from "../src/lib/simulacro.js";
import { schoolSummary } from "../src/lib/analytics.js";
import { summarize } from "../src/lib/students.js";

const areas = (c) => [
  { name: "Lectura crítica", correct: c, total: 20, answered: 20 },
  { name: "Matemáticas", correct: c, total: 20, answered: 20 },
];
const row = (slug, at, c = 12, extra = {}) => ({ at, mode: "timed", keyed: true, total: 40, answered: 40, perArea: areas(c), snapshot: { slug, scope: "all" }, ...extra });

describe("whole simulacro score", () => {
  it("counts only whole sessions", () => {
    expect(isFullSession(row("S11-A_1ra", 1))).toBe(true);
    expect(isFullSession(row("S11-A_1ra", 1, 12, { snapshot: { slug: "S11-A_1ra", scope: "Matemáticas" } }))).toBe(false);
    expect(isFullSession(row("S11-A_1ra", 1, 12, { mode: "practice", answered: 10 }))).toBe(false);
    expect(isFullSession(row("otro", 1))).toBe(false);
  });

  it("gives no global score with one session, and one with both", () => {
    const one = scoreSummary([row("S11-A_1ra", 1)]);
    expect(one.latest).toBeNull();
    expect(one.open.code).toBe("S11-A");
    expect(one.open.global).toBeNull();
    expect(one.open.areas.length).toBe(2);
    const both = scoreSummary([row("S11-A_1ra", 1), row("S11-A_2da", 2)]);
    expect(both.latest.complete).toBe(true);
    expect(both.latest.global).toBeGreaterThan(0);
    expect(both.open).toBeNull();
  });

  it("counts first tries only: a session redone after seeing its questions makes no new score", () => {
    const list = simulacros([row("S11-A_1ra", 1, 8), row("S11-A_2da", 2, 8), row("S11-A_1ra", 3, 18), row("S11-A_1ra", 4, 16)]);
    expect(list.length).toBe(1);
    expect(list[0].complete).toBe(true);
    const s = scoreSummary([row("S11-A_1ra", 1, 8), row("S11-A_2da", 2, 8), row("S11-A_1ra", 3, 18), row("S11-B_1ra", 5, 10)]);
    expect(s.latest.at).toBe(2);
    expect(s.open.code).toBe("S11-B");
  });

  it("suggests the missing session", () => {
    const open = scoreSummary([row("S11-A_1ra", 1)]).open;
    expect(nextSession(open, [{ slug: "S11-A_1ra" }, { slug: "S11-A_2da" }])).toEqual({ code: "S11-A", n: 2, slug: "S11-A_2da" });
  });

  it("teachers see a score only for students with both sessions", () => {
    const assignments = [{ id: "a1", exam_slug: "S11-A_1ra", scope: "all" }, { id: "a2", exam_slug: "S11-A_2da", scope: "all" }, { id: "a3", exam_slug: "S11-A_2da", scope: "all", question_keys: ["x"] }];
    const att = (who, id, day) => ({ profile_id: who, assignment_id: id, submitted_at: new Date(2026, 9, day).toISOString(), mode: "timed", score: { keyed: true, total: 120, answered: 120, correct: 24, perArea: areas(12) } });
    const attempts = [att("p1", "a1", 1), att("p1", "a2", 2), att("p2", "a1", 1), att("p3", "a1", 1), att("p3", "a3", 2)];
    const scores = studentScores({ attempts, assignments });
    expect(scores.get("p1").global).toBeGreaterThan(0);
    expect(scores.get("p2")).toBeNull();
    expect(scores.get("p3")).toBeNull();
    const s = schoolSummary({ courses: [], members: [], assignments, attempts });
    expect(s.bandCount).toBe(1);
    const withSlug = attempts.filter((t) => t.profile_id === "p1").map((t) => ({ ...t, exam_slug: assignments.find((a) => a.id === t.assignment_id).exam_slug }));
    expect(latestScore(withSlug).global).toBe(scores.get("p1").global);
    expect(summarize(withSlug).band.global).toBe(scores.get("p1").global);
    expect(summarize(withSlug.slice(0, 1)).band).toBeNull();
    const small = withSlug.map((t) => ({ ...t, score: { ...t.score, total: 24 } }));
    expect(latestScore(small)).toBeNull();
    expect(summarize(small, false, assignments).band.global).toBeGreaterThan(0);
  });
});
