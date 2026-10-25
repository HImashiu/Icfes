// The school category A+ to D the ICFES gives each school (Res. 677/2021), projected from students' simulacro
// scores (saber11.js). Pure functions.
import { percentileOf, weightOf } from "./saber11.js";

const CORE = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales"];

// ---------------------------------------------------------------- school category (Res. 677/2021)
// Per prueba: the school's scores high to low, the lowest 20 % left out (at least 9 kept), each turned into its
// cumulative relative frequency in the country (national percentile / 100); the index is their mean over one plus
// their variance, so a uniform school scores higher than an uneven one with the same mean. The resolution prints
// the exact formula as an image, so this is our reading of it. Global index: the 3/3/3/3/1 average. ICFES uses three years of results; we use what the app has.
export const CATEGORY_CUTS = [{ min: 0.77, label: "A+" }, { min: 0.72, label: "A" }, { min: 0.67, label: "B" }, { min: 0.62, label: "C" }, { min: 0, label: "D" }];
export const MIN_SCHOOL = 9;

// toShare: a score -> its cumulative relative frequency in the country (the national percentile as a share).
export function pruebaIndex(scores, toShare = (v) => v / 100) {
  const xs = scores.filter((v) => v != null).sort((a, b) => b - a);
  if (xs.length < MIN_SCHOOL) return null;
  const keep = xs.slice(0, Math.max(MIN_SCHOOL, xs.length - Math.floor(xs.length * 0.2))).map(toShare);
  const mean = keep.reduce((s, v) => s + v, 0) / keep.length;
  const variance = keep.reduce((s, v) => s + (v - mean) ** 2, 0) / keep.length;
  return mean / (1 + variance);
}

// students: [{ "Lectura crítica": 61, ... }]. Returns { index, category, perArea: {name: index}, n } or null.
export function schoolCategory(students) {
  const perArea = {};
  for (const a of [...CORE, "Inglés"]) {
    const idx = pruebaIndex(students.map((s) => s[a]), (v) => (percentileOf(a, v) ?? v) / 100);
    if (idx != null) perArea[a] = idx;
  }
  if (CORE.some((a) => perArea[a] == null)) return null;
  const names = Object.keys(perArea);
  const w = names.reduce((n, a) => n + weightOf(a), 0);
  const index = names.reduce((n, a) => n + weightOf(a) * perArea[a], 0) / w;
  return { index, category: CATEGORY_CUTS.find((c) => index > c.min || c.min === 0).label, perArea, n: students.length };
}
