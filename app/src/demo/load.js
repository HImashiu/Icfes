// Loads the booklets the demo school works on and builds the in-memory school. Only reads files the app already serves.
import { parseExam, parseKey } from "../lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../lib/figures.js";
import { buildDemo } from "./seed.js";
import { createDemoClient } from "./client.js";
import { liveRpc, liveScope } from "./live.js";

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
  const keyOf = (slug, key) => bundles.get(slug)?.key?.get(key) ?? null;
  return { client: createDemoClient({ tables, profile, scope: liveScope, extraRpc: liveRpc({ tables, profile, keyOf }) }), profile, student: { ...student, client: studentClient(tables, student.profile) } };
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
  return createDemoClient({ tables, profile: me, scope, extraRpc: { student_classes } });
}
