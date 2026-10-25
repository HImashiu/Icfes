import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Results from "../src/screens/Results.jsx";
import { recordAttempt } from "../src/lib/local.js";

// Ending any practice opens Resultados. It crashed for every kind (a variable used before it was defined), so each
// way of ending one is rendered here with data shaped like a real account's.
const AREAS = [["Lectura crítica", 41], ["Matemáticas", 50], ["Sociales y ciudadanas", 50], ["Ciencias naturales", 58], ["Inglés", 55]];
const session = (n) => AREAS.flatMap(([section, count]) => Array.from({ length: Math.round(count / 2) }, (_, i) => ({ key: `${n}-${section}-${i}`, number: i + 1, section, options: [{}, {}, {}, {}] })));
const keyOf = (qs) => new Map(qs.map((q) => [q.key, "A"]));
const answersOf = (qs, share) => Object.fromEntries(qs.map((q, i) => [q.key, i / qs.length < share ? "A" : "B"]));
const base = (qs, over) => ({ startedAt: Date.now() - 3600e3, submittedAt: Date.now(), answers: answersOf(qs, 0.7), flags: {}, times: {}, mode: "practice", slug: "S11-A_1ra", scope: "all", ...over });
const show = (qs, attempt, extra = {}) => render(<Results title="S11-A" questions={qs} attempt={attempt} answerKey={keyOf(qs)} keyStatus="preliminary" onReview={() => {}} onHome={() => {}} onRetry={() => {}} exams={[{ slug: "S11-A_1ra" }, { slug: "S11-A_2da" }]} {...extra} />);

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("ending a practice opens Resultados without crashing", () => {
  const s1 = session(1);
  const s2 = session(2).map((q) => q);
  it("practice of one area", () => {
    const qs = s1.filter((q) => q.section === "Matemáticas");
    show(qs, base(qs, { scope: "Matemáticas" }));
    expect(screen.getAllByText(/Matemáticas/).length).toBeGreaterThan(0);
  });
  it("practice stopped early (few answered)", () => {
    const qs = s1.slice(0, 20);
    show(qs, base(qs, { answers: { [qs[0].key]: "A" } }));
    expect(screen.getByText(/Respondidas/)).toBeTruthy();
  });
  it("one timed session: waits for the other", () => {
    show(s1, base(s1, { mode: "timed" }));
    expect(screen.getByText(/Falta la Sesión 2/)).toBeTruthy();
  });
  it("the second session completes a simulacro and shows the Saber 11 score", () => {
    const first = base(s1, { mode: "timed", startedAt: Date.now() - 86400e3, submittedAt: Date.now() - 80000e3 });
    recordAttempt({ id: String(first.startedAt), title: "S11-A", mode: "timed", at: first.submittedAt, total: s1.length, answered: s1.length, keyed: true, correct: 0, perArea: [], snapshot: { slug: "S11-A_1ra", scope: "all", answers: first.answers } });
    show(s2, base(s2, { mode: "timed", slug: "S11-A_2da" }));
    expect(screen.getAllByText(/Saber 11/).length).toBeGreaterThan(0);
  });
  it("a teacher's tarea with a grading model", () => {
    const qs = s1.slice(0, 15);
    show(qs, base(qs, { assignmentId: "a1", attemptNo: 2 }), { grading: { kind: "scale" } });
    expect(screen.getByText(/Nota de tu docente/)).toBeTruthy();
  });
  it("a repechaje round and a custom practice", () => {
    const qs = s1.slice(0, 6);
    show(qs, base(qs, { repechaje: true }));
    cleanup();
    show(qs, base(qs, { custom: true }), { grading: { kind: "irt" } });
    expect(screen.getByText(/Respondidas/)).toBeTruthy();
  });
  it("an attempt with nothing answered", () => {
    const qs = s1.slice(0, 6);
    show(qs, base(qs, { answers: {} }));
    expect(screen.getByText(/Sin respuestas todavía|Sesión entregada/)).toBeTruthy();
  });
});
