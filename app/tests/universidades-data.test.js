// The admission data behind /puntaje-icfes/ pages: weights add up, careers have enough universities, every
// university cites its sources, and 2027 ICFES dates (when filled in) are complete.
import { describe, expect, it } from "vitest";
import { CAREERS, UNIVERSITIES } from "../scripts/seo-data/universidades.mjs";
import { CAL_2026, CAL_2027 } from "../scripts/seo-data/icfes-tramites.mjs";
import { ICETEX, QUIERO_ESTUDIAR } from "../scripts/seo-data/becas.mjs";

const sum = (w) => w.cn + w.lc + w.ma + w.sc + w.in + (w.pe || 0);

describe("universidades data", () => {
  it("weights of every program add up to 100 %", () => {
    for (const u of UNIVERSITIES) for (const p of u.programs || []) expect(sum(p.w), `${u.short} ${p.name}`).toBe(100);
  });
  it("every university has an official source and unique slug", () => {
    expect(new Set(UNIVERSITIES.map((u) => u.slug)).size).toBe(UNIVERSITIES.length);
    for (const u of UNIVERSITIES) {
      expect(u.sources.length, u.name).toBeGreaterThan(0);
      for (const s of u.sources) expect(s.url).toMatch(/^https:\/\/[^/]*\.edu\.co\//);
    }
  });
  it("cut lines sit on the 0-100 weighted scale and only for listed periods", () => {
    for (const u of UNIVERSITIES) for (const p of u.programs || []) for (const [pe, c] of Object.entries(p.cut || {})) {
      expect(u.periods).toContain(pe);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(100);
    }
  });
  it("global-score cuts sit on the 0-500 scale, above the university minimum, only for listed periods", () => {
    for (const u of UNIVERSITIES) for (const p of u.globals || []) for (const [pe, c] of Object.entries(p.cut || {})) {
      expect(u.mode, u.name).toBe("global");
      expect(u.periods).toContain(pe);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(u.gmin || 0);
      expect(c).toBeLessThanOrEqual(500);
    }
  });
  it("each career page has data from at least two universities", () => {
    for (const c of CAREERS) {
      const unis = UNIVERSITIES.filter((u) => (u.programs || []).some((p) => p.career === c.slug) || (u.ranges?.programs || []).some((p) => p.career === c.slug) || (u.globals || []).some((p) => p.career === c.slug));
      expect(unis.length, c.slug).toBeGreaterThanOrEqual(2);
    }
  });
  it("ICFES calendars are complete", () => {
    for (const cal of [CAL_2026, CAL_2027]) for (const k of ["A", "B"]) {
      const c = cal[k];
      if (!c) continue;
      for (const f of ["exam", "ordinaryUntil", "citacion", "results"]) expect(c[f], `${k} ${f}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.exam > c.citacion && c.results > c.exam).toBe(true);
    }
  });
  it("becas data: ICETEX minimums on the global scale, dates in order, official sources", () => {
    for (const [city, , min] of [...ICETEX.capitals, ...ICETEX.others]) {
      expect(Number.isInteger(min), city).toBe(true);
      expect(min).toBeGreaterThanOrEqual(39);
      expect(min).toBeLessThanOrEqual(230);
    }
    const dates = ICETEX.cal.map(([, v]) => v);
    expect([...dates].sort()).toEqual(dates);
    expect(ICETEX.pdf).toMatch(/^https:\/\/web\.icetex\.gov\.co\//);
    expect(QUIERO_ESTUDIAR.url).toMatch(/^https:\/\/[^/]*uniandes\.edu\.co\//);
    expect(QUIERO_ESTUDIAR.minGlobalMed).toBeGreaterThan(QUIERO_ESTUDIAR.minGlobal);
  });
});
