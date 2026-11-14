import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeacherSpread, { constanciaHtml, inviteLink, inviteText, progress, referralLink, referralText, rewardText } from "../src/screens/teacher/TeacherSpread.jsx";
import { claimMessage } from "../src/lib/auth.jsx";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* none */ } });

describe("self-serve teacher trial (migration 0038)", () => {
  it("builds the colleague invitation on the public domain, with code, inviter and source", () => {
    const link = inviteLink("CND-AAAA-BBBB-CCCC-DDDD", "11111111-2222-3333-4444-555555555555", "https://condoricfes.com");
    expect(link).toBe("https://condoricfes.com/app/?codigo=CND-AAAA-BBBB-CCCC-DDDD&fuente=invita-docente&de=11111111-2222-3333-4444-555555555555#docente/hoy");
    expect(inviteText(link)).toContain(link);
    expect(inviteLink("CND-AAAA-BBBB-CCCC-DDDD", null, "http://localhost:5173")).toMatch(/^http:\/\/localhost:5173\/app\/\?codigo=/);
  });

  it("builds the personal referral link for teachers of any school", () => {
    const link = referralLink("ABC123", "https://condoricfes.com");
    expect(link).toBe("https://condoricfes.com/prueba-docente/?ref=ABC123&via=docente&fuente=referido-docente");
    expect(referralLink("ABC123", "http://localhost:5173")).toBe("http://localhost:5173/app/?ref=ABC123&via=docente&fuente=referido-docente");
    expect(referralText(link)).toContain(link);
  });

  it("never talks about prices, trials or selling to the school", () => {
    const all = [inviteText("L"), referralText("L"), rewardText(1), rewardText(2, { student_questions: [0, 0, 10, 20], trial_booklets: [0, 0, 14, 28] }, true)].join(" ");
    expect(all).not.toMatch(/gratis|precio|prueba de|demostraci|coordinaci|pagar|cobr/i);
  });

  it("describes each level's reward and the progress toward it", () => {
    const rewards = { student_questions: [0, 0, 10, 20], trial_booklets: [0, 0, 14, 28] };
    expect(rewardText(1, rewards)).toMatch(/insignia y una constancia/);
    expect(rewardText(2, rewards, false)).toBe("10 preguntas más al día para tus estudiantes");
    expect(rewardText(2, rewards, true)).toBe("14 cuadernillos más para tu espacio y 10 preguntas más al día para tus estudiantes");
    expect(rewardText(3, rewards)).toMatch(/página de docentes fundadores$/);
    expect(progress({ colleagues: 1, students: 50, next: { colleagues: 3, students: 100 } })).toBeCloseTo(1 / 3);
    expect(progress({ colleagues: 3, students: 25, next: { colleagues: 3, students: 100 } })).toBeCloseTo(0.25);
    expect(progress({ next: null })).toBe(1);
  });

  it("prints a constancia with the teacher's name escaped", () => {
    const h = constanciaHtml({ name: "Ana <b>", school: "IE San José", level: 2, since: "2026-11-14T12:00:00Z", colleagues: 3, students: 120 });
    expect(h).toContain("Ana &lt;b&gt;");
    expect(h).toContain("Docente Embajador");
    expect(h).toContain("Invitó a 3 colegas");
    expect(h).toContain("docente de IE San José");
  });

  it("maps the new database errors to plain Spanish", () => {
    expect(claimMessage(new Error("school_uses_condor"))).toMatch(/coordinación/);
    expect(claimMessage(new Error("self_trial_used"))).toMatch(/ya abrió/);
    expect(claimMessage(new Error("school_name_required"))).toMatch(/nombre de tu colegio/);
    expect(claimMessage(new Error("Could not find the function public.start_teacher_trial"))).toMatch(/todavía no está activa/);
  });

  it("shows the same-school link in a self-serve space, and hides it for a week on «Ahora no»", async () => {
    const api = { myTrial: vi.fn().mockResolvedValue({ code: "CND-AAAA-BBBB-CCCC-DDDD", school_name: "IE San José, Pasto", teachers: 1, max_teachers: 50 }) };
    const profile = { id: "11111111-2222-3333-4444-555555555555" };
    render(<TeacherSpread api={api} profile={profile} />);
    await waitFor(() => expect(screen.getByText("Invita a otros profes")).toBeTruthy());
    expect(screen.queryByText(/cupos/)).toBeNull();
    const wa = screen.getByText(/Invitar por WhatsApp/).closest("a");
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("codigo=CND-AAAA-BBBB-CCCC-DDDD");
    fireEvent.click(screen.getByText("Ahora no"));
    expect(screen.queryByText("Invita a otros profes")).toBeNull();
    cleanup();
    render(<TeacherSpread api={api} profile={profile} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Invita a otros profes")).toBeNull();
  });

  it("shows the level, progress and personal link when referrals are on", async () => {
    const refs = { code: "ABC123", level: 1, colleagues: 1, students: 24, reached_at: { 1: "2026-11-14T12:00:00Z" },
      next: { level: 2, colleagues: 3, students: 100 }, rewards: { student_questions: [0, 0, 10, 20], trial_booklets: [0, 0, 14, 28] },
      invited: 2, list: [{ name: "Marta", students: 24 }, { name: "Pedro", students: 0 }] };
    const api = { myTrial: vi.fn().mockResolvedValue({ code: "CND-AAAA-BBBB-CCCC-DDDD", school_name: "IE San José, Pasto" }), myTeacherReferrals: vi.fn().mockResolvedValue(refs) };
    render(<TeacherSpread api={api} profile={{ id: "u1", full_name: "Luis" }} />);
    await waitFor(() => expect(screen.getByText(/Docente Aliado/)).toBeTruthy());
    expect(screen.getByText(/1 de 3 colegas · 24 de 100 estudiantes activos para Embajador/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("24");
    const wa = screen.getByText(/Invitar por WhatsApp/).closest("a");
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("ref=ABC123&via=docente");
    expect(screen.getByText("Constancia")).toBeTruthy();
    expect(screen.getByText(/a IE San José/)).toBeTruthy();
    expect(screen.getByText("2 profes invitados")).toBeTruthy();
  });

  it("works for a teacher in a real school, with only the personal link", async () => {
    const api = { myTrial: vi.fn().mockResolvedValue(null), myTeacherReferrals: vi.fn().mockResolvedValue({ code: "ZZ9", level: 0, colleagues: 0, students: 0, next: { level: 1, colleagues: 1, students: 20 }, rewards: {}, invited: 0, list: [] }) };
    render(<TeacherSpread api={api} profile={{ id: "u2" }} />);
    await waitFor(() => expect(screen.getByText("Sin nivel todavía")).toBeTruthy());
    expect(screen.queryByText("Constancia")).toBeNull();
    expect(screen.queryByText(/¿Es de tu mismo colegio?/)).toBeNull();
  });

  it("renders nothing when the server has neither call", async () => {
    const api = { myTrial: vi.fn().mockResolvedValue(null) };
    const { container } = render(<TeacherSpread api={api} profile={{ id: "x" }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });
});
