import { supabase } from "./supabase.js";

// Usage statistics for the owner (migration 0037). Two things leave the browser:
//  - track_visit: a random id this browser keeps (condor:vid, shared with the public site), where the visit came from
//    and how far it got (opened the app, signed in). No IP, no name.
//  - log_answers: each question answered in the app (exam, question, area, the letter, right or wrong when known),
//    sent in small batches. Grades never read it; it only feeds the «Uso» page.
// Every call fails quietly: statistics must never get in a student's way, and before 0037 runs they do nothing.

const VID = "condor:vid";
const QUEUE = "condor:answer-log";

export function visitorId() {
  try {
    let id = localStorage.getItem(VID);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
      localStorage.setItem(VID, id);
    }
    return id;
  } catch {
    return null;
  }
}

// Crawlers and headless browsers (Googlebot renders pages with JavaScript) are not visitors.
export const isBot = () => {
  try {
    return Boolean(navigator.webdriver) || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|bingpreview|ahrefs|semrush|mj12/i.test(navigator.userAgent || "");
  } catch { return false; }
};

const sent = new Set();
// event: 'app' (opened /app/) or 'signin' (has an account). Once per page load each.
export function trackVisit(event) {
  if (!supabase || sent.has(event) || isBot()) return;
  const id = visitorId();
  if (!id) return;
  sent.add(event);
  const args = { p_visitor: id, p_event: event, p_path: window.location.pathname, p_source: sourceOf() };
  // p_device arrives with migration 0040; before it runs the server only knows the 4-argument call.
  supabase.rpc("track_visit", { ...args, p_device: deviceKind() }).then(
    ({ error }) => { if (error) supabase.rpc("track_visit", args).then(() => {}, () => {}); },
    () => {},
  );
}

// Phone, tablet or computer, from the screen and the browser's own hint. Nothing else about the device is sent.
export function deviceKind() {
  try {
    const ua = navigator.userAgent || "";
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
    if (navigator.userAgentData?.mobile || /Mobi|iPhone|iPod|Android/i.test(ua)) return "movil";
    return Math.min(window.screen?.width ?? 1200, window.screen?.height ?? 1200) < 600 ? "movil" : "computador";
  } catch {
    return null;
  }
}

// Where the visit came from: ?utm_source=… or the other site that linked here (facebook.com, google.com…).
export function sourceOf() {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm = q.get("utm_source") || q.get("fuente");
    if (utm) return utm.slice(0, 80);
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, "");
    return host && host !== window.location.hostname.replace(/^www\./, "") ? host : null;
  } catch {
    return null;
  }
}

// ---- Answers ----
let queue = (() => {
  try { return JSON.parse(localStorage.getItem(QUEUE) || "[]"); } catch { return []; }
})();
let timer = null;
let flushing = false;
const store = () => { try { localStorage.setItem(QUEUE, JSON.stringify(queue.slice(-400))); } catch { /* full or blocked */ } };

// row: { attempt, slug, key, area, mode, assignment, answer, correct }
export function logAnswer(row) {
  if (!supabase) return;
  queue = queue.filter((r) => !(r.attempt === row.attempt && r.slug === row.slug && r.key === row.key));
  queue.push(row);
  store();
  clearTimeout(timer);
  timer = setTimeout(flushAnswers, 4000);
}

export async function flushAnswers() {
  if (!supabase || flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, 200);
  try {
    const { error } = await supabase.rpc("log_answers", { p_rows: batch });
    // Sent (or the server can't take them: before migration 0037, signed out): drop them so they don't pile up.
    if (!error || !/fetch|network|timeout/i.test(error.message ?? "")) {
      queue = queue.filter((r) => !batch.includes(r));
      store();
    }
  } catch { /* offline: kept for the next try */ }
  flushing = false;
  if (queue.length) { clearTimeout(timer); timer = setTimeout(flushAnswers, 4000); }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAnswers(); });
}

// What changed in an attempt since the last look: new or changed answers, and answers whose right/wrong is now known.
// `seen` is a Map kept by the caller (`${attempt}:${key}` -> "B:true").
export function answerChanges(attempt, questions, keyMap, seen) {
  const out = [];
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const attemptId = String(attempt.startedAt);
  for (const [k, letter] of Object.entries(attempt.answers ?? {})) {
    if (!letter || !byKey.has(k)) continue;
    const right = keyMap?.get?.(k);
    // In a timed run the right answer is not looked up before delivering; right/wrong arrives with the grade.
    const correct = right ? right === letter : null;
    const tag = `${letter}:${correct}`;
    const id = `${attemptId}:${k}`;
    if (seen.get(id) === tag) continue;
    seen.set(id, tag);
    out.push({
      attempt: attemptId, slug: attempt.slug, key: k, area: byKey.get(k).section ?? null, mode: attempt.mode ?? null,
      assignment: attempt.assignmentId ?? null, answer: letter, correct,
    });
  }
  return out;
}

// The owner's page (#admin/uso). Throws 'not_admin' for everyone else.
export async function amAdmin() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("am_admin");
  return !error && data === true;
}
// The founder's dashboard (migration 0040). Dates are 'YYYY-MM-DD' (Bogotá days); filters null = all.
export async function adminDashboard({ from, to, role = null, channel = null, school = null }) {
  const { data, error } = await supabase.rpc("admin_dashboard", { p_from: from, p_to: to, p_role: role, p_channel: channel, p_school: school });
  if (error) throw new Error(error.message);
  return data;
}
export async function adminPeople() {
  const { data, error } = await supabase.rpc("admin_people");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function adminPerson(id) {
  const { data, error } = await supabase.rpc("admin_person", { p_user: id });
  if (error) throw new Error(error.message);
  return data;
}
export async function adminTeachers({ from, to }) {
  const { data, error } = await supabase.rpc("admin_teachers", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data;
}
// True when the error says migration 0040 has not run yet (the function does not exist).
export const missingFunction = (message) => /could not find the function|does not exist|schema cache|PGRST202/i.test(message ?? "");

export async function adminUsage(days = 30) {
  const { data, error } = await supabase.rpc("admin_usage", { p_days: days });
  if (error) throw new Error(error.message);
  return data;
}
