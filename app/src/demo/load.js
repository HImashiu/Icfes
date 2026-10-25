// Loads the booklets the demo school works on and builds the in-memory school. Only reads files the app already serves.
import { parseExam, parseKey } from "../lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../lib/figures.js";
import { buildDemo } from "./seed.js";
import { createDemoClient } from "./client.js";

const base = import.meta.env.BASE_URL;
const getJson = async (path) => {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
};

export async function loadDemo() {
  const index = (await getJson("exams/index.json")).exams ?? [];
  const ready = index.filter((e) => e.status !== "proximamente" && e.hasKey).slice(0, 2);
  const bundles = new Map();
  for (const entry of ready) {
    const [raw, rawKey, rawFigures, rawEnrich] = await Promise.all([
      getJson(`exams/${entry.slug}.json`), getJson(`exams/${entry.slug}.key.json`),
      entry.hasFigures ? getJson(`exams/${entry.slug}.figures.json`) : null,
      entry.hasEnrich ? getJson(`exams/${entry.slug}.enrich.json`) : null,
    ]);
    const parsed = parseExam(raw);
    const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
    bundles.set(entry.slug, { exam: prepareExam(parsed, figures), key: parseKey(rawKey), enrich: rawEnrich?.questions ?? null });
  }
  const { profile, tables, student } = buildDemo({ bundles });
  return { client: createDemoClient({ tables, profile, extraRpc: { school_question_uses: () => questionUses(tables) } }), profile, student: { ...student, client: studentClient(tables, student.profile) } };
}

// The same school seen by one student: only their classes, their tasks and their own attempts.
function studentClient(tables, me) {
  const mine = () => new Set(tables.course_members.filter((m) => m.profile_id === me.id && m.role === "student").map((m) => m.course_id));
  const scope = {
    courses: (r) => mine().has(r.id),
    course_members: (r) => r.profile_id === me.id,
    assignments: (r) => mine().has(r.course_id) && r.status !== "draft",
    attempts: (r) => r.profile_id === me.id,
    annotations: (r) => !r.profile_id || r.profile_id === me.id,
  };
  const student_classes = () => tables.courses.filter((c) => mine().has(c.id)).map((c) => ({
    id: c.id, name: c.name, subject: c.subject, grade: c.grade, group_label: c.group_label,
    teachers: tables.course_members.filter((m) => m.course_id === c.id && m.role === "teacher").map((m) => m.full_name),
  }));
  return createDemoClient({ tables, profile: me, scope, extraRpc: { student_classes, hidden_questions: () => hiddenQuestions(tables) } });
}

// Migration 0021's two functions, on the in-memory school: every use of every question, and what students may not see.
function questionUses(tables) {
  const course = new Map(tables.courses.map((c) => [c.id, c]));
  const who = new Map(tables.profiles.map((p) => [p.id, p.full_name || p.email]));
  const at = (c) => ({ course_id: c?.id ?? null, course_name: c?.name ?? null, grade: c?.grade ?? null, group_label: c?.group_label ?? null });
  return [
    ...tables.assignments.map((a) => ({ source: "assignment", id: a.id, kind: a.kind, exam_slug: a.exam_slug, scope: a.scope, question_keys: a.question_keys, title: a.title,
      ...at(course.get(a.course_id)), teacher_id: a.created_by, teacher_name: who.get(a.created_by) ?? "", at: a.opens_at ?? a.created_at, status: a.status, delivery: a.delivery ?? null })),
    ...(tables.live_sessions ?? []).filter((x) => x.current_index >= 0).map((x) => ({ source: "live", id: x.id, kind: "live", exam_slug: x.exam_slug, scope: "all",
      question_keys: x.question_keys.slice(0, x.current_index + 1), title: x.title, ...at(course.get(x.course_id)), teacher_id: x.host_id, teacher_name: who.get(x.host_id) ?? "", at: x.created_at, status: x.state })),
    ...(tables.lessons ?? []).map((l) => ({ source: "lesson", id: l.id, kind: "lesson", exam_slug: l.exam_slug, scope: "all",
      question_keys: (l.items ?? []).filter((i) => i.type === "q").map((i) => i.key), title: l.title, ...at(null), teacher_id: l.owner_id, teacher_name: who.get(l.owner_id) ?? "", at: l.updated_at, status: l.visibility })),
  ];
}
function hiddenQuestions(tables) {
  const now = Date.now();
  return (tables.question_holds ?? []).filter((h) => h.hide_from_students && (!h.until || new Date(h.until).getTime() >= now)).map((h) => ({ exam_slug: h.exam_slug, qkey: h.qkey === "*" ? null : h.qkey }));
}
