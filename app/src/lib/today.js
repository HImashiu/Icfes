// What the teacher's home ("Hoy") shows: the numbers of the week, what needs attention, the week's agenda, each
// class at a glance, results that just arrived and students who need support. Pure, so it is tested without a screen.
import { AREAS, areaOf, groupOf } from "./teaching.js";
import { assignmentState, scorePct } from "./assignments.js";
import { alertLabel, weekStart } from "./workspace.js";

const DAY = 864e5;
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function todayModel({ courses, assignments, attempts, roster, now = Date.now() }) {
  const courseIds = new Set(courses.map((c) => c.id));
  const live = assignments.filter((a) => courseIds.has(a.course_id) && a.status !== "draft");
  const byId = new Map(live.map((a) => [a.id, a]));
  const shown = attempts.filter((t) => t.submitted_at && byId.has(t.assignment_id));
  const nameOf = (id) => groupOf(courses.find((c) => c.id === id) ?? {}).name;
  const items = roster.flatMap((e) => e.items.map((i) => ({ ...i, who: e }))).filter((i) => byId.has(i.id));

  // ---- the week's numbers
  const from = weekStart(now);
  const weekEnd = from + 7 * DAY;
  const inWeek = (iso) => iso && Date.parse(iso) >= from && Date.parse(iso) < weekEnd;
  const weekItems = items.filter((i) => inWeek(byId.get(i.id).due_at) || (i.done && inWeek(i.at)));
  const pctIn = (a, b) => shown.filter((t) => Date.parse(t.submitted_at) >= a && Date.parse(t.submitted_at) < b).map(scorePct).filter((p) => p != null);
  const recent = avg(pctIn(now - 28 * DAY, now + 1));
  const before = avg(pctIn(now - 56 * DAY, now - 28 * DAY));
  const followUps = roster.filter((e) => e.followUp || e.severity >= 3);
  const kpis = {
    delivered: weekItems.filter((i) => i.done).length,
    expected: weekItems.length,
    missing: new Set(weekItems.filter((i) => !i.done).map((i) => i.who.key)).size,
    avgPct: recent,
    avgDelta: recent != null && before != null ? recent - before : null,
    active: live.filter((a) => assignmentState(a, now) === "active").length,
    scheduled: live.filter((a) => assignmentState(a, now) === "scheduled").length,
    followUps: followUps.length,
  };

  // ---- what needs attention, most urgent first
  const attention = [];
  for (const a of live) {
    const state = assignmentState(a, now);
    const due = a.due_at ? Date.parse(a.due_at) : null;
    const mine = items.filter((i) => i.id === a.id);
    const done = mine.filter((i) => i.done).length;
    if (state === "active" && due && due - now < 2 * DAY) {
      attention.push({ kind: "closing", rank: 1, title: `${a.title} cierra ${due - now < DAY ? "hoy" : "mañana"}`, detail: `${done} de ${mine.length} entregaron · ${nameOf(a.course_id)}`, tag: new Date(due).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }), warn: mine.length - done > 0, route: { section: "actividad", id: a.id, tab: "resultados" }, action: "Abrir" });
    } else if (state === "closed" && a.status !== "closed" && due && now - due < 3 * DAY && mine.length && done < mine.length) {
      attention.push({ kind: "late", rank: 2, title: `${mine.length - done} sin entregar en ${a.title}`, detail: `Cerró ${new Date(due).toLocaleDateString("es-CO", { weekday: "long" })} · ${nameOf(a.course_id)}`, tag: nameOf(a.course_id), warn: true, route: { section: "actividad", id: a.id, tab: "resultados" }, action: "Ver" });
    } else if (state === "scheduled" && a.opens_at && Date.parse(a.opens_at) - now < 2 * DAY) {
      attention.push({ kind: "opens", rank: 4, title: `${a.title} abre pronto`, detail: `${new Date(a.opens_at).toLocaleDateString("es-CO", { weekday: "long", day: "numeric" })} · ${nameOf(a.course_id)}`, tag: nameOf(a.course_id), warn: false, route: { section: "actividad", id: a.id }, action: "Revisar" });
    }
  }
  const dueFollow = roster.filter((e) => e.followUp?.due && Date.parse(e.followUp.due) < weekEnd);
  if (dueFollow.length) attention.push({ kind: "follow", rank: 3, title: `${dueFollow.length} ${dueFollow.length === 1 ? "seguimiento" : "seguimientos"} esta semana`, detail: dueFollow.slice(0, 3).map((e) => e.name).join(", "), tag: "seguimiento", warn: false, route: { section: "estudiantes", tab: "lista" }, action: "Ver" });
  const never = roster.filter((e) => !e.joined);
  if (never.length) attention.push({ kind: "never", rank: 5, title: `${never.length} ${never.length === 1 ? "estudiante no ha" : "estudiantes no han"} ingresado`, detail: "No ven sus tareas hasta que entren con su correo del colegio", tag: "acceso", warn: false, route: { section: "estudiantes", tab: "lista" }, action: "Ver" });
  attention.sort((a, b) => a.rank - b.rank);

  // ---- the week's agenda, Monday to Sunday
  const agenda = WEEKDAYS.map((day, i) => {
    const start = from + i * DAY;
    const end = start + DAY;
    const at = (iso) => iso && Date.parse(iso) >= start && Date.parse(iso) < end;
    const list = [
      ...live.filter((a) => at(a.due_at)).map((a) => ({ id: a.id, group: nameOf(a.course_id), text: `cierra ${a.title}` })),
      ...live.filter((a) => at(a.opens_at)).map((a) => ({ id: a.id, group: nameOf(a.course_id), text: `abre ${a.title}` })),
    ];
    return { day, date: new Date(start).getDate(), today: now >= start && now < end, items: list };
  }).filter((d, i) => i < 5 || d.items.length);

  // ---- each class at a glance
  const classes = courses.map((c) => {
    const own = live.filter((a) => a.course_id === c.id).sort((x, y) => String(x.due_at ?? x.created_at).localeCompare(String(y.due_at ?? y.created_at)));
    const series = own.map((a) => avg(shown.filter((t) => t.assignment_id === a.id).map(scorePct).filter((p) => p != null))).filter((p) => p != null).slice(-6);
    const wk = weekItems.filter((i) => byId.get(i.id).course_id === c.id);
    const people = roster.filter((e) => e.courseIds.includes(c.id));
    return {
      id: c.id, name: groupOf(c).name, full: c.name,
      students: people.length,
      deliveredPct: wk.length ? Math.round((wk.filter((i) => i.done).length / wk.length) * 100) : null,
      series, last: series.at(-1) ?? null,
      alerts: people.filter((e) => e.severity >= 2).length,
      active: own.filter((a) => assignmentState(a, now) === "active").length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));

  // ---- results that arrived in the last 3 days
  const fresh = live.map((a) => {
    const rows = shown.filter((t) => t.assignment_id === a.id && now - Date.parse(t.submitted_at) < 3 * DAY);
    if (!rows.length) return null;
    const paper = rows.filter((t) => String(t.client_id ?? "").startsWith("paper-")).length;
    return { id: a.id, title: a.title, group: nameOf(a.course_id), count: rows.length, avgPct: avg(rows.map(scorePct).filter((p) => p != null)), via: paper > rows.length / 2 ? "Papel" : "En línea", last: Math.max(...rows.map((t) => Date.parse(t.submitted_at))) };
  }).filter(Boolean).sort((a, b) => b.last - a.last).slice(0, 4);

  // ---- students who need support (each compared with their own progress, never ranked against others)
  const support = roster.filter((e) => e.severity >= 2)
    .sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name, "es"))
    .slice(0, 5)
    .map((e) => ({ key: e.key, email: e.email, name: e.name, groups: e.courseIds.map(nameOf).filter(Boolean).join(", "), reason: e.alerts[0]?.reason ?? alertLabel(e.alerts[0]?.kind), kind: e.alerts[0]?.kind }));

  // ---- where it costs most: by area across the context, plus the activities with the lowest average
  const perArea = new Map(AREAS.map((a) => [a, { correct: 0, total: 0 }]));
  for (const t of shown) for (const p of t.score?.perArea ?? []) {
    const slot = perArea.get(p.name);
    if (slot) { slot.correct += p.correct ?? 0; slot.total += (t.mode === "practice" ? p.answered : p.total) ?? 0; }
  }
  const areas = [...perArea].filter(([, v]) => v.total > 0).map(([name, v]) => ({ name, pct: Math.round((v.correct / v.total) * 100), answered: v.total })).sort((a, b) => a.pct - b.pct);
  const weakest = live.map((a) => {
    const ps = shown.filter((t) => t.assignment_id === a.id).map(scorePct).filter((p) => p != null);
    return ps.length >= 3 ? { id: a.id, title: a.title, group: nameOf(a.course_id), pct: avg(ps), n: ps.length } : null;
  }).filter(Boolean).sort((a, b) => a.pct - b.pct).slice(0, 4);

  // ---- every date of the open work, for the month calendar
  const areaOfCourse = (id) => areaOf(courses.find((c) => c.id === id) ?? {});
  const events = live.flatMap((a) => [
    a.due_at && { at: a.due_at, kind: "due", id: a.id, label: `Cierra ${a.title} · ${nameOf(a.course_id)}`, area: areaOfCourse(a.course_id) },
    a.opens_at && Date.parse(a.opens_at) > Date.parse(a.created_at ?? 0) + DAY && { at: a.opens_at, kind: "opens", id: a.id, label: `Abre ${a.title} · ${nameOf(a.course_id)}`, area: areaOfCourse(a.course_id) },
  ].filter(Boolean));

  return { kpis, attention, agenda, events, classes, fresh, support, areas, weakest, students: roster.length };
}
