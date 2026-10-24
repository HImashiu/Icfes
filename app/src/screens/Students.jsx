import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateField, Select, confirmDialog } from "../components/Controls.jsx";
import Icon from "../components/Icon.jsx";
import { areaColor } from "../lib/brand.js";
import { fmtDuration } from "../lib/studentRun.js";
import { activityCsv } from "../lib/activityReport.js";
import { areaAverages } from "../lib/analytics.js";
import {
  ALERT_KINDS, EMPTY_FILTERS, SORTS, activeFilterCount, addDaysIso, alertLabel, applyFilters, buildRoster, followUpQueue,
  isoDay, rosterCsv, viewFilters, weeklyActivity,
} from "../lib/workspace.js";
import { SWATCHES } from "../lib/workspaceStore.js";
import { bulkActions, profilePanels, rosterColumns, scoring, sorted } from "../lib/workspaceSlots.js";
import { Bars, Kpi } from "./Dashboard.jsx";

const PAGE = 60;
const TABS = [["list", "Lista"], ["queue", "Seguimiento"], ["groups", "Grupos"], ["statuses", "Estados"]];
const KIND_LABEL = { task: "Tarea", homework: "Tarea en casa", exam: "Examen" };
const STATE_LABEL = { active: "Abierta", scheduled: "Programada", closed: "Cerrada", draft: "Borrador" };
const AREAS = ["Lectura Crítica", "Matemáticas", "Sociales y Ciudadanas", "Ciencias Naturales", "Inglés"];
const shortDate = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");
const initials = (name) => String(name).split(/\s+/).filter((w) => w && !w.includes("@")).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || String(name)[0]?.toUpperCase() || "?";
const fmtTrend = (t) => (t == null ? "—" : `${t > 0 ? "+" : ""}${t} pts`);

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export function StatusChip({ status }) {
  if (!status) return <span className="caption">—</span>;
  return <span className="ws-status" style={{ "--st": status.color }}><span className="dot" style={{ background: status.color }} />{status.label}</span>;
}

function AlertChips({ alerts, max = 2 }) {
  if (!alerts.length) return <span className="caption">—</span>;
  return (
    <span className="ws-alerts">
      {alerts.slice(0, max).map((a) => <span key={a.kind} className={`ws-alert sev-${a.kind === "up" ? "up" : a.severity >= 4 ? "high" : a.severity >= 3 ? "mid" : "low"}`} title={a.reason}>{alertLabel(a.kind)}</span>)}
      {alerts.length > max && <span className="caption">+{alerts.length - max}</span>}
    </span>
  );
}

// Estudiantes: the workspace for large classes. A searchable roster across every class space, statuses, groups,
// a follow-up queue, bulk actions and a full profile per student. Nothing is hidden: every list leads to the detail.
export default function Students({ api, profile, courses, assignments, guard, setNotice, ws, store, focus, onFocusDone, onOpenAssignment, onReinforce }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("list");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [moreFilters, setMoreFilters] = useState(false);
  const [phoneFilters, setPhoneFilters] = useState(false); // on a phone the selects fold behind one button
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [openKey, setOpenKey] = useState(null);
  const [naming, setNaming] = useState(null);
  const listTop = useRef(null);

  const load = useCallback(() => guard(async () => {
    const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts()]);
    setData({ members, attempts });
  }), [api, guard]);
  useEffect(() => { load(); }, [load]);

  const courseName = useCallback((id) => courses.find((c) => c.id === id)?.name ?? "", [courses]);
  const groupById = useMemo(() => new Map((ws?.groups ?? []).map((g) => [g.id, g])), [ws]);
  const groupName = useCallback((id) => groupById.get(id)?.name ?? "", [groupById]);
  const ctx = useMemo(() => ({ courseName, groupName }), [courseName, groupName]);

  const roster = useMemo(() => {
    if (!data) return [];
    const ids = new Set(courses.map((c) => c.id));
    return buildRoster({ members: data.members.filter((m) => ids.has(m.course_id)), assignments: assignments.filter((a) => ids.has(a.course_id)), attempts: data.attempts, ws: ws ?? {} });
  }, [data, courses, assignments, ws]);
  const shown = useMemo(() => applyFilters(roster, filters, ctx), [roster, filters, ctx]);
  const scope = useMemo(() => (filters.course ? roster.filter((e) => e.courseIds.includes(filters.course)) : roster), [roster, filters.course]);

  // Deep link from Resumen or Reportes: open that student's profile.
  useEffect(() => {
    if (!focus || !data) return;
    const key = String(focus).toLowerCase();
    if (key === "#queue") { setOpenKey(null); setTab("queue"); }
    else if (roster.some((e) => e.key === key)) { setOpenKey(key); setTab("list"); }
    onFocusDone?.();
  }, [focus, data, roster, onFocusDone]);

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const toggle = (key) => setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const picked = roster.filter((e) => selected.has(e.key));
  const allShownPicked = shown.length > 0 && shown.every((e) => selected.has(e.key));
  const selectShown = () => setSelected((s) => { const n = new Set(s); for (const e of shown) if (allShownPicked) n.delete(e.key); else n.add(e.key); return n; });
  const say = (text) => setNotice?.(text);
  const persist = (fn) => guard(fn);

  const flagged = (emails, patch, text) => persist(async () => { await store.setFlags(emails, patch); say(text); });
  const followUp = (list, { reason = "", due = addDaysIso(isoDay(), 7) } = {}) =>
    flagged(list.map((e) => e.email), { follow_up: true, follow_up_due: due, follow_up_reason: reason || null }, list.length === 1 ? `${list[0].name} quedó en seguimiento.` : `${list.length} estudiantes en seguimiento.`);
  const closeFollowUp = (e) => persist(async () => {
    await store.setFlags([e.email], { follow_up: false, follow_up_due: null, follow_up_reason: null });
    await store.addNote(e.email, `Seguimiento cerrado${e.followUp?.reason ? `: ${e.followUp.reason}` : "."}`);
    say(`Seguimiento de ${e.name} cerrado.`);
  });

  if (!data || !ws) return <p className="caption">Cargando estudiantes…</p>;

  const open = openKey ? roster.find((e) => e.key === openKey) : null;
  if (open) {
    const nav = shown.some((e) => e.key === open.key) ? shown : roster;
    const i = nav.findIndex((e) => e.key === open.key);
    return (
      <StudentProfile
        key={open.key} api={api} userId={profile?.id} student={open} ws={ws} store={store} guard={guard} say={say} courses={courses} assignments={assignments}
        courseName={courseName} groupById={groupById} position={{ i, n: nav.length }}
        onPrev={i > 0 ? () => setOpenKey(nav[i - 1].key) : null}
        onNext={i < nav.length - 1 ? () => setOpenKey(nav[i + 1].key) : null}
        onBack={() => { setOpenKey(null); setTimeout(() => listTop.current?.scrollIntoView?.({ block: "start" }), 30); }}
        onFollowUp={followUp} onCloseFollowUp={closeFollowUp} onOpenAssignment={onOpenAssignment} onReinforce={onReinforce}
      />
    );
  }

  const queue = followUpQueue(roster);
  const overdue = queue.queue.filter((e) => e.overdue || e.dueToday).length;
  const counts = {
    attention: scope.filter((e) => e.severity > 0).length,
    follow: scope.filter((e) => e.followUp).length,
    never: scope.filter((e) => !e.joined).length,
    late: scope.filter((e) => e.late > 0).length,
    up: scope.filter((e) => e.alerts.some((a) => a.kind === "up")).length,
  };
  const assigned = scope.reduce((n, e) => n + e.assigned, 0);
  const done = scope.reduce((n, e) => n + e.done, 0);
  const pcts = scope.map((e) => e.avgPct).filter((p) => p != null);
  const scopeAreas = areaAverages(scope.flatMap((e) => e.summary.attempts));
  const extraCols = sorted(rosterColumns);
  const quick = [
    ["Todos", { alert: "", followUp: "", joined: "", work: "" }, scope.length, !filters.alert && !filters.followUp && !filters.joined && !filters.work],
    ["Necesitan atención", { alert: "any", followUp: "", joined: "", work: "" }, counts.attention, filters.alert === "any"],
    ["En seguimiento", { followUp: "yes", alert: "", joined: "", work: "" }, counts.follow, filters.followUp === "yes"],
    ["Tareas sin entregar", { work: "late", alert: "", followUp: "", joined: "" }, counts.late, filters.work === "late"],
    ["Sin ingresar", { joined: "no", alert: "", followUp: "", work: "" }, counts.never, filters.joined === "no"],
    ["Mejoraron", { alert: "up", followUp: "", joined: "", work: "" }, counts.up, filters.alert === "up"],
  ];
  const views = ws.views ?? [];
  const sameView = (v) => JSON.stringify(viewFilters(v.filters)) === JSON.stringify(viewFilters(filters));

  return (
    <>
      <header className="t-head" ref={listTop}>
        <div>
          <h1>Estudiantes</h1>
          <span className="caption">{roster.length} {roster.length === 1 ? "estudiante" : "estudiantes"} en {courses.length} {courses.length === 1 ? "espacio" : "espacios"}. Busca, filtra y abre a cualquiera para ver todo su trabajo.</span>
        </div>
        <button type="button" className="secondary" disabled={shown.length === 0} onClick={() => download("Estudiantes.csv", rosterCsv(shown, ctx))}>Exportar lista</button>
      </header>
      {ws.mode === "local" && <p className="notice">Estados, grupos, notas, seguimiento y vistas se guardan por ahora solo en este navegador. Al correr la migración 0014 en Supabase quedan en la cuenta y los ven los demás docentes del estudiante.</p>}

      <div className="segmented small ws-tabs" role="tablist" aria-label="Vistas de estudiantes">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "seg active" : "seg"} onClick={() => setTab(id)}>
            {label}{id === "queue" && queue.queue.length > 0 && <span className={overdue ? "ws-count hot" : "ws-count"}>{queue.queue.length}</span>}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          <section className="card t-card ws-overview" aria-label="Resumen del grupo">
            <div className="section-head">
              <strong>{filters.course ? courseName(filters.course) : "Todos mis espacios"}</strong>
              <span className="caption">Entregas {assigned ? `${Math.round((done / assigned) * 100)} %` : "—"} · {scoring.label} {scoring.format(pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null)}</span>
            </div>
            <div className="ws-quick" role="group" aria-label="Filtros rápidos">
              {quick.map(([label, patch, n, on]) => (
                <button key={label} type="button" className={on ? "ws-stat on" : "ws-stat"} aria-pressed={on} onClick={() => setF(patch)}>
                  <strong className="display">{n}</strong><span>{label}</span>
                </button>
              ))}
            </div>
            {scopeAreas.length > 0 && (
              <details className="ws-areas">
                <summary>Resultados por área del grupo</summary>
                <Bars rows={scopeAreas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
              </details>
            )}
          </section>

          <section className="card t-card ws-filters" aria-label="Buscar y filtrar">
            <div className="ws-views">
              <span className="label">Vistas</span>
              <button type="button" className={activeFilterCount(filters) === 0 && !filters.q ? "chip on" : "chip"} onClick={() => setF({ ...EMPTY_FILTERS })}>Todos</button>
              {views.map((v) => (
                <span key={v.id} className={sameView(v) ? "chip on ws-view" : "chip ws-view"}>
                  <button type="button" className="ws-view-name" onClick={() => setF(viewFilters(v.filters))}>{v.name}</button>
                  <button type="button" className="ws-x" aria-label={`Borrar la vista ${v.name}`} onClick={async () => { if (await confirmDialog(`¿Borrar la vista «${v.name}»?`, { confirmLabel: "Borrar", danger: true })) persist(() => store.deleteView(v.id)); }}><Icon name="x" size={14} /></button>
                </span>
              ))}
              {naming === null ? (
                <button type="button" className="chip ws-add" disabled={activeFilterCount(filters) === 0 && !filters.q} onClick={() => setNaming("")}><Icon name="plus" size={14} /> Guardar vista</button>
              ) : (
                <form className="b-auto" onSubmit={(e) => { e.preventDefault(); if (!naming.trim()) return; persist(async () => { await store.saveView(naming, viewFilters(filters)); setNaming(null); say(`Vista «${naming.trim()}» guardada.`); }); }}>
                  <input autoFocus aria-label="Nombre de la vista" placeholder="Ej.: 11-A sin entregar" value={naming} maxLength={60} onChange={(e) => setNaming(e.target.value)} />
                  <button type="submit" className="secondary" disabled={!naming.trim()}>Guardar</button>
                  <button type="button" className="link" onClick={() => setNaming(null)}>Cancelar</button>
                </form>
              )}
            </div>
            <div className={phoneFilters ? "ws-filter-row ws-main-filters open" : "ws-filter-row ws-main-filters"}>
              <label className="ws-search">
                <Icon name="user" size={18} />
                <input type="search" aria-label="Buscar estudiante" placeholder="Buscar por nombre, correo, espacio, grupo o estado" value={filters.q} onChange={(e) => setF({ q: e.target.value })} />
              </label>
              <button type="button" className="secondary ws-filter-toggle" aria-expanded={phoneFilters} onClick={() => setPhoneFilters(!phoneFilters)}>
                <Icon name="filter" size={16} />Filtros{activeFilterCount(filters) > 0 ? ` · ${activeFilterCount(filters)}` : ""}
              </button>
              <Select aria-label="Espacio de clase" value={filters.course} onChange={(v) => setF({ course: v })}>
                <option value="">Todos los espacios</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select aria-label="Grupo" value={filters.group} onChange={(v) => setF({ group: v })}>
                <option value="">Todos los grupos</option>
                {ws.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
              <Select aria-label="Estado" value={filters.status} onChange={(v) => setF({ status: v })}>
                <option value="">Cualquier estado</option>
                <option value="none">Sin estado</option>
                {ws.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
              <Select aria-label="Alertas" value={filters.alert} onChange={(v) => setF({ alert: v })}>
                <option value="">Con o sin alertas</option>
                <option value="any">Con alguna alerta</option>
                <option value="none">Sin alertas</option>
                {ALERT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </Select>
              <button type="button" className="link" aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>{moreFilters ? "Menos filtros" : "Más filtros"}</button>
              {(activeFilterCount(filters) > 0 || filters.q) && <button type="button" className="link" onClick={() => setF({ ...EMPTY_FILTERS, sort: filters.sort })}>Limpiar ({activeFilterCount(filters) + (filters.q ? 1 : 0)})</button>}
            </div>
            {moreFilters && (
              <div className="ws-filter-row">
                <label className="field"><span className="label">Seguimiento</span>
                  <Select value={filters.followUp} onChange={(v) => setF({ followUp: v })}><option value="">Todos</option><option value="yes">En seguimiento</option><option value="due">Seguimiento vencido o de hoy</option><option value="no">Sin seguimiento</option></Select></label>
                <label className="field"><span className="label">Trabajo</span>
                  <Select value={filters.work} onChange={(v) => setF({ work: v })}><option value="">Todos</option><option value="late">Con tareas sin entregar</option><option value="pending">Con tareas abiertas</option><option value="none">No ha entregado nada</option><option value="quiet7">Sin entregar hace 7 días o más</option></Select></label>
                <label className="field"><span className="label">Ingreso</span>
                  <Select value={filters.joined} onChange={(v) => setF({ joined: v })}><option value="">Todos</option><option value="yes">Ya ingresó</option><option value="no">Aún no ingresa</option></Select></label>
                <label className="field"><span className="label">Área más baja</span>
                  <Select value={filters.weakArea} onChange={(v) => setF({ weakArea: v })}><option value="">Cualquiera</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</Select></label>
                <label className="field ws-range"><span className="label">Promedio entre</span>
                  <span className="b-auto">
                    <input inputMode="numeric" aria-label="Promedio mínimo" placeholder="0" value={filters.minAvg} onChange={(e) => setF({ minAvg: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                    y
                    <input inputMode="numeric" aria-label="Promedio máximo" placeholder="100" value={filters.maxAvg} onChange={(e) => setF({ maxAvg: e.target.value.replace(/\D/g, "").slice(0, 3) })} /> %
                  </span></label>
                <label className="field"><span className="label">Orden</span>
                  <Select value={filters.sort} onChange={(v) => setF({ sort: v })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
              </div>
            )}
          </section>

          {picked.length > 0 && (
            <BulkBar picked={picked} ws={ws} store={store} api={api} persist={persist} say={say} courses={courses}
              onFollowUp={() => followUp(picked)}
              onUnfollow={() => flagged(picked.map((e) => e.email), { follow_up: false, follow_up_due: null, follow_up_reason: null }, `${picked.length} fuera de seguimiento.`)}
              onExport={() => download("Actividad seleccionados.csv", activityCsv(picked.map((e) => ({ ...e, courseId: e.courseIds[0] })), courseName))}
              onClear={() => setSelected(new Set())} />
          )}

          <div className="card t-card">
            <div className="table-wrap">
              <table className="t-table ws-table m-cards">
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label={allShownPicked ? "Quitar la selección" : `Seleccionar los ${shown.length} de la lista`} checked={allShownPicked} onChange={selectShown} /></th>
                    <th>Estudiante</th><th>Espacios</th><th>Estado</th><th>Grupos</th><th>Entregas</th><th>{scoring.label}</th><th>Cambio</th><th>Última</th><th>Alertas</th>
                    {extraCols.map((c) => <th key={c.id}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, page * PAGE).map((e) => (
                    <tr key={e.key} className={selected.has(e.key) ? "t-row-link selected" : "t-row-link"} onClick={() => setOpenKey(e.key)}>
                      <td onClick={(ev) => ev.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar a ${e.name}`} checked={selected.has(e.key)} onChange={() => toggle(e.key)} /></td>
                      <td>
                        <button type="button" className="ws-name" onClick={(ev) => { ev.stopPropagation(); setOpenKey(e.key); }}>
                          <span className="avatar sm" aria-hidden="true">{initials(e.name)}</span>
                          <span><strong>{e.name}</strong><span className="caption">{e.email}{!e.joined ? " · sin ingresar" : ""}</span></span>
                        </button>
                        {e.followUp && <span className={e.followUp.due && e.followUp.due <= isoDay() ? "ws-follow hot" : "ws-follow"} title={e.followUp.reason}><Icon name="flag" size={12} /> {e.followUp.due ? shortDate(e.followUp.due) : "Seguimiento"}</span>}
                      </td>
                      <td className="ws-wrap" data-l="Espacios">{e.courseIds.map(courseName).join(", ")}</td>
                      <td data-l="Estado" className={e.status ? "" : "m-hide"}><StatusChip status={e.status} /></td>
                      <td className={e.groups.length ? "ws-wrap" : "ws-wrap m-hide"} data-l="Grupos">{e.groups.length ? e.groups.map((g) => groupById.get(g)).filter(Boolean).map((g) => <span key={g.id} className="ws-group" style={{ "--gc": g.color }}>{g.name}</span>) : <span className="caption">—</span>}</td>
                      <td data-l="Entregas">{e.done}/{e.assigned}{e.late > 0 && <span className="badge pending"> {e.late} sin entregar</span>}</td>
                      <td data-l={scoring.label} className="m-score">{scoring.format(e.avgPct)}</td>
                      <td data-l="Cambio" className={e.trend > 0 ? "ws-up" : e.trend < 0 ? "ws-down" : e.trend == null ? "m-hide" : ""}>{fmtTrend(e.trend)}</td>
                      <td data-l="Última entrega">{shortDate(e.lastAt)}</td>
                      <td data-l="Alertas" className={e.alerts?.length ? "" : "m-hide"}><AlertChips alerts={e.alerts} /></td>
                      {extraCols.map((c) => <td key={c.id}>{c.value(e) ?? "—"}</td>)}
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={10 + extraCols.length} className="caption">{roster.length === 0 ? "Aún no hay estudiantes. Agrégalos en «Espacios de clase»." : "Nadie coincide con la búsqueda y los filtros."}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="ws-pager">
              <span className="caption">Mostrando {Math.min(shown.length, page * PAGE)} de {shown.length}{shown.length !== roster.length ? ` (de ${roster.length} en total)` : ""}. Orden: {SORTS.find(([v]) => v === filters.sort)?.[1]}.</span>
              {shown.length > page * PAGE && <button type="button" className="secondary" onClick={() => setPage(page + 1)}>Mostrar {Math.min(PAGE, shown.length - page * PAGE)} más</button>}
            </div>
            <span className="caption">Puntajes según la clave preliminar, no oficial. La lista nunca se ordena por puntaje: es una lista de trabajo, no una clasificación.</span>
          </div>
        </>
      )}

      {tab === "queue" && <FollowUpQueue queue={queue} onOpen={setOpenKey} onFollowUp={followUp} onClose={closeFollowUp} store={store} persist={persist} say={say} courseName={courseName} />}
      {tab === "groups" && <Groups ws={ws} store={store} roster={roster} courses={courses} persist={persist} say={say} onShow={(id) => { setF({ ...EMPTY_FILTERS, group: id }); setTab("list"); }} />}
      {tab === "statuses" && <Statuses ws={ws} store={store} roster={roster} persist={persist} say={say} onShow={(id) => { setF({ ...EMPTY_FILTERS, status: id }); setTab("list"); }} />}
    </>
  );
}

function BulkBar({ picked, ws, store, api, persist, say, courses, onFollowUp, onUnfollow, onExport, onClear }) {
  const emails = picked.map((e) => e.email);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(emails.join(", ")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { say("No se pudieron copiar los correos en este navegador."); }
  };
  const sharedGroups = ws.groups.filter((g) => picked.some((e) => e.groups.includes(g.id)));
  return (
    <div className="ws-bulk" role="region" aria-label="Acciones para los seleccionados">
      <strong>{picked.length} {picked.length === 1 ? "seleccionado" : "seleccionados"}</strong>
      <Select aria-label="Poner estado" placeholder="Poner estado…" value="" onChange={(v) => persist(async () => { await store.setFlags(emails, { status_id: v === "none" ? null : v }); say(v === "none" ? `Estado quitado a ${picked.length}.` : `Estado «${ws.statuses.find((s) => s.id === v)?.label}» para ${picked.length}.`); })}>
        {ws.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        <option value="none">Quitar estado</option>
      </Select>
      <Select aria-label="Agregar a grupo" placeholder="Agregar a grupo…" value="" onChange={(v) => persist(async () => { await store.addToGroup(v, emails); say(`${picked.length} en el grupo «${ws.groups.find((g) => g.id === v)?.name}».`); })}>
        {ws.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Select>
      {sharedGroups.length > 0 && (
        <Select aria-label="Quitar de grupo" placeholder="Quitar de grupo…" value="" onChange={(v) => persist(async () => { await store.removeFromGroup(v, emails); say(`Quitados del grupo «${ws.groups.find((g) => g.id === v)?.name}».`); })}>
          {sharedGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      )}
      <button type="button" className="secondary" onClick={onFollowUp}><Icon name="flag" size={16} /> Seguimiento</button>
      {picked.some((e) => e.followUp) && <button type="button" className="link" onClick={onUnfollow}>Quitar seguimiento</button>}
      <button type="button" className="link" onClick={copy}>{copied ? "¡Copiados!" : "Copiar correos"}</button>
      <button type="button" className="link" onClick={onExport}>Exportar actividad</button>
      {sorted(bulkActions).map((a) => <button key={a.id} type="button" className="link" onClick={() => persist(() => a.run({ students: picked, api, store, setNotice: say, courses }))}>{a.label}</button>)}
      <button type="button" className="link" onClick={onClear}>Deseleccionar</button>
    </div>
  );
}

function FollowUpQueue({ queue, onOpen, onFollowUp, onClose, store, persist, say, courseName }) {
  const [more, setMore] = useState(false);
  const later = (e, days) => persist(async () => { await store.setFlags([e.email], { follow_up_due: addDaysIso(isoDay(), days) }); say(`Seguimiento de ${e.name} movido al ${shortDate(addDaysIso(isoDay(), days))}.`); });
  return (
    <div className="d-two ws-queue">
      <section className="card t-card">
        <strong>Cola de seguimiento</strong>
        <span className="caption">Estudiantes que marcaste para revisar, primero los vencidos. Al cerrar uno queda una nota en su perfil.</span>
        {queue.queue.length === 0 && <div className="empty-state"><Icon name="check" size={28} /><p>Nadie en seguimiento. Marca estudiantes desde la lista, su perfil o las sugerencias.</p></div>}
        <ul className="b-list">
          {queue.queue.map((e) => (
            <li key={e.key} className={`ws-q-row${e.overdue ? " overdue" : e.dueToday ? " today" : ""}`}>
              <button type="button" className="ws-name" onClick={() => onOpen(e.key)}>
                <span className="avatar sm" aria-hidden="true">{initials(e.name)}</span>
                <span><strong>{e.name}</strong><span className="caption">{e.courseIds.map(courseName).join(", ")}</span></span>
              </button>
              <span className="b-text">{e.followUp.reason || e.alerts[0]?.reason || "Sin motivo escrito."}</span>
              <span className={e.overdue ? "ws-due hot" : "ws-due"}>{e.followUp.due ? (e.overdue ? `Vencido · ${shortDate(e.followUp.due)}` : e.dueToday ? "Hoy" : shortDate(e.followUp.due)) : "Sin fecha"}</span>
              <span className="ws-q-actions">
                <button type="button" className="secondary" onClick={() => onClose(e)}><Icon name="check" size={16} /> Hecho</button>
                <button type="button" className="link" onClick={() => later(e, 7)}>+1 semana</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card t-card">
        <strong>Sugeridos por las alertas</strong>
        <span className="caption">Bajaron, tienen promedio bajo o llevan tiempo sin entregar, y aún no están en la cola.</span>
        {queue.suggested.length === 0 && <span className="caption">Nada que sugerir por ahora.</span>}
        <ul className="b-list">
          {queue.suggested.slice(0, more ? 60 : 10).map((e) => (
            <li key={e.key} className="ws-q-row">
              <button type="button" className="ws-name" onClick={() => onOpen(e.key)}>
                <span className="avatar sm" aria-hidden="true">{initials(e.name)}</span>
                <span><strong>{e.name}</strong><span className="caption">{e.courseIds.map(courseName).join(", ")}</span></span>
              </button>
              <span className="b-text">{e.alerts[0]?.reason}</span>
              <span />
              <span className="ws-q-actions"><button type="button" className="secondary" onClick={() => onFollowUp([e], { reason: e.alerts[0]?.reason ?? "" })}><Icon name="plus" size={16} /> A la cola</button></span>
            </li>
          ))}
        </ul>
        {queue.suggested.length > 10 && !more && <button type="button" className="link" onClick={() => setMore(true)}>Ver {Math.min(50, queue.suggested.length - 10)} más</button>}
        {queue.suggested.length > (more ? 60 : 10) && more && <span className="caption">Y {queue.suggested.length - 60} más: filtra la lista por «Necesitan atención».</span>}
      </section>
    </div>
  );
}

function Swatches({ value, onChange }) {
  return (
    <span className="ws-swatches" role="radiogroup" aria-label="Color">
      {SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`Color ${c}`} className={value === c ? "ws-swatch on" : "ws-swatch"} style={{ background: c }} onClick={() => onChange(c)} />)}
    </span>
  );
}

function Groups({ ws, store, roster, courses, persist, say, onShow }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[2]);
  const [course, setCourse] = useState("");
  const [editing, setEditing] = useState(null);
  const count = (id) => roster.filter((e) => e.groups.includes(id)).length;
  const create = (ev) => {
    ev.preventDefault();
    if (!name.trim()) return;
    persist(async () => { await store.saveGroup({ name, color, course_id: course }); say(`Grupo «${name.trim()}» creado. Agrega estudiantes desde la lista (selecciónalos y elige «Agregar a grupo»).`); setName(""); });
  };
  return (
    <div className="d-two">
      <form className="card t-card assign-form" onSubmit={create}>
        <strong>Nuevo grupo</strong>
        <span className="caption">Para organizar a muchos estudiantes: grupos de refuerzo, monitores, quienes presentan el simulacro el sábado…</span>
        <label className="field"><span className="label">Nombre</span><input value={name} maxLength={60} placeholder="Ej.: Refuerzo de lectura" onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span className="label">Espacio de clase (opcional)</span>
          <Select value={course} onChange={setCourse}><option value="">Cualquier espacio</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <div className="field"><span className="label">Color</span><Swatches value={color} onChange={setColor} /></div>
        <div className="report-actions"><button type="submit" className="primary" disabled={!name.trim()}>Crear grupo</button></div>
      </form>
      <section className="card t-card">
        <strong>Grupos</strong>
        {ws.groups.length === 0 && <span className="caption">Aún no hay grupos.</span>}
        <ul className="b-list">
          {ws.groups.map((g) => (
            <li key={g.id} className="ws-g-row">
              {editing?.id === g.id ? (
                <form className="b-auto" onSubmit={(e) => { e.preventDefault(); persist(async () => { await store.saveGroup(editing); setEditing(null); }); }}>
                  <input aria-label="Nombre del grupo" value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <Swatches value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} />
                  <button type="submit" className="secondary" disabled={!editing.name.trim()}>Guardar</button>
                  <button type="button" className="link" onClick={() => setEditing(null)}>Cancelar</button>
                </form>
              ) : (
                <>
                  <span className="ws-group big" style={{ "--gc": g.color }}>{g.name}</span>
                  <span className="caption">{count(g.id)} {count(g.id) === 1 ? "estudiante" : "estudiantes"}{g.course_id ? ` · ${courses.find((c) => c.id === g.course_id)?.name ?? ""}` : ""}</span>
                  <span className="ws-q-actions">
                    <button type="button" className="secondary" onClick={() => onShow(g.id)}>Ver</button>
                    <button type="button" className="link" onClick={() => setEditing({ id: g.id, name: g.name, color: g.color, course_id: g.course_id })}>Editar</button>
                    <button type="button" className="link" onClick={async () => { if (await confirmDialog(`¿Borrar el grupo «${g.name}»? Los estudiantes no se borran.`, { confirmLabel: "Borrar grupo", danger: true })) persist(() => store.deleteGroup(g.id)); }}>Borrar</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Statuses({ ws, store, roster, persist, say, onShow }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(SWATCHES[5]);
  const count = (id) => roster.filter((e) => e.status?.id === id).length;
  return (
    <div className="d-two">
      <form className="card t-card assign-form" onSubmit={(e) => { e.preventDefault(); if (!label.trim()) return; persist(async () => { await store.saveStatus({ label, color }); setLabel(""); }); }}>
        <strong>Estados del colegio</strong>
        <span className="caption">Etiquetas que tú defines para el seguimiento de cada estudiante. Las comparten los docentes del colegio. No son notas ni puestos.</span>
        <label className="field"><span className="label">Nuevo estado</span><input value={label} maxLength={40} placeholder="Ej.: Habló con acudiente" onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="field"><span className="label">Color</span><Swatches value={color} onChange={setColor} /></div>
        <div className="report-actions">
          {ws.statuses.length === 0 && <button type="button" className="secondary" onClick={() => persist(async () => { await store.seedStatuses(); say("Estados sugeridos creados. Puedes renombrarlos o borrarlos."); })}>Usar los sugeridos</button>}
          <button type="submit" className="primary" disabled={!label.trim()}>Agregar estado</button>
        </div>
      </form>
      <section className="card t-card">
        <strong>Estados</strong>
        {ws.statuses.length === 0 && <span className="caption">Aún no hay estados. Los sugeridos: Al día, En observación, Necesita apoyo, Con plan de refuerzo, Avanza muy bien.</span>}
        <ul className="b-list">
          {ws.statuses.map((s) => (
            <li key={s.id} className="ws-g-row">
              <StatusChip status={s} />
              <span className="caption">{count(s.id)} {count(s.id) === 1 ? "estudiante" : "estudiantes"}</span>
              <span className="ws-q-actions">
                <button type="button" className="secondary" onClick={() => onShow(s.id)}>Ver</button>
                <button type="button" className="link" onClick={async () => { if (await confirmDialog(`¿Borrar el estado «${s.label}»? Se quita a los ${count(s.id)} estudiantes que lo tienen.`, { confirmLabel: "Borrar estado", danger: true })) persist(() => store.deleteStatus(s.id)); }}>Borrar</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Results over time against the student's own earlier work.
function ProgressLine({ items }) {
  const pts = items.filter((i) => i.done && i.pct != null);
  if (pts.length < 2) return <p className="caption">Con dos entregas o más se dibuja su progreso.</p>;
  const w = 320, h = 132, pad = 30, top = 18, bottom = 22;
  const x = (i) => pad + (i * (w - 2 * pad)) / (pts.length - 1);
  const y = (p) => h - bottom - (p / 100) * (h - top - bottom);
  const every = Math.max(1, Math.ceil(pts.length / 6)); // labels stay readable with many deliveries
  return (
    <svg className="progress-line" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Resultados en el tiempo: ${pts.map((p) => `${p.title} ${p.pct} %`).join(", ")}`} width="100%">
      <line x1={pad} x2={w - pad} y1={y(50)} y2={y(50)} stroke="var(--line)" strokeDasharray="4 4" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} />
      {pts.map((p, i) => <circle key={`${p.id}-${i}`} cx={x(i)} cy={y(p.pct)} r="4.5" fill="var(--accent)"><title>{`${p.title}: ${p.pct} % · ${shortDate(p.at)}`}</title></circle>)}
      {pts.map((p, i) => ((i % every === 0 || i === pts.length - 1) ? (
        <g key={`l-${p.id}-${i}`} fontSize="9.5" fill="var(--text-2)" textAnchor="middle">
          <text x={x(i)} y={y(p.pct) - 9} fill="var(--text)" fontWeight="700">{p.pct}%</text>
          <text x={x(i)} y={h - 6}>{new Date(p.at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</text>
        </g>
      ) : null))}
    </svg>
  );
}

function WeeklyBars({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.deliveries));
  return (
    <div className="d-hist ws-weeks" role="img" aria-label={`Entregas por semana: ${weeks.map((w) => `${shortDate(new Date(w.from).toISOString())}: ${w.deliveries}`).join(", ")}`}>
      {weeks.map((w) => (
        <div key={w.from} className="d-hist-col" title={`${w.deliveries} entregas · ${w.minutes} min`}>
          <span className="d-hist-n">{w.deliveries || ""}</span>
          <span className="d-hist-bar" style={{ height: `${(w.deliveries / max) * 100}%` }} />
          <span className="d-hist-x">{new Date(w.from).toLocaleDateString("es-CO", { day: "numeric", month: "numeric" })}</span>
        </div>
      ))}
    </div>
  );
}

export function StudentProfile({ api, userId, student: s, ws, store, guard, say, courses, assignments, courseName, groupById, position, onPrev, onNext, onBack, onFollowUp, onCloseFollowUp, onOpenAssignment, onReinforce }) {
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState("");
  const [fu, setFu] = useState(null);
  const [itemFilter, setItemFilter] = useState("all");
  useEffect(() => { guard(async () => setNotes(await store.notes(s.email))); }, [guard, store, s.email]);
  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea/i.test(e.target?.tagName ?? "") || e.target?.isContentEditable) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  const addNote = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    guard(async () => { await store.addNote(s.email, draft); setDraft(""); setNotes(await store.notes(s.email)); });
  };
  const items = s.items.filter((i) => itemFilter === "all" || (itemFilter === "done" ? i.done : itemFilter === "late" ? i.late : !i.done && !i.late));
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const weeks = weeklyActivity(s);
  const panels = sorted(profilePanels);

  return (
    <div className="ws-profile">
      <div className="ws-profile-nav">
        <button type="button" className="link" onClick={onBack}><Icon name="left" size={16} /> Lista</button>
        <span className="caption">{position.i + 1} de {position.n}</span>
        <span className="ws-q-actions">
          <button type="button" className="secondary" disabled={!onPrev} onClick={onPrev} aria-label="Estudiante anterior"><Icon name="left" size={16} /> Anterior</button>
          <button type="button" className="secondary" disabled={!onNext} onClick={onNext} aria-label="Estudiante siguiente">Siguiente <Icon name="right" size={16} /></button>
        </span>
      </div>

      <section className="card t-card ws-hero">
        <div className="ws-hero-top">
          <span className="avatar big" aria-hidden="true">{initials(s.name)}</span>
          <div>
            <h1>{s.name}</h1>
            <span className="caption">{s.email} · {s.joined ? "Ya ingresó" : "Aún no ingresa"}</span>
            <div className="ws-tags">{s.courseIds.map((id) => <span key={id} className="badge">{courseName(id)}</span>)}</div>
          </div>
        </div>
        <div className="ws-hero-controls">
          <label className="field"><span className="label">Estado</span>
            <Select aria-label="Estado del estudiante" placeholder="Sin estado" value={s.status?.id ?? ""} onChange={(v) => guard(async () => { await store.setFlags([s.email], { status_id: v || null }); })}>
              <option value="">Sin estado</option>
              {ws.statuses.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
            </Select></label>
          <div className="field"><span className="label">Grupos</span>
            <div className="ws-tags">
              {s.groups.map((id) => groupById.get(id)).filter(Boolean).map((g) => (
                <span key={g.id} className="ws-group" style={{ "--gc": g.color }}>{g.name}
                  <button type="button" className="ws-x" aria-label={`Quitar del grupo ${g.name}`} onClick={() => guard(() => store.removeFromGroup(g.id, [s.email]))}><Icon name="x" size={12} /></button></span>
              ))}
              {ws.groups.some((g) => !s.groups.includes(g.id)) && (
                <Select aria-label="Agregar a un grupo" placeholder="+ Grupo" value="" className="ws-mini" onChange={(v) => guard(() => store.addToGroup(v, [s.email]))}>
                  {ws.groups.filter((g) => !s.groups.includes(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              )}
              {ws.groups.length === 0 && <span className="caption">Crea grupos en la pestaña «Grupos».</span>}
            </div>
          </div>
          <div className="field ws-fu"><span className="label">Seguimiento</span>
            {s.followUp && !fu ? (
              <div className="ws-fu-on">
                <span><Icon name="flag" size={14} /> {s.followUp.due ? `Para el ${shortDate(s.followUp.due)}` : "Sin fecha"}{s.followUp.reason ? ` · ${s.followUp.reason}` : ""}</span>
                <span className="ws-q-actions">
                  <button type="button" className="secondary" onClick={() => onCloseFollowUp(s)}><Icon name="check" size={16} /> Hecho</button>
                  <button type="button" className="link" onClick={() => setFu({ reason: s.followUp.reason, due: s.followUp.due ?? addDaysIso(isoDay(), 7) })}>Editar</button>
                </span>
              </div>
            ) : fu ? (
              <form className="ws-fu-form" onSubmit={(e) => { e.preventDefault(); onFollowUp([s], fu); setFu(null); }}>
                <input aria-label="Motivo del seguimiento" maxLength={300} placeholder="Motivo (ej.: hablar sobre tareas pendientes)" value={fu.reason} onChange={(e) => setFu({ ...fu, reason: e.target.value })} />
                <DateField aria-label="Fecha del seguimiento" value={fu.due} min={isoDay()} onChange={(v) => setFu({ ...fu, due: v })} />
                <button type="submit" className="primary">Guardar</button>
                <button type="button" className="link" onClick={() => setFu(null)}>Cancelar</button>
              </form>
            ) : (
              <button type="button" className="secondary" onClick={() => setFu({ reason: s.alerts.find((a) => a.kind !== "up")?.reason ?? "", due: addDaysIso(isoDay(), 7) })}><Icon name="flag" size={16} /> Agregar a seguimiento</button>
            )}
          </div>
        </div>
      </section>

      {s.alerts.length > 0 && (
        <section className="card t-card">
          <strong>Alertas</strong>
          <ul className="b-list">
            {s.alerts.map((a) => (
              <li key={a.kind} className={`ws-alert-row sev-${a.kind === "up" ? "up" : a.severity >= 4 ? "high" : a.severity >= 3 ? "mid" : "low"}`}>
                <span className="ws-alert">{alertLabel(a.kind)}</span>
                <span className="b-body"><span>{a.reason}{a.area ? ` Más bajo: ${a.area}.` : ""}</span><span className="caption">{a.action}</span></span>
              </li>
            ))}
          </ul>
          {onReinforce && s.alerts.some((a) => a.kind === "drop" || a.kind === "low") && <div className="report-actions"><button type="button" className="secondary" onClick={onReinforce}>Preparar un plan de refuerzo</button></div>}
        </section>
      )}

      <div className="d-kpis ws-kpis">
        <Kpi label="Entregas" value={`${s.done}/${s.assigned}`} hint={s.late ? `${s.late} sin entregar` : s.pending ? `${s.pending} abiertas` : "Al día"} />
        <Kpi label={scoring.label} value={scoring.format(s.avgPct)} hint="de aciertos en lo entregado" />
        <Kpi label="Cambio" value={fmtTrend(s.trend)} hint="últimas 3 frente a las anteriores" />
        <Kpi label="Tiempo total" value={s.totalSec ? fmtDuration(s.totalSec) : "—"} />
        <Kpi label="Última entrega" value={shortDate(s.lastAt)} />
        {s.band?.global != null && <Kpi label="Banda estimada" value={`${s.band.global}/500`} hint={`${s.band.low}–${s.band.high}, curva provisional`} />}
        {s.leaves > 0 && <Kpi label="Salidas en exámenes" value={String(s.leaves)} />}
      </div>

      <div className="d-two">
        <section className="card t-card"><strong>Progreso</strong><ProgressLine items={s.items} /><span className="caption">Cada punto es una entrega, en orden. La línea punteada marca 50 %.</span></section>
        <div className="ws-side-stack">
          <section className="card t-card">
            <strong>Por área</strong>
            {s.areas.length ? <Bars rows={s.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} /> : <span className="caption">Aún sin entregas calificadas.</span>}
          </section>
          <section className="card t-card">
            <div className="section-head"><strong>Actividad por semana</strong><span className="caption">Últimas 8 semanas · {weeks.reduce((n, w) => n + w.minutes, 0)} min</span></div>
            <WeeklyBars weeks={weeks} />
          </section>
        </div>
      </div>

      <section className="card t-card">
        <div className="section-head">
          <strong>Asignaciones e historial</strong>
          <div className="segmented small" role="tablist">
            {[["all", "Todas"], ["done", "Entregadas"], ["open", "Abiertas"], ["late", "Sin entregar"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={itemFilter === id} className={itemFilter === id ? "seg active" : "seg"} onClick={() => setItemFilter(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="t-table">
            <thead><tr><th>Asignación</th><th>Espacio</th><th>Tipo</th><th>Estado</th><th>Resultado</th><th>Tiempo</th><th>Salidas</th><th>Fecha</th><th /></tr></thead>
            <tbody>
              {[...items].reverse().map((i) => (
                <tr key={`${i.id}-${i.memberId}`}>
                  <td>{i.title}</td>
                  <td>{courseName(i.courseId)}</td>
                  <td>{KIND_LABEL[i.kind] ?? "—"}{byId.get(i.id)?.assignee_id ? " · personal" : ""}</td>
                  <td>{i.done ? <span className="badge ok">Entregada{i.attempt?.mode === "paper" ? " · papel" : ""}</span> : i.late ? <span className="badge ws-late">Sin entregar</span> : <span className="badge pending">{STATE_LABEL[i.state] ?? "Abierta"}</span>}</td>
                  <td>{i.done ? scoring.format(i.pct) : "—"}</td>
                  <td>{i.sec ? fmtDuration(i.sec) : "—"}</td>
                  <td>{i.done ? i.leaves || "—" : "—"}</td>
                  <td>{i.done ? shortDate(i.at) : i.due ? `Entrega ${shortDate(i.due)}` : "—"}</td>
                  <td>{onOpenAssignment && <button type="button" className="link" onClick={() => onOpenAssignment(i.id, i.done ? i.memberId : null)}>{i.done ? "Ver respuestas" : "Abrir"}</button>}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={9} className="caption">Nada en esta pestaña.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card t-card">
        <strong>Notas del docente</strong>
        <span className="caption">Solo las ven los docentes del estudiante y la coordinación.</span>
        <form className="ws-note-form" onSubmit={addNote}>
          <textarea rows={3} aria-label="Nueva nota" maxLength={4000} placeholder="Ej.: Habló con el acudiente; acordamos entregar el simulacro el lunes." value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="report-actions"><button type="submit" className="primary" disabled={!draft.trim()}>Guardar nota</button></div>
        </form>
        {notes === null ? <span className="caption">Cargando notas…</span> : notes.length === 0 ? <span className="caption">Sin notas todavía.</span> : (
          <ul className="b-list">
            {notes.map((n) => (
              <li key={n.id} className="ws-note">
                <span className="b-body"><span>{n.body}</span><span className="caption">{n.author_name || "Docente"} · {new Date(n.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
                {(!n.author_id || n.author_id === userId) && <button type="button" className="link" aria-label="Borrar nota" onClick={async () => { if (await confirmDialog("¿Borrar esta nota?", { confirmLabel: "Borrar", danger: true })) guard(async () => { await store.deleteNote(n.id); setNotes(await store.notes(s.email)); }); }}>Borrar</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {panels.map((p) => (
        <section key={p.id} className="card t-card">
          {p.title && <strong>{p.title}</strong>}
          <p.Component student={s} api={api} courses={courses} assignments={assignments} guard={guard} />
        </section>
      ))}
    </div>
  );
}

