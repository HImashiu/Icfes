import { describe, expect, it } from "vitest";
import { RANGE, applyFilters, classInfo, decimalsOf, distinctValues, filterParts, filterText, formulaValues, fxSuggest, groupRows, namesToLetters, rangeStats, rangeText, scalePos, scaleName, tableColumns } from "../src/lib/sheet.js";

const rows = [
  { Nombre: "Ana", Curso: "11A", Pct: 80, Nota: 4 },
  { Nombre: "Beto", Curso: "11B", Pct: 40, Nota: 2.5 },
  { Nombre: "Íngrid", Curso: "11A", Pct: 60, Nota: null },
];
const columns = tableColumns(rows, ["Nombre", "Curso", "Pct", "Nota"]);

describe("hoja de datos como hoja de cálculo", () => {
  it("names classes subject first, and the curso class as every area", () => {
    expect(classInfo({ name: "Matemáticas 11 A", grade: "11", group_label: "A", subject: "Matemáticas" })).toEqual({ clase: "Matemáticas · 11A", materia: "Matemáticas" });
    expect(classInfo({ name: "11-A", grade: "11", group_label: "A" }).clase).toBe("Todas las áreas · 11A");
  });
  it("writes every number of a column with the same decimals", () => {
    expect(decimalsOf([2, 2.1, 3])).toBe(1);
    expect(decimalsOf([2, 3])).toBe(0);
    expect(columns.find((c) => c.id === "Nota").decimals).toBe(1);
  });
  it("names grading scales", () => {
    expect(scaleName({ kind: "percent" })).toBe("0–100");
    expect(scaleName({ kind: "icfes" })).toBe("0–500");
  });
  it("builds and reads filters with operators, and filters by a list of values", () => {
    expect(filterText(">=", "60")).toBe(">=60");
    expect(filterText("entre", "2", "3")).toBe("2..3");
    expect(filterText("no", "ana")).toBe("!ana");
    expect(filterParts(">=60")).toEqual({ op: ">=", a: "60", b: "" });
    expect(filterParts("2..3")).toEqual({ op: "entre", a: "2", b: "3" });
    expect(applyFilters(rows, { Curso: { values: ["11A"] } }).map((r) => r.Nombre)).toEqual(["Ana", "Íngrid"]);
    expect(applyFilters(rows, { Nota: { values: ["(vacías)"] } }).map((r) => r.Nombre)).toEqual(["Íngrid"]);
    expect(distinctValues(rows, "Curso")).toEqual([{ value: "11A", n: 2 }, { value: "11B", n: 1 }]);
  });
  it("sums, averages and copies a block of cells", () => {
    const s = rangeStats(rows, columns, { r0: 0, r1: 2, c0: 2, c1: 3 });
    expect(s).toMatchObject({ cells: 6, count: 5, n: 5, sum: 186.5, min: 2.5, max: 80 });
    expect(rangeText(rows, columns, { r0: 0, r1: 1, c0: 0, c1: 3 })).toBe("Ana\t11A\t80\t4\nBeto\t11B\t40\t2,5");
  });
  it("groups rows with an average per numeric column", () => {
    const g = groupRows(rows, "Curso", columns);
    expect(g.map((x) => [x.key, x.n, x.avg.Pct])).toEqual([["11A", 2, 70], ["11B", 1, 40]]);
  });
  it("places values on their scale, Nota on the scale of its own row", () => {
    const pct = { id: "Pct", scale: [0, 100] };
    expect(scalePos(pct, {}, 25)).toBe(0.25);
    const row = { Nota: 3 };
    row[RANGE] = [1, 5];
    expect(scalePos({ id: "Nota", scale: "row" }, row, 3)).toBe(0.5);
    expect(scalePos({ id: "Nota", scale: "row" }, { Nota: 3 }, 3)).toBe(null);
    expect(Object.keys(row)).toEqual(["Nota"]);
  });
  it("suggests columns and functions while typing, and accepts names in brackets", () => {
    const s = fxSuggest("=ro", 3, columns);
    expect(s.items[0]).toMatchObject({ insert: "round(", kind: "fn" });
    const b = fxSuggest("=[pc", 4, columns);
    expect(b.items[0]).toMatchObject({ insert: "[Pct]" });
    expect(b.from).toBe(1);
    expect(namesToLetters("=[Pct]/20", columns)).toBe("=C/20");
    expect(formulaValues("=round([Pct]/20; 1)", rows, columns).values).toEqual([4, 2, 3]);
  });
});
