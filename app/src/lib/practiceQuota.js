// The daily allowance of free-practice questions (fair use: practice stays free to open, one student can't take the
// whole bank in a day). Teacher assignments and the full simulacro are not counted. The number is
// app_limits.questions_per_day on the server (migration 0033). Without a backend, or when the server can't be reached,
// the same count is kept in this browser so the rule still holds for the day. Pure except for localStorage.
export const DEFAULT_DAILY_QUESTIONS = 40;
const KEY = "condor:practice-quota";

// The day in Colombia (Bogotá), as the server counts it.
export const todayKey = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

function readLocal(now) {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (v && v.day === todayKey(now) && Number.isFinite(v.used)) return v;
  } catch { /* no storage: the count starts at zero */ }
  return { day: todayKey(now), used: 0 };
}

export function localQuota(limit = DEFAULT_DAILY_QUESTIONS, now = new Date()) {
  const { used } = readLocal(now);
  return { used, limit, remaining: Math.max(limit - used, 0) };
}

// Takes up to `want` questions from today's allowance. Returns { granted, used, limit, remaining }.
export function spendLocal(want, limit = DEFAULT_DAILY_QUESTIONS, now = new Date()) {
  const cur = readLocal(now);
  const granted = Math.min(Math.max(Math.floor(want) || 0, 0), Math.max(limit - cur.used, 0));
  const used = cur.used + granted;
  try { window.localStorage.setItem(KEY, JSON.stringify({ day: cur.day, used })); } catch { /* the count lasts for this visit */ }
  return { granted, used, limit, remaining: Math.max(limit - used, 0) };
}

// Full simulacros without an account (the server's rule otherwise, migration 0053): SIMULACROS_PER_MONTH a calendar
// month, both sessions of one cuadernillo are one simulacro, and opening it again within 30 days is free.
export const SIMULACROS_PER_MONTH = 1;
const SIM_KEY = "condor:simulacros";
export const simulacroExam = (slug) => String(slug ?? "").replace(/_(1ra|2da)$/, "");

function readSims() {
  try {
    const v = JSON.parse(window.localStorage.getItem(SIM_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.exam === "string" && Number.isFinite(x.at)) : [];
  } catch { return []; }
}

export function localSimulacros(now = new Date()) {
  const month = todayKey(now).slice(0, 7);
  const used = readSims().filter((x) => todayKey(new Date(x.at)).slice(0, 7) === month).length;
  return { month_limit: SIMULACROS_PER_MONTH, month_used: used, extra: 0, extra_used: 0, remaining: Math.max(SIMULACROS_PER_MONTH - used, 0), unlimited: false, pass: false };
}

export function takeLocalSimulacro(slug, now = new Date()) {
  const exam = simulacroExam(slug);
  const sims = readSims();
  if (sims.some((x) => x.exam === exam && now.getTime() - x.at < 30 * 864e5)) return { ...localSimulacros(now), granted: true, how: "again" };
  const state = localSimulacros(now);
  if (state.remaining <= 0) return { ...state, granted: false };
  try { window.localStorage.setItem(SIM_KEY, JSON.stringify([...sims.slice(-40), { exam, at: now.getTime() }])); } catch { /* lasts for this visit */ }
  return { ...localSimulacros(now), granted: true, how: "month" };
}
