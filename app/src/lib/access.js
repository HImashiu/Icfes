// Who may open the app. Since 2026-11 the app needs an account: the landing page (/) stays public, /app/ asks for a
// Google sign-in first. Family report links (#/informe/<token>) keep working without one: parents have no account.
// Live games: guests (anonymous sign-in, nickname only) are off, so every player signs in too.
export const GUESTS_ALLOWED = false;

const KEY = "icfes-return-hash";

// The sign-in leaves the site and comes back to /app/, losing the #… part of the address (a live-game QR code,
// #docente…). It is kept here before leaving and put back once the account is ready.
export function rememberReturnHash() {
  try {
    const h = window.location.hash;
    if (h && !h.startsWith("#access_token") && !h.startsWith("#error")) sessionStorage.setItem(KEY, h);
  } catch { /* storage blocked: the student lands on Inicio */ }
}

export function restoreReturnHash() {
  try {
    const h = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (h && !window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search + h);
  } catch { /* nothing to restore */ }
}
