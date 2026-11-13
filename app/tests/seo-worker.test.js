// Search: one address (condoricfes.com) for public pages, and a per-address limit on pages that show bank questions.
import { describe, expect, it, vi } from "vitest";
import worker, { isLimitedPage, botOf, INDEXNOW_KEY } from "../worker/index.js";

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

describe("worker: crawler log", () => {
  it("names search engines and other bots, and ignores people", () => {
    expect(botOf(get("https://condoricfes.com/", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }))?.bot).toBe("Googlebot");
    expect(botOf(get("https://condoricfes.com/", { "User-Agent": "Mozilla/5.0 (compatible; bingbot/2.0)" }))?.bot).toBe("Bingbot");
    expect(botOf(get("https://condoricfes.com/", { "User-Agent": "WhatsApp/2.23" }))?.bot).toBe("WhatsApp");
    expect(botOf(get("https://condoricfes.com/", { "User-Agent": "Mozilla/5.0 (iPhone) Safari/604.1" }))).toBeNull();
    expect(botOf(get("https://condoricfes.com/", { "User-Agent": "x" }, { verifiedBotCategory: "Search Engine Crawler" }))).toEqual({ bot: "Verified", verified: "Search Engine Crawler" });
  });
  it("logs one line per bot request with path and status, never the address", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.fetch(get("https://condoricfes.com/simulacro-icfes/", { "User-Agent": "Googlebot/2.1", "CF-Connecting-IP": "1.2.3.4" }), env());
    await worker.fetch(get("https://condoricfes.com/simulacro-icfes/", { "User-Agent": "Mozilla/5.0 Safari" }), env());
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0][0]);
    expect(line).toMatchObject({ crawl: 1, bot: "Googlebot", path: "/simulacro-icfes/", status: 200 });
    expect(JSON.stringify(line)).not.toContain("1.2.3.4");
    log.mockRestore();
  });
});

describe("worker: IndexNow", () => {
  const listEnv = (urls, ok = true) => ({
    ASSETS: { fetch: vi.fn(async () => new Response(JSON.stringify({ urls }), { status: 200 })) },
    INDEXNOW_RATE: { limit: vi.fn(async () => ({ success: ok })) },
  });
  it("submits only this site's changed pages, with the key", async () => {
    const sent = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 202 }));
    const res = await worker.fetch(new Request("https://condor.juandabarrios12.workers.dev/__indexnow", { method: "POST" }), listEnv(["https://condoricfes.com/a/", "https://evil.example/x"]));
    expect(await res.json()).toEqual({ submitted: 1, "www.bing.com": 202, "yandex.com": 202 });
    const body = JSON.parse(sent.mock.calls[0][1].body);
    expect(body).toMatchObject({ host: "condoricfes.com", key: INDEXNOW_KEY, urlList: ["https://condoricfes.com/a/"] });
    sent.mockRestore();
  });
  it("refuses GET and repeated calls", async () => {
    expect((await worker.fetch(get("https://condoricfes.com/__indexnow"), listEnv([]))).status).toBe(405);
    expect((await worker.fetch(new Request("https://condoricfes.com/__indexnow", { method: "POST" }), listEnv([], false))).status).toBe(429);
  });
});
