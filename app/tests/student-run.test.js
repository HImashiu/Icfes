import { describe, expect, it } from "vitest";
import { addTime, classTimes, fmtDuration, median, roundedTimes, studentRun } from "../src/lib/studentRun.js";
import { attemptForAssignment, attemptRow, progressRows } from "../src/lib/assignments.js";
import { itemStats } from "../src/lib/analytics.js";

const qs = [1, 2, 3].map((n) => ({ key: String(n), number: n, section: "Matemáticas", options: [] }));
const key = new Map([["1", "A"], ["2", "B"], ["3", "C"]]);

describe("time per question", () => {
  it("adds stretches to the same question and rounds for upload", () => {
    const t = addTime(addTime({}, "1", 12.34), "1", 5);
    expect(t).toEqual({ "1": 17.3 });
    expect(roundedTimes(t)).toEqual({ "1": 17 });
  });
  it("formats durations and medians", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(42)).toBe("42 s");
    expect(fmtDuration(65)).toBe("1 min 05 s");
    expect(fmtDuration(3700)).toBe("1 h 01 min");
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("one student's run", () => {
  const a = { answers: { 1: "A", 2: "D" }, times: { 1: 20, 2: 90, 3: 10 }, activity: { hints: { 2: true }, changes: { 2: 1 } } };
  const b = { answers: { 1: "A" }, times: { 1: 30, 2: 10 } };
  const avg = classTimes(qs, [a, b]);
  const run = studentRun(qs, key, a, avg);
  it("grades each question and keeps time, hint and changes", () => {
    expect(run.rows.map((r) => r.verdict)).toEqual(["ok", "bad", "blank"]);
    expect(run.correct).toBe(1);
    expect(run.hints).toBe(1);
    expect(run.rows[1]).toMatchObject({ sec: 90, hint: true, changes: 1, slow: true });
    expect(run.questionSec).toBe(120);
    expect(run.slowest[0].number).toBe(2);
  });
  it("copes with attempts that recorded no times", () => {
    const r = studentRun(qs, key, { answers: { 1: "A" } }, avg);
    expect(r.hasTimes).toBe(false);
    expect(r.avgSec).toBeNull();
  });
  it("class stats: average time and the most chosen wrong option", () => {
    const items = itemStats(qs, key, [{ submitted_at: "x", ...a }, { submitted_at: "x", ...b }]);
    expect(items[1]).toMatchObject({ avgSec: 50, topWrong: "D", hintN: 1 });
  });
});

describe("saving and listing attempts", () => {
  it("an assignment attempt starts with empty timing and delivers it", () => {
    const att = { ...attemptForAssignment({ id: "A", kind: "task", exam_slug: "X", scope: "all" }, [], 1000), submittedAt: 61000, times: { 1: 12.6 }, hintsUsed: { 1: true } };
    const row = attemptRow(att, qs, key);
    expect(row.times).toEqual({ "1": 13 });
    expect(row.activity).toEqual({ hints: { 1: true }, changes: {} });
    expect(row.duration_sec).toBe(60);
  });
  it("progress rows list every delivered attempt of a student, oldest first", () => {
    const members = [{ id: "m1", role: "student", profile_id: "p1", full_name: "Ana", email: "a@x.co" }];
    const att = [
      { profile_id: "p1", submitted_at: "2026-10-18T10:00:00Z", mode: "practice", score: { keyed: true, correct: 1, answered: 2, total: 3 } },
      { profile_id: "p1", submitted_at: "2026-10-17T10:00:00Z", mode: "practice", score: { keyed: true, correct: 2, answered: 2, total: 3 } },
    ];
    const { rows } = progressRows(members, att);
    expect(rows[0].attempts.map((x) => x.submitted_at)).toEqual(["2026-10-17T10:00:00Z", "2026-10-18T10:00:00Z"]);
    expect(rows[0].attempt.score.correct).toBe(2);
  });
});
