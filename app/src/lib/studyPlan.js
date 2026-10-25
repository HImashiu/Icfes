// Mi plan: a week of practice built from the student's goal (exam date, daily XP, target score) and their own
// results per area. The weakest areas get more days; the phase depends on how far the exam is. Each day is ticked
// off by itself when the history shows practice of that kind that day. Pure, no storage of its own.
import { AREA_SUBJECT } from "./teaching.js";

const DAY = 864e5;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const AREAS = Object.keys(AREA_SUBJECT);

export const PHASES = {
  base: { label: "Construir bases", help: "Faltan más de 3 meses: practica por área, sin prisa, y entiende cada error." },
  intensive: { label: "Ritmo de examen", help: "Faltan de 1 a 3 meses: mezcla áreas con cronómetro y un simulacro por semana." },
  final: { label: "Recta final", help: "Falta menos de un mes: simulacros completos, repaso de errores y descanso antes del día." },
  open: { label: "Sin fecha", help: "Pon la fecha de tu examen en Mi meta y el plan se ajusta a cuánto falta." },
};
export function phaseOf(daysLeft) {
  if (daysLeft == null || daysLeft < 0) return "open";
  if (daysLeft > 90) return "base";
  if (daysLeft > 30) return "intensive";
  return "final";
}

// areas: practiceInsights().areas ({ name, pct, answered }). Areas never practiced count as weak (50 %).
// Weight = room to grow; the weakest area appears up to three times a week, every area at least once.
export function areaRotation(areas = [], available = AREAS) {
  const pct = new Map(areas.map((a) => [a.name, a.pct]));
  const list = available.map((name) => ({ name, pct: pct.has(name) ? pct.get(name) : 50 })).sort((a, b) => a.pct - b.pct);
  const slots = [];
  list.forEach((a, i) => { slots.push(a.name); if (i < 2) slots.push(a.name); if (i === 0) slots.push(a.name); });
  // Spread repeats so the same area is not on two days in a row when it can be avoided.
  const out = [];
  const pool = [...slots];
  while (pool.length) {
    const i = pool.findIndex((n) => n !== out[out.length - 1]);
    out.push(...pool.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

// One week, Monday first. Each day: { date, kind, area?, questions, minutes, label, done, today, past }.
// kind: "area" (practice one area), "mix" (mixed timed), "errors" (error notebook), "simulacro" (one full session), "rest".
export function weekPlan({ goal = {}, insights = { areas: [] }, history = [], pendingErrors = 0, now = Date.now(), daysLeft = null } = {}) {
  const phase = phaseOf(daysLeft);
  const monday = dayStart(now) - ((new Date(now).getDay() + 6) % 7) * DAY;
  const rot = areaRotation(insights.areas);
  const perDay = Math.max(5, Math.round((goal.dailyXp ?? 100) / 10)); // +10 XP per right answer ≈ questions a day
  const plan = [];
  let r = 0;
  for (let i = 0; i < 7; i++) {
    const date = monday + i * DAY;
    let item;
    if (i === 6) item = phase === "final" ? { kind: "rest", label: "Descanso: repasa tus notas, sin preguntas nuevas" } : { kind: "errors", label: "Repaso de tu cuaderno de errores" };
    else if (i === 5 && phase !== "base") item = { kind: "simulacro", label: "Simulacro: una sesión completa con tiempo" };
    else if (i === 2 && pendingErrors >= 5) item = { kind: "errors", label: "Repaso de tu cuaderno de errores" };
    else if (phase === "final" && i % 2 === 1) item = { kind: "mix", label: "Mezcla de áreas con cronómetro" };
    else { const area = rot[r++ % rot.length]; item = { kind: "area", area, label: `${AREA_SUBJECT[area] ?? area}` }; }
    const questions = item.kind === "simulacro" ? null : item.kind === "rest" ? 0 : item.kind === "errors" ? Math.min(perDay, Math.max(5, pendingErrors)) : perDay;
    const minutes = item.kind === "simulacro" ? 270 : item.kind === "rest" ? 0 : Math.round(questions * 2);
    plan.push({ ...item, date, questions, minutes, done: doneOn(history, date, item), today: date === dayStart(now), past: date < dayStart(now) });
  }
  const due = plan.filter((d) => d.kind !== "rest" && (d.past || d.today));
  return { phase, ...PHASES[phase], days: plan, perDay, done: due.filter((d) => d.done).length, due: due.length, today: plan.find((d) => d.today) ?? null };
}

// A day counts as done when the history has, that day: a session in the area (area), anything timed (mix),
// a repechaje / notebook round (errors) or a full-booklet timed session (simulacro).
export function doneOn(history, date, item) {
  const rows = history.filter((h) => dayStart(h.at) === date);
  if (item.kind === "rest") return true;
  if (item.kind === "area") return rows.some((h) => (h.perArea ?? []).some((a) => a.name === item.area && a.answered > 0));
  if (item.kind === "mix") return rows.some((h) => h.mode === "timed" || (h.perArea ?? []).filter((a) => a.answered > 0).length > 1);
  if (item.kind === "errors") return rows.some((h) => h.snapshot?.repechaje || h.snapshot?.custom?.label?.startsWith("Errores"));
  if (item.kind === "simulacro") return rows.some((h) => h.mode === "timed" && (h.snapshot?.scope ?? "all") === "all" && !h.snapshot?.keys && h.total >= 100);
  return false;
}
