// Cuaderno de errores: every question the student missed, across all their practice, with why they think they
// missed it (their own tag), a note, and whether they have since answered it right. Built from the practice history
// kept in this browser; the tags and notes are kept here too (personal study notes, never a grade).
import { demoEnabled } from "../demo/mode.js";

const KEY = demoEnabled ? "condor:demo:errors" : "condor:errors";

export const CAUSES = [
  { id: "concept", label: "No sabía el tema", tip: "Repasa el tema antes de volver a practicar: una explicación corta y dos ejemplos." },
  { id: "reading", label: "Leí mal o muy rápido", tip: "Subraya qué pregunta exactamente el enunciado antes de mirar las opciones." },
  { id: "two", label: "Dudé entre dos", tip: "Busca la palabra que hace falsa a la opción que casi eliges: casi siempre hay una." },
  { id: "calc", label: "Error de cálculo", tip: "Escribe cada paso y verifica el resultado con un número fácil." },
  { id: "time", label: "Me faltó tiempo", tip: "Practica con cronómetro: marca y salta la que te tome más de 3 minutos." },
  { id: "guess", label: "Adiviné", tip: "Una respuesta adivinada no es un acierto: vuelve a ella aunque te salga bien." },
];
export const causeLabel = (id) => CAUSES.find((c) => c.id === id)?.label ?? "Sin clasificar";

export function loadNotes() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}
export function saveNote(id, patch) {
  const all = loadNotes();
  const next = { ...(all[id] ?? {}), ...patch, at: Date.now() };
  for (const k of Object.keys(next)) if (next[k] === "" || next[k] == null) delete next[k];
  all[id] = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* blocked storage */ }
  return all;
}

export const entryId = (slug, key) => `${slug}|${key}`;

// history: loadHistory() rows. Each missed question once, with its latest miss, how many times it was missed and
// whether a later attempt got it right ("recovered"). Area and the chosen letter come from the row when it has them
// (attempts saved since the notebook exists keep `missedInfo`).
export function notebook(history = [], notes = {}) {
  const rows = [...history].filter((h) => h.snapshot?.slug).sort((a, b) => a.at - b.at);
  const map = new Map();
  for (const h of rows) {
    const slug = h.snapshot.slug;
    const info = new Map((h.missedInfo ?? []).map((m) => [String(m.key), m]));
    for (const k of h.missed ?? []) {
      const id = entryId(slug, k);
      const m = info.get(String(k));
      const prev = map.get(id);
      map.set(id, {
        id, slug, key: String(k), title: h.title ?? slug,
        number: m?.number ?? prev?.number ?? (Number.isFinite(Number(k)) ? Number(k) : null),
        area: m?.area ?? prev?.area ?? null,
        chosen: m?.chosen ?? h.snapshot.answers?.[k] ?? prev?.chosen ?? null,
        times: (prev?.times ?? 0) + 1, firstAt: prev?.firstAt ?? h.at, lastAt: h.at, recovered: false, recoveredAt: null,
      });
    }
    for (const k of h.right ?? []) {
      const e = map.get(entryId(slug, k));
      if (e && h.at > e.lastAt) Object.assign(e, { recovered: true, recoveredAt: h.at });
    }
  }
  return [...map.values()].map((e) => ({ ...e, cause: notes[e.id]?.cause ?? null, note: notes[e.id]?.note ?? "" }))
    .sort((a, b) => Number(a.recovered) - Number(b.recovered) || b.lastAt - a.lastAt);
}

export const EMPTY_FILTER = { area: "", cause: "", state: "pending" };
export function filterNotebook(entries, f) {
  return entries.filter((e) => (!f.area || e.area === f.area) && (!f.cause || (f.cause === "none" ? !e.cause : e.cause === f.cause))
    && (f.state === "all" || (f.state === "pending" ? !e.recovered : e.recovered)));
}

// What the tags say: counts per cause among pending errors, the main one and its advice.
export function causeSummary(entries) {
  const pending = entries.filter((e) => !e.recovered);
  const counts = CAUSES.map((c) => ({ ...c, n: pending.filter((e) => e.cause === c.id).length })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const tagged = counts.reduce((s, c) => s + c.n, 0);
  return { pending: pending.length, recovered: entries.length - pending.length, untagged: pending.length - tagged, counts, main: counts[0] ?? null };
}

// Pending errors grouped by booklet, so each group can be practiced as one round (most missed first).
export function practiceGroups(entries) {
  const by = new Map();
  for (const e of entries.filter((x) => !x.recovered)) {
    if (!by.has(e.slug)) by.set(e.slug, { slug: e.slug, title: e.title, keys: [] });
    by.get(e.slug).keys.push(e);
  }
  return [...by.values()].map((g) => ({ ...g, keys: g.keys.sort((a, b) => b.times - a.times).map((e) => e.key) }));
}
