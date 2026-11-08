import { supabase } from "./supabase.js";

const base = import.meta.env.BASE_URL;

// Exam files (questions, keys, explanations) are served only to signed-in accounts: the site's worker checks the
// account's token (worker/index.js). index.json, the catalog, stays public.
export async function authHeaders() {
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function getJson(path) {
  const res = await fetch(base + path, { headers: await authHeaders() });
  if (res.status === 401) throw new Error("Tu sesión terminó. Vuelve a ingresar para ver las preguntas.");
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return res.json();
}
