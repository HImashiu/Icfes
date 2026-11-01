// Progress alerts: what changed in the teacher's classes that deserves a look, each with a stable id so the teacher
// can mark it as handled or snooze it, and a signature (sig) so it comes back by itself when the situation changes
// again (a new delivery, a new week). Pure functions: the screen (Hoy) and the tests share them.
//
// Three levels, so a teacher of 100+ students sees classes first and individuals where it matters:
//   class    · a class whose results or deliveries moved in the last two weeks against the two before.
//   activity · an activity most of the class got wrong (worth re-teaching) .
//   student  · the early-warning alerts of the workspace (drop, low, inactive, late, exits, improved) plus two
//              progress rules of its own: a drop in one area and three low results in a row.
// Students are always compared with their own earlier work and classes with themselves: never against each other.
import { assignmentState, scorePct } from "./assignments.js";
import { alertLabel } from "./workspace.js";
import { classLabel } from "./teaching.js";

const DAY = 864e5;
export const PROGRESS_RULES = {
  window: 14, // days per period when a class is compared with itself
  classMin: 5, // deliveries needed in each period
  classPoints: 8, // change in points that counts
  completionLow: 60, // % delivered under which a class is flagged
  completionMin: 10, // expected deliveries needed for that
  reteachAvg: 45, // an activity under this average is worth re-teaching
  reteachMin: 5, // deliveries needed for that
  reteachDays: 21, // only activities with deliveries in these days
  areaPoints: 15, // drop in one area against the student's own earlier results there
  areaMin: 3, // results in that area needed
  lowStreak: 40, // three results in a row under this
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x) => (x == null ? null : Math.round(x));
const weekOf = (t) => Math.floor(t / (7 * DAY));

// Share right per area of one delivered attempt: [{ area, pct }].
function areaResults(attempt) {
  return (attempt?.score?.perArea ?? []).map((p) => {
    const n = attempt.mode === "practice" ? p.answered : p.total;
    return n ? { area: p.name, pct: (100 * (p.correct ?? 0)) / n } : null;
  }).filter(Boolean);
}

// A drop in one area: the latest result there against the mean of the earlier ones (at least `areaMin` in all).
export function areaDrops(entry, rules = PROGRESS_RULES) {
  const series = new Map();
  for (const i of entry.items.filter((x) => x.done && x.attempt)) {
    for (const r of areaResults(i.attempt)) series.set(r.area, [...(series.get(r.area) ?? []), { pct: r.pct, id: i.id }]);
  }
  const out = [];
  for (const [area, list] of series) {
    if (list.length < rules.areaMin) continue;
    const last = list[list.length - 1];
    const before = mean(list.slice(0, -1).map((x) => x.pct));
    if (before - last.pct >= rules.areaPoints) out.push({ area, last: round(last.pct), before: round(before), id: last.id });
  }
  return out;
}

const STUDENT_KINDS = new Set(["drop", "low", "inactive", "late", "leaves", "up"]);

export function progressAlerts({ roster = [], courses = [], assignments = [], attempts = [], now = Date.now(), rules = PROGRESS_RULES }) {
  const out = [];
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const nameOf = (id) => (byCourse.get(id) ? classLabel(byCourse.get(id)) : "");
  const live = assignments.filter((a) => byCourse.has(a.course_id) && a.status !== "draft");
  const liveIds = new Set(live.map((a) => a.id));
  const delivered = attempts.filter((t) => t.submitted_at && liveIds.has(t.assignment_id));
  const courseOfAssignment = new Map(live.map((a) => [a.id, a.course_id]));
  const w = rules.window * DAY;
  const thisWeek = weekOf(now);

  // ---- classes: results and deliveries against themselves
  for (const c of courses) {
    const mine = delivered.filter((t) => courseOfAssignment.get(t.assignment_id) === c.id);
    const recent = mine.filter((t) => now - Date.parse(t.submitted_at) < w).map(scorePct).filter((p) => p != null);
    const before = mine.filter((t) => { const d = now - Date.parse(t.submitted_at); return d >= w && d < 2 * w; }).map(scorePct).filter((p) => p != null);
    if (recent.length >= rules.classMin && before.length >= rules.classMin) {
      const d = round(mean(recent) - mean(before));
      if (Math.abs(d) >= rules.classPoints) {
        out.push({
          id: `c:${c.id}:${d < 0 ? "down" : "up"}`, sig: String(thisWeek), level: "class", kind: d < 0 ? "classDown" : "classUp",
          severity: d < 0 ? 4 : 0, courseId: c.id,
          title: d < 0 ? `${nameOf(c.id)} bajó ${-d} puntos` : `${nameOf(c.id)} subió ${d} puntos`,
          detail: `Promedio de las últimas 2 semanas: ${round(mean(recent))} % frente a ${round(mean(before))} % en las 2 anteriores (${recent.length} y ${before.length} entregas).`,
          action: d < 0 ? "Revisar qué preguntas fallaron y planear un repaso." : "Contárselo al curso: reconocer el avance ayuda a sostenerlo.",
          route: { section: "resultados", tab: "actividades" }, cta: "Ver actividades",
        });
      }
    }
    // Deliveries: expected = students × activities that closed (or are due) in the window.
    const people = roster.filter((e) => e.courseIds.includes(c.id));
    const due = live.filter((a) => a.course_id === c.id && a.due_at && Date.parse(a.due_at) <= now && now - Date.parse(a.due_at) < w && !a.assignee_id);
    const expected = people.length * due.length;
    if (expected >= rules.completionMin) {
      const done = people.reduce((n, e) => n + e.items.filter((i) => due.some((a) => a.id === i.id) && i.done).length, 0);
      const pct = Math.round((done / expected) * 100);
      if (pct < rules.completionLow) {
        out.push({
          id: `c:${c.id}:entregas`, sig: String(thisWeek), level: "class", kind: "classLate", severity: 3, courseId: c.id,
          title: `En ${nameOf(c.id)} solo ${pct} % entregó`,
          detail: `${done} de ${expected} entregas de las actividades que cerraron en las últimas 2 semanas.`,
          action: "Recordar las entregas en clase o abrir un plazo extra.",
          route: { section: "estudiantes", tab: "lista", filters: { course: c.id, work: "late" } }, cta: "Ver quién debe",
        });
      }
    }
  }

  // ---- activities most of the class got wrong
  for (const a of live) {
    const rows = delivered.filter((t) => t.assignment_id === a.id);
    if (rows.length < rules.reteachMin) continue;
    if (!rows.some((t) => now - Date.parse(t.submitted_at) < rules.reteachDays * DAY)) continue;
    const avg = round(mean(rows.map(scorePct).filter((p) => p != null)));
    if (avg == null || avg >= rules.reteachAvg) continue;
    out.push({
      id: `a:${a.id}:repaso`, sig: String(Math.floor(rows.length / 5)), level: "activity", kind: "reteach", severity: 3,
      courseId: a.course_id, assignmentId: a.id, keys: a.question_keys ?? [], slug: a.exam_slug,
      title: `«${a.title}» quedó en ${avg} %`,
      detail: `${rows.length} entregas en ${nameOf(a.course_id)}${assignmentState(a, now) === "active" ? " (sigue abierta)" : ""}. Vale la pena repasarla en clase.`,
      action: "Abrir las preguntas que más fallaron o proyectarlas como repaso.",
      route: { section: "actividad", id: a.id, tab: "resultados" }, cta: "Ver preguntas",
    });
  }

  // ---- students
  for (const e of roster) {
    const lastDone = e.items.filter((i) => i.done).map((i) => `${i.id}@${i.at}`).pop() ?? "none";
    const base = { level: "student", studentKey: e.key, email: e.email, name: e.name, courseId: e.courseIds[0] ?? null };
    const studentRoute = { section: "estudiantes", tab: "lista", student: e.email };
    for (const a of e.alerts ?? []) {
      if (!STUDENT_KINDS.has(a.kind)) continue;
      out.push({
        ...base, id: `s:${e.key}:${a.kind}`, sig: a.kind === "inactive" ? String(thisWeek) : lastDone, kind: a.kind, severity: a.severity,
        title: `${e.name}: ${alertLabel(a.kind).toLowerCase()}`, detail: `${a.reason}${a.area ? ` Más bajo: ${a.area}.` : ""}`,
        action: a.action, route: studentRoute, cta: "Ver perfil",
      });
    }
    for (const d of areaDrops(e, rules)) {
      out.push({
        ...base, id: `s:${e.key}:area:${d.area}`, sig: d.id, kind: "areaDrop", severity: 4, area: d.area,
        title: `${e.name} bajó en ${d.area}`, detail: `Último resultado ${d.last} % frente a ${d.before} % en sus entregas anteriores de esa área.`,
        action: "Revisar sus respuestas en esa área y proponerle un refuerzo corto.", route: studentRoute, cta: "Ver perfil",
      });
    }
    const pcts = e.items.filter((i) => i.done && i.pct != null).map((i) => i.pct);
    const hasLow = (e.alerts ?? []).some((a) => a.kind === "low");
    if (!hasLow && pcts.length >= 3 && pcts.slice(-3).every((p) => p < rules.lowStreak)) {
      out.push({
        ...base, id: `s:${e.key}:racha`, sig: lastDone, kind: "lowStreak", severity: 4,
        title: `${e.name}: tres entregas seguidas bajas`, detail: `Sus últimos resultados: ${pcts.slice(-3).map((p) => `${p} %`).join(", ")}.`,
        action: "Hablar con el estudiante antes de la próxima actividad.", route: studentRoute, cta: "Ver perfil",
      });
    }
  }

  // Worrying first (by severity), good news last; ties by title so the list does not jump around.
  return out.sort((x, y) => (y.severity > 0) - (x.severity > 0) || y.severity - x.severity || levelRank(x) - levelRank(y) || x.title.localeCompare(y.title, "es"));
}
const levelRank = (a) => ({ class: 0, activity: 1, student: 2 })[a.level] ?? 3;

export const ALERT_KIND_LABEL = {
  classDown: "Curso bajó", classUp: "Curso subió", classLate: "Entregas bajas", reteach: "Para repasar", areaDrop: "Bajó en un área", lowStreak: "Racha baja",
  drop: "Bajó", low: "Promedio bajo", inactive: "Sin actividad", late: "Tareas sin entregar", leaves: "Salidas en exámenes", up: "Mejoró",
};
export const isGoodNews = (a) => a.severity === 0;

// What the teacher did with each alert. states: Map(id -> { sig, state: "done" | "snoozed" | "seen", until }).
// done: hidden until its sig changes. snoozed: hidden until the date. seen: shown, without the "Nueva" mark.
export function visibleAlerts(alerts, states, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  return alerts.map((a) => {
    const s = states?.get(a.id);
    const same = s && s.sig === a.sig;
    if (same && s.state === "done") return null;
    if (s?.state === "snoozed" && s.until && s.until > today) return null;
    return { ...a, fresh: !same };
  }).filter(Boolean);
}

// With 100+ students the same alert repeats for many of them: from `min` students on, one row per kind
// ("27 estudiantes bajaron frente a su promedio") that opens the list already filtered or unfolds one by one.
const GROUP_LABEL = {
  drop: "bajaron frente a su promedio", low: "tienen promedio bajo", inactive: "llevan tiempo sin actividad", late: "tienen tareas sin entregar",
  leaves: "salieron de la pestaña en exámenes", up: "mejoraron frente a su propio trabajo", areaDrop: "bajaron en un área", lowStreak: "tienen tres entregas seguidas bajas",
};
// Kinds the Estudiantes list can filter by (workspace ALERT_KINDS).
export const LIST_FILTER = new Set(["drop", "low", "inactive", "late", "leaves", "up"]);
export function groupAlerts(alerts, min = 3) {
  const byKind = new Map();
  for (const a of alerts.filter((x) => x.level === "student")) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  const out = [];
  const done = new Set();
  for (const a of alerts) {
    if (a.level !== "student") { out.push(a); continue; }
    const list = byKind.get(a.kind);
    if (list.length < min) { out.push(a); continue; }
    if (done.has(a.kind)) continue;
    done.add(a.kind);
    out.push({
      id: `g:${a.kind}`, group: true, level: "student", kind: a.kind, severity: Math.max(...list.map((x) => x.severity)), items: list,
      fresh: list.some((x) => x.fresh), title: `${list.length} estudiantes ${GROUP_LABEL[a.kind] ?? ALERT_KIND_LABEL[a.kind]}`,
      detail: `${list.slice(0, 4).map((x) => x.name).join(", ")}${list.length > 4 ? ` y ${list.length - 4} más` : ""}.`, action: list[0].action,
    });
  }
  return out;
}
