// Search: one address (condoricfes.com) for public pages, and a per-address limit on pages that show bank questions.
import { describe, expect, it, vi } from "vitest";
import worker, { isLimitedPage } from "../worker/index.js";

const env = (ok = true) => ({
  ASSETS: { fetch: vi.fn(async () => new Response("<html></html>", { status: 200 })) },
  PAGE_IP_RATE: { limit: vi.fn(async () => ({ success: ok })) },
});
const get = (url, headers = {}, cf) => {
  const r = new Request(url, { headers });
  if (cf) Object.defineProperty(r, "cf", { value: cf });
  return r;
};

describe("worker: one address for search", () => {
  it("sends public pages on workers.dev and www to condoricfes.com with a 301, keeping path and query", async () => {
    for (const host of ["condor.juandabarrios12.workers.dev", "www.condoricfes.com"]) {
      const res = await worker.fetch(get(`https://${host}/simulacro-icfes/matematicas/?fuente=wa`), env());
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe("https://condoricfes.com/simulacro-icfes/matematicas/?fuente=wa");
    }
  });
  it("leaves the app alone on any host (sessions, QR codes)", async () => {
    const e = env();
    const res = await worker.fetch(get("https://condor.juandabarrios12.workers.dev/app/?sala=ABC"), e);
    expect(res.status).toBe(200);
    expect(e.ASSETS.fetch).toHaveBeenCalled();
  });
  it("serves workers.dev as is with the preview header, and condoricfes.com always", async () => {
    expect((await worker.fetch(get("https://condor.juandabarrios12.workers.dev/", { "x-condor-preview": "1" }), env())).status).toBe(200);
    expect((await worker.fetch(get("https://condoricfes.com/preguntas-icfes/"), env())).status).toBe(200);
  });
  it("does not redirect form posts", async () => {
    const res = await worker.fetch(new Request("https://www.condoricfes.com/x", { method: "POST" }), env());
    expect(res.status).not.toBe(301);
  });
});

describe("worker: page rate limit", () => {
  it("covers solved questions, exams by area and topic pages, not hubs", () => {
    expect(isLimitedPage("/pregunta-icfes/matematicas/probabilidad-dados/")).toBe(true);
    expect(isLimitedPage("/examenes-icfes-anteriores/icfes-2019-1/matematicas/")).toBe(true);
    expect(isLimitedPage("/preguntas-icfes/matematicas/probabilidad/")).toBe(true);
    expect(isLimitedPage("/preguntas-icfes/matematicas/")).toBe(false);
    expect(isLimitedPage("/examenes-icfes-anteriores/icfes-2019-1/")).toBe(false);
  });
  it("answers 429 over the limit, and lets verified search engines through", async () => {
    const path = "https://condoricfes.com/pregunta-icfes/matematicas/x/";
    expect((await worker.fetch(get(path), env(false))).status).toBe(429);
    expect((await worker.fetch(get(path, {}, { verifiedBotCategory: "Search Engine Crawler" }), env(false))).status).toBe(200);
    expect((await worker.fetch(get(path), env(true))).status).toBe(200);
  });
});
