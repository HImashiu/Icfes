// Growth events from the app (F1, F2): the same pipeline as the site (track_events, migration 0050), batched, with
// the visitor id the site uses (condor:vid), so a visit can be followed from the landing to the fifth question.
// Every call fails quietly. Funnel steps (F2): app:open, auth:start, auth:done, consent:ok, q:first, q:fifth,
// practice:done; growth.js on the site adds page:view and cta:click.
import { supabase } from "../supabase.js";
import { visitorId } from "../usage.js";

let queue = [];
let timer = null;
const once = new Set();

export function track(name, props = {}) {
  if (!supabase || typeof window === "undefined") return;
  queue.push({ n: name, p: window.location.pathname.slice(0, 160), x: props });
  if (!timer) timer = setTimeout(flush, 2000);
}

// Only once per browser (funnel milestones such as the first question).
export function trackOnce(name, props = {}) {
  if (once.has(name)) return;
  once.add(name);
  try {
    if (localStorage.getItem(`condor:once:${name}`)) return;
    localStorage.setItem(`condor:once:${name}`, "1");
  } catch { /* storage blocked: once per load */ }
  track(name, props);
}

export async function flush() {
  timer = null;
  if (!supabase || !queue.length) return;
  const vid = visitorId();
  if (!vid) { queue = []; return; }
  const rows = queue.splice(0, 30);
  try { await supabase.rpc("track_events", { p_visitor: vid, p_rows: rows }); } catch { /* dropped */ }
  if (queue.length) timer = setTimeout(flush, 800);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

// Answers counted in this browser for the funnel milestones q:first and q:fifth.
export function noteAnswered(count = 1) {
  let n = 0;
  try {
    n = Number(localStorage.getItem("condor:answered") || "0") + count;
    localStorage.setItem("condor:answered", String(n));
  } catch { n = count; }
  if (n >= 1) trackOnce("q:first");
  if (n >= 5) trackOnce("q:fifth");
  return n;
}

// ---- F4 errors in the app: grouped by fingerprint, once per load each.
const seen = new Set();
const fpOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function reportError(message, source = "", stack = "") {
  if (!supabase || !message) return;
  const msg = String(message).slice(0, 300);
  if (/ResizeObserver loop|Script error\.?$/.test(msg)) return;
  const fp = fpOf(`${msg}|${String(source).replace(/\?.*$/, "").replace(/:\d+:\d+$/, "")}`);
  if (seen.has(fp)) return;
  seen.add(fp);
  let first = true;
  try {
    const known = JSON.parse(localStorage.getItem("condor:errs") || "{}");
    first = !known[fp];
    known[fp] = 1;
    localStorage.setItem("condor:errs", JSON.stringify(known));
  } catch { /* fine */ }
  supabase.rpc("log_client_error", {
    p_fp: fp, p_message: msg, p_source: String(source).slice(0, 200), p_path: `${window.location.pathname}${window.location.hash.split("?")[0]}`.slice(0, 160),
    p_stack: String(stack ?? "").slice(0, 1500), p_surface: "app", p_first: first,
  }).then(() => {}, () => {});
}

export function installErrorReporting() {
  if (typeof window === "undefined" || window.__condorErrors) return;
  window.__condorErrors = true;
  window.addEventListener("error", (e) => { if (e?.message) reportError(e.message, `${e.filename ?? ""}:${e.lineno ?? 0}`, e.error?.stack); });
  window.addEventListener("unhandledrejection", (e) => { const r = e?.reason; reportError(r?.message ?? String(r), "promise", r?.stack); });
}
