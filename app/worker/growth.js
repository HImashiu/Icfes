// Growth routes of the site's worker (docs/growth/LEDGER.md). Kept apart from worker/index.js, which calls
// growthRoute() before its own handling and growthCron() from its scheduled() handler.
//
//   /r/<code>               F13 short links (QR codes, printed posters, WhatsApp): a link from short_links, or else a
//                           student's or partner's referral code (F8, F10), sent to the landing with ?ref=.
//   /app/api/push-key       F34 the public VAPID key, so the app can subscribe to daily practice reminders.
//   ?p=<score> on the diagnostic and ?s=<right> on a challenge
//                           F15 the share preview (og:image, og:title) shows the score that was shared.
//   cron, hourly            F34 sends the day's practice reminder to subscribers due at that hour (Web Push without a
//                           payload: the service worker shows the reminder), and drops subscriptions that are gone.

const CODE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const BUCKETS = new Set([150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450]);

async function anonRpc(env, name, body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`rpc ${name}: ${r.status}`);
  return r.status === 204 ? null : r.json();
}

// Where /r/<code> goes. Exported for tests: target is what resolve_short_link answered (null when no such link).
export function shortTarget(code, target) {
  if (target && target.startsWith("/") && !target.startsWith("//")) {
    const u = new URL(target, "https://x");
    if (!u.searchParams.has("fuente")) u.searchParams.set("fuente", `r-${code}`);
    return `${u.pathname}${u.search}${u.hash}`;
  }
  return `/?ref=${encodeURIComponent(code)}&fuente=ref`;
}

// The share preview of a shared result: same page, another image and title. Exported for tests.
export function personalPreview(html, { kind, value, total }) {
  let img, title;
  if (kind === "diag") {
    img = `img/og/growth/diagnostico-${value}.png`;
    title = `Mi diagnóstico ICFES: unos ${value} de 500. ¿Cuánto sacas tú?`;
  } else {
    img = "img/og/growth/reto.png";
    title = `Acerté ${value} de ${total} en el Reto ICFES. ¿Me ganas?`;
  }
  const abs = (m) => m.replace(/content="(https?:\/\/[^/"]+\/)[^"]*"/, (_, origin) => `content="${origin}${img}"`);
  return html
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, abs)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, abs)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${title}" />`);
}

export function previewOf(url) {
  if (url.pathname === "/diagnostico-icfes/" && url.searchParams.has("p")) {
    const p = Number(url.searchParams.get("p"));
    return BUCKETS.has(p) ? { kind: "diag", value: p } : null;
  }
  const m = url.pathname.match(/^\/reto-icfes\/(\d{1,2})\/$/);
  if (m && url.searchParams.has("s")) {
    const s = Number(url.searchParams.get("s"));
    return Number.isInteger(s) && s >= 0 && s <= 5 ? { kind: "reto", value: s, total: 5 } : null;
  }
  return null;
}

export async function growthRoute(request, env, url) {
  const path = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const r = path.match(/^\/r\/([^/]+)\/?$/);
  if (r) {
    const code = decodeURIComponent(r[1]).toLowerCase();
    if (!CODE.test(code)) return Response.redirect(`${url.origin}/`, 302);
    let target = null;
    try { target = await anonRpc(env, "resolve_short_link", { p_code: code }); } catch { /* fall back to a referral code */ }
    return new Response(null, { status: 302, headers: { Location: `${url.origin}${shortTarget(code, target)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  if (path === "/app/api/push-key") {
    const key = env.VAPID_PUBLIC || "";
    return new Response(JSON.stringify({ key }), { status: key ? 200 : 404, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
  }

  const pv = previewOf(url);
  if (pv && env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(new URL(path, url), { method: "GET" }));
    if (!res.ok || !(res.headers.get("Content-Type") || "").includes("text/html")) return res;
    const out = new Response(personalPreview(await res.text(), pv), res);
    out.headers.delete("Content-Length");
    return out;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ F34 Web Push
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8 = (s) => new TextEncoder().encode(s);

// VAPID (RFC 8292) authorization for one push service origin. jwk: the private key as a JWK (kty EC, crv P-256, d, x, y).
export async function vapidHeader(jwk, publicKey, audience, subject = "https://condoricfes.com/", now = Date.now()) {
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(utf8(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

export async function growthCron(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC || !env.PUSH_CRON_TOKEN) return { skipped: "not_configured" };
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const due = (await anonRpc(env, "push_due", { p_token: env.PUSH_CRON_TOKEN, p_limit: 800 })) ?? [];
  const auth = new Map(); // one VAPID token per push service
  let sent = 0, gone = 0, failed = 0;
  for (const sub of due) {
    let origin;
    try { origin = new URL(sub.endpoint).origin; } catch { continue; }
    if (!auth.has(origin)) auth.set(origin, await vapidHeader(jwk, env.VAPID_PUBLIC, origin));
    try {
      const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: auth.get(origin), TTL: "21600", Urgency: "normal", "Content-Length": "0" } });
      if (r.status === 404 || r.status === 410) { gone++; await anonRpc(env, "push_failed", { p_token: env.PUSH_CRON_TOKEN, p_endpoint: sub.endpoint, p_gone: true }); }
      else if (!r.ok) { failed++; await anonRpc(env, "push_failed", { p_token: env.PUSH_CRON_TOKEN, p_endpoint: sub.endpoint, p_gone: false }); }
      else sent++;
    } catch { failed++; }
  }
  console.log(JSON.stringify({ push: 1, due: due.length, sent, gone, failed }));
  return { due: due.length, sent, gone, failed };
}
