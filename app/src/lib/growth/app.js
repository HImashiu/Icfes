// The app's side of the growth engine (docs/growth/LEDGER.md): funnel milestones, invitations, study groups,
// practice reminders, the install prompt and the calls behind the growth cards. Server side: migration 0050.
// Every call that only measures fails quietly; calls the student asked for (join a group, make a certificate) throw,
// so the screen can say what happened.
import { supabase } from "../supabase.js";
import { visitorId } from "../usage.js";
import { installErrorReporting, track, trackOnce } from "./events.js";

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } };

export async function call(name, args = {}) {
  if (!supabase) throw new Error("sin_servidor");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "error");
  return data;
}
const quiet = (name, args) => call(name, args).catch(() => null);

// ------------------------------------------------------------------------------------------------ F2 funnel, F8 ref
// Run once when the app loads: errors are reported, the visit counts, and an invitation code in the address
// (?ref=ana-k7d&via=amigo, also passed on by the site from condor:ref) is kept for after sign-in.
export function bootGrowth() {
  if (typeof window === "undefined") return;
  installErrorReporting();
  const q = new URLSearchParams(window.location.search);
  const ref = (q.get("ref") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  if (ref) set("condor:ref", JSON.stringify({ code: ref, via: q.get("via") || "amigo", at: Date.now() }));
  track("app:open", { src: q.get("fuente") || q.get("utm_source") || null, ref: ref ? 1 : 0 });
}

// The sign-in button was pressed (the site uses it to offer a way back if the sign-in never finished).
export function noteAuthStart() {
  set("condor:auth-start", String(Date.now()));
  track("auth:start", {});
}

// Signed in: milestone, flags for the site's banners, and the invitation claimed (once, only new accounts qualify).
export async function onSignedIn(profile) {
  set("condor:signed", "1");
  set("condor:auth-done", "1");
  if (profile?.full_name) set("condor:first-name", String(profile.full_name).split(" ")[0].slice(0, 20));
  trackOnce("auth:done", { role: profile?.role ?? null });
  let ref = null;
  try { ref = JSON.parse(get("condor:ref") || "null"); } catch { ref = null; }
  if (!ref?.code || Date.now() - (ref.at ?? 0) > 30 * 864e5) return null;
  const r = await quiet("claim_referral", { p_code: ref.code, p_via: ref.via || "amigo" });
  if (r && r !== "not_signed_in") del("condor:ref");
  if (r === "ok") track("ref:claimed", { via: ref.via || "amigo" });
  return r;
}
export const noteConsent = () => trackOnce("consent:ok", {});
export const notePracticeDone = (props) => track("practice:done", props);

// ------------------------------------------------------------------------------------------------ F8, F9 invitations
export const myReferralCode = () => call("my_referral_code");
export const myReferrals = () => call("my_referrals");
const SITE = typeof window !== "undefined" ? `${window.location.origin}/` : "https://condoricfes.com/";
export const inviteLink = (code, via = "amigo") => (via === "amigo" ? `${SITE}r/${code}` : `${SITE}?ref=${code}&via=${via}`);
export const whatsapp = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export function inviteMessage(code, name) {
  return `${name ? `${name} te invita: ` : ""}practica el ICFES con preguntas reales en Cóndor. Con mi enlace los dos tenemos preguntas extra al día: ${inviteLink(code)}`;
}
export function teacherMessage(code) {
  return `Profe, estoy practicando el ICFES en Cóndor con preguntas reales de cuadernillos del ICFES. Tiene un espacio para docentes con diagnóstico del curso, tareas por prueba y simulacros en papel. Se lo recomiendo: ${SITE}prueba-docente/?ref=${code}&via=profe`;
}

// ------------------------------------------------------------------------------------------------ F11 study groups
export const myStudyGroups = () => call("my_study_groups");
export const createStudyGroup = (name, goal, display) => call("create_study_group", { p_name: name, p_goal: goal, p_display: display });
export const joinStudyGroup = (code, display) => call("join_study_group", { p_code: code, p_display: display });
export const leaveStudyGroup = (id) => call("leave_study_group", { p_group: id });
export const studyGroupPreview = (code) => call("study_group_preview", { p_code: code });
export const groupLink = (code) => `${SITE}app/#parche/${code}`;

// ------------------------------------------------------------------------------------------------ F29 notices, F48 school
export const activeNotices = () => quiet("active_notices", { p_audience: "app" }).then((x) => x ?? []);
export const mySchoolName = () => quiet("my_school_name");
export const setMySchoolName = (name, city) => call("set_my_school_name", { p_name: name, p_city: city });

// ------------------------------------------------------------------------------------------------ F39 certificate, F40 family
export const certificateProgress = () => call("certificate_progress");
export const issueCertificate = (name) => call("issue_certificate", { p_name: name });
export const certificateLink = (code) => `${SITE}verificar/?c=${code}`;
export const createMyFamilyReport = (payload) => call("create_my_family_report", { p_payload: payload });

// ------------------------------------------------------------------------------------------------ F43-F45 surveys, F31
export async function answerSurvey(survey, answer) {
  const r = await call("answer_survey", { p_survey: survey, p_visitor: visitorId(), p_answer: answer });
  set(`condor:survey:${survey}`, String(Date.now()));
  track("survey", { s: survey });
  return r;
}
export const surveyDone = (survey) => !!get(`condor:survey:${survey}`);
export const snoozeSurvey = (survey, days = 14) => set(`condor:survey-snooze:${survey}`, String(Date.now() + days * 864e5));
export const surveySnoozed = (survey) => Number(get(`condor:survey-snooze:${survey}`) || 0) > Date.now();
export const submitTestimonial = (name, detail, body) => call("submit_testimonial", { p_name: name, p_detail: detail, p_body: body, p_consent: true });

// ------------------------------------------------------------------------------------------------ F10 partners
export const partnerStats = () => call("partner_stats");

// ------------------------------------------------------------------------------------------------ F36 first steps, F35 welcome back
// What a new student has done, from this browser: the checklist ticks itself.
export function firstSteps({ answered, hasGoal, invited, installed, grouped }) {
  return [
    { id: "q1", label: "Responde tu primera pregunta", done: answered >= 1 },
    { id: "q5", label: "Llega a 5 preguntas", done: answered >= 5 },
    { id: "goal", label: "Pon la fecha de tu examen y tu meta", done: hasGoal },
    { id: "group", label: "Arma un parche de estudio o invita a un amigo", done: invited || grouped },
    { id: "install", label: "Instala Cóndor en tu celular", done: installed },
  ];
}
// Days since the last visit before this one (kept per browser); the welcome-back card shows from 3 days away.
export function daysAway(now = Date.now()) {
  const last = Number(get("condor:last-open") || 0);
  const seen = sessionStorageGet("condor:away");
  if (seen != null) return Number(seen);
  const away = last ? Math.floor((now - last) / 864e5) : 0;
  sessionStorageSet("condor:away", String(away));
  set("condor:last-open", String(now));
  return away;
}
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } }
export const answeredHere = () => Number(get("condor:answered") || 0);

// ------------------------------------------------------------------------------------------------ F32 install, F34 push
let deferredInstall = null;
const installListeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; installListeners.forEach((f) => f(true)); });
  window.addEventListener("appinstalled", () => { set("condor:installed", "1"); deferredInstall = null; track("pwa:installed", {}); installListeners.forEach((f) => f(false)); });
}
export const isInstalled = () => get("condor:installed") === "1" || (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches);
export const canInstall = () => !!deferredInstall;
export const onInstallChange = (f) => { installListeners.add(f); return () => installListeners.delete(f); };
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const choice = await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  track("pwa:prompt", { ok: choice?.outcome === "accepted" });
  return choice?.outcome === "accepted";
}
export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

// The service worker only shows practice reminders (it caches nothing, so a new deploy is never stuck behind it).
export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || window.location.protocol !== "https:") return null;
  try { return await navigator.serviceWorker.register("sw.js", { scope: "./" }); } catch { return null; }
}
export const pushSupported = () => typeof window !== "undefined" && "PushManager" in window && "Notification" in window && "serviceWorker" in navigator;
const fromB64u = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const toB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function pushStatus() {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : Notification.permission === "denied" ? "denied" : "off";
}
// hour: Bogotá time for the reminder (the server sends it at that hour if the student hasn't practiced that day).
export async function enablePush(hour = 18) {
  const res = await fetch("api/push-key");
  if (!res.ok) throw new Error("no_key");
  const { key } = await res.json();
  if ((await Notification.requestPermission()) !== "granted") throw new Error("denied");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) throw new Error("no_sw");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  const j = sub.toJSON();
  await call("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh ?? toB64u(sub.getKey("p256dh")), p_auth: j.keys.auth ?? toB64u(sub.getKey("auth")), p_hour: hour, p_visitor: visitorId() });
  track("push:on", { h: hour });
  return true;
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await quiet("remove_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
  track("push:off", {});
}
