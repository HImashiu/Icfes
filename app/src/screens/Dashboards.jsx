import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Anchored from "../components/Anchored.jsx";
import { Select, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import {
  BOARD_FILTER_COLS, DATASET_LABEL, KPI_AGGS, addTile, createBoardStore, kpiTitle, kpiValue, moveTile, newBoard, newTile, patchTile, pivotOf, removeTile, starterTiles, tileRows,
} from "../lib/dashboards.js";
import { datasetTable, distinctValues, filterActive, scalePos, scaleOf, withFormulas } from "../lib/sheet.js";
import { CHART_AGGS, CHART_TYPES, autoTitle } from "../lib/sheetChart.js";
import SheetChart from "./SheetChart.jsx";
import { useFacts } from "./useFacts.js";
import "./results.css";
import Loading from "../components/Loading.jsx";

const CURRENT = "condor.boards.current";
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: d }));
const heat = (t) => (t == null ? undefined : t < 0.5
  ? `color-mix(in srgb, color-mix(in srgb, var(--bad) ${Math.round((1 - t * 2) * 100)}%, var(--flame)) 30%, transparent)`
  : `color-mix(in srgb, color-mix(in srgb, var(--flame) ${Math.round((1 - (t - 0.5) * 2) * 100)}%, var(--ok)) 30%, transparent)`);
const readCurrent = () => { try { return localStorage.getItem(CURRENT); } catch { return null; } };
const writeCurrent = (id) => { try { localStorage.setItem(CURRENT, id); } catch { /* storage blocked */ } };

// One store per teacher, shared by the sheet (to add tiles) and the Tableros tab.
const stores = new Map();
export function boardStore(api, userId) {
  const k = userId ?? "anon";
  if (!stores.has(k) || stores.get(k).api !== api) stores.set(k, { api, store: createBoardStore({ api, userId }) });
  return stores.get(k).store;
}

// "Al tablero": pick a dashboard (or name a new one) for a tile made in the sheet.
export function AddToBoard({ api, profile, tile, rect, onClose, onOpenBoard }) {
  const store = boardStore(api, profile?.id);
  const [boards, setBoards] = useState(store.boards);
  const [name, setName] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => { store.load().then((b) => setBoards([...b])).catch(() => {}); }, [store]);
  const put = async (board) => {
    const next = addTile(board, { ...tile, id: newTile(tile.kind, tile).id });
    await store.save(next);
    writeCurrent(next.id);
    setDone(next.name);
  };
  return (
    <Anchored rect={rect} onClose={onClose} label="Agregar al tablero" className="db-add">
      {done ? (
        <div className="db-add-done">
          <span><Icon name="check" size={16} /> Agregado a «{done}»</span>
          {onOpenBoard && <button type="button" className="primary" onClick={() => { onClose(); onOpenBoard(); }}>Ver el tablero</button>}
        </div>
      ) : (
        <>
          <strong>Agregar al tablero</strong>
          {boards.length > 0 && <ul className="hd-menu-list db-add-list">{boards.map((b) => <li key={b.id}><button type="button" onClick={() => put(b)}>{b.name} <span className="caption">{b.tiles.length} {b.tiles.length === 1 ? "elemento" : "elementos"}</span></button></li>)}</ul>}
          <form className="hd-menu-row" onSubmit={(e) => { e.preventDefault(); put(newBoard(name.trim() || (boards.length ? `Tablero ${boards.length + 1}` : "Mi tablero"))); }}>
            <input aria-label="Nombre del tablero nuevo" placeholder={boards.length ? "Tablero nuevo…" : "Nombre del tablero"} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button type="submit" className="primary">{boards.length ? "Crear" : "Crear y agregar"}</button>
          </form>
          {store.mode === "local" && <span className="caption">Se guarda en este navegador hasta correr la migración 0028.</span>}
        </>
      )}
    </Anchored>
  );
}

// Every table the tiles may use, from the same data as the sheet. Answers load only when a tile needs them.
function useTables({ api, profile, courses, assignments, models, fetchExam, guard, ws, needFacts }) {
  const [base, setBase] = useState(null);
  useEffect(() => {
    guard(async () => {
      const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
      setBase({ members, attempts });
    });
  }, [api, guard]);
  const facts = useFacts({ api, assignments, courses, fetchExam, ws, on: needFacts });
  return useMemo(() => {
    const ctx = { base, facts, assignments, courses, models, schoolId: profile?.school_id };
    return { entregas: datasetTable("entregas", ctx), estudiantes: datasetTable("estudiantes", ctx), respuestas: needFacts ? datasetTable("respuestas", ctx) : null, loading: !base };
  }, [base, facts, assignments, courses, models, profile, needFacts]);
}

// Resultados › Tableros: the teacher's dashboards, always computed from today's data.
export default function Dashboards({ api, profile, courses, assignments, models = [], fetchExam, guard, ws = null, onOpenSheet }) {
  const store = boardStore(api, profile?.id);
  const [boards, setBoards] = useState(store.boards);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState(readCurrent);
  const [edit, setEdit] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [full, setFull] = useState(null); // null | "full" | "project"
  const [filterMenu, setFilterMenu] = useState(null); // { col, rect }
  const [kpiMenu, setKpiMenu] = useState(null); // rect
  const [drag, setDrag] = useState(null);
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    store.load().then((b) => { if (alive) { setBoards([...b]); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [store]);
  const board = boards.find((b) => b.id === currentId) ?? boards[0] ?? null;
  useEffect(() => { if (board && board.id !== currentId) setCurrentId(board.id); }, [board, currentId]);

  // Edits show at once and are saved shortly after (one write for a burst of drags).
  const update = useCallback((next) => {
    setBoards((list) => list.map((b) => (b.id === next.id ? next : b)));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { store.save(next).catch(() => {}); }, 400);
  }, [store]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const pick = (id) => { setCurrentId(id); writeCurrent(id); setRenaming(false); };
  const create = async (name, tiles = []) => {
    const b = newBoard(name, tiles);
    const list = await store.save(b);
    setBoards([...list]);
    pick(b.id);
    return b;
  };
  const remove = async () => {
    if (!board) return;
    if (!(await confirmDialog(`¿Borrar el tablero «${board.name}»? Los datos no se borran, solo este tablero.`, { confirmLabel: "Borrar tablero", danger: true }))) return;
    const list = await store.remove(board.id);
    setBoards([...list]);
    setCurrentId(list[0]?.id ?? null);
  };

  const needFacts = !!board?.tiles.some((t) => t.ds === "respuestas");
  const tables = useTables({ api, profile, courses, assignments, models, fetchExam, guard, ws, needFacts });
  const tableFor = useCallback((t) => withFormulas(tables[t.ds] ?? null, t.formulas ?? []), [tables]);

  // Full screen and projection (bigger type, no editing).
  const enter = async (mode) => {
    setEdit(false);
    setFull(mode);
    if (!document.fullscreenElement && rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen().catch(() => {});
  };
  const exit = async () => { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); setFull(null); };
  useEffect(() => {
    const change = () => { if (!document.fullscreenElement) setFull(null); };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!full) return undefined;
    const key = (e) => { if (e.key === "Escape" && !document.querySelector(".hd-menu, .ui-pop")) exit(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize by dragging the corner: the tile snaps to whole columns and rows.
  const startResize = (tile, e) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const gap = 12;
    const cellW = (grid.clientWidth - gap * (cols - 1)) / cols;
    const cellH = 150;
    const x0 = e.clientX, y0 = e.clientY;
    const w0 = Math.min(tile.w, cols), h0 = tile.h;
    let last = null;
    const move = (ev) => {
      const w = Math.max(1, Math.min(cols, Math.round((w0 * (cellW + gap) + ev.clientX - x0) / (cellW + gap))));
      const h = Math.max(1, Math.min(4, Math.round((h0 * (cellH + gap) + ev.clientY - y0) / (cellH + gap))));
      if (last && last.w === w && last.h === h) return;
      last = { w, h };
      setBoards((list) => list.map((b) => (b.id === board.id ? patchTile(b, tile.id, { w, h }) : b)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (last) update(patchTile(board, tile.id, last));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const boardValues = useMemo(() => Object.fromEntries(BOARD_FILTER_COLS.map((c) => [c, tables.entregas ? distinctValues(tables.entregas.rows, c).filter((v) => v.value !== "(vacías)") : []])), [tables.entregas]);
  const setBoardFilter = (col, values) => {
    const f = { ...(board.filters ?? {}) };
    if (!values || !values.length) delete f[col]; else f[col] = { values };
    update({ ...board, filters: f });
  };

  if (!loaded) return <Loading label="Cargando tableros…" />;

  if (!board) {
    return (
      <div className="db db-empty-all">
        <header className="t-head"><div><h1>Tableros</h1><span className="caption">Arma tu propio tablero con gráficas, tablas dinámicas e indicadores de la hoja de datos. Siempre muestran los datos de hoy.</span></div></header>
        <div className="card t-card db-start">
          <strong>Todavía no tienes tableros</strong>
          <span className="caption">Empieza con uno de ejemplo y cámbialo a tu gusto, o crea gráficas en la hoja de datos y toca «Al tablero».</span>
          <div className="hd-menu-row">
            <button type="button" className="primary" disabled={!tables.entregas} onClick={() => create("Mi tablero", starterTiles(tables.entregas?.columns ?? []))}>Crear un tablero de ejemplo</button>
            <button type="button" className="secondary" onClick={() => create("Mi tablero")}>Tablero vacío</button>
            {onOpenSheet && <button type="button" className="link" onClick={onOpenSheet}>Ir a la hoja de datos</button>}
          </div>
          {store.mode === "local" && <span className="caption">Se guardan en este navegador hasta correr la migración 0028; después te siguen a cualquier dispositivo.</span>}
        </div>
      </div>
    );
  }

  const nFilters = Object.values(board.filters ?? {}).filter(filterActive).length;
  return (
    <div ref={rootRef} className={`db ${full ? "db-full" : ""} ${full === "project" ? "db-project" : ""} ${edit ? "db-editing" : ""}`}>
      <header className="db-head">
        <div className="db-boards" role="tablist" aria-label="Tableros">
          {boards.map((b) => (
            b.id === board.id && renaming ? (
              <form key={b.id} onSubmit={(e) => { e.preventDefault(); setRenaming(false); }}>
                <input className="db-rename" aria-label="Nombre del tablero" autoFocus value={b.name} maxLength={80} onChange={(e) => update({ ...b, name: e.target.value })} onBlur={() => setRenaming(false)} />
              </form>
            ) : (
              <button key={b.id} type="button" role="tab" aria-selected={b.id === board.id} className={b.id === board.id ? "on" : ""} onClick={() => pick(b.id)} onDoubleClick={() => { pick(b.id); setRenaming(true); }} title="Doble clic para renombrar">{b.name || "Sin nombre"}</button>
            )
          ))}
          {!full && <button type="button" className="db-new" onClick={() => create(`Tablero ${boards.length + 1}`)} aria-label="Nuevo tablero"><Icon name="plus" size={14} /> Nuevo</button>}
        </div>
        <span className="hd-spacer" />
        {!full && (
          <>
            <button type="button" className={edit ? "secondary on" : "secondary"} aria-pressed={edit} onClick={() => setEdit(!edit)}><Icon name="pencil" size={15} /> {edit ? "Listo" : "Editar"}</button>
            <button type="button" className="secondary" onClick={() => enter("full")}><Icon name="expand" size={15} /> Pantalla completa</button>
            <button type="button" className="secondary" onClick={() => enter("project")}><Icon name="play" size={15} /> Proyectar</button>
          </>
        )}
        {full && <button type="button" className="secondary" onClick={exit}><Icon name="x" size={15} /> Salir</button>}
      </header>

      <div className="db-filters">
        <span className="caption">Filtros del tablero</span>
        {BOARD_FILTER_COLS.map((c) => {
          const f = board.filters?.[c];
          const on = f && Array.isArray(f.values) && f.values.length;
          return (
            <button key={c} type="button" className={`chip ${on ? "on" : ""}`} onClick={(e) => setFilterMenu({ col: c, rect: e.currentTarget.getBoundingClientRect() })}>
              {c}{on ? `: ${f.values.length === 1 ? f.values[0] : `${f.values.length}`}` : ""} ▾
            </button>
          );
        })}
        {nFilters > 0 && <button type="button" className="link" onClick={() => update({ ...board, filters: {} })}>Quitar filtros</button>}
        {edit && (
          <>
            <span className="hd-spacer" />
            <button type="button" className="secondary" onClick={(e) => setKpiMenu(e.currentTarget.getBoundingClientRect())}><Icon name="plus" size={14} /> Indicador</button>
            {onOpenSheet && <button type="button" className="secondary" onClick={onOpenSheet}><Icon name="chart" size={14} /> Gráfica desde la hoja</button>}
            <button type="button" className="link" onClick={() => setRenaming(true)}>Renombrar</button>
            <button type="button" className="link db-danger" onClick={remove}>Borrar tablero</button>
          </>
        )}
      </div>

      {board.tiles.length === 0 ? (
        <div className="card t-card db-start">
          <strong>Este tablero está vacío</strong>
          <span className="caption">En la hoja de datos, crea una gráfica o una tabla dinámica y toca «Al tablero». Para un número suelto (por ejemplo la nota media), selecciona su columna y toca «Indicador al tablero».</span>
          <div className="hd-menu-row">
            <button type="button" className="primary" disabled={!tables.entregas} onClick={() => update({ ...board, tiles: starterTiles(tables.entregas?.columns ?? []) })}>Llenar con un ejemplo</button>
            <button type="button" className="secondary" onClick={(e) => setKpiMenu(e.currentTarget.getBoundingClientRect())}><Icon name="plus" size={14} /> Indicador</button>
            {onOpenSheet && <button type="button" className="link" onClick={onOpenSheet}>Ir a la hoja de datos</button>}
          </div>
        </div>
      ) : (
        <div ref={gridRef} className="db-grid">
          {board.tiles.map((t) => (
            <Tile key={t.id} tile={t} board={board} table={tableFor(t)} loading={tables.loading || (t.ds === "respuestas" && !tables.respuestas)} edit={edit}
              dragging={drag === t.id}
              onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}
              onDrop={() => { if (drag && drag !== t.id) update(moveTile(board, drag, t.id)); setDrag(null); }}
              onPatch={(p) => update(patchTile(board, t.id, p))} onRemove={() => update(removeTile(board, t.id))}
              onMove={(d) => update(moveTile(board, t.id, d))} onResize={(e) => startResize(t, e)} />
          ))}
        </div>
      )}
      {store.mode === "local" && !full && <span className="caption">Tus tableros se guardan en este navegador. Cuando el colegio corra la migración 0028 te seguirán a cualquier dispositivo.</span>}

      {filterMenu && (
        <ValuesMenu rect={filterMenu.rect} title={filterMenu.col} values={boardValues[filterMenu.col] ?? []} picked={board.filters?.[filterMenu.col]?.values ?? null}
          onApply={(v) => { setBoardFilter(filterMenu.col, v); setFilterMenu(null); }} onClose={() => setFilterMenu(null)} />
      )}
      {kpiMenu && <KpiMaker rect={kpiMenu} tables={tables} onClose={() => setKpiMenu(null)} onAdd={(tile) => { update(addTile(board, tile)); setKpiMenu(null); }} />}
    </div>
  );
}

function ValuesMenu({ rect, title, values, picked, onApply, onClose }) {
  const [sel, setSel] = useState(() => new Set(picked ?? []));
  const toggle = (v) => setSel((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  return (
    <Anchored rect={rect} onClose={onClose} label={`Filtro ${title}`}>
      <strong>{title}</strong>
      <ul className="hd-values">{values.map((v) => <li key={v.value}><label><input type="checkbox" checked={sel.has(v.value)} onChange={() => toggle(v.value)} /> <span>{v.value}</span> <span className="caption">{v.n}</span></label></li>)}</ul>
      <div className="hd-menu-row">
        <button type="button" className="primary" onClick={() => onApply([...sel])}>{sel.size ? "Aplicar" : "Mostrar todos"}</button>
        <button type="button" className="link" onClick={() => onApply([])}>Todos</button>
      </div>
    </Anchored>
  );
}

// A quick indicator made right on the board: table, column and how to summarize it.
function KpiMaker({ rect, tables, onClose, onAdd }) {
  const [ds, setDs] = useState("entregas");
  const cols = tables[ds]?.columns ?? tables.entregas?.columns ?? [];
  const [col, setCol] = useState(cols.find((c) => c.id === "% aciertos")?.id ?? cols.find((c) => c.type === "num")?.id ?? "");
  const isNum = cols.find((c) => c.id === col)?.type === "num";
  const [agg, setAgg] = useState("avg");
  const aggs = KPI_AGGS.filter((a) => isNum || a.id === "count" || a.id === "distinct");
  const a = aggs.some((x) => x.id === agg) ? agg : aggs[0]?.id;
  return (
    <Anchored rect={rect} onClose={onClose} label="Nuevo indicador">
      <strong>Nuevo indicador</strong>
      <label className="field"><span className="label">Tabla</span><Select aria-label="Tabla" value={ds} onChange={setDs} options={["entregas", "estudiantes"].map((d) => ({ value: d, label: DATASET_LABEL[d] }))} /></label>
      <label className="field"><span className="label">Columna</span><Select aria-label="Columna" value={col} onChange={setCol} options={cols.map((c) => ({ value: c.id, label: c.name }))} /></label>
      <label className="field"><span className="label">Cálculo</span><Select aria-label="Cálculo" value={a} onChange={setAgg} options={aggs.map((x) => ({ value: x.id, label: x.label }))} /></label>
      <button type="button" className="primary" disabled={!col} onClick={() => onAdd(newTile("kpi", { ds, kpi: { col, agg: a } }))}>Agregar</button>
    </Anchored>
  );
}

function Tile({ tile, board, table, loading, edit, dragging, onDragStart, onDragEnd, onDrop, onPatch, onRemove, onMove, onResize }) {
  const rows = useMemo(() => tileRows(table, board, tile), [table, board, tile]);
  const nF = Object.values(tile.filters ?? {}).filter(filterActive).length;
  const auto = tile.kind === "kpi" ? kpiTitle(tile.kpi) : tile.kind === "pivot" ? `${tile.pivot?.value ?? ""} por ${tile.pivot?.row ?? ""}${tile.pivot?.col ? ` y ${tile.pivot.col}` : ""}`
    : tile.chart?.title || (tile.pivot ? `${tile.pivot.value ?? ""} por ${tile.pivot.row ?? ""}${tile.pivot.col ? ` y ${tile.pivot.col}` : ""}` : autoTitle(tile.chart, CHART_AGGS.find((a) => a.id === tile.chart?.agg)?.label ?? "Promedio"));
  const sub = `${DATASET_LABEL[tile.ds] ?? ""}${nF ? ` · ${nF} ${nF === 1 ? "filtro" : "filtros"} propios` : ""}${rows ? ` · ${rows.length.toLocaleString("es-CO")} filas` : ""}`;
  return (
    <section className={`card db-tile db-t-${tile.kind} ${dragging ? "dragging" : ""}`} data-w={tile.w} style={{ gridRow: `span ${tile.h}` }}
      onDragOver={(e) => { if (edit) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onDrop(); }} aria-label={tile.title || auto}>
      <header className="db-tile-head">
        {edit && <span className="db-grip" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tile.id); onDragStart(); }} onDragEnd={onDragEnd} title="Arrastra para mover" aria-hidden="true">⠿</span>}
        {edit ? <input className="db-tile-title" aria-label="Título" value={tile.title} placeholder={auto} onChange={(e) => onPatch({ title: e.target.value })} maxLength={90} />
          : <strong className="db-tile-title">{tile.title || auto}</strong>}
        {edit && (
          <span className="db-tile-tools">
            {tile.kind === "chart" && <Select aria-label="Tipo de gráfica" value={tile.chart?.type ?? "bar"} onChange={(v) => onPatch({ chart: { ...tile.chart, type: v } })} options={CHART_TYPES.filter((c) => !tile.pivot || !["scatter", "hist", "box"].includes(c.id)).map((c) => ({ value: c.id, label: c.label }))} className="db-type" />}
            {tile.kind === "kpi" && <Select aria-label="Cálculo" value={tile.kpi?.agg ?? "avg"} onChange={(v) => onPatch({ kpi: { ...tile.kpi, agg: v } })} options={KPI_AGGS.map((a) => ({ value: a.id, label: a.label }))} className="db-type" />}
            <button type="button" className="icon-btn" aria-label="Mover antes" onClick={() => onMove(-1)}><Icon name="left" size={14} /></button>
            <button type="button" className="icon-btn" aria-label="Mover después" onClick={() => onMove(1)}><Icon name="right" size={14} /></button>
            <button type="button" className="icon-btn" aria-label="Quitar del tablero" onClick={onRemove}><Icon name="x" size={14} /></button>
          </span>
        )}
      </header>
      <div className="db-tile-body">
        {loading || !table ? <Loading label="Cargando…" /> : <TileBody tile={tile} rows={rows} table={table} />}
      </div>
      <span className="caption db-tile-sub">{sub}</span>
      {edit && <span className="db-resize" onPointerDown={onResize} title="Arrastra para cambiar el tamaño" aria-hidden="true" />}
    </section>
  );
}

function TileBody({ tile, rows, table }) {
  if (tile.kind === "kpi") {
    const { value, n } = kpiValue(rows, tile.kpi);
    const col = table.columns.find((c) => c.id === tile.kpi?.col);
    const sc = col?.scale ?? scaleOf(tile.kpi?.col);
    const t = sc && sc !== "row" && ["avg", "median", "min", "max"].includes(tile.kpi?.agg) ? scalePos({ scale: sc }, null, value) : null;
    const d = ["count", "distinct"].includes(tile.kpi?.agg) ? 0 : Math.max(1, col?.decimals ?? 1);
    return (
      <div className="db-kpi" style={t != null ? { background: heat(t) } : undefined}>
        <span className="db-kpi-n">{fmt(value, d)}{sc && sc !== "row" && sc[1] === 100 && value != null && !["count", "distinct", "sum"].includes(tile.kpi?.agg) ? " %" : ""}</span>
        <span className="caption">{["count", "distinct"].includes(tile.kpi?.agg) ? `de ${rows.length.toLocaleString("es-CO")} filas` : `sobre ${n.toLocaleString("es-CO")} valores`}</span>
      </div>
    );
  }
  if (tile.kind === "pivot") {
    const p = pivotOf(rows, tile.pivot);
    if (!p) return <p className="caption">Tabla dinámica sin filas.</p>;
    const sc = scaleOf(tile.pivot.value);
    return (
      <div className="db-pivot">
        <table className="t-table">
          <thead><tr>{p.columns.map((c) => <th key={c.id} className={c.type === "num" ? "num" : ""}>{c.name}</th>)}</tr></thead>
          <tbody>{p.rows.map((r, i) => <tr key={i}>{p.columns.map((c, j) => {
            const v = r[c.id];
            const bg = j > 0 && c.id !== "n" && sc && sc !== "row" && tile.pivot.how !== "count" ? heat(scalePos({ scale: tile.pivot.how === "pct1" ? [0, 100] : sc }, null, v)) : undefined;
            return <td key={c.id} className={c.type === "num" ? "num" : ""} style={bg ? { background: bg } : undefined}>{typeof v === "number" ? fmt(v) : v}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  // Chart (of the rows, or of a pivot table of them).
  const p = tile.pivot ? pivotOf(rows, tile.pivot) : null;
  const data = p ? p.rows : rows;
  const cols = p ? p.columns : table.columns;
  return <SheetChart compact rows={data} columns={cols} pivot={!!p} config={{ ...tile.chart, title: tile.title || tile.chart?.title || "" }} />;
}

