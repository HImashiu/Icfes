import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import { ALERT_KIND_LABEL, LIST_FILTER, groupAlerts, isGoodNews } from "../../lib/progressAlerts.js";

const ATTN_ICON = { closing: "clock", late: "flag", opens: "book", follow: "user", never: "users" };
const ATTN_TILE = { closing: "var(--flame)", late: "var(--bad)", opens: "var(--ctx)", follow: "var(--surface)", never: "var(--surface)" };
const LEVEL_ICON = { class: "users", activity: "book", student: "user" };
const FILTERS = [["all", "Todas"], ["class", "Cursos"], ["activity", "Actividades"], ["student", "Estudiantes"], ["good", "Buenas noticias"]];
const FIRST = 6;
const tileOf = (a) => (isGoodNews(a) ? "var(--ok)" : a.severity >= 4 ? "var(--bad)" : a.severity >= 3 ? "var(--flame)" : "var(--surface)");

// Hoy › Alertas y pendientes: the deadlines of today and this week (they go away by themselves) and the progress
// alerts (they stay until the teacher marks them "Listo", or postpones them, and come back if things change again).
// Every row leads to the detail: the activity, the class's list already filtered, or the student's full profile.
export default function AlertInbox({ attention, alerts, hidden, contextName, go, onOpenStudent, onOpenStudents, onConvert, onAnswer, onFollowUp, onRestore }) {
  const [filter, setFilter] = useState("all");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const [unfolded, setUnfolded] = useState(() => new Set());
  const counts = useMemo(() => ({
    all: alerts.length,
    class: alerts.filter((a) => a.level === "class" && !isGoodNews(a)).length,
    activity: alerts.filter((a) => a.level === "activity").length,
    student: alerts.filter((a) => a.level === "student" && !isGoodNews(a)).length,
    good: alerts.filter(isGoodNews).length,
  }), [alerts]);
  const list = alerts.filter((a) => filter === "all" || (filter === "good" ? isGoodNews(a) : a.level === filter && !isGoodNews(a)));
  const rows = groupAlerts(list);
  const shownRows = all ? rows : rows.slice(0, FIRST);
  const seenNow = shownRows.flatMap((r) => (r.group ? r.items : [r]));
  const fresh = alerts.filter((a) => a.fresh).length;

  // What was on screen counts as seen: next time it no longer carries the "Nueva" mark.
  const seenKey = seenNow.filter((a) => a.fresh).map((a) => a.id).join("|");
  useEffect(() => {
    if (!seenKey) return undefined;
    const t = setTimeout(() => onAnswer(seenNow.filter((a) => a.fresh), "seen"), 4000);
    return () => clearTimeout(t);
  }, [seenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (a) => {
    if (a.route?.student) return onOpenStudent(a.route.student);
    if (a.route?.filters && onOpenStudents) return onOpenStudents(a.route.filters);
    return go(a.route);
  };
  const act = async (a, fn) => { setBusy(a.id); try { await fn(); } finally { setBusy(null); } };

  const row = (a) => (
              <li key={a.id} className={a.fresh ? "ai-row fresh" : "ai-row"}>
                <span className="td-tile" style={{ background: tileOf(a), color: tileOf(a) === "var(--surface)" ? "var(--text)" : "#0D110F" }} aria-hidden="true"><Icon name={isGoodNews(a) ? "check" : LEVEL_ICON[a.level]} size={20} /></span>
                <span className="td-task-text">
                  <strong>{a.level === "student" ? <button type="button" className="link ws-inline" onClick={() => onOpenStudent(a.email)}>{a.title}</button> : a.title}{a.fresh && <span className="ai-new">Nueva</span>}</strong>
                  <span className="caption">{a.detail}</span>
                  <span className="caption ai-hint">{ALERT_KIND_LABEL[a.kind] ?? a.kind} · {a.action}</span>
                </span>
                <span className="ai-actions">
                  <button type="button" className="secondary small" onClick={() => open(a)}>{a.cta}</button>
                  {a.kind === "reteach" && onConvert && a.keys?.length > 0 && (
                    <button type="button" className="secondary small" onClick={() => onConvert({ target: "clase", slug: a.slug, keys: a.keys, title: `Repaso · ${a.title.replace(/^«|» quedó.*$/g, "")}` })}><Icon name="play" size={14} /> Repaso</button>
                  )}
                  {a.level === "student" && !isGoodNews(a) && onFollowUp && (
                    <button type="button" className="link" disabled={busy === a.id} onClick={() => act(a, async () => { await onFollowUp(a); await onAnswer([a], "done"); })}>A seguimiento</button>
                  )}
                  <button type="button" className="icon-btn ai-btn" disabled={busy === a.id} aria-label={`Listo: ${a.title}`} title="Listo (vuelve si cambia algo)" onClick={() => act(a, () => onAnswer([a], "done"))}><Icon name="check" size={16} /></button>
                  <button type="button" className="icon-btn ai-btn" disabled={busy === a.id} aria-label={`Posponer una semana: ${a.title}`} title="Posponer una semana" onClick={() => act(a, () => onAnswer([a], "snoozed", { days: 7 }))}><Icon name="clock" size={16} /></button>
                </span>
              </li>
  );

  return (
    <section className="card td-card ai" aria-label="Alertas y pendientes">
      <div className="section-head">
        <h2>Alertas y pendientes</h2>
        <span className="caption">{attention.length + alerts.length === 0 ? "Nada" : `${attention.length + alerts.length}`}{fresh ? <> · <span className="td-pill warn">{fresh} {fresh === 1 ? "nueva" : "nuevas"}</span></> : null}</span>
      </div>
      {attention.length + alerts.length === 0 && <p className="caption">Todo al día en {contextName}. Buen momento para preparar la próxima actividad.</p>}

      {attention.slice(0, 6).map((a, i) => (
        <div key={`${a.kind}-${i}`} className="td-task">
          <span className="td-tile" style={{ background: ATTN_TILE[a.kind], color: ATTN_TILE[a.kind] === "var(--surface)" ? "var(--text)" : "#0D110F" }} aria-hidden="true"><Icon name={ATTN_ICON[a.kind]} size={20} /></span>
          <span className="td-task-text"><strong>{a.title}</strong><span className="caption">{a.detail}</span></span>
          {a.tag && <span className={a.warn ? "td-pill warn" : "td-pill"}>{a.tag}</span>}
          <button type="button" className="secondary small" onClick={() => go(a.route)}>{a.action}</button>
        </div>
      ))}

      {alerts.length > 0 && (
        <>
          <div className="ai-head">
            <span className="label">Progreso</span>
            <div className="chips-row ai-filters" role="group" aria-label="Tipo de alerta">
              {FILTERS.filter(([id]) => id === "all" || counts[id] > 0).map(([id, label]) => (
                <button key={id} type="button" className={filter === id ? "chip on" : "chip"} aria-pressed={filter === id} onClick={() => { setFilter(id); setAll(false); }}>{label} · {counts[id]}</button>
              ))}
            </div>
          </div>
          <ul className="ai-list">
            {shownRows.map((r) => (r.group ? (
              <li key={r.id} className="ai-group">
                <div className={r.fresh ? "ai-row fresh" : "ai-row"}>
                  <span className="td-tile" style={{ background: tileOf(r), color: tileOf(r) === "var(--surface)" ? "var(--text)" : "#0D110F" }} aria-hidden="true"><Icon name={isGoodNews(r) ? "check" : "users"} size={20} /></span>
                  <span className="td-task-text">
                    <strong>{r.title}{r.fresh && <span className="ai-new">Nueva</span>}</strong>
                    <span className="caption">{r.detail}</span>
                    <span className="caption ai-hint">{ALERT_KIND_LABEL[r.kind] ?? r.kind} · {r.action}</span>
                  </span>
                  <span className="ai-actions">
                    {LIST_FILTER.has(r.kind) && onOpenStudents && <button type="button" className="secondary small" onClick={() => onOpenStudents({ alert: r.kind })}>Ver la lista</button>}
                    <button type="button" className="link" aria-expanded={unfolded.has(r.id)} onClick={() => setUnfolded((u) => { const n = new Set(u); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>{unfolded.has(r.id) ? "Plegar" : "Uno por uno"}</button>
                    <button type="button" className="icon-btn ai-btn" disabled={busy === r.id} aria-label={`Listo: ${r.title}`} title="Listo para todos (vuelve si cambia algo)" onClick={() => act(r, () => onAnswer(r.items, "done"))}><Icon name="check" size={16} /></button>
                    <button type="button" className="icon-btn ai-btn" disabled={busy === r.id} aria-label={`Posponer una semana: ${r.title}`} title="Posponer una semana" onClick={() => act(r, () => onAnswer(r.items, "snoozed", { days: 7 }))}><Icon name="clock" size={16} /></button>
                  </span>
                </div>
                {unfolded.has(r.id) && <ul className="ai-list ai-sub">{r.items.map(row)}</ul>}
              </li>
            ) : row(r)))}
          </ul>
          <div className="ai-foot">
            {rows.length > FIRST && <button type="button" className="link" onClick={() => setAll(!all)}>{all ? "Ver menos" : `Ver las ${rows.length} filas (${list.length} alertas)`}</button>}
            {filter === "student" && counts.student > 0 && onOpenStudents && <button type="button" className="link" onClick={() => onOpenStudents({ alert: "any", sort: "attention" })}>Abrir en Estudiantes</button>}
            {hidden > 0 && <span className="caption">{hidden} {hidden === 1 ? "resuelta o pospuesta" : "resueltas o pospuestas"}{onRestore && <> · <button type="button" className="link" onClick={onRestore}>Mostrar de nuevo</button></>}</span>}
          </div>
        </>
      )}
      {alerts.length === 0 && hidden > 0 && <p className="caption">{hidden} {hidden === 1 ? "alerta resuelta o pospuesta" : "alertas resueltas o pospuestas"}.{onRestore && <> <button type="button" className="link" onClick={onRestore}>Mostrar de nuevo</button></>}</p>}
    </section>
  );
}
