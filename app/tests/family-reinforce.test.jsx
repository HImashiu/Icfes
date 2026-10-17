import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { familyPayload, tokenFromHash, whatsappLink } from "../src/lib/family.js";
import FamilyReport from "../src/screens/FamilyReport.jsx";
import Reinforcement from "../src/screens/Reinforcement.jsx";

afterEach(cleanup);

const att = (mode, per) => ({ submitted_at: "2026-10-10T10:00:00Z", mode, score: { keyed: true, correct: per.reduce((a, p) => a + p.correct, 0), total: per.reduce((a, p) => a + p.total, 0), perArea: per } });

describe("family report", () => {
  it("builds a parent-safe payload: band from the latest timed exam, strongest and weakest area, a plan for the two weakest", () => {
    const p = familyPayload({ studentName: "Dani", attempts: [att("timed", [{ name: "Matemáticas", correct: 3, total: 10 }, { name: "Lectura crítica", correct: 8, total: 10 }, { name: "Inglés", correct: 5, total: 10 }]), att("practice", [{ name: "Matemáticas", correct: 5, total: 10 }])] });
    expect(p.student).toBe("Dani");
    expect(p.band.low).toBeLessThan(p.band.high);
    expect(p.weakest).toBe("Matemáticas");
    expect(p.strongest).toBe("Lectura crítica");
    expect(p.plan.map((x) => x.area)).toEqual(["Matemáticas", "Inglés"]);
    expect(JSON.stringify(p)).not.toMatch(/answers|email/);
  });
  it("has no band without a timed exam and reads tokens from the link", () => {
    expect(familyPayload({ studentName: "A", attempts: [att("practice", [{ name: "Inglés", correct: 5, total: 10 }])] }).band).toBeNull();
    expect(tokenFromHash("#/informe/" + "a".repeat(36))).toBe("a".repeat(36));
    expect(tokenFromHash("#/informe/../x")).toBeNull();
    expect(whatsappLink("https://x/#/informe/abc", "Ana")).toContain("wa.me");
  });
  it("shows the report to the family and a friendly message for a dead link", async () => {
    const data = { school: "Colegio", student: "Dani", created_at: "2026-10-17T10:00:00Z", band: { low: 220, high: 280 }, areas: [{ name: "Matemáticas", pct: 30, scale: 30 }], strongest: null, weakest: "Matemáticas", plan: [{ area: "Matemáticas", tip: "Practicar." }], attempts: 2, note: "Orientativo" };
    render(<FamilyReport api={{ familyReport: vi.fn().mockResolvedValue(data) }} token="t" />);
    expect(await screen.findByText("Informe de Dani")).toBeTruthy();
    expect(screen.getByText("220–280")).toBeTruthy();
    cleanup();
    render(<FamilyReport api={{ familyReport: vi.fn().mockResolvedValue(null) }} token="t" />);
    expect(await screen.findByText("No pudimos abrir este informe")).toBeTruthy();
  });
});

describe("Reinforcement", () => {
  const q = (n, tag) => ({ key: String(n), number: n, section: "Matemáticas", stem_md: `P${n}`, group: null, _tag: tag });
  const qs = [1, 2, 3, 4, 5, 6].map((n) => q(n, n <= 3 ? "Razonamiento" : "Interpretación"));
  const bundle = { exam: { title: "X", questions: qs }, key: new Map(qs.map((x) => [x.key, "A"])), enrich: Object.fromEntries(qs.map((x) => [String(x.number), { competencia: x._tag }])) };
  it("computes a set per student with evidence and assigns one personal assignment each", async () => {
    const api = {
      getProfile: vi.fn().mockResolvedValue({ id: "t1" }),
      listMembers: vi.fn().mockResolvedValue([
        { id: "m1", role: "student", profile_id: "p1", email: "a@c.co", full_name: "Ana" },
        { id: "m2", role: "student", profile_id: "p2", email: "b@c.co", full_name: "Beto" },
      ]),
      examAttempts: vi.fn().mockResolvedValue([{ profile_id: "p1", submitted_at: "2026-10-10T10:00:00Z", answers: { 1: "B", 2: "B", 3: "B", 4: "A", 5: "A", 6: "A" } }]),
      createAssignment: vi.fn().mockResolvedValue({}),
    };
    const setNotice = vi.fn();
    render(<Reinforcement api={api} courses={[{ id: "c1", name: "11-A" }]} exams={[{ slug: "X", title: "X", status: "ready", hasEnrich: true }]} fetchExam={vi.fn().mockResolvedValue(bundle)} guard={async (f) => f()} setNotice={setNotice} />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular planes" }));
    expect(await screen.findByText("Aún sin suficientes respuestas")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Asignar 1 plan" }));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment.mock.calls[0][0]).toMatchObject({ assignee_id: "p1", kind: "task", exam_slug: "X", question_keys: ["1", "2", "3", "4", "5", "6"] });
  });
});
