// Builds the invented school of the demo: 3 class spaces, 120 students and 8 weeks of work, from the exam bundles
// the app already loaded. Everything is deterministic (same seed, same school) and kept in memory.
// No exam text is stored here: answers refer to question keys of whatever booklets are loaded.
import { bankItems } from "../lib/bank.js";
import { scoreAttempt } from "../lib/exam.js";
import { CONSENT_VERSION } from "../lib/consent.js";
import { PRESETS } from "../lib/chartBuilder.js";
import { BUILTIN_FORMATS } from "../lib/lesson.js";
import { generatePlan } from "../lib/seating.js";
import { SUGGESTED_STATUSES } from "../lib/workspaceStore.js";
import { EMPTY_FILTERS } from "../lib/workspace.js";
import { FIRST, LAST, TEACHERS, emailOf } from "./names.js";
import { bookletCode, sessionOf } from "../lib/booklets.js";

export const SCHOOL_ID = "demo-school";
const DAY = 864e5;

function rngFor(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  return { next, normal, pick: (list) => list[Math.floor(next() * list.length)] };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Seconds a student typically needs per question, by area.
const AREA_SECONDS = { "Lectura crítica": 85, Matemáticas: 100, "Sociales y ciudadanas": 65, "Ciencias naturales": 75, Inglés: 55 };

const COURSES = [
  { id: "demo-c1", subject: "Matemáticas", group: "A", focus: "Matemáticas", teacher: 1, edge: 0.15, titles: ["Tablas y gráficos", "Funciones y variación", "Simulacro de matemáticas", "Probabilidad y conteo", "Razonamiento con datos"] },
  { id: "demo-c2", subject: "Lectura crítica", group: "B", focus: "Lectura crítica", teacher: 2, edge: 0, titles: ["Textos argumentativos", "Inferir la intención del autor", "Simulacro de lectura", "Textos discontinuos", "Contrastar posiciones"] },
  { id: "demo-c3", subject: "Todas las áreas", group: "C", focus: null, teacher: 3, edge: -0.1, titles: ["Calentamiento Saber 11", "Mezcla de áreas", "Simulacro general", "Ciencias y sociales", "Repaso antes del simulacro"] },
  // The rest of 11 A's subjects, each with its own teacher: the same 40 students see one class per subject.
  { id: "demo-c4", subject: "Lectura crítica", group: "A", focus: "Lectura crítica", teacher: 2, titles: ["Idea principal y tesis", "Tipos de texto", "Simulacro de lectura", "Leer una infografía", "Argumentos y contraargumentos"] },
  { id: "demo-c5", subject: "Ciencias naturales", group: "A", focus: "Ciencias naturales", teacher: 4, titles: ["Variables de un experimento", "Energía y cambios", "Simulacro de ciencias", "Ecosistemas", "Leer resultados de laboratorio"] },
  { id: "demo-c6", subject: "Sociales y ciudadanas", group: "A", focus: "Sociales y ciudadanas", teacher: 3, titles: ["La Constitución del 91", "Mecanismos de participación", "Simulacro de sociales", "Conflictos y perspectivas", "Economía y territorio"] },
  { id: "demo-c7", subject: "Inglés", group: "A", focus: "Inglés", teacher: 5, titles: ["Avisos y letreros", "Vocabulary in context", "Simulacro de inglés", "Short conversations", "Reading for details"] },
];
// The student the demo shows on the student side: the first of 11 A.
export const DEMO_STUDENT_N = 1;
const DAYS_AGO = [55, 41, 27, 13, 2];
const KINDS = ["task", "homework", "exam", "task", "homework"];

export function buildDemo({ bundles, now = Date.now() }) {
  const rand = rngFor(20261024);
  const slugs = [...bundles.keys()];
  const itemsBySlug = new Map(slugs.map((s) => {
    const b = bundles.get(s);
    return [s, bankItems(b.exam, { enrich: b.enrich, key: b.key }).filter((i) => i.hasKey)];
  }));
  const questionBy = new Map(slugs.map((s) => [s, new Map(bundles.get(s).exam.questions.map((q) => [q.key, q]))]));

  const staff = [
    { id: "demo-t0", email: emailOf(...TEACHERS[0]), full_name: `${TEACHERS[0][0]} ${TEACHERS[0][1]}`, role: "school_admin", created_at: new Date(now - 90 * DAY).toISOString(), school_id: SCHOOL_ID },
    ...TEACHERS.slice(1).map(([f, l], i) => ({ id: `demo-t${i + 1}`, email: emailOf(f, l), full_name: `${f} ${l}`, role: "teacher", created_at: new Date(now - 80 * DAY).toISOString(), school_id: SCHOOL_ID })),
  ];

  // ----- people -----
  const courses = [];
  const members = [];
  const students = [];
  const used = new Set();
  const emails = new Set();
  let n = 0;
  const edgeOf = {};
  COURSES.forEach((c, ci) => {
    courses.push({ id: c.id, name: c.subject === "Todas las áreas" ? `Preparación Saber 11 ${c.group}` : `${c.subject} 11 ${c.group}`, grade: "11", year: 2026, subject: c.subject, group_label: c.group, school_id: SCHOOL_ID, created_by: staff[c.teacher].id, created_at: new Date(now - 70 * DAY).toISOString() });
    members.push({ id: `demo-m-t${ci}`, course_id: c.id, profile_id: staff[c.teacher].id, email: staff[c.teacher].email, full_name: staff[c.teacher].full_name, role: "teacher" });
    // A group's students are made once, with its first class; its other classes reuse them.
    if (c.group in edgeOf) {
      for (const s of students.filter((x) => x.group === c.group)) {
        members.push({ id: `${s.memberId}-${c.id}`, course_id: c.id, profile_id: s.profileId, email: s.email, full_name: s.name, role: "student" });
      }
      return;
    }
    edgeOf[c.group] = c.edge ?? 0;
    for (let k = 0; k < 40; k += 1) {
      let first; let last; let tries = 0;
      do { first = rand.pick(FIRST); last = `${rand.pick(LAST)} ${rand.pick(LAST)}`; tries += 1; } while (used.has(`${first} ${last}`) && tries < 50);
      used.add(`${first} ${last}`);
      n += 1;
      const roll = rand.next();
      const s = {
        n, group: c.group, courseId: c.id, memberId: `demo-m-${n}`, profileId: `demo-p-${n}`, name: `${first} ${last}`, email: emailOf(first, last.split(" ")[0], emails.has(emailOf(first, last.split(" ")[0])) ? n : ""),
        ability: rand.normal() * 0.8 + edgeOf[c.group],
        engagement: roll < 0.6 ? 0.94 : roll < 0.9 ? 0.78 : 0.45,
        speed: Math.exp(rand.normal() * 0.22),
        growth: 0.03 + rand.next() * 0.05,
        dropout: rand.next() < 0.05, // stops delivering after week 5
        slump: rand.next() < 0.06, // falls hard in the last two tasks
        hintLover: rand.next() < 0.25,
        areaSkill: Object.fromEntries(Object.keys(AREA_SECONDS).map((a) => [a, rand.normal() * 0.45])),
      };
      if (n === DEMO_STUDENT_N) Object.assign(s, { name: "Valentina Ospina Rojas", email: "valentina.ospina@demo.invalid", ability: 0.35, engagement: 1, dropout: false, slump: false, areaSkill: { ...s.areaSkill, Matemáticas: -0.35, Inglés: 0.4 } });
      emails.add(s.email);
      students.push(s);
      members.push({ id: s.memberId, course_id: c.id, profile_id: s.profileId, email: s.email, full_name: s.name, role: "student" });
    }
  });

  // The math teacher of 11 A also reads its Ciencias naturales class (view only), to follow the shared data work.
  members.push({ id: "demo-m-view-1", course_id: "demo-c5", profile_id: staff[1].id, email: staff[1].email, full_name: staff[1].full_name, role: "teacher", access: "view" });

  // ----- assignments and what students did -----
  const assignments = [];
  const attempts = [];
  const proctorEvents = [];
  const lessonKeysByAssignment = new Map();
  let pe = 0;
  COURSES.forEach((c, ci) => {
    const roster = students.filter((s) => s.group === c.group);
    DAYS_AGO.forEach((ago, j) => {
      const poolOf = (sl) => (c.focus ? (itemsBySlug.get(sl) ?? []).filter((i) => i.section === c.focus) : itemsBySlug.get(sl) ?? []);
      const candidates = slugs.filter((sl) => poolOf(sl).length);
      if (!candidates.length) return;
      const slug = candidates[(ci + j) % candidates.length];
      const pool = poolOf(slug);
      const count = KINDS[j] === "exam" ? 24 : 16;
      const step = pool.length / Math.min(count, pool.length);
      const picked = Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[Math.floor(i * step)]);
      const keys = picked.map((i) => i.key);
      const opens = now - (ago + ci) * DAY;
      const active = j === DAYS_AGO.length - 1;
      const kind = KINDS[j];
      const exam = kind === "exam";
      const a = {
        id: `demo-a-${ci + 1}-${j + 1}`, course_id: c.id, created_by: staff[c.teacher].id, kind, title: c.titles[j], exam_slug: slug, scope: c.focus ?? "all", question_keys: keys,
        opens_at: new Date(opens).toISOString(), due_at: new Date(active ? now + (1 + (ci % 5)) * DAY + 5 * 3600000 : opens + 6 * DAY).toISOString(),
        time_limit_min: exam ? 45 : null, reveal_policy: exam ? "after_close" : "after_submit", max_attempts: exam ? 1 : null, assignee_id: null,
        status: "published", created_at: new Date(opens - DAY).toISOString(), allow_hints: !exam, instant_feedback: !exam,
        allow_definitions: false, definitions: [], proctor: exam, courses: { name: courses[ci].name },
      };
      assignments.push(a);
      lessonKeysByAssignment.set(a.id, keys);
      const bundle = bundles.get(slug);
      const qs = keys.map((k) => questionBy.get(slug).get(k)).filter(Boolean);
      const trend = j; // tasks later in the term are easier for a student who keeps working
      for (const s of roster) {
        if (s.n === DEMO_STUDENT_N && active) continue;
        if (s.dropout && j >= 3) continue;
        if (s.n !== DEMO_STUDENT_N && rand.next() > s.engagement * (active ? 0.6 : 1)) continue;
        const slumpShift = s.slump && j >= 3 ? -1.4 : 0;
        const answers = {};
        const times = {};
        const hints = {};
        const changes = {};
        for (const q of qs) {
          const item = picked.find((i) => i.key === q.key);
          const diff = (item?.dificultad ?? 3) - 3;
          const theta = s.ability + s.growth * 10 * (trend / 4) + (s.areaSkill[q.section] ?? 0) + slumpShift;
          const p = sigmoid(1.15 * (theta - 0.5 * diff) + 0.15);
          const right = bundle.key.get(q.key);
          const roll = rand.next();
          if (exam && roll > 0.97) continue; // left blank
          const wrong = (q.options ?? []).map((o) => o.letter).filter((l) => l !== right);
          const popular = wrong[(Number(q.number) || 0) % Math.max(1, wrong.length)];
          const correct = rand.next() < p;
          const letter = correct ? right : rand.next() < 0.5 ? popular : rand.pick(wrong.length ? wrong : ["A"]);
          answers[q.key] = letter;
          const base = AREA_SECONDS[q.section] ?? 70;
          times[q.key] = Math.max(6, Math.round(base * (1 + 0.18 * diff) * s.speed * Math.exp(rand.normal() * 0.38) * (correct ? 0.9 : 1.15)));
          if (!exam && rand.next() < (s.hintLover ? 0.3 : 0.07) * (correct ? 0.7 : 1.4)) hints[q.key] = 1 + (rand.next() < 0.2 ? 1 : 0);
          if (rand.next() < 0.07) changes[q.key] = 1;
        }
        const total = Object.values(times).reduce((x, y) => x + y, 0);
        const submitted = Math.min(now - 20 * 60000, opens + (2 + rand.next() * (active ? 70 : 140)) * 3600000);
        const started = submitted - (total + 60 + rand.next() * 120) * 1000;
        const sc = scoreAttempt(qs, answers, bundle.key);
        const leaves = exam && rand.next() < 0.14 ? 1 + Math.floor(rand.next() * 3) : 0;
        attempts.push({
          profile_id: s.profileId, member_id: null, client_id: String(Math.round(started)), assignment_id: a.id, exam_slug: slug, scope: a.scope,
          mode: exam ? "timed" : "practice", started_at: new Date(started).toISOString(), submitted_at: new Date(submitted).toISOString(),
          duration_sec: Math.round((submitted - started) / 1000), answers, times, activity: { hints, changes },
          proctor: exam ? { leaves, awaySec: leaves * 25, pointerOuts: leaves * 2, idleSec: 0 } : null,
          score: { keyed: true, correct: sc.correct, answered: sc.answered, total: sc.total, perArea: sc.perArea }, key_status: "preliminary", device: s.n % 3 ? "phone" : "desktop",
        });
        for (let e = 0; e < leaves; e += 1) {
          const at = started + (0.2 + 0.6 * rand.next()) * (submitted - started);
          pe += 1;
          proctorEvents.push({ id: `demo-pe-${pe}`, assignment_id: a.id, profile_id: s.profileId, client_id: String(Math.round(started)), kind: "leave", at: new Date(at).toISOString(), question_key: keys[Math.floor(rand.next() * keys.length)], secs: null });
          pe += 1;
          proctorEvents.push({ id: `demo-pe-${pe}`, assignment_id: a.id, profile_id: s.profileId, client_id: String(Math.round(started)), kind: "return", at: new Date(at + 25000).toISOString(), question_key: null, secs: 25 });
        }
      }
    });
  });

  // A paper simulacro for the third space: the sheets were scanned, so results hang from the roster rows.
  const paperSlug = slugs[0];
  const paperRoster = members.filter((m) => m.course_id === "demo-c3" && m.role === "student");
  const assignedC3 = assignments.filter((a) => a.course_id === "demo-c3");
  const paperBase = assignedC3[2];
  let seating = [];
  if (paperBase && paperSlug) {
    const paper = { ...paperBase, id: "demo-a-3-paper", title: "Simulacro en papel · sesión 1", opens_at: new Date(now - 2 * DAY).toISOString(), due_at: new Date(now - 1 * DAY).toISOString(), created_at: new Date(now - 6 * 3600000).toISOString(), proctor: false, delivery: "paper" };
    assignments.push(paper);
    const bundle = bundles.get(paper.exam_slug);
    const qs = paper.question_keys.map((k) => questionBy.get(paper.exam_slug).get(k)).filter(Boolean);
    for (const s of students.filter((x) => x.courseId === "demo-c3")) {
      if (rand.next() > 0.93) continue;
      const answers = {};
      for (const q of qs) {
        const right = bundle.key.get(q.key);
        if (rand.next() > 0.96) continue;
        const wrong = (q.options ?? []).map((o) => o.letter).filter((l) => l !== right);
        answers[q.key] = rand.next() < sigmoid(1.1 * (s.ability + 0.4) + 0.1) ? right : rand.pick(wrong.length ? wrong : ["A"]);
      }
      const sc = scoreAttempt(qs, answers, bundle.key);
      attempts.push({ profile_id: s.profileId, member_id: s.memberId, client_id: `paper-${s.n}`, assignment_id: paper.id, exam_slug: paper.exam_slug, scope: paper.scope, mode: "timed", started_at: paper.opens_at, submitted_at: new Date(now - 1.8 * DAY).toISOString(), duration_sec: 45 * 60, answers, times: {}, activity: { hints: {}, changes: {} }, proctor: null, score: { keyed: true, correct: sc.correct, answered: sc.answered, total: sc.total, perArea: sc.perArea }, key_status: "preliminary", device: "paper" });
    }
    const plan = generatePlan({ rows: 7, cols: 7, blocked: ["0,3", "3,3", "6,3"], versions: 4, studentIds: paperRoster.map((m) => m.id), seed: 20261024, orderSeed: 7351 });
    seating = [{ assignment_id: paper.id, plan, updated_at: new Date(now - 5 * 3600000).toISOString() }];
  }


  // ----- teacher workspace (migration 0014): statuses, follow-up, groups, notes, saved views -----
  const pctOf = new Map();
  for (const a of attempts) {
    const who = a.profile_id;
    if (!who || !a.score?.total) continue;
    const list = pctOf.get(who) ?? [];
    list.push(a.score.correct / a.score.total);
    pctOf.set(who, list);
  }
  const avgOf = (s) => { const l = pctOf.get(s.profileId); return l?.length ? l.reduce((x, y) => x + y, 0) / l.length : null; };
  const stamp = (d) => new Date(now - d * DAY).toISOString();
  const statuses = SUGGESTED_STATUSES.map((st, i) => ({ id: `demo-st-${i + 1}`, school_id: SCHOOL_ID, label: st.label, color: st.color, position: i }));
  const statusId = (label) => statuses.find((x) => x.label === label).id;
  const ranked = students.map((s) => ({ s, avg: avgOf(s) })).sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1));
  const flags = [];
  ranked.slice(0, 14).forEach(({ s }, i) => flags.push({ id: `demo-fl-${s.n}`, school_id: SCHOOL_ID, email: s.email, status_id: statusId(i < 7 ? "Necesita apoyo" : "En observación"), follow_up: i < 9, follow_up_due: new Date(now + (i - 2) * DAY).toISOString().slice(0, 10), follow_up_reason: i % 2 ? "Hablar con acudiente" : "Revisar tareas pendientes", updated_at: stamp(i % 6) }));
  ranked.slice(-10).forEach(({ s }) => flags.push({ id: `demo-fl-${s.n}`, school_id: SCHOOL_ID, email: s.email, status_id: statusId("Avanza muy bien"), follow_up: false, updated_at: stamp(3) }));
  ranked.slice(14, 24).forEach(({ s }) => flags.push({ id: `demo-fl-${s.n}`, school_id: SCHOOL_ID, email: s.email, status_id: statusId("Con plan de refuerzo"), follow_up: false, updated_at: stamp(8) }));
  const groups = [
    { id: "demo-gr-1", school_id: SCHOOL_ID, name: "Refuerzo de matemáticas", color: "#FFB547", course_id: "demo-c1", created_by: "demo-t1", created_at: stamp(20) },
    { id: "demo-gr-2", school_id: SCHOOL_ID, name: "Tutores entre pares", color: "#C8F04A", course_id: null, created_by: "demo-t0", created_at: stamp(15) },
    { id: "demo-gr-3", school_id: SCHOOL_ID, name: "Taller de lectura", color: "#8AB4FF", course_id: "demo-c2", created_by: "demo-t2", created_at: stamp(12) },
  ];
  const lowOf = (cid, n) => ranked.filter((r) => r.s.courseId === cid).slice(0, n).map((r) => r.s.email);
  const groupMembers = [
    ...lowOf("demo-c1", 8).map((email) => ({ group_id: "demo-gr-1", email })),
    ...ranked.slice(-6).map((r) => ({ group_id: "demo-gr-2", email: r.s.email })),
    ...lowOf("demo-c2", 7).map((email) => ({ group_id: "demo-gr-3", email })),
  ];
  const noteTexts = ["Habló con la mamá: se compromete a revisar las tareas por la plataforma.", "Mejoró en gráficos, sigue flojo en probabilidad. Asignar refuerzo.", "Se distrae en los simulacros con tiempo; sentarlo adelante.", "Muy buena actitud, puede ayudar a sus compañeros."];
  const notes = ranked.slice(0, 4).map(({ s }, i) => ({ id: `demo-no-${i + 1}`, school_id: SCHOOL_ID, email: s.email, body: noteTexts[i], author_id: "demo-t0", author_name: staff[0].full_name, created_at: stamp(2 + i * 3) }));
  const views = [
    { id: "demo-vw-1", profile_id: "demo-t0", name: "Necesitan apoyo", filters: { ...EMPTY_FILTERS, status: statusId("Necesita apoyo") }, created_at: stamp(5) },
    { id: "demo-vw-2", profile_id: "demo-t0", name: "Seguimiento pendiente", filters: { ...EMPTY_FILTERS, followUp: "yes" }, created_at: stamp(4) },
  ];

  // ----- settings, saved work -----
  const scale = { min: 1, max: 5, pass: 3, passPct: 60, decimals: 1 };
  const grading = [
    { id: "demo-g1", scope: "school", scope_id: SCHOOL_ID, model: { kind: "scale", scale } },
    { id: "demo-g2", scope: "course", scope_id: "demo-c1", model: { kind: "scale", scale, curves: { Matemáticas: { strict: 0.9, bonus: 4 } }, partial: { hintCredit: 0.5, wrongPenalty: 0 } } },
    { id: "demo-g3", scope: "assignment", scope_id: "demo-a-3-3", model: { kind: "icfes" } },
    { id: "demo-g4", scope: "assignment", scope_id: "demo-a-2-3", model: { kind: "irt" } },
    { id: "demo-g5", scope: "assignment", scope_id: "demo-a-1-5", model: { kind: "formula", formula: { expr: "round(pct / 20 - hints * 0.05, 1)", unit: "", decimals: 1 } } },
  ];
  const charts = [PRESETS[0], PRESETS[2], PRESETS[3]].map((p, i) => ({ id: `demo-ch-${i + 1}`, name: p.name, spec: p.spec, created_at: new Date(now - (6 - i) * DAY).toISOString() }));

  const lessonSlug = slugs[0];
  const lessonItems = (itemsBySlug.get(lessonSlug) ?? []).filter((i) => i.section === "Matemáticas").slice(0, 6);
  const lessons = lessonSlug && lessonItems.length ? [{
    id: "demo-l1", owner_id: "demo-t0", title: "Repaso: leer tablas y gráficos", exam_slug: lessonSlug,
    items: [{ type: "text", title: "Qué vamos a hacer hoy", body: "- Leer una tabla antes de mirar las opciones\n- Justificar la respuesta con un dato" }, ...lessonItems.map((i) => ({ type: "q", key: i.key })), { type: "text", title: "Para llevar", body: "Subraya el dato que usaste. Si no lo encuentras, vuelve a leer la pregunta." }],
    settings: { hideOptions: false, seconds: 60, titleSlide: true, intro: { layout: "split", title: "Leer tablas y gráficos", subtitle: "Matemáticas · repaso para el simulacro", by: "Prof. Marcela Ríos", color: "#1F4E79", goals: "- Encontrar el dato antes de mirar las opciones\n- Justificar cada respuesta con la tabla" } },
    visibility: "school", updated_at: new Date(now - 3 * DAY).toISOString(),
  }, {
    id: "demo-l2", owner_id: "demo-t2", title: "Argumentos en un texto", exam_slug: lessonSlug,
    items: (itemsBySlug.get(lessonSlug) ?? []).filter((i) => i.section === "Lectura crítica").slice(0, 4).map((i) => ({ type: "q", key: i.key })),
    settings: { hideOptions: false, seconds: 90, titleSlide: true }, visibility: "school", updated_at: new Date(now - 5 * DAY).toISOString(),
  }] : [];
  const formats = [{ id: "demo-f1", owner_id: "demo-t0", name: "Quiz de salida (10 min)", config: { ...BUILTIN_FORMATS[2].config, limit: "" }, visibility: "private", created_at: new Date(now - 9 * DAY).toISOString() }];

  // ----- whole simulacros: Sesión 1 + Sesión 2 of one cuadernillo, the only thing that gives the 0-500 estimate -----
  const s1Slug = slugs.find((sl) => sessionOf(sl) === 1);
  const s2Slug = s1Slug && slugs.find((sl) => sessionOf(sl) === 2 && bookletCode(sl) === bookletCode(s1Slug));
  const wholeSession = (s, slug, shift = 0) => {
    const key = bundles.get(slug).key;
    const qs = (itemsBySlug.get(slug) ?? []).map((it) => ({ q: questionBy.get(slug).get(it.key), diff: (it.dificultad ?? 3) - 3 })).filter((x) => x.q);
    const answers = {};
    const times = {};
    for (const { q, diff } of qs) {
      if (rand.next() > 0.98) continue; // left blank
      const right = key.get(q.key);
      const p = sigmoid(1.15 * (s.ability + shift + (s.areaSkill[q.section] ?? 0) - 0.5 * diff) + 0.15);
      const wrong = (q.options ?? []).map((o) => o.letter).filter((l) => l !== right);
      const ok = rand.next() < p;
      answers[q.key] = ok ? right : rand.pick(wrong.length ? wrong : ["A"]);
      times[q.key] = Math.max(6, Math.round((AREA_SECONDS[q.section] ?? 70) * Math.exp(rand.normal() * 0.3)));
    }
    return { qs: qs.map((x) => x.q), answers, times, sc: scoreAttempt(qs.map((x) => x.q), answers, key) };
  };
  if (s2Slug) {
    const c3 = COURSES.findIndex((c) => c.id === "demo-c3");
    [[s1Slug, 13], [s2Slug, 12]].forEach(([slug, ago], k) => {
      const opens = now - ago * DAY;
      const a = {
        id: `demo-a-3-s${k + 1}`, course_id: "demo-c3", created_by: staff[3].id, kind: "exam", title: `Simulacro completo · Sesión ${k + 1}`, exam_slug: slug, scope: "all", question_keys: null,
        opens_at: new Date(opens).toISOString(), due_at: new Date(opens + 2 * DAY).toISOString(), time_limit_min: 270, reveal_policy: "after_close", max_attempts: 1,
        assignee_id: null, status: "published", created_at: new Date(opens - DAY).toISOString(), allow_hints: false, instant_feedback: false,
        allow_definitions: false, definitions: [], proctor: true, courses: { name: courses[c3].name },
      };
      assignments.push(a);
      for (const s of students.filter((x) => x.group === "C")) {
        if (s.dropout || rand.next() > s.engagement) continue;
        const { answers, times, sc } = wholeSession(s, slug, s.growth * 5);
        const submitted = opens + (3 + rand.next() * 20) * 3600000;
        const started = submitted - 4.2 * 3600000;
        attempts.push({
          profile_id: s.profileId, member_id: null, client_id: `whole-${k + 1}-${s.n}`, assignment_id: a.id, exam_slug: slug, scope: "all", mode: "timed",
          started_at: new Date(started).toISOString(), submitted_at: new Date(submitted).toISOString(), duration_sec: Math.round((submitted - started) / 1000),
          answers, times, activity: { hints: {}, changes: {} }, proctor: { leaves: 0, awaySec: 0, pointerOuts: 0, idleSec: 0 },
          score: { keyed: true, correct: sc.correct, answered: sc.answered, total: sc.total, perArea: sc.perArea }, key_status: "preliminary", device: s.n % 3 ? "phone" : "desktop",
        });
      }
    });
  }

  // ----- the demo student's own practice, as this browser's history would hold it -----
  const me = students.find((s) => s.n === DEMO_STUDENT_N);
  const history = [];
  const practiceAreas = ["Matemáticas", "Lectura crítica", "Ciencias naturales", "Matemáticas", "Sociales y ciudadanas", "Inglés"];
  const sessionDays = [19, 17, 16, 14, 12, 11, 9, 7, 6, 5, 4, 3, 2, 1, 0];
  sessionDays.forEach((ago, i) => {
    const area = practiceAreas[i % practiceAreas.length];
    const slug = slugs.find((sl) => (itemsBySlug.get(sl) ?? []).some((it) => it.section === area));
    if (!slug) return;
    const pool = (itemsBySlug.get(slug) ?? []).filter((it) => it.section === area);
    const start = (i * 7) % Math.max(1, pool.length);
    const picked = Array.from({ length: Math.min(12, pool.length) }, (_, k) => pool[(start + k) % pool.length]);
    const qs = picked.map((it) => questionBy.get(slug).get(it.key)).filter(Boolean);
    const key = bundles.get(slug).key;
    const answers = {};
    const times = {};
    for (const q of qs) {
      const right = key.get(q.key);
      const p = sigmoid(1.15 * (me.ability + me.growth * i + (me.areaSkill[area] ?? 0)) + 0.2);
      const wrong = (q.options ?? []).map((o) => o.letter).filter((l) => l !== right);
      const ok = rand.next() < p;
      answers[q.key] = ok ? right : rand.pick(wrong.length ? wrong : ["A"]);
      times[q.key] = Math.round((AREA_SECONDS[area] ?? 70) * Math.exp(rand.normal() * 0.3) * (ok ? 0.9 : 1.2));
    }
    const sc = scoreAttempt(qs, answers, key);
    const at = now - ago * DAY - (3 + (i % 4)) * 3600000;
    history.push({
      id: `demo-h-${i + 1}`, title: `${bundles.get(slug).exam.title} · ${area}`, mode: "practice", at, answered: sc.answered, total: sc.total, keyed: true,
      correct: sc.correct, outOf: sc.answered, percent: sc.answered ? (sc.correct / sc.answered) * 100 : 0,
      perArea: sc.perArea.map((a) => ({ name: a.name, correct: a.correct, answered: a.answered, total: a.total })),
      xp: sc.correct * 10 + (area === "Matemáticas" ? sc.correct * 10 : 0),
      missed: qs.filter((q) => answers[q.key] !== key.get(q.key)).map((q) => q.key),
      right: qs.filter((q) => answers[q.key] === key.get(q.key)).map((q) => q.key),
      snapshot: { slug, scope: area, mode: "practice", answers, flags: {}, times, startedAt: at - 15 * 60000, submittedAt: at, auto: false, xp: sc.correct * 10 },
    });
  });
  // Her whole simulacros: two complete S11-A (Sesión 1 + Sesión 2, each a score), then a newer Sesión 1 waiting for its Sesión 2.
  if (s2Slug) {
    [[s1Slug, 20, -0.3], [s2Slug, 19, -0.3], [s1Slug, 10, 0], [s2Slug, 9, 0], [s1Slug, 2, 0.35]].forEach(([slug, ago, shift], k) => {
      const { qs, answers, times, sc } = wholeSession(me, slug, shift);
      const key = bundles.get(slug).key;
      const at = now - ago * DAY - 4 * 3600000;
      history.push({
        id: `demo-hs-${k + 1}`, title: bundles.get(slug).exam.title, mode: "timed", at, answered: sc.answered, total: sc.total, keyed: true,
        correct: sc.correct, outOf: sc.total, percent: sc.total ? (sc.correct / sc.total) * 100 : 0,
        perArea: sc.perArea.map((a) => ({ name: a.name, correct: a.correct, answered: a.answered, total: a.total })),
        xp: sc.correct * 10,
        missed: qs.filter((q) => answers[q.key] !== key.get(q.key)).map((q) => q.key),
        right: qs.filter((q) => answers[q.key] === key.get(q.key)).map((q) => q.key),
        snapshot: { slug, scope: "all", mode: "timed", answers, flags: {}, times, startedAt: at - 4.5 * 3600000, submittedAt: at, auto: false, xp: sc.correct * 10 },
      });
    });
    history.sort((x, y) => y.at - x.at);
  }
  // Question control: 8 questions no class has used yet, reserved by coordination for next month's simulacro and
  // hidden from students' free practice (Biblioteca › Control de preguntas).
  const listed = new Set(assignments.filter((a) => a.exam_slug === slugs[0]).flatMap((a) => a.question_keys ?? []));
  const holds = (itemsBySlug.get(slugs[0]) ?? []).filter((i) => !listed.has(i.key)).slice(-8).map((i, n) => ({
    id: `demo-hold-${n + 1}`, school_id: SCHOOL_ID, exam_slug: slugs[0], qkey: i.key, reserve: true, hide_from_students: true,
    label: "Simulacro de noviembre", until: null, assignment_id: null, created_by: staff[0].id, created_at: new Date(now - 3 * DAY).toISOString(),
  }));
  const meProfile = { id: me.profileId, email: me.email, full_name: me.name, role: "student", school_id: SCHOOL_ID, created_at: new Date(now - 60 * DAY).toISOString() };

  return {
    profile: staff[0],
    student: { profile: meProfile, history },
    tables: {
      profiles: [...staff, ...students.map((s) => ({ id: s.profileId, email: s.email, full_name: s.name, role: "student", school_id: SCHOOL_ID, created_at: new Date(now - 60 * DAY).toISOString() }))],
      courses, course_members: members, assignments, attempts, grading_models: grading, saved_charts: charts, lessons, activity_formats: formats,
      paper_seating: seating, proctor_events: proctorEvents,
      consents: [{ kind: "terms", version: CONSENT_VERSION, granted_at: new Date(now - 60 * DAY).toISOString() }],
      school_consents: [{ kind: "guardian_authorization", version: CONSENT_VERSION, granted_at: new Date(now - 60 * DAY).toISOString() }],
      student_statuses: statuses, student_flags: flags, student_groups: groups, student_group_members: groupMembers, student_notes: notes, saved_views: views,
      teacher_questions: [], question_overrides: [], annotations: [], live_sessions: [], live_players: [], live_answers: [],
      group_directors: [{ id: "demo-gd-1", school_id: SCHOOL_ID, grade: "11", group_label: "A", profile_id: staff[1].id }],
      // Colegio (migration 0020): cursos (10 A and 10 B still without classes), a view-only seat, a subject grant,
      // a pending invitation, settings and a few lines of the log.
      schools: [{ id: SCHOOL_ID, name: "Colegio de demostración", domains: ["demo.invalid"], status: "active" }],
      school_groups: [["11", "A"], ["11", "B"], ["11", "C"], ["10", "A"], ["10", "B"]].map(([grade, label], i) => ({ id: `demo-sg-${i + 1}`, school_id: SCHOOL_ID, grade, label, created_at: stamp(70) })),
      subject_access: [{ id: "demo-sa-1", school_id: SCHOOL_ID, profile_id: staff[2].id, area: "Inglés", grade: null, access: "view", created_at: stamp(30) }],
      school_settings: [{ school_id: SCHOOL_ID, settings: { grades: ["9", "10", "11"], year: 2026, teachers_create_classes: true, periods: [
        { name: "Periodo 1", from: "2026-01-26", to: "2026-04-03" }, { name: "Periodo 2", from: "2026-04-13", to: "2026-06-19" },
        { name: "Periodo 3", from: "2026-07-06", to: "2026-09-11" }, { name: "Periodo 4", from: "2026-09-14", to: "2026-11-27" }] }, updated_at: stamp(40) }],
      staff_invites: [
        ...staff.slice(1).map((p, i) => ({ id: `demo-si-${i + 1}`, school_id: SCHOOL_ID, email: p.email, full_name: p.full_name, role: "teacher", created_at: stamp(85), accepted_at: stamp(80) })),
        { id: "demo-si-9", school_id: SCHOOL_ID, email: "laura.mejia@gmail.com", full_name: "Laura Mejía", role: "teacher", created_at: stamp(1), accepted_at: null },
      ],
      school_audit: [
        { id: "demo-au-1", school_id: SCHOOL_ID, actor: staff[0].id, action: "group_create", detail: { groups: ["10A", "10B"] }, created_at: stamp(6) },
        { id: "demo-au-2", school_id: SCHOOL_ID, actor: staff[0].id, action: "access", detail: { course: "demo-c5", profile: staff[1].id, email: staff[1].email, access: "view" }, created_at: stamp(5) },
        { id: "demo-au-3", school_id: SCHOOL_ID, actor: staff[0].id, action: "grant", detail: { profile: staff[2].id, area: "Inglés", grade: null, access: "view" }, created_at: stamp(4) },
        { id: "demo-au-4", school_id: SCHOOL_ID, actor: staff[0].id, action: "invite", detail: { email: "laura.mejia@gmail.com", role: "teacher" }, created_at: stamp(1) },
      ],
      question_holds: holds, question_rules: [],
    },
  };
}
