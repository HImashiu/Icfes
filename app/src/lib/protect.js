import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { isDemo } from "../demo/mode.js";
import "./protect.css";

// Protección del banco: every print or export of questions (typeset cuadernillo, worksheet, teacher key) is noted on
// the server (bank_export, migration 0036). The server answers with a short reference that is printed at the foot of
// every page with the school's name and the date, so a leaked PDF says who printed it, and it refuses once the account
// (or a school on trial) has printed too much today. Without a backend, in the example data or when the server can't
// be reached, the page still prints with the local mark: printing must never break for a teacher with a weak network.

const marks = new Map(); // `${kind}|${slug}|${count}` -> Promise<mark>

export const EXPORT_DENIED = {
  export_limit: "Llegaste al límite de impresiones y exportaciones de hoy. Mañana se habilitan de nuevo; lo que ya imprimiste sigue disponible.",
  trial_export_limit: "Tu colegio llegó al límite diario de impresiones de la versión de prueba. Mañana se habilitan de nuevo.",
  access_blocked: "Esta cuenta tiene el acceso a las preguntas suspendido. Escríbenos para revisarlo.",
};

export const formatDay = (d = new Date()) =>
  d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });

// The text printed at the foot of every page. Pure.
export function markLine(mark, now = new Date()) {
  if (!mark) return "";
  const parts = [];
  if (mark.school) parts.push(mark.school);
  if (mark.name) parts.push(`impreso por ${mark.name}`);
  parts.push(formatDay(now));
  if (mark.ref) parts.push(`ref. ${mark.ref}`);
  parts.push(mark.demo ? "ejemplo" : "uso exclusivo del colegio");
  return parts.join(" · ");
}

async function ask(kind, slug, count) {
  if (!supabase || isDemo()) return { ok: true, demo: isDemo(), school: isDemo() ? "Colegio de ejemplo" : null };
  try {
    const { data, error } = await supabase.rpc("bank_export", { p_kind: kind, p_slug: slug ?? null, p_questions: Math.max(0, Math.min(1000, count | 0)) });
    if (error || !data) return { ok: true, offline: true };
    return data;
  } catch {
    return { ok: true, offline: true };
  }
}

// One note per print per day: the same kind, booklet and number of questions reuse the reference.
export function noteExport(kind, slug = null, count = 0) {
  const k = `${kind}|${slug ?? ""}|${count}`;
  if (!marks.has(k)) marks.set(k, ask(kind, slug, count));
  return marks.get(k);
}

// For a print view: { status: "wait" | "ok" | "denied", mark, message }.
export function useExportMark(kind, slug, count) {
  const [state, setState] = useState({ status: "wait", mark: null, message: null });
  useEffect(() => {
    let live = true;
    noteExport(kind, slug, count).then((m) => {
      if (!live) return;
      if (m && m.ok === false) setState({ status: "denied", mark: null, message: EXPORT_DENIED[m.reason] ?? EXPORT_DENIED.export_limit });
      else setState({ status: "ok", mark: m, message: null });
    });
    return () => { live = false; };
  }, [kind, slug, count]);
  return state;
}

// Tests only.
export function resetExportMarks() { marks.clear(); }

// What this account may still open: { kind, today, day_limit, week, week_limit, school_total, school_limit,
// opened_today: [slug], opened_week: [slug] } or null (no backend, example data, migration 0036 not run yet).
export async function loadBankQuota() {
  if (!supabase || isDemo()) return null;
  try {
    const { data, error } = await supabase.rpc("bank_quota");
    return error ? null : data ?? null;
  } catch {
    return null;
  }
}

// One short sentence for the booklet pickers. Pure.
export function quotaLine(q) {
  if (!q || !Number.isFinite(q.day_limit)) return "";
  const parts = [`Hoy abriste ${q.today} de ${q.day_limit} cuadernillos`];
  if (Number.isFinite(q.school_limit)) parts.push(`tu colegio lleva ${q.school_total} de ${q.school_limit} en la prueba`);
  return `${parts.join("; ")}. Volver a abrir uno que ya abriste esta semana no cuenta.`;
}

export function useBankQuota(refresh) {
  const [q, setQ] = useState(null);
  useEffect(() => {
    let live = true;
    loadBankQuota().then((v) => live && setQ(v));
    return () => { live = false; };
  }, [refresh]);
  return q;
}
