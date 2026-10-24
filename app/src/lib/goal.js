// The student's own goal: the date of their Saber 11, a daily XP goal and the score they aim for. Kept in this
// browser only (it is a personal setting, not a grade), and every read and write can fail without breaking anything.
const KEY = "condor:goal";
export const DAILY_GOALS = [50, 100, 150, 200];
export const TARGETS = [250, 300, 350, 400];
export const DEFAULT_GOAL = { examDate: "", dailyXp: 100, target: 300 };

export function loadGoal() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return { ...DEFAULT_GOAL, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    return { ...DEFAULT_GOAL };
  }
}

export function saveGoal(goal) {
  try { window.localStorage.setItem(KEY, JSON.stringify(goal)); return true; } catch { return false; }
}

// Whole days from today to an ISO date ("2027-08-15"); null without a date, 0 on the day itself.
export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 864e5);
}

// XP earned today, from the practice history.
export function xpToday(history = [], now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return history.filter((h) => h.at >= start.getTime()).reduce((a, h) => a + (h.xp ?? 0), 0);
}
