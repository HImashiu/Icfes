// The site's worker. Static files are served by Cloudflare directly; this code runs only for /app/exams/*
// (see run_worker_first in wrangler.jsonc): the question files, answer keys and explanations, which only a
// signed-in account may download. The catalog (exams/index.json) stays public.
//
// Defences against scraping the question bank, in order:
//  1. Per network address: at most 120 requests a minute reach the sign-in check (EXAM_IP_RATE).
//  2. A valid Supabase session (Authorization: Bearer …, sent by app/src/lib/data.js), checked with Supabase
//     itself (/auth/v1/user) so it works with either JWT signing method. Guests are refused unless ALLOW_GUESTS="1".
//  3. Per account: at most 60 files a minute (EXAM_USER_RATE).
//  4. Per account and day: a limited number of different booklets (note_exam_download, migration 0031). Every
//     booklet an account opens is logged, so heavy accounts show up in the exam_download_watch view.
// Checks 2 and 4 are remembered for a few minutes per worker instance, so opening a booklet costs one round trip.

const OK_FOR = 5 * 60 * 1000;
const users = new Map(); // token -> { id, until }
const noted = new Map(); // `${id}:${slug}` -> until

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

function trim(map) { if (map.size > 5000) map.clear(); }

async function userOf(token, env) {
  const now = Date.now();
  const hit = users.get(token);
  if (hit && hit.until > now) return hit.id;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  if (!user?.id) return null;
  if (user.is_anonymous && env.ALLOW_GUESTS !== "1") return null;
  // Remember it no longer than the token itself lives.
  let until = now + OK_FOR;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp) until = Math.min(until, payload.exp * 1000);
  } catch { /* keep the default */ }
  trim(users);
  users.set(token, { id: user.id, until });
  return user.id;
}

// "ok", or "limit" when the account has opened too many booklets today. Anything else (the migration not run yet,
// Supabase slow) lets the file through: the sign-in check already passed, and students must never be locked out.
async function noteDownload(token, id, slug, env) {
  const k = `${id}:${slug}`;
  const now = Date.now();
  if ((noted.get(k) ?? 0) > now) return "ok";
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/note_exam_download`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (text.includes("download_limit")) return "limit";
      return "ok";
    }
  } catch { return "ok"; }
  trim(noted);
  noted.set(k, now + OK_FOR);
  return "ok";
}

async function underLimit(limiter, key) {
  if (!limiter) return true;
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isExamFile = url.pathname.startsWith("/app/exams/") && url.pathname !== "/app/exams/index.json";
    if (!isExamFile || request.method === "OPTIONS") return env.ASSETS.fetch(request);

    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (!(await underLimit(env.EXAM_IP_RATE, `ip:${ip}`))) return json(429, { error: "too_many_requests" });

    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token.length > 4096 || token.split(".").length !== 3) return json(401, { error: "sign_in_required" });
    const id = await userOf(token, env);
    if (!id) return json(401, { error: "sign_in_required" });

    if (!(await underLimit(env.EXAM_USER_RATE, `user:${id}`))) return json(429, { error: "too_many_requests" });
    const slug = decodeURIComponent(url.pathname.slice("/app/exams/".length)).split("/")[0].split(".")[0].slice(0, 80);
    if ((await noteDownload(token, id, slug, env)) === "limit") return json(429, { error: "daily_limit" });

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    // Never kept by shared caches; the browser may keep its own copy for an hour.
    out.headers.set("Cache-Control", "private, max-age=3600");
    out.headers.set("Vary", "Authorization");
    return out;
  },
};
