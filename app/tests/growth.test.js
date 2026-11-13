// Growth engine (docs/growth/LEDGER.md): the pure logic behind the site tools, the statistics of the control room,
// experiment bucketing shared by the site and the app, and the worker's growth routes.
import { describe, expect, it, vi } from "vitest";
import { scoreTest } from "../src/lib/saber11.js";
import {
  REAL_COUNTS, TEST_IDS, buildScoreTables, countdown, diagnosticResult, globalOf, icsCalendar, inversePlan, planWeeks,
  practiceReminders, rightNeeded, scoreBucket, searchPages,
} from "../src/lib/growth/tools-core.js";
import { compareArms, experimentVerdict, nps, tally, vanWestendorp } from "../src/lib/growth/stats.js";
import { bucketOf, pickVariant } from "../src/lib/growth/experiments.js";
import worker from "../worker/index.js";
import { personalPreview, previewOf, shortTarget, vapidHeader } from "../worker/growth.js";

const diag = buildScoreTables(scoreTest, 4);
const real = buildScoreTables(scoreTest, REAL_COUNTS);

describe("score tables and the diagnostic", () => {
  it("has one row per possible number right, rising with each one", () => {
    for (const id of TEST_IDS) {
      expect(diag[id]).toHaveLength(5);
      expect(real[id]).toHaveLength(REAL_COUNTS[id] + 1);
      for (let k = 1; k < real[id].length; k++) expect(real[id][k][0]).toBeGreaterThanOrEqual(real[id][k - 1][0]);
    }
  });
  it("weights the global like the ICFES (3 each, 1 for Inglés, ×5)", () => {
    expect(globalOf({ lc: 60, ma: 60, sc: 60, cn: 60, in: 60 })).toBe(300);
    expect(globalOf({ lc: 50, ma: 50, sc: 50, cn: 50, in: 100 })).toBe(Math.round((5 * (12 * 50 + 100)) / 13));
  });
  it("gives a global inside its range and picks the weakest test (the heavier one on ties)", () => {
    const r = diagnosticResult({ lc: [3, 4], ma: [1, 4], sc: [2, 4], cn: [3, 4], in: [1, 4] }, diag);
    expect(r.global).toBeGreaterThanOrEqual(r.low);
    expect(r.global).toBeLessThanOrEqual(r.high);
    expect(r.weakest.id).toBe("ma");
    expect(r.right).toBe(10);
    expect(r.total).toBe(20);
    const all = diagnosticResult({ lc: [4, 4], ma: [4, 4], sc: [4, 4], cn: [4, 4], in: [4, 4] }, diag);
    const none = diagnosticResult({ lc: [0, 4], ma: [0, 4], sc: [0, 4], cn: [0, 4], in: [0, 4] }, diag);
    expect(all.global).toBeGreaterThan(r.global);
    expect(none.global).toBeLessThan(r.global);
  });
  it("buckets shared scores in 25-point steps between 150 and 450", () => {
    expect(scoreBucket(262)).toBe(250);
    expect(scoreBucket(263)).toBe(275);
    expect(scoreBucket(40)).toBe(150);
    expect(scoreBucket(499)).toBe(450);
    expect(scoreBucket(NaN)).toBe(null);
  });
});

describe("inverse calculator", () => {
  it("needs more right answers for a higher target, never more than the test has", () => {
    const p300 = inversePlan(real, { global: 300 });
    const p400 = inversePlan(real, { global: 400 });
    for (let i = 0; i < 5; i++) {
      expect(p300[i].right).not.toBeNull();
      expect(p400[i].right ?? 999).toBeGreaterThanOrEqual(p300[i].right);
      expect(p300[i].right).toBeLessThanOrEqual(p300[i].total);
    }
  });
  it("finds the first count that reaches the target", () => {
    const t = [[10], [20], [35], [50]];
    expect(rightNeeded(t, 30)).toBe(2);
    expect(rightNeeded(t, 60)).toBe(null);
  });
});

describe("study plan, countdown, calendar files", () => {
  it("splits the weeks into bases, ritmo and final, with the weak tests twice", () => {
    const p = planWeeks({ start: "2026-11-16", exam: "2027-03-14", days: 4, minutes: 45, weak: ["ma"] });
    expect(p.totalWeeks).toBe(17);
    expect(p.weeks[0].phase).toBe("bases");
    expect(p.weeks.at(-1).phase).toBe("final");
    expect(p.weeks.filter((w) => w.phase === "final")).toHaveLength(4);
    const firstSix = p.weeks.slice(0, 6).map((w) => w.focus);
    expect(firstSix.filter((f) => f === "ma")).toHaveLength(2);
    for (let i = 1; i < 6; i++) expect(firstSix[i]).not.toBe(firstSix[i - 1]);
    expect(p.weeks.filter((w) => w.phase === "final").every((w) => w.simulacro)).toBe(true);
  });
  it("counts down to zero and says when it is over", () => {
    const now = Date.parse("2027-03-10T07:00:00-05:00");
    expect(countdown(Date.parse("2027-03-14T07:00:00-05:00"), now)).toMatchObject({ days: 4, hours: 0, done: false });
    expect(countdown(now - 1000, now).done).toBe(true);
  });
  it("writes a valid calendar: CRLF, folded lines, escaped text, Bogotá times, weekly reminder until the exam", () => {
    const rem = practiceReminders({ days: [0, 2], time: "18:30", minutes: 30, until: "2027-03-14", url: "https://condoricfes.com/app/", start: "2026-11-13" });
    const ics = icsCalendar("Mi plan, ICFES; Cóndor", [...rem, { uid: "x", date: "2027-03-14", title: "Examen Saber 11", description: "Lleva tu documento" }], Date.parse("2026-11-13T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Mi plan\\, ICFES\\; Cóndor");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270314T235959Z");
    expect(ics).toContain("DTSTART;TZID=America/Bogota:20261116T183000"); // first Monday on or after the 13th
    expect(ics).toContain("DTSTART;VALUE=DATE:20270314");
    expect(ics).toContain("DTEND;VALUE=DATE:20270315");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("site search", () => {
  const pages = [
    { u: "puntaje-icfes/univalle/", t: "Puntaje ICFES para entrar a Univalle", d: "Ponderados por carrera." },
    { u: "preguntas-icfes/matematicas/probabilidad-y-conteo/", t: "Preguntas de probabilidad del ICFES", d: "Conteo, combinaciones." },
    { u: "inscripcion-icfes/", t: "Inscripción al ICFES 2027", d: "Pasos y fechas." },
  ];
  it("finds pages without accents and ranks title hits first", () => {
    expect(searchPages(pages, "inscripcion")[0].u).toBe("inscripcion-icfes/");
    expect(searchPages(pages, "puntaje univalle")[0].u).toBe("puntaje-icfes/univalle/");
    expect(searchPages(pages, "probabilidad")[0].u).toContain("probabilidad");
    expect(searchPages(pages, "de la")).toEqual([]);
  });
});

describe("control room statistics", () => {
  it("reads an A/B test only with enough data, and calls a clear winner", () => {
    expect(compareArms({ exposed: 50, converted: 5 }, { exposed: 50, converted: 9 }).enough).toBe(false);
    const big = compareArms({ exposed: 2000, converted: 100 }, { exposed: 2000, converted: 160 });
    expect(big.enough).toBe(true);
    expect(big.lift).toBeCloseTo(0.6, 5);
    expect(big.p).toBeLessThan(0.001);
    expect(big.beat).toBeGreaterThan(0.99);
    const [v] = experimentVerdict({ variants: ["control", "pregunta"], arms: [{ variant: "control", exposed: 2000, converted: 100 }, { variant: "pregunta", exposed: 2000, converted: 160 }] });
    expect(v.verdict).toBe("Gana la variante");
    const [same] = experimentVerdict({ variants: ["a", "b"], arms: [{ variant: "a", exposed: 1000, converted: 100 }, { variant: "b", exposed: 1000, converted: 101 }] });
    expect(same.verdict).toBe("Sin diferencia clara");
  });
  it("computes NPS", () => {
    expect(nps([10, 9, 8, 7, 6, 0])).toMatchObject({ score: 0, promoters: 2, passives: 2, detractors: 2, n: 6 });
    expect(nps([]).score).toBe(null);
  });
  it("finds Van Westendorp points in order", () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const base = 8000 + (i % 10) * 1500;
      rows.push({ muy_barato: base * 0.4, barato: base * 0.7, caro: base * 1.4, muy_caro: base * 2 });
    }
    const v = vanWestendorp(rows);
    expect(v.enough).toBe(true);
    expect(v.pmc).toBeLessThanOrEqual(v.pme);
    expect(v.opp).toBeGreaterThan(0);
    expect(vanWestendorp(rows.slice(0, 3)).enough).toBe(false);
  });
  it("tallies single-choice answers", () => {
    expect(tally([{ c: "tiktok" }, { c: "profe" }, { c: "tiktok" }, {}], "c")).toEqual([{ value: "tiktok", count: 2, pct: 67 }, { value: "profe", count: 1, pct: 33 }]);
  });
});

describe("experiments", () => {
  it("bucket a visitor the same way every time, close to evenly", () => {
    expect(bucketOf("abc", "hero-cta")).toBe(bucketOf("abc", "hero-cta"));
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) counts[pickVariant({ key: "hero-cta", variants: ["a", "b"], running: true }, `v${i}`) === "a" ? 0 : 1]++;
    expect(Math.abs(counts[0] - counts[1])).toBeLessThan(300);
  });
  it("matches site/growth.js bucketing (FNV-1a of visitor:key mod 100)", () => {
    // Same arithmetic as growth.js bucket(), written out once more.
    const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; };
    for (const v of ["0f8c", "visitor-1", "ñandú"]) expect(bucketOf(v, "sticky-cta")).toBe(fnv(`${v}:sticky-cta`));
  });
  it("show the winner of a stopped experiment and honour a forced variant", () => {
    expect(pickVariant({ key: "k", variants: ["a", "b"], running: false, winner: "b" }, "x")).toBe("b");
    expect(pickVariant({ key: "k", variants: ["a", "b"], running: true }, "x", "b")).toBe("b");
    expect(pickVariant({ key: "k", variants: ["a", "b"], running: true }, "x", "zzz")).toMatch(/^[ab]$/);
  });
});

describe("worker growth routes", () => {
  const env = (rpcAnswer) => ({
    SUPABASE_URL: "https://db.example", SUPABASE_ANON_KEY: "anon",
    ASSETS: { fetch: vi.fn(async () => new Response('<html><head><meta property="og:title" content="Diagnóstico ICFES" /><meta property="og:image" content="https://condoricfes.com/img/og/diagnostico-icfes.png" /><meta name="twitter:image" content="https://condoricfes.com/img/og/diagnostico-icfes.png" /></head></html>', { headers: { "Content-Type": "text/html; charset=utf-8" } })) },
    PAGE_IP_RATE: { limit: vi.fn(async () => ({ success: true })) },
    _rpc: rpcAnswer,
  });
  it("sends a short link to its target with a source, or a referral code to the landing", async () => {
    expect(shortTarget("simulacro", "/app/?empezar=1")).toBe("/app/?empezar=1&fuente=r-simulacro");
    expect(shortTarget("x", "/a/?fuente=qr")).toBe("/a/?fuente=qr");
    expect(shortTarget("ana-k7d", null)).toBe("/?ref=ana-k7d&fuente=ref");
    expect(shortTarget("x", "//evil.example/")).toBe("/?ref=x&fuente=ref");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify("/colegios/"), { status: 200 }));
    const res = await worker.fetch(new Request("https://condoricfes.com/r/Colegios"), env());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://condoricfes.com/colegios/?fuente=r-colegios");
    expect(fetchMock.mock.calls[0][0]).toBe("https://db.example/rest/v1/rpc/resolve_short_link");
    fetchMock.mockRestore();
  });
  it("puts the shared score in the preview of a diagnostic or challenge link", async () => {
    expect(previewOf(new URL("https://condoricfes.com/diagnostico-icfes/?p=275"))).toEqual({ kind: "diag", value: 275 });
    expect(previewOf(new URL("https://condoricfes.com/diagnostico-icfes/?p=276"))).toBe(null);
    expect(previewOf(new URL("https://condoricfes.com/reto-icfes/3/?s=4"))).toEqual({ kind: "reto", value: 4, total: 5 });
    const res = await worker.fetch(new Request("https://condoricfes.com/diagnostico-icfes/?p=300&fuente=wa-diag"), env());
    const html = await res.text();
    expect(html).toContain('content="https://condoricfes.com/img/og/growth/diagnostico-300.png"');
    expect(html).toContain("unos 300 de 500");
    expect(personalPreview(html, { kind: "reto", value: 3, total: 5 })).toContain("Acerté 3 de 5");
  });
  it("signs a VAPID token the push services accept (ES256 JWT for the endpoint's origin)", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const header = await vapidHeader(jwk, "PUB", "https://fcm.googleapis.com", "https://condoricfes.com/", Date.parse("2026-11-13T12:00:00Z"));
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(k).toBe("PUB");
    const [h, b, s] = token.split(".");
    const dec = (x) => JSON.parse(Buffer.from(x, "base64url").toString());
    expect(dec(h)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(dec(b).aud).toBe("https://fcm.googleapis.com");
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${b}`));
    expect(ok).toBe(true);
  });
});
