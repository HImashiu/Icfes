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
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error === "daily_limit"
      ? "Abriste muchos cuadernillos hoy. Sigue con los que ya abriste; mañana se habilitan más."
      : "Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.");
  }
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return res.json();
}

// Grading on the server (worker/index.js, POST /app/api/reveal). Returns { answers, enrich, notes, hidden, score?,
// receipt? }. Students get answers only for the questions they ask about, and none of an activity still in progress.
export async function reveal(body) {
  const res = await fetch(`${base}api/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Tu sesión terminó. Vuelve a ingresar.");
  if (res.status === 429) throw new Error("Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.");
  if (!res.ok) throw new Error(`No se pudo calificar (${res.status})`);
  return res.json();
}

// Lays revealed answers, explanations and key notes over a booklet bundle (a new object, so screens re-render).
export function withRevealed(bundle, r) {
  if (!bundle || !r) return bundle;
  const key = new Map(bundle.key ?? []);
  for (const [k, letter] of Object.entries(r.answers ?? {})) key.set(String(k), letter);
  const enrich = { ...(bundle.enrich ?? {}) };
  for (const [k, row] of Object.entries(r.enrich ?? {})) enrich[k] = { ...(enrich[k] ?? {}), ...row };
  const notes = new Map(bundle.notes ?? []);
  for (const [k, note] of Object.entries(r.notes ?? {})) notes.set(String(k), note);
  return { ...bundle, key, enrich, notes };
}
