import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TeacherSpread, { coordinationText, inviteLink, inviteText } from "../src/screens/teacher/TeacherSpread.jsx";
import { claimMessage } from "../src/lib/auth.jsx";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* none */ } });

describe("self-serve teacher trial (migration 0038)", () => {
  it("builds the colleague invitation on the public domain, with code, inviter and source", () => {
    const link = inviteLink("CND-AAAA-BBBB-CCCC-DDDD", "11111111-2222-3333-4444-555555555555", "https://condoricfes.com");
    expect(link).toBe("https://condoricfes.com/app/?codigo=CND-AAAA-BBBB-CCCC-DDDD&fuente=invita-docente&de=11111111-2222-3333-4444-555555555555#docente/hoy");
    expect(inviteText(link)).toContain(link);
    expect(inviteLink("CND-AAAA-BBBB-CCCC-DDDD", null, "http://localhost:5173")).toMatch(/^http:\/\/localhost:5173\/app\/\?codigo=/);
  });

  it("tells coordination what the teacher already did, without promising free forever", () => {
    const t = coordinationText({ students: 34, activities: 3, avgPct: 58, school: "IE San José" });
    expect(t).toContain("34 estudiantes en 3 actividades (promedio 58 %)");
    expect(t).toContain("IE San José");
    expect(t).toContain("gratis durante la demostración");
    expect(t).not.toMatch(/siempre|para siempre/i);
    expect(coordinationText({})).not.toContain("Ya lo usé");
  });

  it("maps the new database errors to plain Spanish", () => {
    expect(claimMessage(new Error("school_uses_condor"))).toMatch(/coordinación/);
    expect(claimMessage(new Error("self_trial_used"))).toMatch(/ya abrió/);
    expect(claimMessage(new Error("school_name_required"))).toMatch(/nombre de tu colegio/);
    expect(claimMessage(new Error("Could not find the function public.start_teacher_trial"))).toMatch(/todavía no está activa/);
  });

  it("shows the invite card only for a trial school, and hides it for a week on «Ahora no»", async () => {
    const api = { myTrial: vi.fn().mockResolvedValue({ code: "CND-AAAA-BBBB-CCCC-DDDD", school_name: "IE San José, Pasto", teachers: 1, max_teachers: 15 }) };
    const profile = { id: "11111111-2222-3333-4444-555555555555" };
    render(<TeacherSpread api={api} profile={profile} stats={{ students: 10, activities: 2, avgPct: null }} />);
    await waitFor(() => expect(screen.getByText("Trae a tus colegas")).toBeTruthy());
    expect(screen.getByText(/quedan 14 cupos/)).toBeTruthy();
    const wa = screen.getByText(/Invitar por WhatsApp/).closest("a");
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("codigo=CND-AAAA-BBBB-CCCC-DDDD");
    fireEvent.click(screen.getByText("Ahora no"));
    expect(screen.queryByText("Trae a tus colegas")).toBeNull();
    cleanup();
    render(<TeacherSpread api={api} profile={profile} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Trae a tus colegas")).toBeNull();
  });

  it("renders nothing for a real school (no trial)", async () => {
    const api = { myTrial: vi.fn().mockResolvedValue(null) };
    const { container } = render(<TeacherSpread api={api} profile={{ id: "x" }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });
});
