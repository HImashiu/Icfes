import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { classShare, distribution, pointsFor, resultsCsv, scoreQuestion, secondsLeft } from "../src/lib/live.js";
import LiveHost from "../src/screens/LiveHost.jsx";
import LivePlay from "../src/screens/LivePlay.jsx";

afterEach(cleanup);

const session = (over = {}) => ({
  id: "s1", code: "123456", title: "Repaso", exam_slug: "X", question_keys: ["1", "2"], seconds_per_question: 60,
  state: "lobby", current_index: -1, question_started_at: null, current_correct: [], ...over,
});
const q = (n) => ({ key: String(n), number: n, section: "Matemáticas", stem_md: `<p>Pregunta ${n}</p>`, group: null, options: ["A", "B", "C", "D"].map((l) => ({ letter: l, text_md: `Opción ${l}` })) });
const bundle = { exam: { title: "S11-A", questions: [q(1), q(2)] }, key: new Map([["1", "B"], ["2", "C"]]), figures: null };

describe("live scoring", () => {
  it("pays more for faster correct answers and adds a capped streak bonus", () => {
    expect(pointsFor({ correct: true, elapsedMs: 0, limitSec: 60, streak: 0 })).toBe(1000);
    expect(pointsFor({ correct: true, elapsedMs: 60000, limitSec: 60, streak: 0 })).toBe(600);
    expect(pointsFor({ correct: true, elapsedMs: 0, limitSec: 60, streak: 9 })).toBe(1250);
    expect(pointsFor({ correct: false, elapsedMs: 0, limitSec: 60, streak: 3 })).toBe(0);
  });
  it("scores a question from server timestamps and every accepted letter", () => {
    const s = session({ state: "question", current_index: 0, question_started_at: "2026-10-17T10:00:00Z" });
    const players = [{ player_id: "a", streak: 2 }, { player_id: "b", streak: 0 }];
    const answers = [
      { player_id: "a", option: "B", answered_at: "2026-10-17T10:00:30Z" },
      { player_id: "b", option: "C", answered_at: "2026-10-17T10:00:10Z" },
    ];
    expect(scoreQuestion(s, players, answers, ["B"]).map((x) => x.points)).toEqual([800 + 100, 0]);
    expect(scoreQuestion(s, players, answers, ["B", "C"])[1].points).toBe(Math.round(1000 - 400 / 6));
  });
  it("shares the class's right answers, never ranks, counts options and runs the countdown against the database clock", () => {
    expect(classShare([{ option: "A" }, { option: "B" }, { option: "A" }, { option: "C" }], ["A"])).toEqual({ answered: 4, right: 2, pct: 50 });
    expect(classShare([], ["A"]).pct).toBeNull();
    expect(resultsCsv("T", [{ nickname: "b", score: 9 }, { nickname: "a", score: 5 }])).not.toMatch(/Puesto/);
    expect(resultsCsv("T", [{ nickname: "b", score: 9 }, { nickname: "a", score: 5 }]).split("\n").slice(2, 4)).toEqual(["a,5,Invitado", "b,9,Invitado"]);
    expect(distribution([{ option: "A" }, { option: "A" }, { option: "C" }])).toEqual({ A: 2, B: 0, C: 1, D: 0 });
    const s = session({ state: "question", question_started_at: "2026-10-17T10:00:00Z" });
    const t = new Date("2026-10-17T10:00:20Z").getTime();
    expect(secondsLeft(s, t, 0)).toBe(40);
    expect(secondsLeft(s, t + 5000, 5000)).toBe(40);
    expect(secondsLeft(s, t + 90000, 0)).toBe(0);
  });
});

describe("LiveHost", () => {
  const api = (over = {}) => ({
    liveNow: vi.fn().mockResolvedValue(new Date().toISOString()),
    liveSession: vi.fn().mockResolvedValue(null),
    livePlayers: vi.fn().mockResolvedValue([{ player_id: "p1", nickname: "Ana", score: 0, streak: 0 }]),
    liveAnswers: vi.fn().mockResolvedValue([]),
    liveNext: vi.fn().mockResolvedValue(session({ state: "question", current_index: 0, question_started_at: new Date().toISOString() })),
    liveReveal: vi.fn(),
    liveEnd: vi.fn(),
    ...over,
  });
  const guard = async (fn) => fn();

  it("shows the code and players, then opens the first question", async () => {
    const a = api();
    render(<LiveHost api={a} initial={session()} fetchExam={vi.fn().mockResolvedValue(bundle)} guard={guard} onExit={() => {}} />);
    expect(screen.getByText("123456")).toBeTruthy();
    expect(await screen.findByText("Ana")).toBeTruthy();
    const start = await screen.findByRole("button", { name: "Empezar" });
    await waitFor(() => expect(start.disabled).toBe(false));
    fireEvent.click(start);
    await waitFor(() => expect(a.liveNext).toHaveBeenCalledWith("s1", 0));
    expect(await screen.findByText(/Pregunta 1 de 2/)).toBeTruthy();
  });

  it("closes the question with the key plus any extra accepted letter and scores the answers", async () => {
    const start = new Date().toISOString();
    let answered = false;
    const a = api({
      liveAnswers: vi.fn().mockImplementation(async () => (answered ? [{ player_id: "p1", option: "C", answered_at: start }] : [])),
      liveReveal: vi.fn().mockResolvedValue(session({ state: "reveal", current_index: 0, question_started_at: start, current_correct: ["B", "C"] })),
    });
    render(<LiveHost api={a} initial={session({ state: "question", current_index: 0, question_started_at: start })} fetchExam={vi.fn().mockResolvedValue(bundle)} guard={guard} onExit={() => {}} />);
    // the booklet key (B) is preselected; the teacher also accepts C before closing
    fireEvent.click(await screen.findByRole("button", { name: "C" }));
    answered = true;
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar y mostrar respuesta" }));
    await waitFor(() => expect(a.liveReveal).toHaveBeenCalled());
    const [, correct, points] = a.liveReveal.mock.calls[0];
    expect(correct).toEqual(["B", "C"]);
    expect(points).toEqual([{ player_id: "p1", points: expect.any(Number) }]);
    expect(points[0].points).toBeGreaterThan(900);
  });
});

describe("LivePlay", () => {
  it("sends the tapped option once and shows it as sent", async () => {
    const start = new Date().toISOString();
    const api = {
      myPlayerId: vi.fn().mockResolvedValue("p1"),
      liveNow: vi.fn().mockResolvedValue(new Date().toISOString()),
      liveSession: vi.fn().mockResolvedValue(session({ state: "question", current_index: 0, question_started_at: start })),
      livePlayers: vi.fn().mockResolvedValue([{ player_id: "p1", nickname: "Ana", score: 0, streak: 0 }]),
      liveMyAnswers: vi.fn().mockResolvedValue([]),
      liveAnswer: vi.fn().mockResolvedValue(undefined),
    };
    render(<LivePlay api={api} initial={session({ state: "question", current_index: 0, question_started_at: start })} nickname="Ana" fetchExam={vi.fn().mockResolvedValue(bundle)} onExit={() => {}} />);
    fireEvent.click(await screen.findByText("Opción B"));
    await waitFor(() => expect(api.liveAnswer).toHaveBeenCalledWith("s1", 0, "B"));
    expect(await screen.findByText("Respuesta enviada: B")).toBeTruthy();
  });
});
