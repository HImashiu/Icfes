// Demo mode: a fake school with invented students, kept entirely in memory. It is off unless asked for with
// `?demo=1` in the address (or a build made with VITE_DEMO=1, used for the clickable preview).
// It never talks to the backend: auth.jsx swaps the API for an in-memory one while it is on.
export const DEMO_LABEL = "Datos de demostración";

export function isDemo() {
  if (import.meta.env.VITE_DEMO === "1") return true;
  if (typeof window === "undefined") return false;
  try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; }
}
export const demoEnabled = isDemo();
