// Pure logic of the public growth tools (diagnóstico, calculadora inversa, plan de estudio, cuenta regresiva,
// calendario .ics, búsqueda). Shared by the site bundle (site-src/tools.js, built with esbuild into site-dist/tools.js)
// and the app, and tested in tests/growth-tools.test.js. No DOM, no storage.

export const TEST_IDS = ["lc", "ma", "sc", "cn", "in"];
export const TEST_NAMES = { lc: "Lectura crítica", ma: "Matemáticas", sc: "Sociales y ciudadanas", cn: "Ciencias naturales", in: "Inglés" };
export const WEIGHTS = { lc: 3, ma: 3, sc: 3, cn: 3, in: 1 };
// The app's ?area= slugs (lib/quickStart.js AREA_SLUGS).
export const AREA_SLUG = { lc: "lectura-critica", ma: "matematicas", sc: "sociales-y-ciudadanas", cn: "ciencias-naturales", in: "ingles" };
// Questions per test in the real exam (ICFES guía 2026), for the inverse calculator.
export const REAL_COUNTS = { lc: 41, ma: 50, sc: 50, cn: 58, in: 55 };

// ------------------------------------------------------------------------------------------------ score tables
// Built in node from lib/saber11.js (scoreTest) and embedded in the page: table[test][k] = [scale, low, high] for k
// right out of n. The browser then needs no IRT code.
export function buildScoreTables(scoreTest, n) {
  const out = {};
  for (const id of TEST_IDS) {
    const name = TEST_NAMES[id];
    const count = typeof n === "number" ? n : n[id];
    out[id] = Array.from({ length: count + 1 }, (_, k) => {
      const r = scoreTest({ name, correct: k, total: count });
      return [r.scale ?? 0, r.low ?? 0, r.high ?? 0];
    });
  }
  return out;
}

export const globalOf = (scales) => {
  let w = 0, s = 0;
  for (const id of TEST_IDS) if (scales[id] != null) { w += WEIGHTS[id]; s += WEIGHTS[id] * scales[id]; }
  return w ? Math.round((5 * s) / w) : null;
};

// perArea: { lc: [right, total], ... } → estimated global with a range, per-test scores, the weakest test.
export function diagnosticResult(perArea, tables) {
  const areas = [];
  const mid = {}, lo = {}, hi = {};
  for (const id of TEST_IDS) {
    const got = perArea[id];
    if (!got || !got[1]) continue;
    const row = tables[id]?.[Math.min(got[0], tables[id].length - 1)];
    if (!row) continue;
    mid[id] = row[0]; lo[id] = row[1]; hi[id] = row[2];
    areas.push({ id, name: TEST_NAMES[id], right: got[0], total: got[1], scale: row[0], low: row[1], high: row[2], pct: Math.round((got[0] / got[1]) * 100) });
  }
  const global = globalOf(mid);
  const low = globalOf(lo), high = globalOf(hi);
  // Weakest: lowest share right, the heavier test first on ties (it moves the global three times more).
  const weakest = [...areas].sort((a, b) => a.pct - b.pct || WEIGHTS[b.id] - WEIGHTS[a.id])[0] ?? null;
  const right = areas.reduce((n, a) => n + a.right, 0), total = areas.reduce((n, a) => n + a.total, 0);
  return { global, low: low != null ? Math.min(low, global) : null, high: high != null ? Math.max(high, global) : null, areas, weakest, right, total };
}

// Share-preview bucket of a global score (the worker picks og/diagnostico-<bucket>.png): 25-point steps 150..450.
export const scoreBucket = (g) => (Number.isFinite(g) ? Math.max(150, Math.min(450, Math.round(g / 25) * 25)) : null);

// ------------------------------------------------------------------------------------------------ inverse calculator
// How many right answers out of the real count each test needs for a target 0-100 score. tables: built with
// REAL_COUNTS. Returns the smallest k whose estimated scale reaches the target, or null if none does.
export function rightNeeded(table, target) {
  for (let k = 0; k < table.length; k++) if (table[k][0] >= target) return k;
  return null;
}

// A target global (0-500), spread as the same score on every test (global = 5 × that score), or per-test targets.
export function inversePlan(tables, { global = null, perTest = null } = {}) {
  const targets = {};
  for (const id of TEST_IDS) targets[id] = perTest?.[id] ?? (global != null ? Math.min(100, Math.max(0, global / 5)) : null);
  return TEST_IDS.map((id) => {
    const t = targets[id];
    const k = t == null ? null : rightNeeded(tables[id], Math.round(t));
    const n = tables[id].length - 1;
    return { id, name: TEST_NAMES[id], target: t == null ? null : Math.round(t), right: k, total: n, pct: k == null ? null : Math.round((k / n) * 100) };
  });
}

// ------------------------------------------------------------------------------------------------ dates
const DAY = 864e5;
export const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const parseDay = (iso) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Time left until `target` (ms epoch). Negative spans give zeros and done = true.
export function countdown(target, now = Date.now()) {
  const ms = Math.max(0, target - now);
  return { done: ms === 0, days: Math.floor(ms / DAY), hours: Math.floor((ms % DAY) / 36e5), minutes: Math.floor((ms % 36e5) / 6e4), seconds: Math.floor((ms % 6e4) / 1e3) };
}

// ------------------------------------------------------------------------------------------------ study plan
// Weeks from `start` to the exam. Phases as in the app's Mi plan (lib/studyPlan.js): más de 12 semanas "Bases",
// 4 a 12 "Ritmo de examen", las últimas 4 "Recta final". Each week focuses on one test, the weak ones twice as often;
// from the second phase a timed simulacro every other week, every week in the final one. minutes: per study day.
export function planWeeks({ start, exam, days = 4, minutes = 45, weak = [] }) {
  const s = parseDay(start), e = parseDay(exam);
  const total = Math.max(1, Math.ceil((e - s) / (7 * DAY)));
  const weeks = Math.min(total, 52);
  const order = [...weak.filter((id) => TEST_IDS.includes(id)), ...TEST_IDS.filter((id) => !weak.includes(id))];
  const rotation = [];
  order.forEach((id) => { rotation.push(id); if (weak.includes(id)) rotation.push(id); });
  // Spread repeats so the same test is not two weeks in a row when it can be avoided.
  for (let i = 1; i < rotation.length; i++) {
    if (rotation[i] === rotation[i - 1]) {
      const j = rotation.findIndex((x, k) => k > i && x !== rotation[i]);
      if (j > 0) [rotation[i], rotation[j]] = [rotation[j], rotation[i]];
    }
  }
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const left = total - w; // weeks to the exam, this one included
    const phase = left > 12 ? "bases" : left > 4 ? "ritmo" : "final";
    const focus = rotation[w % rotation.length];
    const simulacro = phase === "final" || (phase === "ritmo" && w % 2 === 1);
    const qPerDay = Math.max(5, Math.round(minutes / 2.5));
    const from = new Date(s.getTime() + w * 7 * DAY);
    out.push({
      week: w + 1, from: isoDay(from), phase, focus, focusName: TEST_NAMES[focus], simulacro,
      tasks: [
        `${days - (simulacro ? 1 : 0)} días de ${minutes} min: ${qPerDay} preguntas de ${TEST_NAMES[focus]}${phase === "bases" ? " sin reloj, entendiendo cada error" : " con tiempo"}`,
        simulacro ? (phase === "final" ? "Un simulacro completo (sesión 1 o 2) con el tiempo real" : "Un simulacro de una sesión con el tiempo real") : "Un día de repaso de las preguntas que fallaste",
        left <= 1 ? "Descansa el día antes y revisa tu citación" : phase === "final" ? "Repasa fórmulas y tus errores más repetidos" : "Mezcla 10 preguntas de las otras pruebas",
      ],
    });
  }
  return { weeks: out, totalWeeks: total, truncated: total > weeks };
}

// ------------------------------------------------------------------------------------------------ calendar files
const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const icsDate = (iso) => iso.replace(/-/g, "");
const fold = (line) => {
  // RFC 5545: lines of at most 75 octets, continued with a space.
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ` ${ch}`; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
};
const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

// events: [{ uid, date: "2027-03-14" (all day) | start: "2027-03-14T07:00", minutes, title, description, url, rrule?, alarm? }]
// Times are Bogotá local (no daylight saving: a fixed −05:00 offset as TZID America/Bogota with its VTIMEZONE).
export function icsCalendar(name, events, now = Date.now()) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Condor//Saber 11//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, "X-WR-TIMEZONE:America/Bogota",
    "BEGIN:VTIMEZONE", "TZID:America/Bogota", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0500", "TZNAME:-05", "END:STANDARD", "END:VTIMEZONE",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@condoricfes.com`, `DTSTAMP:${stamp(now)}`);
    if (e.date) {
      const next = isoDay(parseDay(e.date).getTime() + DAY + 3600e3);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
    } else {
      const [d, t] = e.start.split("T");
      const startMin = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + (e.minutes ?? 30);
      const endT = `${String(Math.floor(startMin / 60) % 24).padStart(2, "0")}${String(startMin % 60).padStart(2, "0")}00`;
      lines.push(`DTSTART;TZID=America/Bogota:${icsDate(d)}T${t.replace(":", "")}00`, `DTEND;TZID=America/Bogota:${icsDate(d)}T${endT}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description + (e.url ? `\n${e.url}` : ""))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarm != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${e.alarm}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
// A weekly practice reminder until the exam: days = indexes 0 (Monday) .. 6, time "18:30", deep link into the app.
export function practiceReminders({ days = [0, 2, 4], time = "18:30", minutes = 30, until, url, start = isoDay(Date.now()) }) {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort();
  if (!sorted.length) return [];
  // First occurrence: the first chosen weekday on or after start.
  const s = parseDay(start);
  let first = s;
  for (let i = 0; i < 7; i++) {
    const d = new Date(s.getTime() + i * DAY + 3600e3);
    if (sorted.includes((d.getDay() + 6) % 7)) { first = d; break; }
  }
  return [{
    uid: `practica-${sorted.join("")}-${time.replace(":", "")}`,
    start: `${isoDay(first)}T${time}`, minutes,
    title: "Practicar ICFES en Cóndor",
    description: `${minutes} minutos de preguntas reales del Saber 11. Abre la app y sigue tu plan.`,
    url,
    rrule: `FREQ=WEEKLY;BYDAY=${sorted.map((d) => BYDAY[d]).join(",")}${until ? `;UNTIL=${icsDate(until)}T235959Z` : ""}`,
    alarm: 10,
  }];
}

// ------------------------------------------------------------------------------------------------ search
export const fold2 = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const STOP = new Set(["de", "la", "el", "en", "y", "a", "los", "las", "del", "para", "con", "por", "que", "un", "una", "como", "cual", "es", "mi", "se", "lo", "al"]);
export const terms = (q) => fold2(q).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1 && !STOP.has(w));

// pages: [{ u: path, t: title, d: description, k?: extra keywords }]. Title hits weigh most, prefix matches count.
export function searchPages(pages, query, limit = 12) {
  const qs = terms(query);
  if (!qs.length) return [];
  const scored = [];
  for (const p of pages) {
    const t = fold2(p.t), d = fold2(`${p.d ?? ""} ${p.k ?? ""}`), u = fold2(p.u.replace(/[-/]/g, " "));
    let s = 0, all = true;
    for (const w of qs) {
      const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      const hit = (re.test(t) ? 6 : 0) + (re.test(u) ? 3 : 0) + (re.test(d) ? 2 : 0);
      if (!hit) all = false;
      s += hit;
    }
    if (s > 0) scored.push({ p, s: s + (all ? 10 : 0) - p.u.split("/").length * 0.1 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}
