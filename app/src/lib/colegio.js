// Colegio: what coordination needs to run the school. Per-teacher figures (what each one teaches, made and
// reached), the "who did what" feed, and the invitation list parser. Figures describe each teacher's own work and
// are never ranked against each other.
import { scorePct, whoOf } from "./assignments.js";
import { AREAS, areaOf, areaShort, classLabel, grantCovers } from "./teaching.js";
import { gradeLabel } from "./spaces.js";

const DAY = 864e5;
const fold = (s) => String(s ?? "").trim().toLowerCase();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const ACCESS_LABEL = { edit: "Edita", view: "Solo ve" };
export const ROLE_LABEL = { teacher: "Docente", school_admin: "Coordinación", student: "Estudiante" };

// What a subject grant covers, in words: "Matemáticas en todos los grados", "Todas las áreas en 11".
export function grantText(g) {
  const area = g.area === "*" ? "Todas las áreas" : areaShort(g.area);
  return `${area} ${g.grade ? `en ${gradeLabel(g.grade)}` : "en todos los grados"}`;
}

// The classes a person reaches through their roster rows and grants, each with the access they hold there.
export function accessOf(person, { courses, members, grants = [] }) {
  const mine = (m) => (person.id && m.profile_id === person.id) || fold(m.email) === fold(person.email);
  const rows = members.filter((m) => m.role === "teacher" && mine(m));
  const out = new Map();
  for (const m of rows) {
    const c = courses.find((x) => x.id === m.course_id);
    if (!c) continue;
    out.set(c.id, { course: c, access: m.access ?? "edit", memberId: m.id, via: "class" });
  }
  for (const g of grants.filter((x) => x.profile_id === person.id)) {
    for (const c of courses.filter((x) => grantCovers(g, x))) {
      const prev = out.get(c.id);
      if (prev && (prev.access === "edit" || g.access === "view")) continue;
      out.set(c.id, { course: c, access: g.access, memberId: prev?.memberId ?? null, via: "subject" });
    }
  }
  return [...out.values()].sort((a, b) => classLabel(a.course).localeCompare(classLabel(b.course), "es", { numeric: true }));
}

// One row per staff member: classes they edit and only read, students they reach, activities they made (all and
// the last 30 days), how much of it was delivered, the average result, own questions and classes to project, and
// when they last created something.
export function teacherStats({ staff, courses, members, grants = [], authorship = {}, attempts = [], now = Date.now() }) {
  const { assignments = [], questions = [], lessons = [] } = authorship;
  const studentsIn = new Map();
  for (const m of members) if (m.role === "student") studentsIn.set(m.course_id, (studentsIn.get(m.course_id) ?? new Set()).add(fold(m.email)));
  const delivered = new Map();
  for (const t of attempts) {
    if (!t.submitted_at || !t.assignment_id) continue;
    const row = delivered.get(t.assignment_id) ?? { who: new Set(), pcts: [] };
    const who = whoOf(t);
    if (who) row.who.add(who);
    const p = scorePct(t);
    if (p != null) row.pcts.push(p);
    delivered.set(t.assignment_id, row);
  }
  return staff.map((p) => {
    const access = accessOf(p, { courses, members, grants });
    const edits = access.filter((a) => a.access === "edit");
    const students = new Set(edits.flatMap((a) => [...(studentsIn.get(a.course.id) ?? [])]));
    const made = assignments.filter((a) => a.created_by === p.id);
    let expected = 0; let got = 0; const pcts = [];
    for (const a of made) {
      const d = delivered.get(a.id);
      expected += a.assignee_id ? 1 : studentsIn.get(a.course_id)?.size ?? 0;
      got += d?.who.size ?? 0;
      if (d) pcts.push(...d.pcts);
    }
    const ownQuestions = questions.filter((q) => q.owner_id === p.id);
    const ownLessons = lessons.filter((l) => l.owner_id === p.id);
    const stamps = [...made, ...ownQuestions, ...ownLessons].map((x) => Date.parse(x.created_at)).filter(Number.isFinite);
    const areas = [...new Set(edits.map((a) => areaOf(a.course)).filter(Boolean))].sort((a, b) => AREAS.indexOf(a) - AREAS.indexOf(b));
    return {
      person: p,
      access,
      classes: edits.length,
      viewOnly: access.length - edits.length,
      areas,
      students: students.size,
      activities: made.length,
      recent: made.filter((a) => now - Date.parse(a.created_at) < 30 * DAY).length,
      completion: expected ? Math.round((Math.min(got, expected) / expected) * 100) : null,
      avgPct: pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null,
      questions: ownQuestions.length,
      lessons: ownLessons.length,
      lastAt: stamps.length ? Math.max(...stamps) : null,
      made,
    };
  });
}

// "hace 3 días", "hoy", "ayer".
export function ago(ms, now = Date.now()) {
  if (!ms) return "nunca";
  const d = Math.floor((now - ms) / DAY);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m <= 1 ? "hace un mes" : `hace ${m} meses`;
}

const KIND = { task: "una práctica", homework: "una tarea", exam: "un simulacro" };

// What one audit row says, in a sentence (without the actor, who leads the line).
export function auditText(row, { staff = [], courses = [] } = {}) {
  const d = row.detail ?? {};
  const who = (id, email) => staff.find((p) => p.id === id)?.full_name || email || staff.find((p) => p.id === id)?.email || "alguien";
  const cls = (id) => classLabel(courses.find((c) => c.id === id)) || d.class || "una clase";
  switch (row.action) {
    case "invite": return `invitó a ${d.email} como ${ROLE_LABEL[d.role]?.toLowerCase() ?? "docente"}`;
    case "school_name": return `cambió el nombre del colegio a «${d.name}»`;
    case "teacher_code": return "generó un código de docente nuevo";
    case "settings": return `cambió los ajustes del colegio${d.what ? ` (${d.what})` : ""}`;
    case "group_create": return `creó ${d.groups?.length > 1 ? "los cursos" : "el curso"} ${(d.groups ?? []).join(", ")}`;
    case "group_delete": return `borró el curso ${d.group}`;
    case "class_teacher": return `asignó a ${who(d.profile, d.email)} en ${cls(d.course)} (${ACCESS_LABEL[d.access] ?? "Edita"})`;
    case "class_remove": return `quitó a ${who(d.profile, d.email)} de ${cls(d.course)}`;
    case "access": return `cambió el permiso de ${who(d.profile, d.email)} en ${cls(d.course)} a «${ACCESS_LABEL[d.access]}»`;
    case "grant": return `dio a ${who(d.profile)} acceso «${ACCESS_LABEL[d.access]}» a ${grantText(d)}`;
    case "grant_remove": return `quitó a ${who(d.profile)} el acceso a ${grantText(d)}`;
    case "director": return d.profile ? `nombró a ${who(d.profile)} director(a) de ${d.group}` : `dejó a ${d.group} sin director de grupo`;
    case "role": return `cambió el rol de ${who(d.profile)} a ${ROLE_LABEL[d.role]?.toLowerCase() ?? d.role}`;
    case "roster": return `agregó ${d.count} estudiantes a ${d.where}`;
    default: return row.action;
  }
}

// Coordination actions (audit log) and authored work (activities, classes, questions, classes to project) in one
// timeline, newest first.
export function buildFeed({ audit = [], authorship = {}, staff = [], courses = [] }) {
  const name = (id) => staff.find((p) => p.id === id)?.full_name || staff.find((p) => p.id === id)?.email || "Alguien";
  const out = [];
  for (const r of audit) out.push({ id: `au-${r.id}`, at: Date.parse(r.created_at), actor: r.actor, who: name(r.actor), text: auditText(r, { staff, courses }), kind: "admin" });
  for (const a of authorship.assignments ?? []) {
    const c = courses.find((x) => x.id === a.course_id);
    out.push({ id: `as-${a.id}`, at: Date.parse(a.created_at), actor: a.created_by, who: name(a.created_by), text: `creó ${KIND[a.kind] ?? "una actividad"} «${a.title}»${c ? ` en ${classLabel(c)}` : ""}`, kind: "activity", assignmentId: a.id });
  }
  for (const c of authorship.courses ?? []) out.push({ id: `co-${c.id}`, at: Date.parse(c.created_at), actor: c.created_by, who: name(c.created_by), text: `creó la clase ${classLabel(courses.find((x) => x.id === c.id) ?? c)}`, kind: "class" });
  for (const q of authorship.questions ?? []) out.push({ id: `q-${q.id}`, at: Date.parse(q.created_at), actor: q.owner_id, who: name(q.owner_id), text: `escribió una pregunta${q.area ? ` de ${areaShort(q.area)}` : ""}`, kind: "question" });
  for (const l of authorship.lessons ?? []) out.push({ id: `l-${l.id}`, at: Date.parse(l.created_at), actor: l.owner_id, who: name(l.owner_id), text: `armó la clase para proyectar «${l.title}»`, kind: "lesson" });
  return out.filter((e) => Number.isFinite(e.at)).sort((a, b) => b.at - a.at);
}

// Invitation list: one person per line, "correo", "correo, nombre" or "nombre <correo>". Answers the valid rows
// (deduplicated) and the lines that are not.
export function parseInvites(text) {
  const rows = [];
  const bad = [];
  const seen = new Set();
  String(text ?? "").split(/\n|;/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const angled = /^(.*)<([^>]+)>\s*$/.exec(line);
    let email; let name;
    if (angled) { email = angled[2]; name = angled[1]; } else {
      const parts = line.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
      const at = parts.findIndex((p) => p.includes("@"));
      email = at >= 0 ? parts[at] : "";
      name = parts.filter((_, i) => i !== at).join(" ");
    }
    email = fold(email);
    name = String(name ?? "").replace(/["']/g, "").trim();
    if (!isEmail(email)) { bad.push(line); return; }
    if (seen.has(email)) return;
    seen.add(email);
    rows.push({ email, name });
  });
  return { rows, bad };
}

// The grades a school works with: from Ajustes, else every grade that has a curso or a class, else 6 to 11.
export function schoolGrades(settings, groups = [], courses = []) {
  const set = settings?.grades?.length ? settings.grades : [...new Set([...groups.map((g) => String(g.grade)), ...courses.map((c) => (c.grade ? String(c.grade) : null)).filter(Boolean)])];
  const list = set.length ? set : ["6", "7", "8", "9", "10", "11"];
  return [...new Set(list.map(String))].sort((a, b) => Number(a) - Number(b));
}

// "A, B, C" or "A-C" or "01 02" into group labels.
export function parseLabels(text) {
  const out = [];
  for (const part of String(text ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean)) {
    const range = /^([A-Z])-([A-Z])$/.exec(part);
    if (range) {
      for (let c = range[1].charCodeAt(0); c <= range[2].charCodeAt(0); c += 1) out.push(String.fromCharCode(c));
    } else if (part.length <= 8) out.push(part);
  }
  return [...new Set(out)];
}
