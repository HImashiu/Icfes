// The landing's «Practicar gratis» links to /app/?empezar=1 (or #empezar): sign in if needed and go straight to a
// first question. The wish is kept in this tab (sessionStorage) so it survives the round trip to Google.
const KEY = "condor:quick";

export function readQuickStart() {
  if (typeof window === "undefined") return false;
  try {
    const asked = window.location.hash.split("?")[0] === "#empezar" || new URLSearchParams(window.location.search).has("empezar");
    if (asked) sessionStorage.setItem(KEY, "1");
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// A past-exam page («Presentar el ICFES 2019-1») adds ?cuadernillo=<slug>: that booklet opens in Nuevo simulacro.
const EXAM = "condor:quick-exam";
export function readQuickExam() {
  if (typeof window === "undefined") return null;
  try {
    const slug = new URLSearchParams(window.location.search).get("cuadernillo");
    if (slug && /^[A-Za-z0-9_-]{2,60}$/.test(slug)) sessionStorage.setItem(EXAM, slug);
    return sessionStorage.getItem(EXAM);
  } catch {
    return null;
  }
}

// An area card on the landing («Matemáticas · 970+ preguntas») adds ?area=<slug>: the first practice is five questions
// of that test. Returns the test id of lib/saber11.js (ma, lc, sc, cn, in).
const AREA = "condor:quick-area";
export const AREA_SLUGS = { matematicas: "ma", "lectura-critica": "lc", "sociales-y-ciudadanas": "sc", "ciencias-naturales": "cn", ingles: "in" };
export function readQuickArea() {
  if (typeof window === "undefined") return null;
  try {
    const slug = new URLSearchParams(window.location.search).get("area");
    if (slug && AREA_SLUGS[slug]) sessionStorage.setItem(AREA, AREA_SLUGS[slug]);
    return sessionStorage.getItem(AREA);
  } catch {
    return null;
  }
}

export function clearQuickStart() {
  try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(EXAM); sessionStorage.removeItem(AREA); } catch { /* blocked */ }
  try {
    const q = new URLSearchParams(window.location.search);
    const had = q.has("empezar") || q.has("cuadernillo") || q.has("area");
    q.delete("empezar");
    q.delete("cuadernillo");
    q.delete("area");
    if (had || window.location.hash === "#empezar") {
      const search = q.toString();
      history.replaceState(null, "", window.location.pathname + (search ? `?${search}` : "") + (window.location.hash === "#empezar" ? "" : window.location.hash));
    }
  } catch { /* nothing to tidy */ }
}

// Facebook, Instagram, Messenger, TikTok… open links in their own browser, and Google refuses to sign in there
// (error 403 disallowed_useragent). Those visitors are asked to open the page in Chrome or Safari first.
export function inAppBrowser() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const app = /FBAN|FBAV|FB_IAB|FBIOS|FB4A/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram" : /musical_ly|TikTok|Bytedance/i.test(ua) ? "TikTok"
    : /Line\//.test(ua) ? "Line" : /; wv\)/.test(ua) ? "esta app" : null;
  if (!app) return null;
  return { app, android: /Android/i.test(ua), ios: /iPhone|iPad|iPod/i.test(ua) };
}

// Android: a link that asks the phone to open this same page in Chrome.
export function chromeIntent(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
