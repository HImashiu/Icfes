// Tableros: the teacher's own dashboards, made of tiles saved from the Hoja de datos (charts, pivot tables and
// indicators). Tiles keep the recipe, never the numbers, so they are always computed from today's data.
// With migration 0028 the dashboards live in the database (teacher_dashboards, one row per dashboard, only its
// teacher reads or writes it); before that, in this browser.
import { aggregate } from "./sheetChart.js";
import { applyFilters, pivotTable } from "./sheet.js";

export const BOARD_FILTER_COLS = ["Curso", "Materia", "Tipo"];
export const KPI_AGGS = [
  { id: "avg", label: "Promedio" }, { id: "median", label: "Mediana" }, { id: "sum", label: "Suma" },
  { id: "count", label: "Recuento" }, { id: "distinct", label: "Recuento único" }, { id: "min", label: "Mínimo" }, { id: "max", label: "Máximo" },
];
export const DATASET_LABEL = { entregas: "Entregas", estudiantes: "Estudiantes", respuestas: "Respuestas" };

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const newId = uid;
const clampW = (w) => Math.max(1, Math.min(4, Math.round(w || 1)));
const clampH = (h) => Math.max(1, Math.min(4, Math.round(h || 1)));

export function newBoard(name = "Mi tablero", tiles = []) {
  return { id: uid(), name: String(name).slice(0, 80) || "Mi tablero", filters: {}, tiles, position: 0, updated_at: new Date().toISOString() };
}
export function newTile(kind, spec) {
  const size = kind === "kpi" ? { w: 1, h: 1 } : kind === "pivot" ? { w: 2, h: 2 } : { w: 2, h: 2 };
  return { id: uid(), kind, title: "", ds: "entregas", formulas: [], filters: {}, ...size, ...spec, w: clampW(spec?.w ?? size.w), h: clampH(spec?.h ?? size.h) };
}

// Board edits, all pure: they return a new board.
export const addTile = (board, tile) => ({ ...board, tiles: [...board.tiles, tile] });
export const removeTile = (board, id) => ({ ...board, tiles: board.tiles.filter((t) => t.id !== id) });
export const patchTile = (board, id, patch) => ({ ...board, tiles: board.tiles.map((t) => (t.id === id ? { ...t, ...patch, ...(patch.w != null ? { w: clampW(patch.w) } : {}), ...(patch.h != null ? { h: clampH(patch.h) } : {}) } : t)) });
// Move a tile to the place of another (drag and drop), or by an offset (keyboard / arrows).
export function moveTile(board, id, toId) {
  const list = [...board.tiles];
  const from = list.findIndex((t) => t.id === id);
  const to = typeof toId === "number" ? Math.max(0, Math.min(list.length - 1, from + toId)) : list.findIndex((t) => t.id === toId);
  if (from < 0 || to < 0 || from === to) return board;
  const [t] = list.splice(from, 1);
  list.splice(to, 0, t);
  return { ...board, tiles: list };
}

// The rows a tile sees: its table, then the board's filters (on the columns the table has), then its own filters.
export function tileRows(table, board, tile) {
  if (!table) return null;
  const has = new Set(table.columns.map((c) => c.id));
  const bf = Object.fromEntries(Object.entries(board?.filters ?? {}).filter(([k]) => has.has(k)));
  return applyFilters(applyFilters(table.rows, bf), tile.filters ?? {});
}

// An indicator: one number from one column.
export function kpiValue(rows, kpi) {
  if (!rows || !kpi?.col) return { value: null, n: 0 };
  const vals = rows.map((r) => r[kpi.col]);
  const n = vals.filter((v) => v != null && v !== "").length;
  if (kpi.agg === "distinct") return { value: new Set(vals.filter((v) => v != null && v !== "").map(String)).size, n };
  return { value: aggregate(vals, kpi.agg ?? "avg"), n };
}
export function kpiTitle(kpi) {
  const a = KPI_AGGS.find((x) => x.id === kpi?.agg)?.label ?? "Promedio";
  return kpi?.agg === "count" ? `Filas con ${kpi.col}` : kpi?.agg === "distinct" ? `${kpi.col} distintos` : `${a} de ${kpi?.col ?? ""}`;
}
export const pivotOf = (rows, pivot) => (rows && pivot?.row ? pivotTable(rows, pivot) : null);

// A first board with the numbers most teachers look at. No rankings: only groups, subjects and distributions.
export function starterTiles(columns) {
  const has = (id) => columns.some((c) => c.id === id);
  const t = [];
  if (has("% aciertos")) t.push(newTile("kpi", { kpi: { col: "% aciertos", agg: "avg" }, title: "% de aciertos promedio" }));
  // Notes come in different scales (1–5, 0–10, 0–100), so the starter shows delivery instead of a mixed average.
  t.push(newTile("kpi", { ds: "estudiantes", kpi: { col: "% entregado", agg: "avg" }, title: "% de actividades entregadas" }));
  if (has("Estudiante")) t.push(newTile("kpi", { kpi: { col: "Estudiante", agg: "distinct" }, title: "Estudiantes que entregaron" }));
  if (has("Actividad")) t.push(newTile("kpi", { kpi: { col: "Actividad", agg: "count" }, title: "Entregas" }));
  if (has("Materia")) t.push(newTile("chart", { chart: { type: "bar", x: "Materia", y: ["% aciertos"], series: null, agg: "avg", bins: 10, sort: "label", limit: 30, title: "", xTitle: "", yTitle: "" }, w: 2, h: 2 }));
  if (has("Curso")) t.push(newTile("chart", { chart: { type: "box", x: "Curso", y: ["% aciertos"], series: null, agg: "avg", bins: 10, sort: "label", limit: 30, title: "", xTitle: "", yTitle: "" }, w: 2, h: 2 }));
  if (has("Tipo")) t.push(newTile("chart", { chart: { type: "hist", x: null, y: ["% aciertos"], series: "Tipo", agg: "avg", bins: 10, sort: "label", limit: 30, title: "", xTitle: "", yTitle: "" }, w: 2, h: 2 }));
  if (has("Curso") && has("Materia")) t.push(newTile("pivot", { pivot: { row: "Curso", col: "Materia", value: "% aciertos", how: "avg", minN: 1 }, title: "% de aciertos por curso y materia", w: 2, h: 2 }));
  return t;
}

// Storage: database rows when migration 0028 has run, this browser otherwise. A board is
// { id, name, filters, tiles, position, updated_at }.
export function createBoardStore({ api, userId, storage = globalThis.localStorage }) {
  const key = `condor:boards:${userId ?? "anon"}`;
  let mode = typeof api?.wsList === "function" ? "db" : "local";
  const readLocal = () => { try { const v = JSON.parse(storage?.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeLocal = (boards) => { try { storage?.setItem(key, JSON.stringify(boards)); } catch { /* storage blocked */ } };
  let boards = [];
  const toRow = (b, i) => ({ id: b.id, teacher_id: userId, name: b.name, filters: b.filters ?? {}, tiles: b.tiles ?? [], position: i });
  const fromRow = (r) => ({ id: r.id, name: r.name, filters: r.filters ?? {}, tiles: Array.isArray(r.tiles) ? r.tiles : [], position: r.position ?? 0, updated_at: r.updated_at });
  const fallBack = () => {
    mode = "local";
    const mine = readLocal();
    for (const b of boards) if (!mine.some((x) => x.id === b.id)) mine.push(b);
    boards = mine;
    writeLocal(boards);
  };
  const run = async (fn) => {
    if (mode !== "db") return;
    try { await fn(); } catch (e) { if (e.code !== "missing") throw e; fallBack(); }
  };
  return {
    get mode() { return mode; },
    get boards() { return boards; },
    async load() {
      if (mode === "db") {
        try {
          const rows = await api.wsList("teacher_dashboards", { teacher_id: userId });
          boards = rows.map(fromRow).sort((a, b) => a.position - b.position);
          return boards;
        } catch (e) { if (e.code !== "missing") throw e; mode = "local"; }
      }
      boards = readLocal();
      return boards;
    },
    async save(board) {
      const i = boards.findIndex((b) => b.id === board.id);
      const next = { ...board, updated_at: new Date().toISOString() };
      boards = i < 0 ? [...boards, next] : boards.map((b) => (b.id === board.id ? next : b));
      await run(() => api.wsUpsert("teacher_dashboards", [toRow(next, i < 0 ? boards.length - 1 : i)], "id"));
      if (mode === "local") writeLocal(boards);
      return boards;
    },
    async remove(id) {
      boards = boards.filter((b) => b.id !== id);
      await run(() => api.wsDelete("teacher_dashboards", { id }));
      if (mode === "local") writeLocal(boards);
      return boards;
    },
  };
}
