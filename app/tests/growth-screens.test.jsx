// Growth screens render and behave with the server answers they expect (migration 0050), mocked here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("../src/lib/supabase.js", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
vi.mock("../src/lib/usage.js", () => ({ visitorId: () => "11111111-1111-4111-8111-111111111111", amAdmin: () => Promise.resolve(true) }));

const { default: GrowthHome } = await import("../src/screens/growth/GrowthHome.jsx");
const { default: GrowthProfile } = await import("../src/screens/growth/GrowthProfile.jsx");
const { default: GrowthSurvey } = await import("../src/screens/growth/GrowthSurvey.jsx");
const { default: Parche } = await import("../src/screens/growth/Parche.jsx");
const { default: AdminGrowth } = await import("../src/screens/AdminGrowth.jsx");
const { firstSteps, onSignedIn } = await import("../src/lib/growth/app.js");

afterEach(() => { cleanup(); rpc.mockReset(); localStorage.clear(); sessionStorage.clear(); });
const answers = (map) => rpc.mockImplementation(async (name) => ({ data: typeof map[name] === "function" ? map[name]() : map[name] ?? null, error: null }));
const student = { id: "u1", role: "student", full_name: "Valentina Ruiz", school_id: null, email: "v@x.co" };

describe("growth on Inicio", () => {
  it("shows a season notice, the first-steps checklist and the study group, cooperatively", async () => {
    answers({
      active_notices: [{ id: "n1", title: "Simulacro nacional Cóndor", body: "Un sábado", cta_label: "Inscribirme", cta_url: "/simulacro-nacional/" }],
      my_study_groups: [{ id: "g", code: "abc123", name: "Los de 11-B", weekly_goal: 300, week_total: 120, members: [{ name: "Ana", today: true, days: 2 }, { name: "Luis", today: false, days: 1 }] }],
    });
    render(<GrowthHome signedIn onSetup={() => {}} onGo={() => {}} />);
    expect(await screen.findByText("Simulacro nacional Cóndor")).toBeTruthy();
    expect(screen.getByText("Primeros pasos")).toBeTruthy();
    expect(await screen.findByText("Los de 11-B")).toBeTruthy();
    expect(screen.getByText(/120 de 300 preguntas · 1 de 2 practicaron hoy/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Ocultar aviso"));
    expect(screen.queryByText("Simulacro nacional Cóndor")).toBeNull();
  });
  it("ticks first steps from what the student did", () => {
    const s = firstSteps({ answered: 6, hasGoal: true, invited: false, installed: false, grouped: true });
    expect(s.filter((x) => x.done).map((x) => x.id)).toEqual(["q1", "q5", "goal", "group"]);
  });
});

describe("invitations", () => {
  it("claims a saved invitation after sign-in, once", async () => {
    localStorage.setItem("condor:ref", JSON.stringify({ code: "ana-k7d", via: "amigo", at: Date.now() }));
    answers({ claim_referral: "ok" });
    expect(await onSignedIn(student)).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("claim_referral", { p_code: "ana-k7d", p_via: "amigo" });
    expect(localStorage.getItem("condor:ref")).toBeNull();
    expect(localStorage.getItem("condor:signed")).toBe("1");
  });
  it("shows the student's link, WhatsApp invite and bonus on Perfil", async () => {
    answers({ my_referral_code: "valentina-k7d", my_referrals: { code: "valentina-k7d", invited: 3, activated: 2, teachers: 0, bonus: 20 }, certificate_progress: { answered: 40, areas: 2, days: 2, need: { answered: 150, areas: 3, days: 5 } }, partner_stats: [] });
    render(<GrowthProfile profile={student} />);
    expect(await screen.findByText(/r\/valentina-k7d/)).toBeTruthy();
    expect(screen.getByText("Invitar por WhatsApp").getAttribute("href")).toContain("wa.me");
    expect(await screen.findByText("+20")).toBeTruthy();
    expect(screen.getByText("40 de 150 preguntas")).toBeTruthy();
    expect(screen.getByText("Crear mi certificado").disabled).toBe(true);
  });
});

describe("study groups", () => {
  it("joins a group from its link", async () => {
    let groups = [];
    answers({ my_study_groups: () => groups, study_group_preview: { name: "Los de 11-B", members: 3, weekly_goal: 300 }, join_study_group: () => { groups = [{ id: "g", code: "abc123", name: "Los de 11-B", weekly_goal: 300, week_total: 0, members: [{ name: "Valentina", me: true, today: false, days: 0 }] }]; return { id: "g" }; } });
    render(<Parche profile={student} code="abc123" onExit={() => {}} />);
    fireEvent.click(await screen.findByText("Unirme"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("join_study_group", { p_code: "abc123", p_display: "Valentina" }));
    expect(await screen.findByText("Valentina (tú)")).toBeTruthy();
  });
});

describe("surveys", () => {
  it("asks how they found Cóndor from the second practice", async () => {
    localStorage.setItem("condor:history", JSON.stringify([{ id: "1", at: 1 }, { id: "2", at: 2 }]));
    answers({ answer_survey: "ok" });
    render(<GrowthSurvey profile={student} />);
    fireEvent.click(screen.getByText("TikTok"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("answer_survey", expect.objectContaining({ p_survey: "canal", p_answer: { c: "tiktok" } })));
  });
});

describe("control room", () => {
  it("renders the funnel and an experiment verdict", async () => {
    answers({
      admin_growth_overview: { visitors: 900 },
      admin_growth_funnel: { visitors: 900, returned: 80, steps: [{ step: "page:view", label: "Visitó una página", visitors: 900 }, { step: "app:open", label: "Abrió la app", visitors: 300 }] },
      admin_experiment_readout: [{ key: "hero-cta", description: "Botón", goal: "cta:click", status: "running", variants: ["control", "pregunta"], arms: [{ variant: "control", exposed: 2000, converted: 100 }, { variant: "pregunta", exposed: 2000, converted: 160 }] }],
      admin_surveys: {}, admin_partners: { applications: [], codes: [] }, admin_leads: [], admin_content_gaps: { searches: [], not_found: [] },
    });
    render(<AdminGrowth onExit={() => {}} />);
    expect(await screen.findByText("Embudo de activación")).toBeTruthy();
    expect(screen.getByText("Abrió la app")).toBeTruthy();
    expect(screen.getByText("Gana la variante")).toBeTruthy();
  });
});
