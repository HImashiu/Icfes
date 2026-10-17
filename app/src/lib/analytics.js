// Pure statistics for teachers and the school: bands, area averages, histograms, item analysis. No network, no React.

// PLACEHOLDER curve until the ICFES national distributions are anchored (plan §5.1, phase 1).
// Chance-corrected share right (4 options) mapped onto the 0-100 area scale. Versioned so stored scores can be recomputed.
export const CURVE_VERSION = "placeholder-1";
const CHANCE = 0.25;
// ICFES weights: the four core areas count 3 and English counts 1 in the global score; areas we do not know count 3.
const WEIGHTS = { "Inglés": 1 };
const weight = (name) => WEIGHTS[name] ?? 3;

export function areaScale(correct, total) {
  if (!total) return null;
  const p = correct / total;
  const adjusted = Math.max(0, (p - CHANCE) / (1 - CHANCE));
  return Math.round(15 + 70 * adjusted);
}

// perArea: [{ name, correct, total }]. Returns { areas: [{name, pct, scale}], global (0-500) or null, low, high }.
// Only full sets mean something; the band widens when few questions back it.
export function bandFor(perArea) {
  const areas = perArea
    .filter((a) => a.total > 0)
    .map((a) => ({ name: a.name, pct: Math.round((a.correct / a.total) * 100), scale: areaScale(a.correct, a.total), total: a.total }));
  if (areas.length === 0) return { areas, global: null, low: null, high: null };
  const w = areas.reduce((acc, a) => acc + weight(a.name), 0);
  const avg = areas.reduce((acc, a) => acc + weight(a.name) * a.scale, 0) / w;
  const global = Math.round(avg * 5);
  const n = areas.reduce((acc, a) => acc + a.total, 0);
  const margin = Math.round(Math.min(90, 20 + 900 / Math.sqrt(Math.max(n, 1))));
  return { areas, global, low: Math.max(0, global - margin), high: Math.min(500, global + margin) };
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// Counts of values over equal-width bins, e.g. histogram(bands, 0, 500, 5).
export function histogram(values, min, max, bins) {
  const out = Array.from({ length: bins }, (_, i) => ({ from: min + ((max - min) * i) / bins, to: min + ((max - min) * (i + 1)) / bins, n: 0 }));
  for (const v of values) {
    if (v == null) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * bins)));
    out[i].n += 1;
  }
  return out;
}

// Delivered attempts only; for a student with several on the same assignment the best counts (same rule as progressRows).
export function bestPerStudentAssignment(attempts) {
  const best = new Map();
  for (const a of attempts) {
    if (!a.submitted_at || !a.score?.keyed) continue;
    const k = `${a.profile_id}|${a.assignment_id ?? a.client_id}`;
    const ratio = a.score.total ? a.score.correct / a.score.total : 0;
    const prev = best.get(k);
    if (!prev || ratio > prev.ratio) best.set(k, { ...a, ratio });
  }
  return [...best.values()];
}

// Share right per area across a set of attempts, answering "where is the group weak".
export function areaAverages(attempts) {
  const acc = new Map();
  for (const a of attempts) {
    for (const ar of a.score?.perArea ?? []) {
      const cur = acc.get(ar.name) ?? { name: ar.name, correct: 0, total: 0, students: new Set() };
      cur.correct += ar.correct;
      cur.total += ar.total;
      cur.students.add(a.profile_id);
      acc.set(ar.name, cur);
    }
  }
  return [...acc.values()]
    .map((c) => ({ name: c.name, pct: c.total ? Math.round((c.correct / c.total) * 100) : null, students: c.students.size }))
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
}

// Per question: how many answered, share right, how the answers split, and a warning when the key looks wrong
// (a wrong option picked more than the keyed one by a clear margin), since every key here is preliminary.
export function itemStats(questions, key, attempts) {
  const rows = attempts.filter((a) => a.submitted_at);
  return questions.map((q) => {
    const keyed = key?.get(q.key) ?? null;
    const dist = {};
    let answered = 0;
    for (const a of rows) {
      const given = a.answers?.[q.key];
      if (!given) continue;
      answered += 1;
      dist[given] = (dist[given] ?? 0) + 1;
    }
    const correct = keyed ? dist[keyed] ?? 0 : 0;
    const wrong = Object.entries(dist).filter(([l]) => l !== keyed).sort((a, b) => b[1] - a[1])[0];
    const suspect = Boolean(keyed) && answered >= 5 && wrong && wrong[1] >= correct * 2 && wrong[1] / answered >= 0.5;
    return {
      key: q.key, number: q.number, section: q.section, keyed, n: rows.length, answered, dist,
      pct: answered && keyed ? Math.round((correct / answered) * 100) : null,
      topWrong: wrong ? wrong[0] : null,
      suspect,
    };
  });
}

// One line per student per question, for Excel or Sheets.
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function itemsCsv(title, questions, key, students) {
  const head = ["Estudiante", "Correo", "Pregunta", "Área", "Respuesta", "Clave preliminar", "Acierto"];
  const lines = [];
  for (const s of students) {
    for (const q of questions) {
      const given = s.answers?.[q.key] ?? "";
      const k = key?.get(q.key) ?? "";
      lines.push([s.name, s.email, q.number, q.section, given, k, given && k ? (given === k ? 1 : 0) : ""].map(csvCell).join(","));
    }
  }
  return `﻿${[csvCell(title), head.join(","), ...lines].join("\n")}\n`;
}

// School-wide numbers for the coordinator. members: course_members rows (students and teachers), courses, assignments, attempts.
export function schoolSummary({ courses, members, assignments, attempts }) {
  const students = members.filter((m) => m.role === "student");
  const best = bestPerStudentAssignment(attempts);
  const perCourse = courses.map((c) => {
    const cs = students.filter((m) => m.course_id === c.id);
    const cAssign = assignments.filter((a) => a.course_id === c.id);
    const ids = new Set(cAssign.map((a) => a.id));
    const cBest = best.filter((a) => ids.has(a.assignment_id));
    const delivered = new Set(cBest.map((a) => a.profile_id));
    const expected = cs.length * cAssign.length;
    return {
      id: c.id, name: c.name, grade: c.grade,
      students: cs.length,
      joined: cs.filter((m) => m.profile_id).length,
      assignments: cAssign.length,
      deliveries: cBest.length,
      completion: expected ? Math.round((cBest.length / expected) * 100) : null,
      avgPct: round(mean(cBest.map((a) => a.ratio * 100))),
      active: delivered.size,
      areas: areaAverages(cBest),
    };
  });
  const full = best.filter((a) => a.mode === "timed");
  const bands = full.map((a) => bandFor(a.score.perArea).global).filter((g) => g != null);
  return {
    students: new Set(students.map((m) => m.email)).size,
    joined: new Set(students.filter((m) => m.profile_id).map((m) => m.profile_id)).size,
    teachers: new Set(members.filter((m) => m.role === "teacher").map((m) => m.profile_id ?? m.email)).size,
    assignments: assignments.length,
    deliveries: best.length,
    avgPct: round(mean(best.map((a) => a.ratio * 100))),
    areas: areaAverages(best),
    bandHistogram: histogram(bands, 0, 500, 10),
    bandCount: bands.length,
    bandMean: round(mean(bands)),
    perCourse,
  };
}

// Competencies where the group does worst on one booklet, from the answers it gave. Needs enough answers to mean something.
// items: bankItems(...) rows; returns [{ competencia, pct, answered }] weakest first.
export function weakCompetencias(items, key, attempts, { minAnswered = 8 } = {}) {
  const tag = new Map(items.map((i) => [i.key, i.competencia]));
  const acc = new Map();
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    for (const [qk, given] of Object.entries(a.answers ?? {})) {
      const c = tag.get(qk);
      const right = key?.get(qk);
      if (!c || !given || !right) continue;
      const cur = acc.get(c) ?? { competencia: c, answered: 0, correct: 0 };
      cur.answered += 1;
      if (given === right) cur.correct += 1;
      acc.set(c, cur);
    }
  }
  return [...acc.values()]
    .filter((c) => c.answered >= minAnswered)
    .map((c) => ({ competencia: c.competencia, answered: c.answered, pct: Math.round((c.correct / c.answered) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}
