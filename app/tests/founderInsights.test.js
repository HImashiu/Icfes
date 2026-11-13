import { describe, expect, it } from "vitest";
import { insights } from "../src/screens/Founder.jsx";

const base = {
  kpis: { current: { signups: 10, visitors: 100, new_visitors: 80 }, previous: { signups: 5 } },
  funnel: { visitors: 100, opened_app: 20, signed_in: 15, answered: 12, answered5: 10 },
  channels: [
    { channel: "Redes sociales", visitors: 60, signups: 3 },
    { channel: "WhatsApp", visitors: 10, signups: 4 },
    { channel: "Buscadores", visitors: 2, signups: 0 },
  ],
  lifecycle: { en_riesgo: 2 },
  hours: [{ dow: 1, hour: 19, answers: 40 }],
  landing: [{ path: "/simulacro-icfes/", visitors: 30, accounts: 6 }],
};

describe("founder insights", () => {
  it("reads growth, the worst funnel step, the best channel and risks", () => {
    const out = insights(base, [{ status: "nuevo", answers: 0, role: "student" }]);
    const titles = out.map((o) => o.title).join(" | ");
    expect(titles).toContain("10 cuentas nuevas (+100% vs. antes)");
    expect(titles).toContain("de llegar a abrir la app");
    expect(titles).toContain("WhatsApp convierte mejor");
    expect(titles).toContain("Google casi no trae visitas");
    expect(out.length).toBeLessThanOrEqual(6);
  });

  it("stays quiet with no data", () => {
    expect(insights({ kpis: { current: {}, previous: {} }, channels: [{ channel: "Buscadores", visitors: 50, signups: 0 }] })).toEqual([]);
  });
});
