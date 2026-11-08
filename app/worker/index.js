// The site's worker. Static files are served by Cloudflare directly; this code runs only for /app/exams/* and
// /app/api/* (run_worker_first in wrangler.jsonc).
//
// Who gets what:
//  - Anyone: exams/index.json (the catalog).
//  - Signed-in students: the questions (<slug>.json, .figures.json) and the tags and hints of the AI notes
//    (<slug>.enrich.json is served from <slug>.enrich.student.json, without explanations). Never the key files.
//    Answers come from POST /app/api/reveal, a few questions at a time, after answering (see reveal()).
//  - Teachers and school admins: every file, as before (printing, scanning paper sheets, reports).
//  - Nobody: <slug>.grade.json, the worker's own copy of keys, areas and notes (written by scripts/build-site.mjs).
//
// Defences against scraping, in order: 120 requests a minute per network address (EXAM_IP_RATE); a valid Supabase
// session checked with Supabase itself (/auth/v1/user); 60 requests a minute per account (EXAM_USER_RATE); a daily
// cap of different booklets per account (note_exam_download, migration 0031).
//
// Scores: when an attempt is delivered, reveal() grades it here and signs the score with GRADE_SECRET (HMAC-SHA256).
// The database keeps a delivered attempt's score only with a valid signature (migration 0032), so a score typed in
// the browser is never trusted.

const OK_FOR = 5 * 60 * 1000;
const users = new Map(); // token -> { id, role, until }
const noted = new Map(); // `${id}:${slug}` -> until
const files = new Map(); // asset path -> { data, until } (grade and enrich files, parsed)

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const trim = (map) => { if (map.size > 5000) map.clear(); };
const STAFF = new Set(["teacher", "school_admin"]);

function rest(env, token, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function userOf(token, env) {
  const now = Date.now();
  const hit = users.get(token);
  if (hit && hit.until > now) return hit;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await rest(env, token, "/auth/v1/user");
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  if (!user?.id) return null;
  if (user.is_anonymous && env.ALLOW_GUESTS !== "1") return null;
  let role = null;
  try {
    const r = await rest(env, token, `/rest/v1/profiles?select=role&id=eq.${user.id}`);
    if (r.ok) role = (await r.json())?.[0]?.role ?? null;
  } catch { /* no role: treated as a student */ }
  let until = now + OK_FOR;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp) until = Math.min(until, payload.exp * 1000);
  } catch { /* keep the default */ }
  trim(users);
  const out = { id: user.id, role, staff: STAFF.has(role), until };
  users.set(token, out);
  return out;
}

// "ok", or "limit" when the account has opened too many booklets today. Other failures (migration 0031 not run,
// Supabase slow) let the request through: the sign-in check already passed and students must never be locked out.
async function noteDownload(token, id, slug, env) {
  const k = `${id}:${slug}`;
  const now = Date.now();
  if ((noted.get(k) ?? 0) > now) return "ok";
  try {
    const res = await rest(env, token, "/rest/v1/rpc/note_exam_download", { method: "POST", body: JSON.stringify({ p_slug: slug }) });
    if (!res.ok) return (await res.text()).includes("download_limit") ? "limit" : "ok";
  } catch { return "ok"; }
  trim(noted);
  noted.set(k, now + OK_FOR);
  return "ok";
}

async function underLimit(limiter, key) {
  if (!limiter) return true;
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

async function asset(env, request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  return env.ASSETS.fetch(new Request(url, { method: "GET" }));
}

async function assetJson(env, request, path) {
  const now = Date.now();
  const hit = files.get(path);
  if (hit && hit.until > now) return hit.data;
  const res = await asset(env, request, path);
  const data = res.ok ? await res.json().catch(() => null) : null;
  if (files.size > 60) files.clear();
  files.set(path, { data, until: now + 10 * 60 * 1000 });
  return data;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sign(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

// AES-256-CBC with a key derived from the secret, then HMAC-SHA256 over iv+data. The database undoes it with
// pgcrypto (migration 0032): decrypt_iv(..., 'aes-cbc/pad:pkcs') and hmac(..., 'sha256').
async function seal(secret, text) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}enc`));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const data = hex(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, enc.encode(text)));
  const ivHex = hex(iv);
  return { iv: ivHex, data, sig: await sign(secret, ivHex + data) };
}

// The same arithmetic as scoreAttempt() in src/lib/exam.js, over the attempt's questions in their order.
function scoreOf(keys, answers, grade, key) {
  const areas = new Map();
  const add = (name, field) => {
    if (!areas.has(name)) areas.set(name, { name, total: 0, answered: 0, correct: 0, resp: [] });
    areas.get(name)[field] += 1;
  };
  for (const k of keys) {
    const section = grade.s[k];
    if (section == null) continue;
    add(section, "total");
    const given = answers[k];
    if (given) add(section, "answered");
    if (key.get(k) && given && key.get(k) === given) add(section, "correct");
    if (key.get(k)) areas.get(section).resp.push([given && key.get(k) === given ? 1 : 0, grade.o[k] || 4]);
  }
  const perArea = [...areas.values()];
  const sum = (f) => perArea.reduce((acc, a) => acc + a[f], 0);
  return { keyed: key.size > 0, correct: sum("correct"), answered: sum("answered"), total: sum("total"), perArea };
}

const stateOf = (a, now) => {
  if (a.status === "draft") return "draft";
  if (a.status === "closed") return "closed";
  if (a.due_at && Date.parse(a.due_at) < now) return "closed";
  if (a.opens_at && Date.parse(a.opens_at) > now) return "scheduled";
  return "active";
};
const revealAllowed = (a, now) => {
  const policy = a.reveal_policy ?? "after_submit";
  if (policy === "after_submit") return true;
  if (policy === "never") return false;
  return stateOf(a, now) === "closed";
};
const covers = (a, slug, key, section) =>
  a.exam_slug === slug && (Array.isArray(a.question_keys) && a.question_keys.length
    ? a.question_keys.map(String).includes(key)
    : a.scope === "all" || a.scope === section);

// POST /app/api/reveal { slug, keys: [...], answers?: {key: letter}, submit?: { client_id, assignment_id } }
// Returns the right answer (and the explanation, the key's notes) of each requested question, except questions of
// an activity still in progress that must stay hidden: a timed simulacro or a task with "corrección al final" that the
// student hasn't delivered, or a delivered one whose teacher shows the answers later. With `submit`, also the signed
// score of the delivered attempt.
async function reveal(request, env, user, token) {
  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.slice(0, 80) : "";
  const keys = Array.isArray(body?.keys) ? body.keys.slice(0, 400).map((k) => String(k).slice(0, 20)) : [];
  if (!/^[A-Za-z0-9_-]+$/.test(slug) || keys.length === 0) return json(400, { error: "bad_request" });
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const submit = body.submit && typeof body.submit === "object" ? body.submit : null;

  if ((await noteDownload(token, user.id, slug, env)) === "limit") return json(429, { error: "daily_limit" });
  const grade = await assetJson(env, request, `/app/exams/${slug}.grade.json`);
  if (!grade) return json(404, { error: "no_key" });

  const key = new Map(Object.entries(grade.k ?? {}));
  // The school's own versions of questions can change the key (question_overrides, readable by its students).
  try {
    const r = await rest(env, token, `/rest/v1/question_overrides?select=qkey,answer,explanation&exam_slug=eq.${encodeURIComponent(slug)}`);
    if (r.ok) for (const o of await r.json()) if (o.answer && /^[A-H]$/.test(o.answer)) key.set(String(o.qkey), o.answer);
  } catch { /* no overrides */ }

  // The student's activities that cover these questions, and which of them they already delivered.
  const now = Date.now();
  let assignments = [];
  let delivered = new Set();
  try {
    const cols = "id,kind,exam_slug,scope,question_keys,reveal_policy,instant_feedback,status,due_at,opens_at";
    const r = await rest(env, token, `/rest/v1/assignments?select=${cols}&exam_slug=eq.${encodeURIComponent(slug)}`);
    if (r.ok) assignments = await r.json();
    else if (r.status === 400) {
      const r2 = await rest(env, token, `/rest/v1/assignments?select=id,kind,exam_slug,scope,question_keys,reveal_policy,status,due_at,opens_at&exam_slug=eq.${encodeURIComponent(slug)}`);
      if (r2.ok) assignments = await r2.json();
    }
    if (assignments.length) {
      const ra = await rest(env, token, `/rest/v1/attempts?select=assignment_id&profile_id=eq.${user.id}&submitted_at=not.is.null&assignment_id=in.(${assignments.map((a) => a.id).join(",")})`);
      if (ra.ok) delivered = new Set((await ra.json()).map((x) => x.assignment_id));
    }
  } catch { /* none */ }
  // Delivering an assignment does not unlock its answers here: they come from a second call, once the attempt is
  // saved in the database (so a student can't ask for the answers of a simulacro and keep answering it).
  const submitting = submit?.assignment_id ? assignments.find((a) => a.id === submit.assignment_id) ?? { id: submit.assignment_id } : null;
  const hidden = (k) => assignments.some((a) => {
    if (!covers(a, slug, k, grade.s[k])) return false;
    const st = stateOf(a, now);
    if (st === "closed" || st === "draft") return delivered.has(a.id) && !revealAllowed(a, now);
    // Active or programmed: hidden until delivered (a timed simulacro always; a practice unless the teacher turned on
    // corrección inmediata), then by the reveal policy.
    if (!delivered.has(a.id)) return a.kind === "exam" || a.instant_feedback === false || a.reveal_policy === "never";
    return !revealAllowed(a, now);
  });

  const enrich = grade.e ? await assetJson(env, request, `/app/exams/${slug}.enrich.json`) : null;
  const out = { answers: {}, enrich: {}, notes: {}, hidden: [] };
  for (const k of keys) {
    if (!key.has(k)) continue;
    if (!user.staff && (submitting || hidden(k))) { out.hidden.push(k); continue; }
    out.answers[k] = key.get(k);
    if (grade.n?.[k]) out.notes[k] = grade.n[k];
    const row = enrich?.questions?.[k];
    if (row) out.enrich[k] = row;
  }

  if (submit && env.GRADE_SECRET) {
    // A practice that includes questions of an activity still in progress gets no grade at all: otherwise delivering
    // one-question practices would tell a student the simulacro's answers.
    const blind = out.hidden.length > 0 && !submitting;
    const score = scoreOf(keys, answers, grade, blind ? new Map() : key);
    const text = JSON.stringify({
      v: 1, uid: user.id, slug, client_id: String(submit.client_id ?? ""), assignment_id: submit.assignment_id ?? null,
      at: new Date(now).toISOString(), score,
    });
    // The score travels encrypted: for an assignment the student must not learn it before the attempt is saved (it
    // would let them try answers until the score goes up). Free practice also gets it in clear.
    if (!submitting) out.score = score;
    out.receipt = await seal(env.GRADE_SECRET, text);
  }
  return json(200, out);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isApi = path === "/app/api/reveal";
    const isExamFile = path.startsWith("/app/exams/") && path !== "/app/exams/index.json";
    if ((!isApi && !isExamFile) || request.method === "OPTIONS") return env.ASSETS.fetch(request);

    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (!(await underLimit(env.EXAM_IP_RATE, `ip:${ip}`))) return json(429, { error: "too_many_requests" });

    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token.length > 4096 || token.split(".").length !== 3) return json(401, { error: "sign_in_required" });
    const user = await userOf(token, env);
    if (!user) return json(401, { error: "sign_in_required" });
    if (!(await underLimit(env.EXAM_USER_RATE, `user:${user.id}`))) return json(429, { error: "too_many_requests" });

    if (isApi) {
      if (request.method !== "POST") return json(405, { error: "post_only" });
      return reveal(request, env, user, token);
    }

    const name = decodeURIComponent(path.slice("/app/exams/".length)).split("/")[0];
    const slug = name.split(".")[0].slice(0, 80);
    if (/\.grade\.json$|\.student\.json$/.test(name)) return json(404, { error: "not_found" });
    let servePath = null;
    if (!user.staff) {
      if (/\.(key|sidecar)\.json$/.test(name)) return json(403, { error: "teachers_only" });
      if (/\.enrich\.json$/.test(name)) servePath = `/app/exams/${slug}.enrich.student.json`;
    }
    if ((await noteDownload(token, user.id, slug, env)) === "limit") return json(429, { error: "daily_limit" });

    const res = servePath ? await asset(env, request, servePath) : await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    // Never kept by shared caches; the browser may keep its own copy for an hour.
    out.headers.set("Cache-Control", "private, max-age=3600");
    out.headers.set("Vary", "Authorization");
    return out;
  },
};
