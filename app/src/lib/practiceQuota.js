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
