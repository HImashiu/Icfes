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

// Why the server would not hand over a booklet (worker/index.js, bank_open in migration 0036), in words for the person.
export const LIMIT_MESSAGES = {
  daily_limit: "Llegaste al número de cuadernillos distintos que se pueden abrir hoy. Sigue con los que ya abriste: esos no cuentan de nuevo. Mañana se habilitan más.",
  week_limit: "Llegaste al número de cuadernillos distintos de esta semana. Sigue con los que ya abriste: esos no cuentan de nuevo. En unos días se habilitan más.",
  trial_limit: "Tu colegio ya abrió todos los cuadernillos que incluye la versión de prueba. Pueden seguir usando los que ya abrieron; para el banco completo, escríbenos.",
  access_blocked: "El acceso a las preguntas de esta cuenta está suspendido. Si crees que es un error, escríbenos.",
  teachers_only: "Ese archivo es solo para docentes.",
  too_many_requests: "Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.",
};
export async function limitMessage(res) {
  const body = await res.json().catch(() => ({}));
  return LIMIT_MESSAGES[body.error] ?? LIMIT_MESSAGES.too_many_requests;
}

export async function getJson(path) {
  const res = await fetch(base + path, { headers: await authHeaders() });
  if (res.status === 401) throw new Error("Tu sesión terminó. Vuelve a ingresar para ver las preguntas.");
  if (res.status === 429 || res.status === 403) {
    const err = new Error(await limitMessage(res));
    err.limit = true;
    throw err;
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
  if (res.status === 429 || res.status === 403) throw new Error(await limitMessage(res));
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
