import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon.jsx";
import Mascot from "../../components/Mascot.jsx";
import { TeacherAnnouncements } from "../../components/Announcements.jsx";
import MonthCalendar from "../../components/MonthCalendar.jsx";
import { buildRoster } from "../../lib/workspace.js";
import { todayModel } from "../../lib/today.js";
import { areaColor } from "../../lib/brand.js";
import { areaShort, contextColor } from "../../lib/teaching.js";

const greeting = (now = new Date()) => (now.getHours() < 12 ? "Buenos días" : now.getHours() < 19 ? "Buenas tardes" : "Buenas noches");
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const firstName = (p) => String(p.full_name || p.email || "").split(/[\s@]/)[0];
const ATTN_ICON = { closing: "clock", late: "flag", opens: "book", follow: "user", never: "users" };
const ATTN_TILE = { closing: "var(--flame)", late: "var(--bad)", opens: "var(--ctx)", follow: "var(--surface)", never: "var(--surface)" };

// Hoy: the teacher's home. What needs attention first, then the week, each class and who needs support.
export default function Today({ api, profile, courses, readOnlyIds = [], assignments, ws, receipts, subject, contextName, go, onOpenStudent, onOpenReceipt, onReinforce }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [members, attempts] = await Promise.all([api.allMembers(), api.reportAttempts ? api.reportAttempts() : api.allAttempts()]);
        if (alive) setData({ members, attempts });
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [api]);
  const roster = useMemo(() => (data ? buildRoster({ members: data.members, assignments, attempts: data.attempts, ws: ws ?? {} }) : []), [data, assignments, ws]);
  const m = useMemo(() => (data ? todayModel({ courses, assignments, attempts: data.attempts, roster }) : null), [data, courses, assignments, roster]);
  const tint = subject ? contextColor(subject) : "var(--accent)";
  const now = new Date();

  if (error) return <p className="notice error">{error}</p>;
  if (!m) return <div className="td-loading"><Mascot pose="thinking" size={72} /><p className="caption">Preparando tu día…</p></div>;

  if (courses.length === 0) {
    return (
      <div className="td-empty card">
        <Mascot pose="normal" idle size={96} />
        <div>
          <h1>Hola, {firstName(profile)}</h1>
          <p className="caption">{profile.role === "school_admin" ? "Empieza armando las clases del colegio: grupos, materias y quién dicta cada una." : "Todavía no tienes clases. Coordinación te las asigna; también puedes crear una en Estudiantes › Listas de clase."}</p>
        </div>
        <button type="button" className="primary" onClick={() => go(profile.role === "school_admin" ? { section: "colegio", tab: "docentes" } : { section: "estudiantes", tab: "clases" })}>{profile.role === "school_admin" ? "Armar las clases" : "Crear una clase"}</button>
      </div>
    );
  }

  const fresh = [...receipts.filter((r) => !r.seen).slice(0, 2).map((r) => ({ id: r.id, title: r.title, detail: r.detail, via: "Nuevo", receipt: r })), ...m.fresh.map((f) => ({ id: f.id, title: `${f.title} · ${f.group}`, detail: `${f.count} ${f.count === 1 ? "entrega" : "entregas"}${f.avgPct != null ? ` · ${f.avgPct} %` : ""}`, via: f.via, route: { section: "actividad", id: f.id, tab: "resultados" } }))].slice(0, 4);
  const k = m.kpis;
  const delta = (d) => (d == null ? null : `${d > 0 ? "+" : ""}${d}`);

  return (
    <div className="td" style={{ "--ctx": tint }}>
      <section className="td-hero card">
        <div className="td-hello">
          <span className="caption">{cap(now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }))} · {contextName}</span>
          <h1>{greeting(now)}, {firstName(profile)}</h1>
          <p>{m.attention.length ? `${m.attention.length} ${m.attention.length === 1 ? "cosa pide" : "cosas piden"} tu atención` : "Nada urgente hoy"}{k.active ? ` · ${k.active} ${k.active === 1 ? "actividad abierta" : "actividades abiertas"}` : ""}{m.fresh.length ? ` · ${m.fresh.length} con resultados nuevos` : ""}.</p>
        </div>
        <div className="td-actions">
          <button type="button" className="primary" onClick={() => go({ section: "actividades", tab: "nueva" })}><Icon name="plus" size={18} strokeWidth={2.8} /> Nueva actividad</button>
          <button type="button" className="secondary" onClick={() => go({ section: "actividades", tab: "lista" })}><Icon name="camera" size={18} /> Escanear hojas</button>
          <button type="button" className="secondary" onClick={() => go({ section: "biblioteca", tab: "clases" })}><Icon name="play" size={18} /> Proyectar clase</button>
          <button type="button" className="secondary" onClick={() => go({ section: "actividades", tab: "vivo" })}><Icon name="bolt" size={18} /> Juego en vivo</button>
        </div>
        <Mascot pose={m.attention.length ? "normal" : "happy"} idle size={84} />
      </section>

      <div className="td-kpis">
        <button type="button" className="td-kpi card" onClick={() => go({ section: "actividades", tab: "lista" })}>
          <span className="label">Entregas de la semana</span>
          <span className="td-kpi-row"><strong>{k.delivered}/{k.expected}</strong>{k.expected > 0 && <span className="td-pill ok">{Math.round((k.delivered / k.expected) * 100)} %</span>}</span>
          <span className="caption">{k.missing ? `${k.missing} ${k.missing === 1 ? "estudiante debe" : "estudiantes deben"} algo` : "Nadie debe nada"}</span>
        </button>
        <button type="button" className="td-kpi card" onClick={() => go({ section: "resultados", tab: "resumen" })}>
          <span className="label">Promedio · últimas 4 semanas</span>
          <span className="td-kpi-row"><strong>{k.avgPct == null ? "—" : `${k.avgPct} %`}</strong>{k.avgDelta != null && <span className={k.avgDelta >= 0 ? "td-pill ok" : "td-pill warn"}>{delta(k.avgDelta)}</span>}</span>
          <span className="caption">{k.avgDelta == null ? "Clave preliminar, no oficial" : "frente a las 4 semanas anteriores"}</span>
        </button>
        <button type="button" className="td-kpi card" onClick={() => go({ section: "actividades", tab: "lista" })}>
          <span className="label">Actividades abiertas</span>
          <span className="td-kpi-row"><strong>{k.active}</strong>{k.scheduled > 0 && <span className="td-pill">{k.scheduled} programadas</span>}</span>
          <span className="caption">en {courses.length} {courses.length === 1 ? "clase" : "clases"} · {m.students} estudiantes</span>
        </button>
        <button type="button" className="td-kpi card" onClick={() => go({ section: "estudiantes", tab: "lista" })}>
          <span className="label">Necesitan apoyo</span>
          <span className="td-kpi-row"><strong>{k.followUps}</strong>{k.followUps > 0 && <span className="td-pill warn">revisar</span>}</span>
          <span className="caption">alertas fuertes o en seguimiento</span>
        </button>
      </div>

      <div className="td-grid">
        <div className="td-col">
          <section className="card td-card">
            <div className="section-head"><h2>Pide tu atención</h2><span className="caption">{m.attention.length || "Nada"}</span></div>
            {m.attention.length === 0 && <p className="caption">Todo al día en {contextName}. Buen momento para preparar la próxima actividad.</p>}
            {m.attention.slice(0, 6).map((a, i) => (
              <div key={`${a.kind}-${i}`} className="td-task">
                <span className="td-tile" style={{ background: ATTN_TILE[a.kind], color: ATTN_TILE[a.kind] === "var(--surface)" ? "var(--text)" : "#0D110F" }} aria-hidden="true"><Icon name={ATTN_ICON[a.kind]} size={20} /></span>
                <span className="td-task-text"><strong>{a.title}</strong><span className="caption">{a.detail}</span></span>
                {a.tag && <span className={a.warn ? "td-pill warn" : "td-pill"}>{a.tag}</span>}
                <button type="button" className="secondary small" onClick={() => go(a.route)}>{a.action}</button>
              </div>
            ))}
          </section>

          <section className="card td-card">
            <div className="section-head"><h2>Mis clases</h2><span className="caption">Por curso y materia · promedio de sus últimas actividades</span></div>
            <div className="td-cursos">
              {m.cursos.filter((g) => g.students || g.classes.some((c) => c.last != null || c.active)).map((g) => (
                <div key={g.name} className="td-curso">
                  <div className="td-curso-head">
                    <strong>{g.name}</strong>
                    <span className="caption">{g.students} est.{g.alerts ? <> · <span className="warn">{g.alerts} con alertas</span></> : " · al día"}</span>
                  </div>
                  {g.classes.map((c) => (
                    <button key={c.id} type="button" className={c.last == null ? "td-subj idle" : "td-subj"} style={{ "--c": c.area ? areaColor(c.area) : "var(--ctx)" }} onClick={() => go({ section: "resultados", tab: "resumen", courseId: c.id })} title={c.full}>
                      <span className="td-subj-dot" aria-hidden="true" />
                      <span className="td-subj-name">{c.subject}</span>
                      {c.last == null ? (
                        <span className="caption td-subj-none">{c.active ? `${c.active} ${c.active === 1 ? "actividad abierta" : "actividades abiertas"}` : "Sin actividades aún"}</span>
                      ) : (
                        <>
                          <span className="td-spark" aria-hidden="true">
                            {c.series.map((v, i, arr) => <span key={i} style={{ height: `${Math.max(8, v)}%`, opacity: i === arr.length - 1 ? 1 : 0.4 }} />)}
                          </span>
                          <span className="caption td-subj-del">{c.deliveredPct != null ? `${c.deliveredPct} % entregó` : ""}</span>
                          <b>{c.last} %</b>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {(() => {
              const idle = m.cursos.filter((g) => !g.students && g.classes.every((c) => c.last == null && !c.active));
              return idle.length ? <p className="caption td-idle">Sin estudiantes ni actividades aún: {idle.map((g) => `${g.name} (${g.classes.length} ${g.classes.length === 1 ? "materia" : "materias"})`).join(", ")}.</p> : null;
            })()}
          </section>

          <section className="card td-card">
            <div className="section-head"><h2>Dónde cuesta más</h2><span className="caption">{m.areas.length > 1 ? "Por área" : "Actividades con el promedio más bajo"}</span></div>
            {m.areas.length > 1 ? m.areas.map((a) => (
              <div key={a.name} className="td-bar">
                <span><span className="td-dot" style={{ background: areaColor(a.name) }} />{areaShort(a.name)}</span>
                <span className="td-track"><span style={{ width: `${a.pct}%`, background: areaColor(a.name) }} /></span>
                <strong>{a.pct} %</strong>
              </div>
            )) : null}
            {m.weakest.map((w) => (
              <button key={w.id} type="button" className="td-bar link-row" onClick={() => go({ section: "actividad", id: w.id, tab: "resultados" })}>
                <span>{w.title} <span className="caption">· {w.group}</span></span>
                <span className="td-track"><span style={{ width: `${w.pct}%`, background: w.pct < 50 ? "var(--flame)" : "var(--ctx)" }} /></span>
                <strong>{w.pct} %</strong>
              </button>
            ))}
            {m.areas.length <= 1 && m.weakest.length === 0 && <p className="caption">Aparece cuando haya al menos 3 entregas en una actividad.</p>}
          </section>
        </div>

        <div className="td-col side">
          <TeacherAnnouncements api={api} profile={profile} classes={courses.filter((c) => !readOnlyIds?.includes(c.id))} />
          <section className="card td-card">
            <MonthCalendar events={m.events.map((e) => ({ at: e.at, label: e.label, color: e.kind === "opens" ? "var(--text-2)" : e.area ? areaColor(e.area) : tint, onClick: () => go({ section: "actividad", id: e.id }) }))} emptyText="No hay entregas este mes." />
          </section>

          <section className="card td-card">
            <h2>Resultados nuevos</h2>
            {fresh.length === 0 && <p className="caption">Cuando tus estudiantes entreguen o escanees hojas, aparecen aquí con un enlace.</p>}
            {fresh.map((f) => (
              <button key={f.id} type="button" className="td-fresh" onClick={() => (f.receipt ? onOpenReceipt(f.receipt) : go(f.route))}>
                <span className="td-via">{f.via}</span>
                <span className="td-task-text"><strong>{f.title}</strong><span className="caption">{f.detail}</span></span>
                <Icon name="right" size={16} strokeWidth={3} />
              </button>
            ))}
          </section>

          <section className="card td-card">
            <div className="section-head"><h2>Necesitan apoyo</h2><span className="caption">Cada uno frente a sí mismo</span></div>
            {m.support.length === 0 && <p className="caption">Sin alertas fuertes. 🎉</p>}
            {m.support.map((s) => (
              <button key={s.key} type="button" className="td-person" onClick={() => onOpenStudent(s.email)}>
                <span className="td-avatar" aria-hidden="true">{s.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>
                <span className="td-task-text"><strong>{s.name} <span className="caption">· {s.groups}</span></strong><span className="caption">{s.reason}</span></span>
              </button>
            ))}
            {m.support.length > 0 && <button type="button" className="secondary" onClick={onReinforce}>Crear refuerzo</button>}
          </section>
        </div>
      </div>
    </div>
  );
}
