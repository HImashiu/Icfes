// Feedback from the public demo: question flags ("needs fixing"), general comments and the launch-discount waitlist.
// These go to the backend when it is configured, so the owner can read them in the Supabase dashboard. Without a
// backend (or if the write fails) they are kept in this browser, and the caller still says "saved".
import { backendConfigured, supabase } from "./supabase.js";
import { addReport } from "./local.js";

const LOCAL_KEY = "condor:public-feedback";
const WAITLIST_KEY = "condor:waitlist";

function readLocal(key) {
  try { const v = JSON.parse(window.localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeLocal(key, list) {
  try { window.localStorage.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
}
const clientTag = () => {
  try { return window.innerWidth < 768 ? "phone" : "desktop"; } catch { return null; }
};

// Keeps a copy in the browser first, so nothing is lost if the network fails; then tries the backend.
// Before migration 0033 the table has no category or exam_slug column: the row is sent without them, so nothing is lost.
async function send(row) {
  writeLocal(LOCAL_KEY, [...readLocal(LOCAL_KEY), { ...row, at: new Date().toISOString() }].slice(-200));
  if (!backendConfigured) return { stored: "browser" };
  let { error } = await supabase.from("public_feedback").insert({ ...row, client: clientTag() });
  if (error && /category|exam_slug/.test(error.message ?? "")) {
    const { category, exam_slug, ...older } = row; // eslint-disable-line no-unused-vars
    ({ error } = await supabase.from("public_feedback").insert({ ...older, client: clientTag() }));
  }
  return error ? { stored: "browser", error: error.message } : { stored: "server" };
}

// The reasons a student can pick when reporting a question (the editor sees the same id in question_reports).
export const REPORT_REASONS = [
  { id: "format", label: "Formato o texto mal escrito" },
  { id: "key", label: "La respuesta correcta no es esa" },
  { id: "figure", label: "Falta o está mal una figura o gráfica" },
  { id: "options", label: "Las opciones están mal" },
  { id: "other", label: "Otra cosa" },
];

// kind: "question" (with exam, question key and number) or "general".
export function sendFeedback({ kind, message, exam = null, questionKey = null, questionNumber = null, contact = null, slug = null, category = null }) {
  const text = String(message ?? "").trim().slice(0, 2000);
  const reason = REPORT_REASONS.find((r) => r.id === category)?.id ?? null;
  if (!text && !reason) return Promise.resolve({ stored: null, error: "empty" });
  // Question flags also appear in Perfil › Mis reportes de errores, as before.
  if (kind === "question") addReport({ slug, question: questionKey, number: questionNumber, exam: exam ?? "", note: text, category: reason });
  return send({
    kind,
    message: text || (REPORT_REASONS.find((r) => r.id === reason)?.label ?? ""),
    category: reason,
    exam_slug: slug ? String(slug).slice(0, 80) : null,
    exam: exam ? String(exam).slice(0, 200) : null,
    question_key: questionKey ? String(questionKey).slice(0, 200) : null,
    question_number: Number.isInteger(questionNumber) ? questionNumber : null,
    contact: contact ? String(contact).trim().slice(0, 200) : null,
  });
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The discount waitlist: one address, kept once. Returns true when the address is recorded.
export async function joinWaitlist(email, source = "demo") {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(clean) || clean.length > 200) return false;
  writeLocal(WAITLIST_KEY, ["joined"]); // only the fact is kept in the browser, not the address
  if (!backendConfigured) return true;
  const { error } = await supabase.rpc("join_launch_waitlist", { p_email: clean, p_source: source });
  return !error;
}

export function waitlisted() {
  return readLocal(WAITLIST_KEY).length > 0;
}
