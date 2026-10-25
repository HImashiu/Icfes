import { createClient } from "@supabase/supabase-js";

// The backend is optional: without these two variables the app runs exactly as before (no accounts, data in this browser).
// Both are public by design; access is limited by row-level security (see ../../../supabase/migrations).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// What the page was opened with after a sign-in redirect, read before the client clears the address. Shown on the
// Ingresar screen so a failed sign-in says why (an error from Google or Supabase, or tokens that never arrived).
export const authLanding = (() => {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error");
    if (err) return { error: err };
    if (q.get("code") || h.get("access_token")) return { arrived: true };
  } catch { /* no address */ }
  return null;
})();

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
export const backendConfigured = Boolean(supabase);
export const microsoftEnabled = import.meta.env.VITE_MICROSOFT_LOGIN === "1";
