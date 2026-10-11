// SAMPLE data for the prototype: streak, XP, league, mastery and the teacher view.
// None of it comes from real students; screens that use it say "datos de muestra".
export const SAMPLE_STUDENT = {
  name: "Estudiante",
  course: "Grado 11",
  streak: 5,
  xp: 1240,
  weeklyXp: [40, 95, 60, 130, 80, 150, 120],
  classXp: [60, 80, 70, 90, 85, 100, 95],
  mastery: { "Matemáticas": 58, "Ciencias naturales": 72, "Sociales y ciudadanas": 64, "Inglés": 41 },
};

export const WEAKEST_AREA = Object.entries(SAMPLE_STUDENT.mastery).sort((a, b) => a[1] - b[1])[0][0];

export const SAMPLE_LEAGUE = [
  { name: "Ana M.", xp: 2140, streak: 12 },
  { name: "Tomás R.", xp: 1985, streak: 8 },
  { name: "Sofía L.", xp: 1760, streak: 6 },
  { name: "Tú", xp: 1240, streak: 5, me: true },
  { name: "Diego P.", xp: 1130, streak: 3 },
  { name: "Camila V.", xp: 990, streak: 1 },
];

export const SAMPLE_TEACHER = {
  assignments: [
    { title: "Simulacro 1 · Matemáticas", due: "Vie 16 oct", dueIso: "2026-10-16", course: "11-A", done: 72 },
    { title: "Práctica · Ciencias naturales", due: "Lun 19 oct", dueIso: "2026-10-19", course: "11-A", done: 40 },
    { title: "Práctica · Inglés", due: "Jue 22 oct", dueIso: "2026-10-22", course: "11-B", done: 18 },
  ],
  events: [
    { day: 16, area: "Matemáticas" },
    { day: 19, area: "Ciencias naturales" },
    { day: 22, area: "Inglés" },
  ],
  atRisk: [
    { name: "Estudiante 07", area: "Matemáticas", score: 38, streak: 0 },
    { name: "Estudiante 19", area: "Inglés", score: 41, streak: 1 },
    { name: "Estudiante 33", area: "Sociales y ciudadanas", score: 44, streak: 2 },
  ],
};

const m = (mat, nat, soc, ing) => ({ "Matemáticas": mat, "Ciencias naturales": nat, "Sociales y ciudadanas": soc, "Inglés": ing });
export const SAMPLE_ROSTER = [
  { name: "Estudiante 01", course: "11-A", streak: 9, xp: 1980, last: 71, mastery: m(74, 80, 69, 62) },
  { name: "Estudiante 02", course: "11-A", streak: 4, xp: 1420, last: 58, mastery: m(61, 55, 66, 49) },
  { name: "Estudiante 03", course: "11-A", streak: 12, xp: 2310, last: 84, mastery: m(88, 79, 83, 77) },
  { name: "Estudiante 05", course: "11-A", streak: 2, xp: 880, last: 52, mastery: m(50, 57, 61, 44) },
  { name: "Estudiante 07", course: "11-A", streak: 0, xp: 410, last: 38, mastery: m(36, 42, 47, 33) },
  { name: "Estudiante 12", course: "11-B", streak: 6, xp: 1610, last: 66, mastery: m(70, 64, 59, 63) },
  { name: "Estudiante 19", course: "11-B", streak: 1, xp: 520, last: 41, mastery: m(45, 39, 52, 41) },
  { name: "Estudiante 21", course: "11-B", streak: 7, xp: 1750, last: 75, mastery: m(81, 72, 68, 70) },
  { name: "Estudiante 28", course: "11-B", streak: 3, xp: 990, last: 60, mastery: m(58, 63, 57, 65) },
  { name: "Estudiante 33", course: "11-B", streak: 2, xp: 760, last: 44, mastery: m(48, 40, 44, 46) },
];

export const TEACHER_AREAS = ["Matemáticas", "Ciencias naturales", "Sociales y ciudadanas", "Inglés"];
