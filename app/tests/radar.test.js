import { describe, expect, it, vi } from "vitest";
import { merge, parseRss, relevant, run } from "../radar/index.js";
import { agoText, filterPosts, shareLink } from "../src/screens/Radar.jsx";
import { radar } from "../worker/index.js";

const now = Date.parse("2026-11-13T12:00:00Z");
const post = (id, hoursAgo, extra = {}) => ({ id, net: "reddit", url: `https://x/${id}`, title: "Tips para el ICFES", text: "", author: "a", where: "r/x", at: new Date(now - hoursAgo * 3600000).toISOString(), ...extra });

describe("radar merge", () => {
  it("keeps relevant posts, newest first, without repeats, and counts new ones", () => {
    const old = [post("a", 5, { seen: "2026-11-13T07:00:00Z" })];
    const { list, added } = merge(old, [post("a", 5), post("b", 1), post("c", 2, { title: "receta de arepas" }), post("d", 24 * 30)], now);
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
    expect(added).toBe(1);
    expect(list[1].seen).toBe("2026-11-13T07:00:00Z");
  });
  it("matches the ways people write the exam's name", () => {
    for (const t of ["icfes mañana", "Saber 11 2026", "saber11", "pruebas saber", "curso pre-icfes", "PREICFES gratis"]) expect(relevant({ title: t, text: "" })).toBe(true);
    expect(relevant({ title: "saberes ancestrales", text: "" })).toBe(false);
  });
});

describe("radar rss", () => {
  it("reads Google News items", () => {
    const xml = `<rss><channel><item><title>Resultados ICFES 2026 - El Tiempo</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Thu, 13 Nov 2026 10:00:00 GMT</pubDate><source url="https://eltiempo.com">El Tiempo</source></item></channel></rss>`;
    expect(parseRss(xml)).toEqual([{ title: "Resultados ICFES 2026 - El Tiempo", link: "https://news.google.com/rss/articles/abc", at: "2026-11-13T10:00:00.000Z", source: "El Tiempo" }]);
  });
});

describe("radar run", () => {
  it("stores posts and per-source status, and survives a failing source", async () => {
    const kv = new Map();
    const env = { RADAR: { get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), put: async (k, v) => kv.set(k, v) } };
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("reddit.com")) return new Response(JSON.stringify({ data: { children: [{ data: { id: "r1", permalink: "/r/colombia/comments/r1/x/", title: "Cómo me fue en el ICFES", selftext: "", author: "ana", subreddit: "colombia", created_utc: Date.now() / 1000 - 60, thumbnail: "self" } }] } }));
      if (u.includes("bsky")) return new Response("no", { status: 403 });
      if (u.includes("news.google.com")) return new Response("<rss></rss>");
      return new Response("[]");
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await run(env);
    vi.unstubAllGlobals();
    const posts = JSON.parse(kv.get("posts"));
    expect(posts.map((p) => p.id)).toEqual(["reddit:r1"]);
    expect(posts[0].url).toBe("https://www.reddit.com/r/colombia/comments/r1/x/");
    expect(posts[0].thumb).toBeNull();
    expect(out.status.reddit.ok).toBe(true);
    expect(out.status.bluesky.ok).toBe(false);
    expect(out.status.youtube.skipped).toMatch(/YOUTUBE_API_KEY/);
  });
});

describe("radar panel helpers", () => {
  it("filters by network, status and text", () => {
    const posts = [post("a", 1), post("b", 2, { net: "youtube", title: "Saber 11 matemáticas" }), post("c", 3)];
    const marks = { c: "done" };
    expect(filterPosts(posts, { marks }).map((p) => p.id)).toEqual(["a", "b"]);
    expect(filterPosts(posts, { net: "youtube", marks }).map((p) => p.id)).toEqual(["b"]);
    expect(filterPosts(posts, { view: "comentados", marks }).map((p) => p.id)).toEqual(["c"]);
    expect(filterPosts(posts, { view: "todos", q: "matem", marks }).map((p) => p.id)).toEqual(["b"]);
  });
  it("writes times and the tracked link", () => {
    expect(agoText("2026-11-13T11:30:00Z", now)).toBe("hace 30 min");
    expect(agoText("2026-11-12T10:00:00Z", now)).toBe("ayer");
    expect(shareLink("reddit")).toBe("https://condoricfes.com/?fuente=comentario-reddit");
  });
});

describe("/app/api/radar", () => {
  const token = "a.b.c";
  const env = (admin) => ({
    SUPABASE_URL: "https://s", SUPABASE_ANON_KEY: "k",
    RADAR: { get: async (k) => (k === "posts" ? [post("a", 1)] : { at: "t" }) },
  });
  const req = (auth = `Bearer ${token}`) => new Request("https://condoricfes.com/app/api/radar", { headers: auth ? { Authorization: auth } : {} });
  it("needs a session", async () => {
    expect((await radar(req(""), env())).status).toBe(401);
  });
  it("refuses accounts that are not admins and serves admins", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("false")));
    expect((await radar(req(), env())).status).toBe(403);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("true")));
    const res = await radar(req(), env());
    vi.unstubAllGlobals();
    expect(res.status).toBe(200);
    expect((await res.json()).posts[0].id).toBe("a");
  });
});
