import { describe, expect, it } from "vitest";
import { pruebaIndex, schoolCategory } from "../src/lib/schoolCategory.js";

describe("school category (Res. 677/2021)", () => {
  const school = (score, n = 30) => Array.from({ length: n }, (_, i) => ({ "Lectura crítica": score + (i % 5) - 2, "Matemáticas": score, "Sociales y ciudadanas": score, "Ciencias naturales": score, "Inglés": score }));
  it("drops the lowest 20 % and needs at least 9 students", () => {
    expect(pruebaIndex([80, 80, 80, 80, 80, 80, 80, 80])).toBeNull();
    expect(pruebaIndex([...Array(12).fill(80), 0, 0, 0])).toBeCloseTo(0.8, 2);
    expect(pruebaIndex([...Array(8).fill(80), 0, 0])).toBeLessThan(0.7); // 9 kept, so one 0 stays in
  });
  it("cuts the global index into A+ to D", () => {
    expect(schoolCategory(school(80)).category).toBe("A+");
    expect(schoolCategory(school(74)).category).toBe("A+"); // a 370 school
    expect(schoolCategory(school(57)).category).toMatch(/^(A|B)$/); // a 285 school
    expect(schoolCategory(school(48)).category).toBe("D"); // below the national average
    expect(schoolCategory(school(80, 5))).toBeNull();
  });
});
