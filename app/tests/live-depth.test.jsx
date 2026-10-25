import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { classProgress, gameReport, missedKeysOf, pointsFor, resultsCsv, secondsLeft } from "../src/lib/live.js";
import LivePlay from "../src/screens/LivePlay.jsx";

afterEach(cleanup);

const session = (over = {}) => ({
  id: "s1", code: "123456", title: "Repaso", exam_slug: "X", question_keys: ["1", "2", "2"], seconds_per_question: 60,
  state: "ended", current_index: 2, question_started_at: null, current_correct: [], reasks: { 2: 1 }, closed: { 0: ["B"], 1: ["C"], 2: ["C"] }, ...over,
});

describe("live game depth", () => {
  it("pays flat points in accuracy mode and none on a re-ask round", () => {
    expect(pointsFor({ correct: true, elapsedMs: 59000, limitSec: 60, streak: 0, mode: "accuracy" })).toBe(1000);
    expect(pointsFor({ correct: true, elapsedMs: 0, limitSec: 60, streak: 0, reask: true })).toBe(0);
  });
  it("counts added time and freezes the clock while paused", () => {
    const s = { state: "question", question_started_at: "2026-10-17T10:00:00Z", seconds_per_question: 60, extra_seconds: 15, paused_at: "2026-10-17T10:00:30Z" };
    expect(secondsLeft(s, new Date("2026-10-17T10:05:00Z").getTime())).toBe(45);
    expect(secondsLeft({ ...s, paused_at: null }, new Date("2026-10-17T10:00:30Z").getTime())).toBe(45);
  });
  it("builds a report: per question, re-ask before/after, misconceptions and players in alphabetical order", () => {
    const players = [{ player_id: "b", nickname: "Beto", score: 900 }, { player_id: "a", nickname: "Ana", score: 100, profile_id: "p" }];
    const answers = [
      { player_id: "a", question_index: 0, option: "B", confident: true }, { player_id: "b", question_index: 0, option: "B", confident: false },
      { player_id: "a", question_index: 1, option: "A", confident: true }, { player_id: "b", question_index: 1, option: "A", confident: true },
      { player_id: "a", question_index: 2, option: "C" }, { player_id: "b", question_index: 2, option: "A" },
    ];
    const r = gameReport({ session: session(), players, answers });
    expect(r.questions.map((q) => q.pct)).toEqual([100, 0, 50]);
    expect(r.questions[1]).toMatchObject({ sureWrong: 2, topWrong: { letter: "A", count: 2 } });
    expect(r.reasks).toEqual([{ n: 3, of: 2, before: 0, after: 50, changedToRight: 1 }]);
    expect(r.people.map((p) => p.nickname)).toEqual(["Ana", "Beto"]);
    expect(r.people[0]).toMatchObject({ right: 1, of: 2, guest: false });
    expect(r.classPct).toBe(50);
    expect(r.toReinforce.map((q) => q.key)).toEqual(["2"]);
    expect(r.misconceptions[0]).toMatchObject({ n: 2, letter: "A" });
    expect(resultsCsv("T", players, r)).toMatch(/P3 \(otra vez\)/);
    expect(classProgress([{ pct: 50, answered: 2, right: 1 }, { pct: 100, answered: 2, right: 2, reask: true }], 60)).toMatchObject({ pct: 50, reached: false });
    expect(missedKeysOf(session(), [{ question_index: 0, option: "B", points: 800 }])).toEqual(["2"]);
  });
});

describe("LivePlay depth", () => {
  const q = (n) => ({ key: String(n), number: n, section: "Matemáticas", stem_md: `<p>Pregunta ${n}</p>`, group: null, options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `Opción ${l}` })) });
  const bundle = { exam: { title: "S11-A", questions: [q(1), q(2)] }, key: new Map([["1", "B"], ["2", "C"]]), figures: null };
  it("asks sure or unsure before sending when the room wants it", async () => {
    const live = session({ state: "question", current_index: 0, question_started_at: new Date().toISOString(), ask_confidence: true, reasks: {}, closed: {} });
    const api = {
      myPlayerId: vi.fn().mockResolvedValue("p1"), liveNow: vi.fn().mockResolvedValue(new Date().toISOString()),
      liveSession: vi.fn().mockResolvedValue(live), livePlayers: vi.fn().mockResolvedValue([]), liveMyAnswers: vi.fn().mockResolvedValue([]),
      liveAnswer: vi.fn().mockResolvedValue(undefined),
    };
    render(<LivePlay api={api} initial={live} nickname="Ana" fetchExam={vi.fn().mockResolvedValue(bundle)} onExit={() => {}} />);
    fireEvent.click(await screen.findByText("Opción B"));
    expect(api.liveAnswer).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Con dudas" }));
    await waitFor(() => expect(api.liveAnswer).toHaveBeenCalledWith("s1", 0, "B", false));
  });
  it("reviews each answer at the end and offers to practice the missed ones", async () => {
    const live = session({ question_keys: ["1", "2"], current_index: 1, reasks: {}, closed: { 0: ["B"], 1: ["C"] } });
    const practice = vi.fn();
    const api = {
      myPlayerId: vi.fn().mockResolvedValue("p1"), liveNow: vi.fn().mockResolvedValue(new Date().toISOString()),
      liveSession: vi.fn().mockResolvedValue(live), livePlayers: vi.fn().mockResolvedValue([]),
      liveMyAnswers: vi.fn().mockResolvedValue([{ question_index: 0, option: "B", points: 900 }, { question_index: 1, option: "A", points: 0 }]),
    };
    render(<LivePlay api={api} initial={live} nickname="Ana" fetchExam={vi.fn().mockResolvedValue(bundle)} onExit={() => {}} onPracticeMissed={practice} />);
    fireEvent.click(await screen.findByRole("button", { name: /Practicar las 1 que fallé/ }));
    expect(practice).toHaveBeenCalledWith("X", ["2"]);
  });
});
