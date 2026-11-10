// Demo mode: a fake school with invented students, kept entirely in memory. It is off unless asked for with
// `?demo=1` in the address (or a build made with VITE_DEMO=1, used for the clickable preview).
// It never talks to the backend: auth.jsx swaps the API for an in-memory one while it is on.
export const DEMO_LABEL = "Datos de ejemplo";

export function isDemo() {
  if (import.meta.env.VITE_DEMO === "1") return true;
  if (typeof window === "undefined") return false;
  try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; }
}
export const demoEnabled = isDemo();

// The example school can be switched on from inside the teacher panel, to see how the tools look with data
// without importing anything. It opens in place of the real school (nothing real is read or written while it is
// on) and switching it off brings the teacher back to their own, real panel.
const FROM = "condor:demo-from";
export function setDemo(on, hash) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (hash === undefined) {
    let from = null;
    try { from = sessionStorage.getItem(FROM); if (on) sessionStorage.setItem(FROM, "teacher"); else sessionStorage.removeItem(FROM); } catch { /* storage blocked */ }
    hash = on || from === "teacher" ? "#docente/hoy" : "";
  }
  if (on) url.searchParams.set("demo", "1"); else url.searchParams.delete("demo");
  url.hash = hash;
  window.location.assign(url.toString());
}
