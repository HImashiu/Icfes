// Cóndor's service worker (F32, F34 in docs/growth/LEDGER.md). It only shows the daily practice reminder that
// worker/growth.js sends by Web Push, and opens the app when it is tapped. It caches nothing on purpose: every deploy
// reaches students right away, and a broken cache can never keep anyone on an old version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const LINES = [
  "Tus 5 preguntas del día te esperan. Son 5 minutos.",
  "Un ratico de ICFES hoy y mañana vas más tranquilo.",
  "¿Una pregunta real del Saber 11 antes de dormir?",
  "Tu racha te espera: responde una pregunta hoy.",
];
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const body = data.body || LINES[new Date().getDate() % LINES.length];
  event.waitUntil(self.registration.showNotification(data.title || "Cóndor · Saber 11", {
    body, tag: "practica-diaria", renotify: false,
    icon: "brand/icon-192.png", badge: "brand/icon-192.png",
    data: { url: data.url || "./?empezar=1&fuente=push" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); return open.navigate(url).catch(() => null); }
    return self.clients.openWindow(url);
  })());
});
