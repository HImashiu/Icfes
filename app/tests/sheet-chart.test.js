import { describe, expect, it } from "vitest";
import { aggregate, autoTitle, chartData, defaultConfig, niceTicks } from "../src/lib/sheetChart.js";

const rows = [
  { Curso: "11A", Tipo: "Tarea", Pct: 80, Nota: 4 },
  { Curso: "11A", Tipo: "Simulacro", Pct: 40, Nota: 2 },
  { Curso: "11B", Tipo: "Tarea", Pct: 60, Nota: 3 },
  { Curso: "11B", Tipo: "Tarea", Pct: 100, Nota: 5 },
];
const cols = [{ id: "Curso", type: "text" }, { id: "Tipo", type: "text" }, { id: "Pct", type: "num", scale: [0, 100] }, { id: "Nota", type: "num" }];
const cfg = (o) => ({ ...defaultConfig(cols), ...o });

describe("gráficas de la hoja", () => {
  it("starts from a category column and a scaled number", () => {
    expect(defaultConfig(cols)).toMatchObject({ x: "Curso", y: ["Pct"], type: "bar", agg: "avg" });
    expect(defaultConfig(cols, ["Tipo", "Nota"])).toMatchObject({ x: "Tipo", y: ["Nota"] });
  });
  it("aggregates per category, per y column or per series", () => {
    expect(chartData(rows, cfg({})).series[0].values).toEqual([60, 80]);
    expect(chartData(rows, cfg({ agg: "count" })).series[0].values).toEqual([2, 2]);
    const s = chartData(rows, cfg({ series: "Tipo" }));
    expect(s.series.map((x) => [x.name, x.values])).toEqual([["Simulacro", [40, null]], ["Tarea", [80, 80]]]);
    expect(chartData(rows, cfg({ sort: "desc" })).labels).toEqual(["11B", "11A"]);
    expect(aggregate([1, 2, 3, 10], "median")).toBe(2.5);
  });
  it("builds scatter with a trend, histogram bins and box quartiles", () => {
    const sc = chartData(rows, cfg({ type: "scatter", x: "Nota", y: ["Pct"] }));
    expect(sc.points).toHaveLength(4);
    expect(sc.trend.r).toBe(1);
    const h = chartData(rows, cfg({ type: "hist", y: ["Pct"], bins: 3 }));
    expect(h.series[0].values.reduce((a, b) => a + b, 0)).toBe(4);
    const b = chartData(rows, cfg({ type: "box", x: "Curso", y: ["Pct"] }));
    expect(b.boxes.map((x) => [x.label, x.med])).toEqual([["11A", 60], ["11B", 80]]);
  });
  it("makes readable ticks and titles", () => {
    expect(niceTicks(0, 87)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(autoTitle(cfg({}), "Promedio")).toBe("Promedio de Pct por Curso");
  });
});
