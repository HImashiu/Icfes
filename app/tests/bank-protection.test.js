// Protección del banco: the site's worker applies bank_open's verdict (migration 0036) to every booklet file, and
// prints carry the school, the date and a reference.
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";
import { markLine, quotaLine, noteExport, resetExportMarks } from "../src/lib/protect.js";
import { LIMIT_MESSAGES } from "../src/lib/data.js";

const token = ["e30", btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })), "sig"].join(".");
let n = 0;
function setup({ verdict = "ok", role = "teacher", bankOpenStatus = 200, oldLimit = false } = {}) {
  n += 1;
  const uid = `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: uid }), { status: 200 });
    if (u.includes("/rest/v1/profiles")) return new Response(JSON.stringify([{ role }]), { status: 200 });
    if (u.endsWith("/rpc/bank_open")) {
      return bankOpenStatus === 200 ? new Response(JSON.stringify(verdict), { status: 200 }) : new Response("{}", { status: bankOpenStatus });
    }
    if (u.endsWith("/rpc/note_exam_download")) {
      return oldLimit ? new Response('{"message":"download_limit"}', { status: 400 }) : new Response("1", { status: 200 });
    }
    return new Response("[]", { status: 200 });
  });
  const env = {
    SUPABASE_URL: "https://db.example", SUPABASE_ANON_KEY: "anon",
    ASSETS: { fetch: vi.fn(async () => new Response('{"questions":[]}', { status: 200 })) },
  };
  // A different token per test, so the worker's 5-minute caches never mix tests.
  const req = (path) => new Request(`https://condoricfes.com${path}`, { headers: { Authorization: `Bearer ${token}${n}` } });
  return { env, req, calls };
}

afterEach(() => { vi.restoreAllMocks(); resetExportMarks(); });

describe("worker: bank_open verdicts", () => {
  it("serves the booklet when bank_open says ok", async () => {
    const { env, req, calls } = setup();
    const res = await worker.fetch(req("/app/exams/S11-A_1ra.json"), env);
    expect(res.status).toBe(200);
    expect(calls.some((u) => u.endsWith("/rpc/bank_open"))).toBe(true);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
  });

  it.each([
    ["trial_limit", 429, "trial_limit"],
    ["week_limit", 429, "week_limit"],
    ["day_limit", 429, "daily_limit"],
    ["files_limit", 429, "daily_limit"],
    ["access_blocked", 403, "access_blocked"],
  ])("refuses %s without serving the file", async (verdict, status, error) => {
    const { env, req } = setup({ verdict });
    const res = await worker.fetch(req("/app/exams/S11-B_2da.json"), env);
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    expect(LIMIT_MESSAGES[error]).toBeTruthy();
  });

  it("applies the same verdict to the answers endpoint", async () => {
    const { env } = setup({ verdict: "access_blocked", role: "student" });
    const res = await worker.fetch(new Request("https://condoricfes.com/app/api/reveal", {
      method: "POST", headers: { Authorization: `Bearer ${token}${n}`, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "S11-A_1ra", keys: ["1"] }),
    }), env);
    expect(res.status).toBe(403);
  });

  it("falls back to the 0031 limit before migration 0036 runs", async () => {
    const { env, req, calls } = setup({ bankOpenStatus: 404, oldLimit: true });
    const res = await worker.fetch(req("/app/exams/S11-C_1ra.json"), env);
    expect(calls.some((u) => u.endsWith("/rpc/note_exam_download"))).toBe(true);
    expect(res.status).toBe(429);
  });

  it("lets the file through when the database is down (students are never locked out by an outage)", async () => {
    const { env, req } = setup({ bankOpenStatus: 500 });
    const res = await worker.fetch(req("/app/exams/S11-D_1ra.json"), env);
    expect(res.status).toBe(200);
  });
});

describe("print marks", () => {
  it("names the school, who printed, the date and the reference", () => {
    const line = markLine({ school: "Colegio Prueba", name: "Ana Ruiz", ref: "7F3A2C" }, new Date("2026-11-10T15:00:00Z"));
    expect(line).toContain("Colegio Prueba");
    expect(line).toContain("impreso por Ana Ruiz");
    expect(line).toContain("ref. 7F3A2C");
    expect(line).toContain("2026");
    expect(markLine(null)).toBe("");
  });

  it("still prints without a backend", async () => {
    const m = await noteExport("hoja", "S11-A_1ra", 10);
    expect(m.ok).toBe(true);
  });

  it("explains the booklet quota, including a trial school's cap", () => {
    expect(quotaLine(null)).toBe("");
    expect(quotaLine({ today: 3, day_limit: 12 })).toContain("3 de 12");
    expect(quotaLine({ today: 2, day_limit: 8, school_total: 9, school_limit: 14 })).toContain("9 de 14");
  });
});
