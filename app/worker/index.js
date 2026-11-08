// The site's worker. Static files are served by Cloudflare directly; this code runs only for /app/exams/*
// (see run_worker_first in wrangler.jsonc): the question files, answer keys and explanations, which only a
// signed-in account may download. The catalog (exams/index.json) stays public.
//
// A request must carry the Supabase session token (Authorization: Bearer …, sent by app/src/lib/data.js).
// The token is checked with Supabase itself (/auth/v1/user), so it works with either JWT signing method.
// Valid tokens are remembered for a few minutes per worker instance, so opening a booklet costs one check.
// Guests (anonymous sign-in) are refused unless ALLOW_GUESTS is "1".

const OK_FOR = 5 * 60 * 1000;
const seen = new Map(); // token -> expiry (ms)

async function signedIn(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 4096 || token.split(".").length !== 3) return false;
  const now = Date.now();
  const until = seen.get(token);
  if (until && until > now) return true;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  if (!user?.id) return false;
  if (user.is_anonymous && env.ALLOW_GUESTS !== "1") return false;
  // Remember it no longer than the token itself lives.
  let exp = now + OK_FOR;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp) exp = Math.min(exp, payload.exp * 1000);
  } catch { /* keep the default */ }
  if (seen.size > 5000) seen.clear();
  seen.set(token, exp);
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isExamFile = url.pathname.startsWith("/app/exams/") && url.pathname !== "/app/exams/index.json";
    if (isExamFile && request.method !== "OPTIONS") {
      if (!(await signedIn(request, env))) {
        return new Response(JSON.stringify({ error: "sign_in_required" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      // Never kept by shared caches; the browser may keep its own copy for an hour.
      out.headers.set("Cache-Control", "private, max-age=3600");
      out.headers.set("Vary", "Authorization");
      return out;
    }
    return env.ASSETS.fetch(request);
  },
};
