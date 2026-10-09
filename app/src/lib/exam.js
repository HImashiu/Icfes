// Pure exam logic: loading and checking the golden exam file, the optional answer key,
// scoping a test to one area, and scoring. No React, no DOM, so it is easy to test.

export const EXAM_FORMAT = "icfes-golden/1";
export const KEY_FORMAT = "icfes-key/1";

export class ExamFormatError extends Error {}

export function parseExam(raw) {
  if (!raw || raw.format !== EXAM_FORMAT) {
    throw new ExamFormatError(`Expected format ${EXAM_FORMAT}, got ${raw?.format ?? "nothing"}`);
  }
  if (!Array.isArray(raw.questions)) throw new ExamFormatError("Exam has no questions array");

  const groups = new Map((raw.groups ?? []).map((g) => [g.id, g]));
  const questions = raw.questions
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((q) => ({
      ...q,
      key: String(q.number),
      group: q.group_id ? groups.get(q.group_id) ?? null : null,
    }));

  const sections = (raw.sections ?? []).map((s) => ({
    name: s.name,
    expected: s.expected ?? null,
    questions: questions.filter((q) => q.section === s.name),
  }));
  // Questions whose section is missing from the cover table still belong to a visible area.
  for (const name of [...new Set(questions.map((q) => q.section))]) {
    if (!sections.some((s) => s.name === name)) {
      sections.push({ name, expected: null, questions: questions.filter((q) => q.section === name) });
    }
  }

  return {
    title: raw.exam?.title ?? "Examen",
    docId: raw.exam?.doc_id ?? null,
    warnings: raw.exam?.warnings ?? [],
    sections,
    questions,
  };
}

// Accepts { format: "icfes-key/1", answers: { "1": "B", "2": null, ... } }.
// Returns a Map of question number string -> letter. A missing or invalid file yields null.
export function parseKey(raw) {
  if (!raw) return null;
  if (raw.format !== KEY_FORMAT || typeof raw.answers !== "object") {
    throw new ExamFormatError(`Expected format ${KEY_FORMAT} with an answers object`);
  }
  const map = new Map();
  for (const [num, letter] of Object.entries(raw.answers)) {
    if (typeof letter === "string" && /^[A-H]$/.test(letter)) map.set(String(num), letter);
  }
  return map;
}

// scope is "all" or the name of one area.
export function questionsFor(exam, scope) {
  if (scope === "all") return exam.questions;
  return exam.sections.find((s) => s.name === scope)?.questions ?? [];
}

export function scoreAttempt(questions, answers, key) {
  const areas = new Map();
  const add = (name, field) => {
    if (!areas.has(name)) areas.set(name, { name, total: 0, answered: 0, correct: 0 });
    areas.get(name)[field] += 1;
  };
  for (const q of questions) {
    add(q.section, "total");
    const given = answers[q.key];
    if (given) add(q.section, "answered");
    if (key && given && key.get(q.key) === given) add(q.section, "correct");
  }
  const perArea = [...areas.values()];
  const sum = (f) => perArea.reduce((acc, a) => acc + a[f], 0);
  return {
    keyed: Boolean(key),
    perArea,
    total: sum("total"),
    answered: sum("answered"),
    correct: sum("correct"),
  };
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

// Approximate time limits in minutes for timed mode. These are a practice default, not an official ICFES figure.
export const AREA_MINUTES = {
  "Sociales y ciudadanas": 45,
  "Matemáticas": 60,
  "Ciencias naturales": 60,
  "Inglés": 60,
};

export function timedSeconds(questions) {
  const areas = [...new Set(questions.map((q) => q.section))];
  const minutes = areas.reduce((acc, a) => acc + (AREA_MINUTES[a] ?? 45), 0);
  return minutes * 60;
}
