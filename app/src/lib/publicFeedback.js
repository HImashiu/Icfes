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
async function send(row) {
  writeLocal(LOCAL_KEY, [...readLocal(LOCAL_KEY), { ...row, at: new Date().toISOString() }].slice(-200));
  if (!backendConfigured) return { stored: "browser" };
  const { error } = await supabase.from("public_feedback").insert({ ...row, client: clientTag() });
  return error ? { stored: "browser", error: error.message } : { stored: "server" };
}

// kind: "question" (with exam, question key and number) or "general".
export function sendFeedback({ kind, message, exam = null, questionKey = null, questionNumber = null, contact = null, slug = null }) {
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) return Promise.resolve({ stored: null, error: "empty" });
  // Question flags also appear in Perfil › Mis reportes de errores, as before.
  if (kind === "question") addReport({ slug, question: questionKey, number: questionNumber, exam: exam ?? "", note: text });
  return send({
    kind,
    message: text,
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
