// Growth screens render and behave with the server answers they expect (migration 0050), mocked here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("../src/lib/supabase.js", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
vi.mock("../src/lib/usage.js", () => ({ visitorId: () => "11111111-1111-4111-8111-111111111111", amAdmin: () => Promise.resolve(true) }));

const { default: GrowthHome } = await import("../src/screens/growth/GrowthHome.jsx");
const { default: GrowthProfile } = await import("../src/screens/growth/GrowthProfile.jsx");
const { default: GrowthSurvey } = await import("../src/screens/growth/GrowthSurvey.jsx");
const { default: Friends } = await import("../src/screens/Friends.jsx");
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
  it("shows the student's link, WhatsApp invite, level and each friend's state on Perfil (migration 0053)", async () => {
    answers({
      my_referral_code: "valentina-k7d",
      my_referrals: {
        code: "valentina-k7d", invited: 3, activated: 1, teachers: 0, bonus: 40,
        reward: { points: 1, level: 1, pass_until: null, bonus: 40, questions: 80, simulacro_extra: 2 },
        simulacros: { month_limit: 1, month_used: 0, extra: 2, extra_used: 0, remaining: 3, unlimited: false },
        friends: [{ name: "Beto", teacher: false, state: "ok", answers: 20, days: 2 }, { name: "Caro", teacher: false, state: "practicing", answers: 12, days: 1 },
          { name: "Dani", teacher: false, state: "same_device", answers: 20, days: 2 }],
        rules: { answers: 20, days: 2, l1: 1, l2: 3, l3: 5 },
      },
      certificate_progress: { answered: 40, areas: 2, days: 2, need: { answered: 150, areas: 3, days: 5 } }, partner_stats: [],
    });
    render(<GrowthProfile profile={student} />);
    expect(await screen.findByText(/r\/valentina-k7d/)).toBeTruthy();
    expect(screen.getByText("Invitar por WhatsApp").getAttribute("href")).toContain("wa.me");
    expect(await screen.findByText("Ya cuenta")).toBeTruthy();
    expect(screen.getByText("Le falta: 8 preguntas y practicar otro día")).toBeTruthy();
    expect(screen.getByText("No cuenta: usó tu mismo celular")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText(/faltan/).textContent).toContain("2 amigos");
    expect(screen.getByText("40 de 150 preguntas")).toBeTruthy();
    expect(screen.getByText("Crear mi certificado").disabled).toBe(true);
  });
});

describe("study groups (Amigos › Parches, migration 0052)", () => {
  const me = { code: "vale7k", name: "Valentina", share: "nada", streak: 0, today: false };
  const empty = { me, friends: [], incoming: [], outgoing: [], cheers: [], invites: [] };
  const overview = {
    id: "g", code: "abc123", name: "Los de 11-B", weekly_goal: 300, mine: false, week_total: 0, streak: 0, today_done: false, missions_done: 0,
    week_ends: "2026-11-22", missions: [{ id: "area", title: "Respondan 40 preguntas de Inglés entre todos", target: 40, progress: 0, done: false }],
    members: [{ id: "u1", name: "Valentina", me: true, friend: false, today: false, days: 0, cheered: false }], challenges: [], activities: [],
  };
  it("joins a group from its link and opens it", async () => {
    let groups = [];
    answers({
      my_friends: empty, my_study_groups: () => groups, study_group_preview: { name: "Los de 11-B", members: 3, weekly_goal: 300 }, group_overview: overview,
      join_study_group: () => { groups = [{ id: "g", code: "abc123", name: "Los de 11-B", weekly_goal: 300, week_total: 0, members: [] }]; return { id: "g" }; },
    });
    render(<Friends tab="parches" onTab={() => {}} joinCode="abc123" profileName="Valentina" />);
    fireEvent.click(await screen.findByText("Unirme como Valentina"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("join_study_group", { p_code: "abc123", p_display: "Valentina" }));
    expect(await screen.findByText("Valentina (tú)")).toBeTruthy();
    expect(screen.getByText("Respondan 40 preguntas de Inglés entre todos")).toBeTruthy();
  });
  it("adds a friend by code", async () => {
    answers({ my_friends: empty, my_study_groups: [], friend_code_preview: { name: "Camila", me: false }, add_friend: { status: "sent" } });
    render(<Friends tab="amigos" onTab={() => {}} profileName="Valentina" />);
    fireEvent.change(await screen.findByPlaceholderText("abc234"), { target: { value: "cami23" } });
    expect(await screen.findByText("Vas a agregar a Camila.")).toBeTruthy();
    fireEvent.click(screen.getByText("Agregar"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("add_friend", { p_code: "cami23" }));
    expect(await screen.findByText("Le enviamos tu solicitud a Camila.")).toBeTruthy();
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
