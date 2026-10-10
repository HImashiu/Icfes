// Per-viewer convenience only: an unfinished attempt survives a reload in this browser.
// Every read and write can fail (private mode, blocked storage), so the app works without it.
const PREFIX = "icfes-practice:attempt:";

export function loadAttempt(slug, scope) {
  try {
    const raw = window.localStorage.getItem(PREFIX + slug + ":" + scope);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAttempt(slug, scope, attempt) {
  try {
    window.localStorage.setItem(PREFIX + slug + ":" + scope, JSON.stringify(attempt));
  } catch {
    /* storage unavailable: the attempt lives only in memory */
  }
}

export function clearAttempt(slug, scope) {
  try {
    window.localStorage.removeItem(PREFIX + slug + ":" + scope);
  } catch {
    /* nothing to clear */
  }
}
