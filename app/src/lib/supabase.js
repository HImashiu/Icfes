import { createClient } from "@supabase/supabase-js";

// The backend is optional: without these two variables the app runs exactly as before (no accounts, data in this browser).
// Both are public by design; access is limited by row-level security (see ../../../supabase/migrations).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
export const backendConfigured = Boolean(supabase);
export const microsoftEnabled = import.meta.env.VITE_MICROSOFT_LOGIN === "1";
