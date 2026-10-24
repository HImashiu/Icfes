// Receipts: after an action saves data (scanning sheets, assigning work, importing a roster, a reinforcement plan)
// the teacher sees what was saved and every place it now shows up, with a link to each. The last week of receipts
// stays in "Novedades" and in Hoy, in this browser.
import { areaOf } from "./teaching.js";

const DAY = 864e5;
const KEEP_DAYS = 7;
const MAX = 40;
const keyFor = (userId) => `condor:recibos:${userId ?? "anon"}`;

export function loadReceipts(userId, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const list = JSON.parse(storage?.getItem(keyFor(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter((r) => now - new Date(r.at).getTime() < KEEP_DAYS * DAY) : [];
  } catch {
    return [];
  }
}

export function saveReceipt(userId, receipt, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  const row = { id: `r-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at: new Date(now).toISOString(), seen: false, ...receipt };
  const next = [row, ...loadReceipts(userId, { storage, now })].slice(0, MAX);
  try { storage?.setItem(keyFor(userId), JSON.stringify(next)); } catch { /* storage blocked: the receipt still shows now */ }
  return { row, list: next };
}

export function markSeen(userId, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  const list = loadReceipts(userId, { storage, now }).map((r) => ({ ...r, seen: true }));
  try { storage?.setItem(keyFor(userId), JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

const pct = (n) => `${Math.round(n)} %`;
const courseName = (a) => a?.courses?.name ?? "";

// Scanned paper sheets of an assignment.
export function scanReceipt({ assignment, course, count, average }) {
  const multi = assignment.scope === "all" && !areaOf(course ?? {});
  const where = [
    { label: "Resultados de esta actividad", detail: "Por pregunta y por estudiante", route: { section: "actividad", id: assignment.id, tab: "resultados" } },
    { label: `${count} ${count === 1 ? "perfil" : "perfiles"} de estudiantes`, detail: "Cada uno ve la entrega en su historial", route: { section: "estudiantes", tab: "lista" } },
    { label: `Resultados · ${courseName(assignment) || "la clase"}`, detail: "Promedio del curso y por área", route: { section: "resultados", tab: "resumen" } },
  ];
  if (multi) where.push({ label: "Las demás áreas", detail: "Sus docentes y Coordinación ven su parte", route: null });
  return {
    kind: "scan",
    title: `${count} ${count === 1 ? "hoja guardada" : "hojas guardadas"}`,
    detail: [assignment.title, courseName(assignment), average != null ? `promedio ${pct(average)}` : null].filter(Boolean).join(" · "),
    where,
    primary: { label: "Ver resultados", route: where[0].route },
  };
}

// A new assignment (one or several classes).
export function assignmentReceipt({ assignment, classes = 1 }) {
  return {
    kind: "assign",
    title: classes > 1 ? `Asignada a ${classes} clases` : "Actividad asignada",
    detail: [assignment.title, classes > 1 ? null : courseName(assignment)].filter(Boolean).join(" · "),
    where: [
      { label: "La página de la actividad", detail: "Entregas, papel, resultados y calificación", route: { section: "actividad", id: assignment.id } },
      { label: "La app de tus estudiantes", detail: "La ven en «Tareas de tu curso» cuando abre", route: null },
      { label: "Hoy", detail: "Te avisa cuando esté por cerrar", route: { section: "hoy" } },
    ],
    primary: { label: "Abrir la actividad", route: { section: "actividad", id: assignment.id } },
  };
}

export function rosterReceipt({ course, count }) {
  return {
    kind: "roster",
    title: `${count} ${count === 1 ? "estudiante agregado" : "estudiantes agregados"}`,
    detail: course.name,
    where: [
      { label: "Estudiantes", detail: "Con filtros, estados y seguimiento", route: { section: "estudiantes", tab: "lista" } },
      { label: `Lista de ${course.name}`, detail: "Entran cuando inicien sesión con su correo", route: { section: "estudiantes", tab: "clases" } },
    ],
    primary: { label: "Ver estudiantes", route: { section: "estudiantes", tab: "lista" } },
  };
}

export function reinforcementReceipt({ count }) {
  return {
    kind: "reinforce",
    title: `${count} ${count === 1 ? "plan de refuerzo" : "planes de refuerzo"}`,
    detail: "Uno por estudiante, con las preguntas que más le costaron",
    where: [
      { label: "Actividades", detail: "Un plan personal por estudiante", route: { section: "actividades", tab: "lista" } },
      { label: "La app de cada estudiante", detail: "Lo ve en «Tareas de tu curso»", route: null },
    ],
    primary: { label: "Ver actividades", route: { section: "actividades", tab: "lista" } },
  };
}
