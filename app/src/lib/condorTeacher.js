// Profesor Cóndor: the teacher of students who have none (an independent account, or a school student no class has
// added yet). Every day it leaves tasks in Tareas, decided by fixed rules from the student's goal (exam date, daily XP,
// target score) and their own answers. No model, no randomness that is not seeded: the same history and the same day
// always give the same tasks. Pure functions; App.jsx opens the booklet and starts the practice.
//
// What a day holds:
//   1. The day of Mi plan (studyPlan.js weekPlan): practice of one area, a timed mix, the error notebook, a simulacro
//      or rest. The weakest areas come up more often; how far the exam is sets the phase.
//   2. An area with fewer than DIAGNOSTIC_MIN first answers is measured first ("Diagnóstico"), so the rest of the
//      plan rests on data, not on a guess.
//   3. Spaced review: every question missed comes back after 1, 3, 7 and 14 days (Leitner boxes). A right answer
//      moves it one box up, a miss sends it back to the first. After the fourth right in a row it is learned.
// The plan is computed from the history before today, so it does not move while the student works through it.
// Practice questions still count against the daily allowance (practiceQuota.js) and the bank limits (bank_open).
import { AREA_SUBJECT, contextColor } from "./teaching.js";
import { PHASES, weekPlan } from "./studyPlan.js";
import { practiceInsights } from "./student.js";
import { pickKeys, questionHistory } from "./customPractice.js";
import { expectedScale } from "./saber11.js";

const DAY = 864e5;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const CONDOR_NAME = "Profesor Cóndor";
export const CONDOR_SUBJECT = { id: "condor", name: CONDOR_NAME, teacher: null, color: "var(--accent)", kind: "condor" };
export const AREAS = Object.keys(AREA_SUBJECT);
export const DIAGNOSTIC_MIN = 10; // first answers an area needs before the plan trusts its share right
export const INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14 }; // days until a question in box n comes back; box 5 = learned
export const LEARNED_BOX = 5;
export const REVIEW_MIN = 3; // fewer due questions than this wait for the next day (or the notebook day)

// Stable 32-bit hash of a string (FNV-1a): the seed that makes the same task pick the same questions.
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0 || 1;
}

// ---------------------------------------------------------------------------------------------- spaced repetition

// Every question the student has missed at least once, with its Leitner box and when it is due again.
// history: loadHistory() rows (any order). Returns [{ slug, key, box, last, due, lapses }], due first.
export function reviewQueue(history = []) {
  const items = new Map();
  for (const e of [...history].filter((h) => h.snapshot?.slug && h.keyed !== false).sort((a, b) => a.at - b.at)) {
    const slug = e.snapshot.slug;
    for (const key of e.missed ?? []) {
      const id = `${slug}|${key}`;
      const it = items.get(id) ?? { slug, key, box: 1, last: e.at, lapses: 0 };
      it.box = 1; it.last = e.at; it.lapses += 1;
      items.set(id, it);
    }
    for (const key of e.right ?? []) {
      const it = items.get(`${slug}|${key}`);
      if (!it) continue; // known from the first try: nothing to review
      // Twice in one day counts once: the spacing is what makes it stick.
      if (dayStart(e.at) > dayStart(it.last) || it.box === 1) it.box = Math.min(it.box + 1, LEARNED_BOX);
      it.last = e.at;
    }
  }
  return [...items.values()]
    .map((it) => ({ ...it, due: it.box >= LEARNED_BOX ? null : dayStart(it.last) + INTERVALS[it.box] * DAY }))
    .sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.box - b.box || a.slug.localeCompare(b.slug) || Number(a.key) - Number(b.key));
}

// The questions due on `now`'s day, grouped by booklet. Returns [{ slug, keys, boxes }], biggest group first.
export function dueByBooklet(queue, now = Date.now(), { preferSlug = null, all = false } = {}) {
  const end = dayStart(now);
  const groups = new Map();
  for (const it of queue) {
    if (it.due == null || (!all && it.due > end)) continue;
    const g = groups.get(it.slug) ?? { slug: it.slug, keys: [], boxes: [] };
    g.keys.push(it.key); g.boxes.push(it.box);
    groups.set(it.slug, g);
  }
  return [...groups.values()].sort((a, b) => b.keys.length - a.keys.length || (b.slug === preferSlug) - (a.slug === preferSlug) || a.slug.localeCompare(b.slug));
}

// -------------------------------------------------------------------------------------------------- area needs

// The share right an area needs for the student's target: the global is 5 × the weighted mean of the areas, so a
// target of 300 asks for about 60 points per area; the share right that gives 60 comes from the same score model the
// results use (saber11.js). Cached per area and score.
const shareCache = new Map();
export function shareFor(area, scale) {
  const id = `${area}|${scale}`;
  if (shareCache.has(id)) return shareCache.get(id);
  let share = 1;
  for (let s = 0; s <= 100; s += 1) { if ((expectedScale(area, s / 100) ?? 0) >= scale) { share = s / 100; break; } }
  shareCache.set(id, Math.round(share * 100));
  return shareCache.get(id);
}

// Per area: first-try share right, how many answers it rests on, what the target asks, and the gap.
export function areaNeeds(insights = { areas: [] }, target = 300, available = AREAS) {
  const scale = Math.max(0, Math.min(100, Math.round(target / 5)));
  const by = new Map((insights.areas ?? []).map((a) => [a.name, a]));
  return available.map((name) => {
    const a = by.get(name);
    const goalPct = shareFor(name, scale);
    const pct = a?.answered ? a.pct : null;
    return { name, pct, answered: a?.answered ?? 0, goalPct, gap: pct == null ? null : goalPct - pct, diagnostic: (a?.answered ?? 0) < DIAGNOSTIC_MIN };
  });
}

// "Practica a tu nivel": the difficulties (1 very easy … 5 very hard, bank.js) a task in an area draws first.
export function levelBand(pct) {
  if (pct == null) return [2, 3, 4];
  if (pct < 45) return [1, 2, 3];
  if (pct < 65) return [2, 3, 4];
  return [3, 4, 5];
}
export const bandLabel = (band) => (band[0] <= 1 ? "de fácil a media" : band[2] >= 5 ? "de media a muy difícil" : "de fácil a difícil");

// ----------------------------------------------------------------------------------------------------- the plan

// The tasks of `now`'s day (and a preview of tomorrow). goal: loadGoal(). exams: the booklets the student can open
// (index rows with sections). Returns { phase, label, help, perDay, rest, tasks, tomorrow, needs }.
// Each task: { id, slot, kind, title, why, area, count, mode, slug?, keys?, band?, due_at, opens_at? }.
export function condorDay({ goal = {}, history = [], exams = [], now = Date.now(), daysLeft = null, preferSlug = null } = {}) {
  const today = dayStart(now);
  const before = history.filter((h) => h.at < today);
  const ins = practiceInsights(before, today);
  const open = exams.filter((e) => e.status !== "proximamente");
  const available = AREAS.filter((a) => open.some((e) => (e.sections ?? []).includes(a)));
  const needs = areaNeeds(ins, goal.target ?? 300, available.length ? available : AREAS);
  // Areas never practised count as 50 % in the rotation (studyPlan.js); here they come first as a diagnostic.
  const plan = weekPlan({ goal, insights: { areas: needs.filter((n) => n.pct != null).map((n) => ({ name: n.name, pct: n.pct })) }, history: before, pendingErrors: 0, now, daysLeft });
  const perDay = plan.perDay;
  const due = `${ymd(now)}T23:59:00`;
  const dueIso = new Date(due).toISOString();
  const day = plan.today;
  const tasks = [];
  const id = (slot) => `condor-${ymd(now)}-${slot}`;
  const timed = plan.phase === "final";
  const diag = needs.filter((n) => n.diagnostic);
  const queue = reviewQueue(before);
  const dueGroups = dueByBooklet(queue, now, { preferSlug });

  if (day && day.kind !== "rest") {
    if (day.kind === "simulacro") {
      tasks.push({ id: id("simulacro"), slot: "simulacro", kind: "simulacro", title: "Simulacro: una sesión completa", count: null, mode: "timed",
        why: plan.phase === "final" ? "Falta menos de un mes: un simulacro por semana te acostumbra al tiempo real." : "Faltan de 1 a 3 meses: una sesión completa con tiempo, como el día del examen.", due_at: dueIso });
    } else if (day.kind === "errors" || day.kind === "mix") {
      // Notebook day: every question still in a box, due or not, from the booklet with most.
      const pending = day.kind === "errors" ? dueByBooklet(queue, now, { preferSlug, all: true })[0] : null;
      if (pending && pending.keys.length) {
        tasks.push({ id: id("errores"), slot: "errores", kind: "review", title: "Repaso de tu cuaderno de errores", slug: pending.slug, keys: pending.keys.slice(0, Math.max(perDay, 10)), count: Math.min(pending.keys.length, Math.max(perDay, 10)), mode: "practice",
          why: "Una vez por semana vuelves a las preguntas que aún no dominas, aunque no les toque todavía.", due_at: dueIso });
      } else {
        tasks.push({ id: id("mezcla"), slot: "mezcla", kind: "mix", title: "Mezcla de áreas con cronómetro", count: perDay, mode: "timed",
          why: day.kind === "mix" ? "En la recta final se practica como en el examen: áreas mezcladas y con tiempo." : "No tienes errores pendientes: hoy toca una mezcla con tiempo.", due_at: dueIso });
      }
    } else {
      // An area day. An area without enough answers is measured first; otherwise the area the plan rotates to.
      const d = diag.length ? diag[(Math.floor(today / DAY)) % diag.length] : null;
      const need = needs.find((n) => n.name === (d ? d.name : day.area)) ?? needs[0];
      const band = levelBand(need.pct);
      const subject = AREA_SUBJECT[need.name] ?? need.name;
      tasks.push(d
        ? { id: id("area"), slot: "area", kind: "area", diagnostic: true, area: need.name, title: `Diagnóstico de ${subject}`, count: Math.max(perDay, DIAGNOSTIC_MIN), mode: "practice", band: [1, 2, 3, 4, 5],
          why: `Aún no tengo suficientes respuestas tuyas en ${subject}. Con estas ${Math.max(perDay, DIAGNOSTIC_MIN)} sé por dónde empezar.`, due_at: dueIso }
        : { id: id("area"), slot: "area", kind: "area", area: need.name, title: `Práctica de ${subject}`, count: perDay, mode: timed ? "timed" : "practice", band,
          why: whyArea(need, goal.target ?? 300, plan.phase), due_at: dueIso });
    }
  }

  // Spaced review, on top of the day (not on the notebook day, which already covers it).
  if (!tasks.some((t) => t.slot === "errores") && dueGroups[0]?.keys.length >= REVIEW_MIN) {
    const g = dueGroups[0];
    const n = Math.min(g.keys.length, Math.max(5, Math.round(perDay / 2)), 10);
    tasks.push({ id: id("repaso"), slot: "repaso", kind: "review", title: "Repaso espaciado", slug: g.slug, keys: g.keys.slice(0, n), count: n, mode: "practice",
      why: `${g.keys.length === 1 ? "Una pregunta que fallaste vuelve hoy" : n < g.keys.length ? `${g.keys.length} preguntas que fallaste vuelven hoy; empiezas por las ${n} más atrasadas` : `${g.keys.length} preguntas que fallaste vuelven hoy`}. Repasarlas a 1, 3, 7 y 14 días hace que no se olviden.`, due_at: dueIso });
  }

  const tIdx = plan.days.findIndex((x) => x.today);
  const next = tIdx >= 0 && tIdx < 6 ? plan.days[tIdx + 1] : null;
  const tomorrow = next ? {
    id: `condor-${ymd(today + DAY)}-plan`, title: next.kind === "rest" ? "Descanso" : next.kind === "area" ? `Práctica de ${AREA_SUBJECT[next.area] ?? next.area}` : next.label,
    opens_at: new Date(today + DAY).toISOString(), count: next.questions, kind: next.kind,
  } : null;
  return { phase: plan.phase, ...PHASES[plan.phase], perDay, rest: day?.kind === "rest", tasks, tomorrow, needs, reviewCount: queue.filter((q) => q.due != null).length };
}

function whyArea(need, target, phase) {
  const subject = AREA_SUBJECT[need.name] ?? need.name;
  const base = need.gap != null && need.gap > 0
    ? `En ${subject} vas en ${need.pct} % de aciertos; para ${target} puntos necesitas cerca de ${need.goalPct} %.`
    : `En ${subject} vas en ${need.pct} %, ya cerca de lo que pide tu meta de ${target}: hoy subimos el nivel.`;
  return phase === "final" ? `${base} Con tiempo, como en el examen.` : base;
}

// ---------------------------------------------------------------------------------- tasks as the student sees them

// The day's tasks as studentTasks() rows (TaskRow), with what the history says about each. Delivered = an attempt
// started from that task (snapshot.custom.condor); the simulacro also counts any full timed session that day.
export function condorTaskRows(day, history = [], now = Date.now()) {
  const today = dayStart(now);
  const rows = day.tasks.map((t) => {
    const done = history.filter((h) => h.snapshot?.custom?.condor === t.id || (t.kind === "simulacro" && dayStart(h.at) === today && h.mode === "timed" && (h.snapshot?.scope ?? "all") === "all" && !h.snapshot?.keys && h.total >= 100))
      .sort((a, b) => b.at - a.at)[0];
    return rowFor(t, done ?? null);
  });
  // Earlier Cóndor tasks this week that were done, newest first (the ones not done are simply not shown).
  const monday = today - ((new Date(now).getDay() + 6) % 7) * DAY;
  const ids = new Set(day.tasks.map((t) => t.id));
  const past = history.filter((h) => h.snapshot?.custom?.condor && !ids.has(h.snapshot.custom.condor) && h.at >= monday && h.at < today)
    .sort((a, b) => b.at - a.at)
    .map((h) => rowFor({ id: h.snapshot.custom.condor, kind: h.snapshot.custom.kind ?? "area", area: h.snapshot.custom.area ?? null, title: h.snapshot.custom.label, count: h.total, mode: h.mode, due_at: new Date(dayStart(h.at) + DAY - 6e4).toISOString() }, h));
  const soon = day.tomorrow && day.tomorrow.kind !== "rest" ? [{
    a: { id: day.tomorrow.id, title: day.tomorrow.title, kind: "task", condor: { kind: "preview" }, opens_at: day.tomorrow.opens_at, question_count: day.tomorrow.count || null, kindLabel: "Mañana" },
    subject: { ...CONDOR_SUBJECT, name: "Plan de Cóndor" }, status: "scheduled", used: 0, pct: null, deliveredAt: null, left: 0, state: "scheduled", why: "Cóndor la confirma mañana según cómo te vaya hoy.",
  }] : [];
  return [...rows, ...soon, ...past];
}

function rowFor(t, entry) {
  const subject = t.area ? { id: `area:${t.area}`, name: AREA_SUBJECT[t.area] ?? t.area, teacher: CONDOR_NAME, color: contextColor(t.area), area: t.area } : { ...CONDOR_SUBJECT };
  const a = {
    id: t.id, title: entry?.snapshot?.custom?.label ?? t.title, kind: t.kind === "simulacro" || t.mode === "timed" ? "exam" : "task", due_at: t.due_at,
    question_count: t.count, kindLabel: t.diagnostic ? "Diagnóstico" : t.kind === "review" ? "Repaso" : t.kind === "simulacro" ? "Simulacro" : "Tarea de Cóndor",
    condor: t, historyId: entry?.id ?? null,
  };
  return {
    a, subject, status: entry ? "delivered" : "pending", used: entry ? 1 : 0,
    pct: entry && entry.keyed !== false && entry.answered ? Math.round((entry.correct / Math.max(1, entry.total || entry.answered)) * 100) : null,
    deliveredAt: entry ? new Date(entry.at).toISOString() : null, left: 0, state: entry ? "closed" : "active", why: entry ? null : t.why,
  };
}

// Teacher tasks and Cóndor tasks in one list, in the order studentTasks() uses.
export function mergeTasks(teacher = [], condor = []) {
  const rank = { pending: 0, paper: 1, scheduled: 1, delivered: 2, missed: 3 };
  return [...teacher, ...condor].sort((x, y) => {
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    const dx = new Date(x.a.due_at ?? x.a.opens_at ?? 8.64e15); const dy = new Date(y.a.due_at ?? y.a.opens_at ?? 8.64e15);
    return x.status === "pending" || x.status === "scheduled" ? dx - dy : (y.deliveredAt ? new Date(y.deliveredAt) : dy) - (x.deliveredAt ? new Date(x.deliveredAt) : dx);
  });
}

// ------------------------------------------------------------------------------------------- choosing questions

// Booklets to draw an area or mix task from, best first: the one already open (no extra download), then the ones
// the student has answered least of. exams: index rows; history: loadHistory().
export function bookletsFor(task, exams = [], history = [], openSlug = null) {
  const answered = new Map();
  for (const h of history) { const s = h.snapshot?.slug; if (s) answered.set(s, (answered.get(s) ?? 0) + Object.keys(h.snapshot.answers ?? {}).length); }
  return exams
    .filter((e) => e.status !== "proximamente" && (task.area ? (e.sections ?? []).includes(task.area) : (e.sections ?? []).length >= 3))
    .map((e) => ({ slug: e.slug, used: (answered.get(e.slug) ?? 0) / Math.max(1, e.questions ?? 1) }))
    .sort((a, b) => (a.used >= 0.8) - (b.used >= 0.8) || (b.slug === openSlug) - (a.slug === openSlug) || a.used - b.used || a.slug.localeCompare(b.slug))
    .map((e) => e.slug);
}

// The question keys of an area or mix task from one open booklet. items: bankItems() of the booklet (hidden
// questions already removed); `graded`: the server grades this booklet (students), so every question counts as keyed.
// New questions first, at the student's level first; whole shared-text groups. Returns [] when the booklet has too few.
export function condorKeys(task, items, history, slug, { graded = false, count = task.count } = {}) {
  const qh = questionHistory(history, slug);
  const usable = items.filter((it) => (graded || it.hasKey) && !it.keyDoubt);
  const seed = seedOf(`${task.id}|${slug}`);
  const choose = (pool, n, order) => {
    const unseen = pool.filter((it) => !qh.seen.has(it.key));
    const band = task.band ?? [1, 2, 3, 4, 5];
    const atLevel = unseen.filter((it) => it.dificultad == null || band.includes(it.dificultad));
    const from = atLevel.length >= n ? atLevel : unseen.length >= n ? unseen : unseen.length >= Math.ceil(n / 2) ? unseen : [];
    return from.length ? pickKeys(from, { count: n, order, seed }) : [];
  };
  if (task.kind === "mix") {
    const areas = [...new Set(usable.map((it) => it.section))];
    if (!areas.length) return [];
    const each = Math.max(1, Math.round(count / areas.length));
    return areas.flatMap((a) => choose(usable.filter((it) => it.section === a), each, "booklet")).slice(0, count + 2);
  }
  return choose(usable.filter((it) => it.section === task.area), count, task.band?.[0] === 1 ? "easy" : "booklet");
}
