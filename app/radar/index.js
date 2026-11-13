// Cóndor radar: a small Worker of its own (wrangler config radar/wrangler.jsonc, name "condor-radar") that looks for
// new public posts about the ICFES / Saber 11 every 30 minutes and keeps the newest ones in the KV namespace RADAR.
// The founder reads them in the app at /app/#admin/posts (the site's worker serves them at /app/api/radar, admins only).
//
// It only reads. It never comments, likes or posts anywhere: Juan opens each post and comments by hand.
// Every source is an official API or feed that allows this kind of read:
//  - Reddit: the public JSON listing of a search (reddit.com/search.json), with a descriptive User-Agent, a few calls
//    per run. With REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (a free "script" app) it uses OAuth (oauth.reddit.com).
//  - Bluesky: app.bsky.feed.searchPosts. With BSKY_HANDLE + BSKY_APP_PASSWORD (an app password) it signs in first,
//    because the public endpoint can refuse searches without a session.
//  - Mastodon: public hashtag timelines (/api/v1/timelines/tag/<tag>) on a few big servers.
//  - YouTube: Data API v3 search.list, only when YOUTUBE_API_KEY is set (free quota: 10,000 units a day; one search
//    costs 100, so two searches per run every 30 minutes = 9,600 a day at most; the run skips YouTube after 45 calls).
//  - News: Google News RSS search (es-419, Colombia).
// TikTok, Instagram, Facebook, X and WhatsApp have no free public search API, so the panel only offers search links
// for them (they open in Juan's own browser).

const TERMS = ["icfes", "saber 11", "pruebas saber", "preicfes"];
const MATCH = /\bicfes\b|saber\s?11\b|pruebas?\s+saber|pre-?\s?icfes/i;
const KEEP = 600; // posts kept in KV
const MAX_AGE_DAYS = 21;
const UA = "CondorRadar/1.0 (+https://condoricfes.com; read-only search for posts about the ICFES exam)";

const clean = (s, n = 400) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim().slice(0, n);
const httpsOrNull = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u.replace(/&amp;/g, "&") : null);
const iso = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// The panel (src/screens/Radar.jsx) also runs reddit(), bluesky() and mastodon() in the founder's own browser, because
// Reddit and Bluesky refuse searches from Cloudflare's addresses. There, no custom headers (they would force a CORS
// preflight that Reddit refuses).
const inBrowser = typeof document !== "undefined";
async function getJson(url, init = {}) {
  const headers = inBrowser ? init.headers ?? {} : { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${new URL(url).hostname}`);
  return res.json();
}

// ------------------------------------------------------------------------------------------------ sources
export async function reddit(env) {
  let base = "https://www.reddit.com";
  const headers = {};
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
    const tok = await getJson("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    base = "https://oauth.reddit.com";
    headers.Authorization = `Bearer ${tok.access_token}`;
  }
  const out = [];
  // Without OAuth, www.reddit.com answered 403 to the Worker (2026-11-13); old.reddit.com is tried next.
  const hosts = headers.Authorization ? [base] : [base, "https://old.reddit.com"];
  const listing = async (q) => {
    let last;
    for (const h of hosts) {
      try { return await getJson(`${h}/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=50&raw_json=1`, { headers }); } catch (e) { last = e; }
    }
    throw last;
  };
  for (const q of ["icfes", '"saber 11"']) {
    const data = await listing(q);
    for (const { data: p } of data?.data?.children ?? []) {
      if (p.over_18) continue;
      const thumb = httpsOrNull(p.preview?.images?.[0]?.resolutions?.slice(-1)[0]?.url) || httpsOrNull(p.thumbnail);
      out.push({
        id: `reddit:${p.id}`, net: "reddit", url: `https://www.reddit.com${p.permalink}`,
        title: clean(p.title, 200), text: clean(p.selftext), author: `u/${p.author}`, where: `r/${p.subreddit}`,
        thumb, at: new Date(p.created_utc * 1000).toISOString(), comments: p.num_comments ?? null,
      });
    }
  }
  return out;
}

export async function bluesky(env) {
  let host = "https://public.api.bsky.app";
  const headers = {};
  if (env.BSKY_HANDLE && env.BSKY_APP_PASSWORD) {
    const s = await getJson("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }),
    });
    host = "https://bsky.social";
    headers.Authorization = `Bearer ${s.accessJwt}`;
  }
  const out = [];
  for (const q of ["icfes", '"saber 11"']) {
    const data = await getJson(`${host}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=50`, { headers });
    for (const p of data?.posts ?? []) {
      const rkey = String(p.uri).split("/").pop();
      const e = p.embed ?? {};
      const thumb = httpsOrNull(e.images?.[0]?.thumb) || httpsOrNull(e.external?.thumb) || httpsOrNull(e.media?.images?.[0]?.thumb)
        || httpsOrNull(e.thumbnail) || httpsOrNull(p.author?.avatar);
      out.push({
        id: `bluesky:${rkey}`, net: "bluesky", url: `https://bsky.app/profile/${p.author?.handle}/post/${rkey}`,
        title: "", text: clean(p.record?.text), author: p.author?.displayName || `@${p.author?.handle}`, where: `@${p.author?.handle}`,
        thumb, at: iso(p.record?.createdAt || p.indexedAt), comments: p.replyCount ?? null,
      });
    }
  }
  return out;
}

const MASTODON = ["mastodon.social", "mstdn.social", "mastodon.online"];
export async function mastodon() {
  const out = [];
  for (const server of MASTODON) {
    for (const tag of ["icfes", "saber11", "pruebassaber"]) {
      let data;
      try { data = await getJson(`https://${server}/api/v1/timelines/tag/${tag}?limit=40`); } catch { continue; }
      for (const p of data ?? []) {
        const s = p.reblog ?? p;
        out.push({
          id: `mastodon:${s.uri}`, net: "mastodon", url: s.url || s.uri,
          title: "", text: clean(s.content), author: s.account?.display_name || `@${s.account?.acct}`, where: `@${s.account?.acct}`,
          thumb: httpsOrNull(s.media_attachments?.[0]?.preview_url) || httpsOrNull(s.card?.image) || httpsOrNull(s.account?.avatar),
          at: iso(s.created_at), comments: s.replies_count ?? null,
        });
      }
    }
  }
  return out;
}

export async function youtube(env, state) {
  if (!env.YOUTUBE_API_KEY) return { skipped: "sin YOUTUBE_API_KEY" };
  const day = new Date().toISOString().slice(0, 10);
  const used = state.ytDay === day ? state.ytCalls ?? 0 : 0;
  if (used >= 90) return { skipped: "cuota del día" };
  const after = new Date(Date.now() - 3 * 86400000).toISOString();
  const out = [];
  let calls = 0;
  for (const q of ["icfes", "saber 11|pruebas saber|preicfes"]) {
    calls++;
    const data = await getJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=50&regionCode=CO&relevanceLanguage=es&publishedAfter=${after}&q=${encodeURIComponent(q)}&key=${env.YOUTUBE_API_KEY}`);
    for (const v of data?.items ?? []) {
      const s = v.snippet ?? {};
      out.push({
        id: `youtube:${v.id?.videoId}`, net: "youtube", url: `https://www.youtube.com/watch?v=${v.id?.videoId}`,
        title: clean(s.title, 200), text: clean(s.description), author: clean(s.channelTitle, 80), where: "YouTube",
        thumb: httpsOrNull(s.thumbnails?.medium?.url || s.thumbnails?.default?.url), at: iso(s.publishedAt), comments: null,
      });
    }
  }
  state.ytDay = day;
  state.ytCalls = used + calls;
  return out;
}

export function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t) => (m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) ?? [])[1] ?? "";
    const un = (s) => s.replace(/^<!\[CDATA\[|\]\]>$/g, "");
    const image = (m[1].match(/<News:Image>([^<]+)<\/News:Image>/i) ?? [])[1];
    items.push({ title: clean(un(tag("title")), 220), link: clean(un(tag("link")), 600), at: iso(un(tag("pubDate"))), source: clean(un(tag("source")) || un(tag("News:Source")), 80), ...(image ? { image: httpsOrNull(clean(image, 600)) } : {}) });
  }
  return items;
}

// Google News answered 503 to the Worker (2026-11-13); Bing News RSS is the fallback.
const NEWS_FEEDS = [
  (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=es-419&gl=CO&ceid=CO:es-419`,
  (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&cc=CO&setlang=es`,
];
async function newsFeed(q) {
  let last;
  for (const url of NEWS_FEEDS) {
    try {
      const res = await fetch(url(q), { headers: { "User-Agent": UA } });
      if (res.ok) return res.text();
      last = new Error(`${res.status} ${new URL(url(q)).hostname}`);
    } catch (e) { last = e; }
  }
  throw last;
}

export async function news() {
  const out = [];
  for (const q of ["icfes", '"saber 11"']) {
    for (const it of parseRss(await newsFeed(q))) {
      if (!/^https:\/\//.test(it.link)) continue;
      const title = it.source && it.title.endsWith(` - ${it.source}`) ? it.title.slice(0, -(it.source.length + 3)) : it.title;
      out.push({ id: `news:${it.link.slice(-90)}`, net: "news", url: it.link, title, text: "", author: it.source || "Noticias", where: it.source || "", thumb: it.image ?? null, at: it.at, comments: null });
    }
  }
  return out;
}

export const SOURCES = { reddit, bluesky, mastodon, youtube, news };

// ------------------------------------------------------------------------------------------------ merge
export function relevant(p) {
  return MATCH.test(`${p.title} ${p.text}`) || (p.net === "youtube" && MATCH.test(`${p.title} ${p.text} ${p.author}`));
}

export function merge(old, fresh, now = Date.now()) {
  const byId = new Map(old.map((p) => [p.id, p]));
  let added = 0;
  for (const p of fresh) {
    if (!p.id || !p.url || !p.at || !relevant(p)) continue;
    if (now - Date.parse(p.at) > MAX_AGE_DAYS * 86400000) continue;
    const had = byId.get(p.id);
    if (!had) added++;
    byId.set(p.id, { ...p, seen: had?.seen ?? new Date(now).toISOString() });
  }
  const list = [...byId.values()].filter((p) => now - Date.parse(p.at) <= MAX_AGE_DAYS * 86400000);
  list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { list: list.slice(0, KEEP), added };
}

export async function run(env) {
  const state = (await env.RADAR.get("state", "json")) ?? {};
  const old = (await env.RADAR.get("posts", "json")) ?? [];
  const status = {};
  const fresh = [];
  for (const [name, fn] of Object.entries(SOURCES)) {
    const t = Date.now();
    try {
      const got = await fn(env, state);
      if (Array.isArray(got)) { fresh.push(...got); status[name] = { ok: true, found: got.length, ms: Date.now() - t }; }
      else status[name] = { ok: false, skipped: got?.skipped ?? "omitido" };
    } catch (e) {
      status[name] = { ok: false, error: String(e?.message ?? e).slice(0, 160) };
    }
  }
  const { list, added } = merge(old, fresh);
  const at = new Date().toISOString();
  await env.RADAR.put("posts", JSON.stringify(list));
  await env.RADAR.put("state", JSON.stringify({ ...state, at, added, status }));
  console.log(JSON.stringify({ radar: 1, added, kept: list.length, status }));
  return { at, added, kept: list.length, status };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  // No public page: the worker has no route and workers.dev is off. It answers 404 to anything.
  async fetch() { return new Response("Not found", { status: 404 }); },
};
