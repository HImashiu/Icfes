// The teacher workspace for large classes: one entry per student across every class space the teacher can see,
// with activity, results, alerts, status, groups and follow-up; plus search/filters, saved views and the weekly summary.
// Pure functions. Students are identified by their lower-case school email, so a student in two spaces is one entry.
import { activityRows } from "./activityReport.js";
import { alerts as baseAlerts, summarize } from "./students.js";

const DAY = 864e5;
export const emailKey = (email) => String(email ?? "").trim().toLowerCase();

// Extra rules on top of the early-warning alerts (students.js). Visible constants so they can be tuned.
export const WORKSPACE_RULES = { lateCount: 2, upPoints: 10, leaves: 3 };

const ALERT_LABEL = {
  drop: "Bajó", low: "Promedio bajo", inactive: "Sin actividad", never: "Sin ingresar",
  late: "Tareas sin entregar", leaves: "Salidas en exámenes", up: "Mejoró",
};
export const ALERT_KINDS = Object.entries(ALERT_LABEL).map(([id, label]) => ({ id, label }));
export const alertLabel = (kind) => ALERT_LABEL[kind] ?? kind;

// Merges per-member activity rows of the same email into one student.
function mergeRows(rows) {
  const first = rows[0];
  const items = rows.flatMap((r) => r.items.map((i) => ({ ...i, courseId: r.courseId, memberId: r.id })))
    .sort((x, y) => String(x.at ?? x.due ?? "").localeCompare(String(y.at ?? y.due ?? "")));
  const done = items.filter((i) => i.done);
  const pcts = done.map((i) => i.pct).filter((p) => p != null);
  const secs = done.map((i) => i.sec).filter((s) => s != null);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    name: rows.map((r) => r.name).find((n) => n && !n.includes("@")) ?? first.name,
    email: first.email,
    memberIds: rows.map((r) => r.id), courseIds: [...new Set(rows.map((r) => r.courseId))],
    joined: rows.some((r) => r.joined),
    assigned: items.length, done: done.length, late: items.filter((i) => i.late).length,
    pending: items.filter((i) => !i.done && !i.late && i.state !== "closed").length,
    avgPct: pcts.length ? Math.round(mean(pcts)) : null,
    trend: pcts.length >= 4 ? Math.round(mean(pcts.slice(-3)) - mean(pcts.slice(-6, -3).length ? pcts.slice(-6, -3) : pcts.slice(0, 1))) : null,
    totalSec: secs.reduce((a, b) => a + b, 0),
    lastAt: done.map((i) => i.at).sort().pop() ?? null,
    leaves: items.reduce((n, i) => n + i.leaves, 0),
    items,
  };
}

// members: course_members (any role; only students are kept). attempts: delivered attempts (reportAttempts).
// ws: { flags: Map(email -> flag row), statuses: [], groups: [], groupMembers: [{group_id, email}] }.
export function buildRoster({ members, assignments, attempts, ws = {}, now = Date.now(), rules = WORKSPACE_RULES }) {
  const students = members.filter((m) => m.role === "student");
  const rows = activityRows({ members: students, assignments, attempts }, now);
  const byEmail = new Map();
  for (const r of rows) {
    const k = emailKey(r.email);
    byEmail.set(k, [...(byEmail.get(k) ?? []), r]);
  }
  const profileOf = new Map(students.map((m) => [m.id, m.profile_id]));
  const groupsByEmail = new Map();
  for (const gm of ws.groupMembers ?? []) groupsByEmail.set(gm.email, [...(groupsByEmail.get(gm.email) ?? []), gm.group_id]);
  const statusById = new Map((ws.statuses ?? []).map((s) => [s.id, s]));

  return [...byEmail.entries()].map(([key, list]) => {
    const base = mergeRows(list);
    const profileIds = [...new Set(base.memberIds.map((id) => profileOf.get(id)).filter(Boolean))];
    const own = attempts.filter((a) => (a.profile_id && profileIds.includes(a.profile_id)) || (a.member_id && base.memberIds.includes(a.member_id)));
    const summary = summarize(own, profileIds.length > 0);
    const flag = ws.flags?.get(key) ?? null;
    const entry = {
      ...base, key, profileId: profileIds[0] ?? null, summary,
      areas: summary.areas, band: summary.band,
      status: flag?.status_id ? statusById.get(flag.status_id) ?? null : null,
      followUp: flag?.follow_up ? { due: flag.follow_up_due ?? null, reason: flag.follow_up_reason ?? "" } : null,
      groups: groupsByEmail.get(key) ?? [],
    };
    entry.alerts = studentAlerts(entry, { now, rules });
    entry.severity = Math.max(0, ...entry.alerts.filter((a) => a.kind !== "up").map((a) => a.severity));
    return entry;
  });
}

// All the alerts of one student, most urgent first. The first rule of students.js plus late work, exam exits and
// improvements (a positive alert, so teachers can also say "well done").
export function studentAlerts(entry, { now = Date.now(), rules = WORKSPACE_RULES } = {}) {
  const out = baseAlerts([{ ...entry.summary, name: entry.name, email: entry.email }], { now }).map((a) => ({
    kind: a.kind, severity: a.severity, reason: a.reason, action: a.action, area: a.area ?? null,
  }));
  if (entry.late >= rules.lateCount) out.push({ kind: "late", severity: 3, reason: `${entry.late} tareas sin entregar después de la fecha.`, action: "Recordarle las entregas pendientes y acordar una fecha." });
  if (entry.leaves >= rules.leaves) out.push({ kind: "leaves", severity: 2, reason: `Salió ${entry.leaves} veces de la pestaña en exámenes monitoreados.`, action: "Revisar el registro del examen y hablar con el estudiante." });
  if (entry.trend != null && entry.trend >= rules.upPoints) out.push({ kind: "up", severity: 0, reason: `Subió ${entry.trend} puntos frente a sus entregas anteriores.`, action: "Felicitarlo: reconocer el avance ayuda a sostenerlo." });
  return out.sort((a, b) => b.severity - a.severity);
}

// ---------------------------------------------------------------- filters and saved views
export const EMPTY_FILTERS = {
  q: "", course: "", group: "", status: "", alert: "", followUp: "", joined: "", work: "", weakArea: "", minAvg: "", maxAvg: "", sort: "name",
};
export const SORTS = [
  ["name", "Nombre (A-Z)"], ["attention", "Necesitan atención primero"], ["recent", "Última entrega reciente"], ["quiet", "Más tiempo sin entregar"], ["pending", "Más tareas sin entregar"],
];
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const activeFilterCount = (f) => Object.entries(f).filter(([k, v]) => k !== "sort" && k !== "q" && v !== "" && v != null).length;

// ctx: { courseName(id), groupName(id), now }. Search matches name, email, class spaces, groups and status.
export function applyFilters(entries, f, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  const min = f.minAvg === "" || f.minAvg == null ? null : Number(f.minAvg);
  const max = f.maxAvg === "" || f.maxAvg == null ? null : Number(f.maxAvg);
  const out = entries.filter((e) => {
    if (words.length) {
      const hay = norm([e.name, e.email, ...e.courseIds.map((id) => ctx.courseName?.(id) ?? ""), ...e.groups.map((g) => ctx.groupName?.(g) ?? ""), e.status?.label ?? ""].join(" "));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.course && !e.courseIds.includes(f.course)) return false;
    if (f.group && !e.groups.includes(f.group)) return false;
    if (f.status === "none" ? e.status : f.status && e.status?.id !== f.status) return false;
    if (f.alert === "any" && e.severity === 0) return false;
    if (f.alert === "none" && e.severity > 0) return false;
    if (f.alert && !["any", "none"].includes(f.alert) && !e.alerts.some((a) => a.kind === f.alert)) return false;
    if (f.followUp === "yes" && !e.followUp) return false;
    if (f.followUp === "no" && e.followUp) return false;
    if (f.followUp === "due" && !(e.followUp?.due && e.followUp.due <= isoDay(now))) return false;
    if (f.joined === "yes" && !e.joined) return false;
    if (f.joined === "no" && e.joined) return false;
    if (f.work === "late" && e.late === 0) return false;
    if (f.work === "pending" && e.pending === 0) return false;
    if (f.work === "none" && !(e.assigned > 0 && e.done === 0)) return false;
    if (f.work === "quiet7" && e.lastAt && now - Date.parse(e.lastAt) < 7 * DAY) return false;
    if (f.work === "quiet7" && !e.lastAt && e.assigned === 0) return false;
    if (f.weakArea && e.areas[0]?.name !== f.weakArea) return false;
    if (min != null && (e.avgPct == null || e.avgPct < min)) return false;
    if (max != null && (e.avgPct == null || e.avgPct > max)) return false;
    return true;
  });
  return sortEntries(out, f.sort);
}

// No order by score: the roster is a work list, not a ranking.
export function sortEntries(list, sort = "name") {
  const byName = (a, b) => a.name.localeCompare(b.name, "es");
  const t = (e) => (e.lastAt ? Date.parse(e.lastAt) : 0);
  const cmp = {
    name: byName,
    attention: (a, b) => b.severity - a.severity || byName(a, b),
    recent: (a, b) => t(b) - t(a) || byName(a, b),
    quiet: (a, b) => t(a) - t(b) || byName(a, b),
    pending: (a, b) => b.late - a.late || b.pending - a.pending || byName(a, b),
  }[sort] ?? byName;
  return [...list].sort(cmp);
}

// The filters a saved view keeps (unknown keys from older versions are dropped).
export const viewFilters = (f) => Object.fromEntries(Object.keys(EMPTY_FILTERS).map((k) => [k, f?.[k] ?? EMPTY_FILTERS[k]]));

// ---------------------------------------------------------------- follow-up queue
export const isoDay = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDaysIso = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d.getTime());
};

// Students in the queue, overdue and soonest first; and students the alerts suggest adding.
export function followUpQueue(entries, now = Date.now()) {
  const today = isoDay(now);
  const queue = entries.filter((e) => e.followUp)
    .map((e) => ({ ...e, overdue: Boolean(e.followUp.due && e.followUp.due < today), dueToday: e.followUp.due === today }))
    .sort((a, b) => String(a.followUp.due ?? "9999").localeCompare(String(b.followUp.due ?? "9999")) || a.name.localeCompare(b.name, "es"));
  const suggested = entries.filter((e) => !e.followUp && e.severity >= 3).sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name, "es"));
  return { queue, suggested };
}

// ---------------------------------------------------------------- weekly summary
// Monday 00:00 local of the week of t.
export function weekStart(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// What happened this week (Monday to now) against last week, for the teacher's courses.
export function weeklySummary(entries, assignments, now = Date.now()) {
  const from = weekStart(now);
  const prevFrom = from - 7 * DAY;
  const inRange = (iso, a, b) => iso && Date.parse(iso) >= a && Date.parse(iso) < b;
  const items = entries.flatMap((e) => e.items.map((i) => ({ ...i, who: e })));
  const thisWeek = items.filter((i) => i.done && inRange(i.at, from, now + 1));
  const lastWeek = items.filter((i) => i.done && inRange(i.at, prevFrom, from));
  const avg = (list) => {
    const p = list.map((i) => i.pct).filter((x) => x != null);
    return p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null;
  };
  const active = new Set(thisWeek.map((i) => i.who.key));
  const weekEnd = from + 7 * DAY;
  const due = assignments.filter((a) => a.status !== "draft" && inRange(a.due_at, from, weekEnd)).map((a) => {
    const expected = items.filter((i) => i.id === a.id);
    return { id: a.id, title: a.title, due: a.due_at, courseId: a.course_id, expected: expected.length, done: expected.filter((i) => i.done).length };
  }).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const today = isoDay(now);
  return {
    from, to: now,
    deliveries: thisWeek.length, prevDeliveries: lastWeek.length,
    avgPct: avg(thisWeek), prevAvgPct: avg(lastWeek),
    secs: thisWeek.reduce((n, i) => n + (i.sec ?? 0), 0),
    active: active.size, students: entries.length,
    quiet: entries.filter((e) => e.assigned > 0 && !active.has(e.key)),
    due,
    improved: entries.filter((e) => e.alerts.some((a) => a.kind === "up")),
    worried: entries.filter((e) => e.alerts.some((a) => a.kind === "drop" || a.kind === "low")),
    followUpsDue: entries.filter((e) => e.followUp?.due && e.followUp.due <= addDaysIso(today, 6 - ((new Date(now).getDay() + 6) % 7))),
  };
}

// Weekly activity of one student over the last n weeks: deliveries and minutes worked.
export function weeklyActivity(entry, now = Date.now(), n = 8) {
  const start = weekStart(now);
  return Array.from({ length: n }, (_, i) => {
    const from = start - (n - 1 - i) * 7 * DAY;
    const done = entry.items.filter((it) => it.done && it.at && Date.parse(it.at) >= from && Date.parse(it.at) < from + 7 * DAY);
    return { from, deliveries: done.length, minutes: Math.round(done.reduce((s, it) => s + (it.sec ?? 0), 0) / 60) };
  });
}

// CSV of the roster as shown (one line per student).
export function rosterCsv(entries, { courseName = () => "", groupName = () => "" } = {}) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Estudiante", "Correo", "Espacios", "Estado", "Grupos", "Entregadas", "Asignadas", "Sin entregar", "Promedio (%) clave preliminar", "Cambio (pts)", "Última entrega", "Alertas", "Seguimiento"];
  const lines = entries.map((e) => [
    e.name, e.email, e.courseIds.map(courseName).join(" / "), e.status?.label ?? "", e.groups.map(groupName).join(" / "),
    e.done, e.assigned, e.late, e.avgPct ?? "", e.trend ?? "", e.lastAt ?? "", e.alerts.map((a) => alertLabel(a.kind)).join(" / "),
    e.followUp ? `${e.followUp.due ?? "sin fecha"} ${e.followUp.reason}`.trim() : "",
  ].map(cell).join(","));
  return [head.join(","), ...lines].join("\n");
}
