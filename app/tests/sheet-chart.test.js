import { describe, expect, it } from "vitest";
import { STYLE_DEFAULTS, aggregate, autoTitle, chartData, defaultConfig, niceTicks, seriesMean, seriesTrend } from "../src/lib/sheetChart.js";

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

describe("más gráficas: circular, 100 %, tendencia y promedio", () => {
  it("draws a pie from the first value, biggest slice first, shares adding to 100", () => {
    const p = chartData(rows, cfg({ type: "pie", agg: "sum" }));
    expect(p.kind).toBe("pie");
    expect(p.slices.map((s) => s.label)).toEqual(["11B", "11A"]);
    expect(p.slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(100, 5);
    expect(p.total).toBe(280);
  });
  it("folds small slices into Otros past nine", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ Curso: `C${i}`, Pct: 100 - i }));
    const p = chartData(many, cfg({ type: "pie", agg: "sum", limit: 30 }));
    expect(p.slices).toHaveLength(10);
    expect(p.slices[9]).toMatchObject({ label: "Otros", others: 5 });
  });
  it("turns stacked values into shares of each category for 100 %", () => {
    const d = chartData(rows, cfg({ type: "stacked100", series: "Tipo", agg: "sum" }));
    expect(d.share).toBe(true);
    const i = d.labels.indexOf("11A");
    expect(d.series.map((s) => s.values[i])).toEqual([33.33, 66.67]);
    expect(d.raw[1].values[i]).toBe(80);
  });
  it("fits a trend through a series and averages it", () => {
    expect(seriesTrend([1, 2, 3, 4])).toMatchObject({ m: 1, b: 1 });
    expect(seriesTrend([5, null])).toBeNull();
    expect(seriesMean([10, null, 20])).toBe(15);
  });
  it("starts every chart with the default look", () => {
    expect(defaultConfig(cols)).toMatchObject(STYLE_DEFAULTS);
    expect(autoTitle(cfg({ type: "pie", agg: "count" }), "Recuento")).toBe("Recuento de Pct por Curso");
  });
});
