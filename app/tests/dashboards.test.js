import { describe, expect, it } from "vitest";
import { addTile, createBoardStore, kpiTitle, kpiValue, moveTile, newBoard, newTile, patchTile, removeTile, starterTiles, tileRows } from "../src/lib/dashboards.js";

const table = {
  columns: [{ id: "Curso" }, { id: "Materia" }, { id: "Tipo" }, { id: "Estudiante" }, { id: "Actividad" }, { id: "% aciertos" }],
  rows: [
    { Curso: "11A", Materia: "Matemáticas", Tipo: "Tarea", Estudiante: "Ana", Actividad: "T1", "% aciertos": 80 },
    { Curso: "11A", Materia: "Lectura", Tipo: "Tarea", Estudiante: "Ana", Actividad: "T2", "% aciertos": 60 },
    { Curso: "11B", Materia: "Matemáticas", Tipo: "Simulacro", Estudiante: "Luis", Actividad: "S1", "% aciertos": 40 },
  ],
};
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

describe("tableros", () => {
  it("edits boards without touching the original", () => {
    const a = newTile("kpi", { kpi: { col: "% aciertos", agg: "avg" } });
    const b = newTile("chart", { w: 9 });
    const board = addTile(addTile(newBoard("Mío"), a), b);
    expect(b.w).toBe(4);
    expect(moveTile(board, b.id, a.id).tiles.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(moveTile(board, a.id, 1).tiles.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(patchTile(board, a.id, { h: 0 }).tiles[0].h).toBe(1);
    expect(removeTile(board, a.id).tiles).toHaveLength(1);
    expect(board.tiles).toHaveLength(2);
  });
  it("applies board filters, then the tile's own", () => {
    const board = { filters: { Curso: { values: ["11A"] }, Nada: "x" } };
    expect(tileRows(table, board, { filters: {} })).toHaveLength(2);
    expect(tileRows(table, board, { filters: { Materia: { values: ["Lectura"] } } })).toHaveLength(1);
  });
  it("computes indicators", () => {
    expect(kpiValue(table.rows, { col: "% aciertos", agg: "avg" }).value).toBe(60);
    expect(kpiValue(table.rows, { col: "Estudiante", agg: "distinct" }).value).toBe(2);
    expect(kpiTitle({ col: "Estudiante", agg: "distinct" })).toBe("Estudiante distintos");
  });
  it("starts with group, subject and distribution tiles, never a ranking", () => {
    const t = starterTiles(table.columns);
    expect(t.length).toBeGreaterThan(4);
    expect(t.some((x) => x.ds === "estudiantes" && x.kpi?.col === "% entregado")).toBe(true);
    expect(t.every((x) => x.chart?.x !== "Estudiante")).toBe(true);
  });
  it("saves in the database, or in this browser when the table is missing", async () => {
    const rows = [];
    const api = { wsList: async () => rows, wsUpsert: async (_t, r) => { rows.push(...r); }, wsDelete: async () => {} };
    const db = createBoardStore({ api, userId: "u1", storage: memory() });
    await db.load();
    await db.save(newBoard("A"));
    expect(db.mode).toBe("db");
    expect(rows[0]).toMatchObject({ teacher_id: "u1", name: "A", position: 0 });

    const missing = Object.assign(new Error("no"), { code: "missing" });
    const storage = memory();
    const api2 = { wsList: async () => { throw missing; }, wsUpsert: async () => { throw missing; }, wsDelete: async () => { throw missing; } };
    const local = createBoardStore({ api: api2, userId: "u2", storage });
    await local.load();
    expect(local.mode).toBe("local");
    const b = newBoard("B");
    await local.save(b);
    const again = createBoardStore({ api: api2, userId: "u2", storage });
    expect((await again.load()).map((x) => x.name)).toEqual(["B"]);
    await again.remove(b.id);
    expect(again.boards).toHaveLength(0);
  });
});
