// Class spaces: a subject, a grade and a group ("Inglés 9no A"). They are stored as courses.
export const SUBJECTS = ["Inglés", "Matemáticas", "Lectura crítica", "Sociales y ciudadanas", "Ciencias naturales", "Física", "Química", "Biología", "Español", "Todas las áreas"];
export const GRADES = ["6", "7", "8", "9", "10", "11"];
const ORDINAL = { 6: "6to", 7: "7mo", 8: "8vo", 9: "9no", 10: "10mo", 11: "11" };
export const gradeLabel = (g) => ORDINAL[g] ?? String(g ?? "");

// "Inglés 9no A"; parts that are missing are left out.
export function spaceName({ subject, grade, group }) {
  const s = subject && subject !== "Todas las áreas" ? subject : "";
  return [s, grade ? gradeLabel(grade) : "", (group ?? "").trim()].filter(Boolean).join(" ");
}

// Spaces grouped by grade then subject, for pickers and lists.
export function groupSpaces(courses) {
  const out = new Map();
  for (const c of courses) {
    const k = c.grade ? `Grado ${gradeLabel(c.grade)}` : "Sin grado";
    out.set(k, [...(out.get(k) ?? []), c]);
  }
  return [...out].sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }));
}
