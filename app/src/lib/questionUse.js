// Question use across the school: every activity, live game and class for projection that showed a question, and
// the holds teachers put on questions or whole booklets (reserved for a simulacro, hidden from free practice).
// The point is that no group of students meets the same question twice without the teacher knowing, and that a
// question seen in a homework never turns up in a simulacro (or the other way round).
// Pure functions: the rows come from api.questionUses(), api.questionHolds() and api.questionRules().
import { questionsFor } from "./exam.js";
import { groupOf } from "./teaching.js";

// Every kind of use. The family decides the "tarea ↔ simulacro" rule: practice on one side, simulacros on the other.
export const USE_KIND = {
  task: { label: "Práctica", family: "practice" },
  homework: { label: "Tarea", family: "practice" },
  exam: { label: "Simulacro", family: "exam" },
  live: { label: "Juego en vivo", family: "practice" },
  lesson: { label: "Clase proyectada", family: "practice" },
};
export const familyOf = (kind) => USE_KIND[kind]?.family ?? "practice";
export const kindLabel = (kind) => USE_KIND[kind]?.label ?? "Actividad";

// The school's rules (migration 0021, set by coordination). "block": the question cannot be added; "warn": it can,
// after a warning; "off": nothing is said. reach "group": only uses with the same students count (same class or same
// group, e.g. 11A in any subject); "school": a use anywhere in the school counts.
export const DEFAULT_RULES = { cross: "block", repeat: "warn", reach: "group", reserved: "block" };
export const RULE_TEXT = {
  cross: { label: "Tarea ↔ simulacro", help: "Una pregunta que los estudiantes ya vieron en una tarea, práctica, juego o clase no sale en su simulacro, y al revés." },
  repeat: { label: "Repetir con los mismos estudiantes", help: "La misma pregunta otra vez en una actividad del mismo tipo (dos tareas, dos simulacros)." },
  reserved: { label: "Preguntas reservadas", help: "Una pregunta reservada para un simulacro no se puede usar en tareas, prácticas, juegos ni clases." },
  reach: { label: "Quiénes cuentan", help: "Con «Mismos estudiantes» solo cuenta lo que ya vio ese grupo (11A en cualquier materia). Con «Todo el colegio», cualquier uso cuenta." },
};
export const normalizeRules = (r) => {
  const out = { ...DEFAULT_RULES };
  for (const k of ["cross", "repeat", "reserved"]) if (["block", "warn", "off"].includes(r?.[k])) out[k] = r[k];
  if (["group", "school"].includes(r?.reach)) out.reach = r.reach;
  return out;
};

const iso = (v) => (v ? new Date(v).toISOString() : null);

// One row of the school_question_uses() function (or of the fallback built from the teacher's own lists).
export function useFromRow(r) {
  const g = r.course_id || r.grade || r.group_label ? groupOf({ id: r.course_id, name: r.course_name, grade: r.grade, group_label: r.group_label }) : null;
  return {
    id: String(r.id),
    source: r.source ?? "assignment",
    kind: r.kind ?? "task",
    slug: r.exam_slug,
    scope: r.scope ?? "all",
    keys: Array.isArray(r.question_keys) && r.question_keys.length ? r.question_keys.map(String) : null,
    title: r.title ?? "",
    courseId: r.course_id ?? null,
    courseName: r.course_name ?? "",
    groupKey: g?.key ?? null,
    groupName: g ? (r.grade && r.group_label ? g.name : r.course_name || g.name) : "",
    teacherId: r.teacher_id ?? null,
    teacherName: r.teacher_name ?? "",
    at: iso(r.at),
    status: r.status ?? null,
    paper: r.delivery === "paper",
  };
}

// Without migration 0021 the app still knows what this teacher can read: their assignments, lessons and live games.
export function usesFromLists({ assignments = [], lessons = [], live = [], courses = [], staff = [] }) {
  const course = new Map(courses.map((c) => [c.id, c]));
  const who = new Map(staff.map((p) => [p.id, p.full_name || p.email]));
  const row = (c, extra) => ({ course_id: c?.id ?? null, course_name: c?.name ?? "", grade: c?.grade ?? null, group_label: c?.group_label ?? null, ...extra });
  return [
    ...assignments.map((a) => useFromRow(row(course.get(a.course_id) ?? { id: a.course_id, name: a.courses?.name }, {
      source: "assignment", id: a.id, kind: a.kind, exam_slug: a.exam_slug, scope: a.scope, question_keys: a.question_keys, title: a.title,
      teacher_id: a.created_by, teacher_name: who.get(a.created_by) ?? "", at: a.opens_at ?? a.created_at, status: a.status, delivery: a.delivery,
    }))),
    ...lessons.map((l) => useFromRow(row(null, {
      source: "lesson", id: l.id, kind: "lesson", exam_slug: l.exam_slug, scope: "all", title: l.title,
      question_keys: (l.items ?? []).filter((i) => i.type === "q").map((i) => i.key), teacher_id: l.owner_id, teacher_name: who.get(l.owner_id) ?? "", at: l.updated_at,
    }))).filter((u) => u.keys),
    ...live.map((s) => useFromRow(row(course.get(s.course_id), {
      source: "live", id: s.id, kind: "live", exam_slug: s.exam_slug, scope: "all", question_keys: s.question_keys, title: s.title,
      teacher_id: s.host_id, teacher_name: who.get(s.host_id) ?? "", at: s.created_at, status: s.state,
    }))),
  ];
}

// Key -> uses (newest first) for one booklet. A use with no keys covers its whole scope (the booklet or one area).
export function useIndex(uses, slug, exam) {
  const index = new Map();
  for (const u of uses) {
    if (u.slug !== slug) continue;
    const keys = u.keys ?? (exam ? questionsFor(exam, u.scope).map((q) => q.key) : []);
    for (const k of keys) index.set(k, [...(index.get(k) ?? []), u]);
  }
  for (const list of index.values()) list.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return index;
}

// Holds. qkey null = the whole booklet. until null = until someone releases it.
// In the database the whole booklet is the key "*", so one hold per question can be upserted.
export const WHOLE = "*";
export function holdFromRow(r) {
  return {
    id: r.id, slug: r.exam_slug, key: r.qkey == null || r.qkey === WHOLE ? null : String(r.qkey), reserve: Boolean(r.reserve), hide: Boolean(r.hide_from_students),
    label: r.label ?? "", until: r.until ?? null, assignmentId: r.assignment_id ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at ?? null,
  };
}
export const activeHolds = (holds, now = Date.now()) => holds.filter((h) => !h.until || new Date(h.until).getTime() >= now);

// The hold that applies to one question: its own plus its booklet's.
export function holdOf(holds, slug, key) {
  const mine = holds.filter((h) => h.slug === slug && (h.key === null || h.key === key));
  if (!mine.length) return null;
  return {
    reserve: mine.some((h) => h.reserve),
    hide: mine.some((h) => h.hide),
    whole: mine.some((h) => h.key === null),
    labels: [...new Set(mine.map((h) => h.label).filter(Boolean))],
    holds: mine,
  };
}

// What students may not see in free practice: { slugs: Set (whole booklets), keys: Map slug -> Set }.
export function hiddenFor(rows) {
  const slugs = new Set();
  const keys = new Map();
  for (const r of rows) {
    const slug = r.exam_slug ?? r.slug;
    const raw = r.qkey ?? r.key ?? null;
    const key = raw === WHOLE ? null : raw;
    if (key == null) slugs.add(slug);
    else keys.set(slug, new Set([...(keys.get(slug) ?? []), String(key)]));
  }
  return { slugs, keys };
}
export const visibleKeys = (hidden, slug, questions) => {
  if (hidden?.slugs.has(slug)) return [];
  const off = hidden?.keys.get(slug);
  return questions.filter((q) => !off?.has(q.key)).map((q) => q.key);
};

const shortDay = (v) => (v ? new Date(v).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "");
export const describeUse = (u) => [kindLabel(u.kind) + (u.paper ? " en papel" : ""), u.groupName || u.courseName, shortDay(u.at)].filter(Boolean).join(" · ");

const RANK = { block: 3, warn: 2, info: 1 };
const worst = (a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);

// Whether a question may go into a new activity. ctx: { kind, courses (the classes it is for), index, holds, slug, rules }.
// Returns { level: "block" | "warn" | "info" | null, reasons: [string], same: [uses with these students], other: [uses] }.
export function checkKey(key, ctx) {
  const rules = normalizeRules(ctx.rules);
  const fam = familyOf(ctx.kind);
  const ids = new Set((ctx.courses ?? []).map((c) => c.id));
  const groups = new Set((ctx.courses ?? []).map((c) => groupOf(c).key));
  const uses = (ctx.index?.get(key) ?? []).filter((u) => !ctx.ignoreId || u.id !== ctx.ignoreId);
  const sameStudents = (u) => rules.reach === "school" || (u.courseId && ids.has(u.courseId)) || (u.groupKey && groups.has(u.groupKey));
  const same = uses.filter(sameStudents);
  const other = uses.filter((u) => !sameStudents(u));
  let level = null;
  const reasons = [];
  const say = (lvl, text) => { if (lvl === "off") return; level = worst(level, lvl); reasons.push(text); };

  const cross = same.filter((u) => familyOf(u.kind) !== fam);
  if (cross.length) {
    const u = cross[0];
    say(rules.cross, fam === "exam"
      ? `Estos estudiantes ya la vieron: ${describeUse(u)}`
      : `Salió en un simulacro de estos estudiantes: ${describeUse(u)}`);
  }
  const repeat = same.filter((u) => familyOf(u.kind) === fam);
  if (repeat.length) say(rules.repeat, `Ya la usaron con estos estudiantes: ${describeUse(repeat[0])}${repeat.length > 1 ? ` y ${repeat.length - 1} más` : ""}`);

  const hold = ctx.holds ? holdOf(ctx.holds, ctx.slug, key) : null;
  if (hold?.reserve && fam !== "exam") say(rules.reserved, `Reservada para un simulacro${hold.labels.length ? `: ${hold.labels.join(", ")}` : ""}`);
  else if (hold?.reserve) say("info", `Reservada para simulacro${hold.labels.length ? `: ${hold.labels.join(", ")}` : ""}`);
  if (hold?.hide && !hold.reserve) say("info", "Oculta de la práctica libre");
  if (other.length) say("info", `Usada antes en el colegio: ${describeUse(other[0])}${other.length > 1 ? ` y ${other.length - 1} más` : ""}`);
  return { level, reasons, same, other };
}

export function checkKeys(keys, ctx) {
  const out = new Map();
  for (const k of keys) out.set(k, checkKey(k, ctx));
  return out;
}

// Splits a selection by what the rules say, for the warning before saving.
export function verdict(keys, checks) {
  const blocked = keys.filter((k) => checks.get(k)?.level === "block");
  const warned = keys.filter((k) => checks.get(k)?.level === "warn");
  return { blocked, warned, ok: blocked.length === 0 };
}

// One booklet seen as a map: each question with its uses and holds, and the state the control screen colours it by.
// state: "free" (never used), "practice", "exam", "both" (one group met it in practice and in a simulacro: the case to avoid).
export function bookletMap(exam, index, holds, slug) {
  return exam.questions.map((q) => {
    const uses = index.get(q.key) ?? [];
    const fams = new Set(uses.map((u) => familyOf(u.kind)));
    const hold = holdOf(holds, slug, q.key);
    const groups = new Map();
    for (const u of uses) if (u.groupKey) groups.set(u.groupKey, [...(groups.get(u.groupKey) ?? []), u]);
    // The same students met it more than once (any kinds), or in a homework and a simulacro: the case to avoid.
    const repeated = [...groups.values()].some((list) => list.length > 1);
    const crossed = [...groups.values()].some((list) => new Set(list.map((u) => familyOf(u.kind))).size === 2);
    const state = fams.size === 0 ? "free" : crossed ? "both" : fams.has("exam") ? "exam" : "practice";
    return { key: q.key, number: q.number, section: q.section, uses, state, repeated, reserve: Boolean(hold?.reserve), hide: Boolean(hold?.hide), hold, question: q };
  });
}

export const MAP_FILTERS = [
  ["all", "Todas"],
  ["free", "Sin usar"],
  ["used", "Usadas"],
  ["both", "Tarea y simulacro"],
  ["repeated", "Repetidas"],
  ["reserved", "Reservadas"],
  ["hidden", "Ocultas"],
];
export function filterMap(rows, f) {
  if (f === "free") return rows.filter((r) => r.state === "free");
  if (f === "used") return rows.filter((r) => r.state !== "free");
  if (f === "both") return rows.filter((r) => r.state === "both");
  if (f === "repeated") return rows.filter((r) => r.repeated);
  if (f === "reserved") return rows.filter((r) => r.reserve);
  if (f === "hidden") return rows.filter((r) => r.hide);
  return rows;
}
export function mapTotals(rows) {
  return {
    total: rows.length,
    free: rows.filter((r) => r.state === "free").length,
    used: rows.filter((r) => r.state !== "free").length,
    both: rows.filter((r) => r.state === "both").length,
    repeated: rows.filter((r) => r.repeated).length,
    reserved: rows.filter((r) => r.reserve).length,
    hidden: rows.filter((r) => r.hide).length,
  };
}

// The booklet a student practises freely: the same exam without the questions the school holds back from them.
// Returns the exam itself when nothing is hidden, so screens that compare by identity keep working.
export function withoutHidden(exam, hidden, slug) {
  if (!exam || !hidden) return exam;
  if (hidden.slugs.has(slug)) return { ...exam, questions: [], sections: exam.sections.map((s) => ({ ...s, questions: [] })), held: true };
  const off = hidden.keys.get(slug);
  if (!off?.size || !exam.questions.some((q) => off.has(q.key))) return exam;
  const keep = (q) => !off.has(q.key);
  return { ...exam, questions: exam.questions.filter(keep), sections: exam.sections.map((s) => ({ ...s, questions: s.questions.filter(keep) })).filter((s) => s.questions.length), held: true };
}
