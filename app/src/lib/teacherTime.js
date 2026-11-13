// Pure helpers for the tools that save a teacher time every day: changing an activity's dates, reminding who has not
// delivered, reusing an activity in another class, a weekly routine, the desempeño of a grade and report cards.
// No network and no React, so every rule here is tested in tests/teacherTime.test.js.
import { scorePct, whoOf } from "./assignments.js";

const DAY = 864e5;
export const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const dayStart = (iso) => new Date(`${iso}T00:00:00`).toISOString();
const dayEnd = (iso) => new Date(`${iso}T23:59:00`).toISOString();
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

// ---- Dates -------------------------------------------------------------------------------------------------------

// The patch that gives an activity new dates. Reopening a closed one (a later due date, or one closed by hand) puts its
// status back to active; a draft stays a draft.
export function datesPatch(assignment, { opens, due }, now = Date.now()) {
  const patch = {};
  if (opens) patch.opens_at = dayStart(opens);
  patch.due_at = due ? dayEnd(due) : null;
  const dueOk = !patch.due_at || new Date(patch.due_at).getTime() > now;
  if (assignment.status === "closed" && dueOk) patch.status = "active";
  return patch;
}

export function datesError({ opens, due }, today = isoDay(Date.now())) {
  if (due && due < today) return "La nueva fecha de cierre ya pasó. Elige hoy o un día después.";
  if (opens && due && due < opens) return "El cierre no puede ser antes de la apertura.";
  return null;
}

// Quick choices for "Dar más tiempo": from the current due date (or today, if it already passed).
export function extendChoices(assignment, today = isoDay(Date.now())) {
  const base = assignment.due_at && isoDay(assignment.due_at) > today ? isoDay(assignment.due_at) : today;
  return [
    { label: "+1 día", due: addDays(base, 1) },
    { label: "+3 días", due: addDays(base, 3) },
    { label: "+1 semana", due: addDays(base, 7) },
  ];
}

// ---- Who has not delivered ---------------------------------------------------------------------------------------

// Students of the activity's class with no delivered attempt, in the class list's order.
export function missingStudents(members, attempts, courseId) {
  const done = new Set(attempts.filter((t) => t.submitted_at).map(whoOf).filter(Boolean));
  return members
    .filter((m) => m.role === "student" && (!courseId || m.course_id === courseId))
    .filter((m) => !done.has(m.id) && !(m.profile_id && done.has(m.profile_id)))
    .map((m) => ({ id: m.id, name: m.full_name || m.email, email: m.email, joined: Boolean(m.profile_id) }));
}

const firstNames = (list, max) => {
  const names = list.map((s) => String(s.name).trim().split(/\s+/).slice(0, 2).join(" "));
  return names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
};

// The reminder, in the teacher's voice, ready for the class announcement or the course's WhatsApp group.
// withNames: list who is missing (fine inside the school; the teacher decides for a group chat).
export function reminderText({ assignment, className, missing, total, withNames = false, now = Date.now() }) {
  const due = assignment.due_at ? isoDay(assignment.due_at) : null;
  const today = isoDay(now);
  const when = !due ? "" : due === today ? " Cierra hoy a las 11:59 p. m." : due === addDays(today, 1) ? " Cierra mañana." : due > today ? ` Cierra el ${longDay(due)}.` : "";
  const head = `Recordatorio${className ? ` para ${className}` : ""}: «${assignment.title}» en Cóndor.`;
  const count = missing.length === total ? "Todavía nadie la ha entregado." : `Faltan ${missing.length} de ${total} por entregar.`;
  const names = withNames && missing.length ? ` Pendientes: ${firstNames(missing, 12)}.` : "";
  const how = " Entren a Cóndor › Inicio › Tareas de tu curso.";
  return `${head} ${count}${when}${names}${how}`;
}

export const whatsappShare = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// ---- Reuse in another class --------------------------------------------------------------------------------------

const COPY_FIELDS = ["kind", "title", "exam_slug", "scope", "question_keys", "time_limit_min", "reveal_policy", "max_attempts",
  "allow_hints", "instant_feedback", "allow_definitions", "definitions", "proctor", "delivery"];

// One new assignment per class with the same questions and settings and the dates the teacher chose. Columns that a
// database without some migration may lack are only sent when they differ from their default, like Nueva actividad.
export function copyRows(assignment, courseIds, { opens, due, title }, userId) {
  const base = {};
  for (const f of COPY_FIELDS) if (assignment[f] !== undefined && assignment[f] !== null) base[f] = assignment[f];
  if (base.allow_hints !== false) delete base.allow_hints;
  if (base.instant_feedback !== false) delete base.instant_feedback;
  if (!base.allow_definitions) { delete base.allow_definitions; delete base.definitions; }
  if (!base.proctor) delete base.proctor;
  if (base.delivery !== "paper") delete base.delivery;
  return courseIds.map((course_id) => ({
    ...base,
    course_id,
    created_by: userId,
    title: (title ?? "").trim() || assignment.title,
    opens_at: dayStart(opens),
    due_at: due ? dayEnd(due) : null,
    status: "active",
  }));
}

// Classes that already have an activity with any of these questions (same booklet): reusing it there repeats them.
export function repeatsIn(assignment, others, courseIds) {
  const keys = new Set(assignment.question_keys ?? []);
  const whole = !assignment.question_keys?.length;
  const hit = new Set();
  for (const o of others) {
    if (o.id === assignment.id || !courseIds.includes(o.course_id) || o.exam_slug !== assignment.exam_slug) continue;
    if (whole || !o.question_keys?.length || o.question_keys.some((k) => keys.has(k))) hit.add(o.course_id);
  }
  return [...hit];
}

// ---- Weekly routine ----------------------------------------------------------------------------------------------

// Splits the chosen questions into `weeks` sets of about the same size, never separating the questions of one
// reading text (items carry groupId). Keeps the teacher's order.
export function splitWeeks(keys, items, weeks) {
  const n = Math.max(1, Math.min(Math.floor(Number(weeks) || 1), keys.length || 1));
  if (n === 1) return [keys.slice()];
  const byKey = new Map(items.map((i) => [i.key, i]));
  const units = [];
  const seen = new Map();
  for (const k of keys) {
    const g = byKey.get(k)?.groupId;
    if (g && seen.has(g)) { seen.get(g).push(k); continue; }
    const u = [k];
    units.push(u);
    if (g) seen.set(g, u);
  }
  const target = keys.length / n;
  const out = [];
  let cur = [];
  let used = 0;
  units.forEach((u, i) => {
    cur.push(...u);
    used += u.length;
    if (out.length >= n - 1) return;
    const unitsLeft = units.length - i - 1;
    const weeksLeft = n - out.length - 1;
    // Close a week when it reached its share, or when every remaining unit is needed to give each later week one.
    if (used >= target * (out.length + 1) - u.length / 2 || unitsLeft <= weeksLeft) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out.filter((w) => w.length);
}

// Dates of each week of a routine: week i opens `i` weeks after the first and stays open as long as the first.
export function weekDates(opens, due, count) {
  // Never longer than 6 days, so one week closes before the next opens.
  const span = due ? Math.min(6, Math.max(0, Math.round((new Date(`${due}T12:00:00`) - new Date(`${opens}T12:00:00`)) / DAY))) : 6;
  return Array.from({ length: count }, (_, i) => {
    const o = addDays(opens, 7 * i);
    return { opens: o, due: addDays(o, span) };
  });
}

// ---- Desempeño (Decreto 1290 de 2009) ----------------------------------------------------------------------------

// The national scale has four levels: Superior, Alto, Básico and Bajo. Each school sets its own cut points; the usual
// one on 1,0–5,0 is Bajo < 3,0 ≤ Básico < 4,0 ≤ Alto < 4,6 ≤ Superior. On any other scale the same shares are used:
// Básico starts at the passing grade, Alto halfway to the top and Superior at 80 % of the way.
export const DESEMPENOS = ["Bajo", "Básico", "Alto", "Superior"];
export function desempenoCuts(scale) {
  const { pass, max } = scale;
  return { basico: pass, alto: pass + (max - pass) * 0.5, superior: pass + (max - pass) * 0.8 };
}
export function desempeno(value, scale) {
  if (value == null || !scale) return null;
  const c = desempenoCuts(scale);
  const v = Number(value) + 1e-9;
  return v >= c.superior ? "Superior" : v >= c.alto ? "Alto" : v >= c.basico ? "Básico" : "Bajo";
}

// Colombian school platforms list students by surname. With 3 or more words the last two are taken as the surnames
// (Juan Esteban Duarte Martínez → Duarte Martínez), with 2 the last one. Ties fall back to the full name.
export function surnameKey(name) {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const sur = w.length >= 3 ? w.slice(-2) : w.slice(-1);
  return `${sur.join(" ")} ${w.slice(0, w.length - sur.length).join(" ")}`.toLocaleLowerCase("es");
}
export function sortRows(rows, by) {
  const list = rows.slice();
  if (by === "surname") list.sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name), "es"));
  else if (by === "grade") list.sort((a, b) => (b.finalPct ?? -1) - (a.finalPct ?? -1) || a.name.localeCompare(b.name, "es"));
  else list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return list;
}

// The final grades alone, one per line in the class list's order, with a decimal comma: pasted into the school's
// platform or spreadsheet column in one go.
export function finalColumn(rows) {
  return rows.map((r) => (r.final ? String(r.final.display).replace(/\s*%$/, "") : "")).join("\n");
}

// ---- Report cards ------------------------------------------------------------------------------------------------

// Per area: share of right answers over this class's delivered attempts of one student.
export function areaLines(attempts) {
  const by = new Map();
  for (const a of attempts) {
    for (const x of a.score?.perArea ?? []) {
      const cur = by.get(x.name) ?? { name: x.name, correct: 0, total: 0 };
      cur.correct += x.correct ?? 0;
      cur.total += x.total ?? 0;
      by.set(x.name, cur);
    }
  }
  return [...by.values()].filter((a) => a.total > 0).map((a) => ({ ...a, pct: Math.round((a.correct / a.total) * 100) })).sort((x, y) => x.pct - y.pct);
}

// What one report card says about a student, from the planilla row and their attempts in this class.
// attempts: this student's attempts in the class's activities (any order; undelivered ones are skipped).
export function reportCard({ row, columns, attempts, scale }) {
  const mine = attempts.filter((a) => a.submitted_at);
  const delivered = columns.filter((c) => row.cells[c.id]?.done).length;
  const closed = columns.filter((c) => !c.open).length;
  const pcts = mine.map(scorePct).filter((p) => p != null);
  const areas = areaLines(mine);
  return {
    name: row.name,
    final: row.final?.display ?? null,
    finalPct: row.finalPct,
    level: scale && row.final ? desempeno(row.final.value, scale) : null,
    delivered,
    missing: row.missing,
    closed,
    activities: columns.map((c) => ({ title: c.title, due: c.due, value: row.cells[c.id]?.done ? row.cells[c.id].display : c.open ? "Abierta" : "Sin entregar", low: row.cells[c.id]?.passed === false })),
    areas,
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    weakest: areas.length > 1 ? areas[0].name : null,
    strongest: areas.length > 1 ? areas[areas.length - 1].name : null,
  };
}

// The comment the card suggests, which the teacher edits before printing.
export function suggestedComment(card) {
  const bits = [];
  if (card.missing > 0) bits.push(`Le ${card.missing === 1 ? "falta entregar 1 actividad" : `faltan ${card.missing} actividades`}; ponerse al día es lo primero.`);
  if (card.level === "Superior" || card.level === "Alto") bits.push("Muy buen trabajo en el periodo; puede apoyar a compañeros.");
  if (card.level === "Bajo") bits.push("Necesita un plan de refuerzo y práctica corta varias veces por semana.");
  if (card.weakest) bits.push(`Para mejorar: ${card.weakest}.`);
  if (!bits.length) bits.push("Va bien; mantener la práctica semanal.");
  return bits.join(" ");
}
