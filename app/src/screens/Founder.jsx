import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminDashboard, adminPeople, adminPerson, amAdmin, missingFunction } from "../lib/usage.js";
import { DateField, Select } from "../components/Controls.jsx";
import AdminUsage from "./AdminUsage.jsx";
import "./founder.css";

// The founder's dashboard (#admin). Only accounts in app_admins get data: every number comes from admin_dashboard(),
// admin_people() and admin_person() (migration 0039), which check app_admins on the server. Hiding this page is not
// the protection; the functions are. Until 0039 runs, the older «Uso» page (0037) is shown instead.
//
// Routes: #admin (Resumen) · #admin/adquisicion · #admin/retencion · #admin/personas · #admin/colegios ·
//         #admin/persona/<id>. The old #admin/uso opens Resumen.

const TABS = [
  ["resumen", "Resumen"],
  ["adquisicion", "Adquisición"],
  ["retencion", "Retención"],
  ["personas", "Personas"],
  ["colegios", "Colegios"],
];
const PERIODS = [["1", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["custom", "Fechas"]];
const ROLE = { student: "Estudiante", teacher: "Docente", school_admin: "Coordinación" };
const STATUS = {
  nuevo: ["Nuevo", "Se registró hace menos de 7 días"],
  activo: ["Activo", "Hizo algo en los últimos 7 días"],
  en_riesgo: ["En riesgo", "Su última actividad fue hace 8 a 21 días"],
  dormido: ["Dormido", "Más de 21 días sin actividad"],
  nunca: ["Nunca practicó", "Se registró y no ha respondido nada"],
};
const CHANNELS = ["Buscadores", "Redes sociales", "WhatsApp", "Asistentes IA", "Correo", "Otros sitios", "Campañas", "Directo", "Sin dato"];
const DEVICE = { movil: "Celular", tablet: "Tableta", computador: "Computador", "sin dato": "Sin dato" };
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ---- formatting ----
const nf = (n) => (n == null ? "—" : Number(n).toLocaleString("es-CO"));
const pct = (a, b) => (b > 0 ? Math.round((100 * (a ?? 0)) / b) : null);
const pctText = (v) => (v == null ? "—" : `${v}%`);
const bogotaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (iso, opts = { day: "numeric", month: "short" }) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", ...opts }) : "—");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const ago = (isoDay) => {
  if (!isoDay) return "nunca";
  const days = Math.round((new Date(`${bogotaToday()}T12:00:00Z`) - new Date(`${String(isoDay).slice(0, 10)}T12:00:00Z`)) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  return dayLabel(isoDay);
};
const minutesText = (m) => (m == null ? "—" : m >= 90 ? `${nf(Math.round(m / 6) / 10)} h` : `${nf(Math.round(m))} min`);
const examName = (slug) => String(slug ?? "").replace(/_/g, " ").replace(/^S11-/, "Saber 11 ").replace(/1ra/, "· 1.ª sesión").replace(/2da/, "· 2.ª sesión");

function readRoute() {
  const h = typeof window === "undefined" ? "" : window.location.hash.replace(/^#admin\/?/, "");
  const [tab, id] = h.split("/");
  if (tab === "persona" && /^[0-9a-f-]{36}$/.test(id ?? "")) return { tab: "persona", id };
  return { tab: TABS.some(([t]) => t === tab) ? tab : "resumen", id: null };
}
const go = (tab, id) => { window.location.hash = id ? `#admin/${tab}/${id}` : tab === "resumen" ? "#admin" : `#admin/${tab}`; };

export default function Founder({ onExit }) {
  const [allowed, setAllowed] = useState(null);
  const [legacy, setLegacy] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [period, setPeriod] = useState("30");
  const [range, setRange] = useState(() => ({ from: addDays(bogotaToday(), -29), to: bogotaToday() }));
  const [role, setRole] = useState("");
  const [channel, setChannel] = useState("");
  const [school, setSchool] = useState("");
  const [data, setData] = useState(null);
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [peopleStatus, setPeopleStatus] = useState("");
  const [stamp, setStamp] = useState(0);

  useEffect(() => { amAdmin().then(setAllowed, () => setAllowed(false)); }, []);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const pickPeriod = (p) => {
    setPeriod(p);
    if (p !== "custom") {
      const to = bogotaToday();
      setRange({ from: addDays(to, -(Number(p) - 1)), to });
    }
  };

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    setLoading(true);
    setError(null);
    adminDashboard({ from: range.from, to: range.to, role: role || null, channel: channel || null, school: school || null })
      .then((d) => { if (alive) setData(d); }, (e) => {
        if (!alive) return;
        if (missingFunction(e.message)) setLegacy(true);
        else setError(e.message);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [allowed, range, role, channel, school, stamp]);

  useEffect(() => {
    if (!allowed || legacy) return;
    let alive = true;
    adminPeople().then((p) => { if (alive) setPeople(p); }, () => { if (alive) setPeople([]); });
    return () => { alive = false; };
  }, [allowed, legacy, stamp]);

  const schools = useMemo(() => {
    const seen = new Map();
    for (const p of people ?? []) if (p.school_id && !seen.has(p.school_id)) seen.set(p.school_id, p.school);
    return [...seen].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [people]);

  // Filters that also apply to the people list.
  const filteredPeople = useMemo(() => (people ?? []).filter((p) => (!role || p.role === role) && (!channel || p.channel === channel)
    && (!school || (school === "none" ? !p.school_id : school === "any" ? Boolean(p.school_id) : p.school_id === school))), [people, role, channel, school]);

  const openPeople = useCallback((status) => { setPeopleStatus(status ?? ""); go("personas"); }, []);

  if (allowed === null) return <main className="frame"><p className="muted">Cargando…</p></main>;
  if (!allowed) {
    return (
      <main className="frame">
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h1>Panel de Cóndor</h1>
          <p className="caption">Esta página es solo para el equipo de Cóndor. Si eres tú, agrega tu cuenta a <code>app_admins</code> en Supabase (está al final del archivo SQL 0037).</p>
          <button type="button" className="secondary" onClick={onExit}>Volver a la app</button>
        </div>
      </main>
    );
  }
  if (legacy) return <AdminUsage onExit={onExit} />;

  const filtersOn = Boolean(role || channel || school);
  return (
    <main className="fd">
      <header className="fd-top">
        <div className="fd-title">
          <h1>Panel de Cóndor</h1>
          <span className="caption">Solo tú ves esto. {data ? `${dayLabel(data.from)} – ${dayLabel(data.to)} · comparado con los ${daysBetween(data.from, data.to)} días anteriores.` : ""}</span>
        </div>
        <div className="fd-top-actions">
          <button type="button" className="secondary" onClick={() => setStamp((s) => s + 1)} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
          <button type="button" className="secondary" onClick={onExit}>Volver a la app</button>
        </div>
      </header>

      <nav className="fd-tabs" aria-label="Secciones">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" className={route.tab === t ? "fd-tab on" : "fd-tab"} aria-current={route.tab === t ? "page" : undefined} onClick={() => go(t)}>{label}</button>
        ))}
      </nav>

      {route.tab !== "persona" && (
        <section className="fd-filters" aria-label="Filtros">
          <div className="segmented fd-period" role="radiogroup" aria-label="Periodo">
            {PERIODS.map(([p, label]) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "seg active" : "seg"} onClick={() => pickPeriod(p)}>{label}</button>
            ))}
          </div>
          {period === "custom" && (
            <div className="fd-dates">
              <DateField value={range.from} max={range.to} clearable={false} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} aria-label="Desde" />
              <span className="caption">a</span>
              <DateField value={range.to} min={range.from} max={bogotaToday()} clearable={false} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} aria-label="Hasta" />
            </div>
          )}
          <Select value={role} onChange={setRole} aria-label="Rol" options={[{ value: "", label: "Todos los roles" }, { value: "student", label: "Estudiantes" }, { value: "teacher", label: "Docentes" }, { value: "school_admin", label: "Coordinación" }]} />
          <Select value={channel} onChange={setChannel} aria-label="Canal" options={[{ value: "", label: "Todos los canales" }, ...CHANNELS.map((c) => ({ value: c, label: c }))]} />
          <Select value={school} onChange={setSchool} aria-label="Colegio" options={[{ value: "", label: "Todos los colegios" }, { value: "none", label: "Independientes" }, { value: "any", label: "Con colegio" }, ...schools.map(([id, name]) => ({ value: id, label: name }))]} />
          {filtersOn && <button type="button" className="fd-link" onClick={() => { setRole(""); setChannel(""); setSchool(""); }}>Quitar filtros</button>}
        </section>
      )}

      {error && <p className="notice error" role="alert">{error === "not_admin" ? "Tu cuenta no está en app_admins." : error}</p>}
      {!data && !error && <p className="muted">Cargando…</p>}

      {data && route.tab === "resumen" && <Overview data={data} people={filteredPeople} openPeople={openPeople} setChannel={setChannel} />}
      {data && route.tab === "adquisicion" && <Acquisition data={data} setChannel={setChannel} />}
      {data && route.tab === "retencion" && <Retention data={data} openPeople={openPeople} />}
      {route.tab === "personas" && <People people={filteredPeople} loading={people === null} status={peopleStatus} setStatus={setPeopleStatus} />}
      {data && route.tab === "colegios" && <Schools data={data} people={filteredPeople} setSchool={(id) => { setSchool(id ?? "none"); go("resumen"); }} />}
      {route.tab === "persona" && <Person id={route.id} />}
    </main>
  );
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1;

// ================================================================================================= Resumen
function Overview({ data, people, openPeople, setChannel }) {
  const cur = data.kpis?.current ?? {};
  const prev = data.kpis?.previous ?? {};
  const reach = data.reach ?? {};
  const [metric, setMetric] = useState("signups");
  const notes = useMemo(() => insights(data, people), [data, people]);
  const life = data.lifecycle ?? {};
  const f = data.funnel ?? {};

  const series = {
    visitors: ["Visitantes", (d) => d.visitors],
    signups: ["Cuentas nuevas", (d) => d.signups],
    active: ["Cuentas activas", (d) => d.active],
    wau: ["Activas en 7 días", (d) => d.wau],
    answers: ["Preguntas respondidas", (d) => d.answers],
    minutes: ["Minutos de práctica", (d) => d.minutes],
  };
  const [label, pick] = series[metric];

  return (
    <div className="fd-body">
      {notes.length > 0 && (
        <section className="card fd-card fd-insights" aria-label="Lo que dicen los números">
          <h2>Lo que dicen los números</h2>
          <ul>
            {notes.map((n, i) => (
              <li key={i} className={`fd-ins fd-ins-${n.tone}`}>
                <span className="fd-ins-dot" aria-hidden="true" />
                <div><b>{n.title}</b><span>{n.text}</span>
                  {n.action && <button type="button" className="fd-link" onClick={() => (n.action.status != null ? openPeople(n.action.status) : n.action.channel ? setChannel(n.action.channel) : go(n.action.tab))}>{n.action.label}</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="fd-kpis">
        <Kpi label="Visitantes" value={cur.visitors} prev={prev.visitors} sub={`${nf(cur.new_visitors)} nuevos`} />
        <Kpi label="Cuentas nuevas" value={cur.signups} prev={prev.signups} sub={`${nf(cur.signups_students)} estudiantes · ${nf(cur.signups_teachers)} docentes`} />
        <Kpi label="Activaron" value={cur.activated} prev={prev.activated} sub={`${pctText(pct(cur.activated, cur.signups))} de las nuevas (5+ preguntas en su 1.ª semana)`} />
        <Kpi label="Volvieron otro día" value={cur.returned} prev={prev.returned} sub={`${pctText(pct(cur.returned, cur.signups))} de las nuevas`} />
        <Kpi label="Cuentas activas" value={cur.active} prev={prev.active} sub={`${nf(cur.practicing)} practicaron`} />
        <Kpi label="Preguntas" value={cur.answers} prev={prev.answers} sub={cur.practicing ? `${nf(Math.round(cur.answers / cur.practicing))} por persona` : "—"} />
        <Kpi label="Tiempo practicando" value={cur.minutes} prev={prev.minutes} format={minutesText} sub="estimado entre respuestas" />
        <Kpi label="Aciertos" value={cur.accuracy} prev={prev.accuracy} format={pctText} points sub={`${nf(cur.attempts)} simulacros entregados`} />
      </section>

      <section className="card fd-card">
        <div className="fd-card-head">
          <h2>{label} por día</h2>
          <Select value={metric} onChange={setMetric} aria-label="Métrica" options={Object.entries(series).map(([value, [l]]) => ({ value, label: l }))} />
        </div>
        <BarTrend rows={data.daily ?? []} value={pick} label={label} />
      </section>

      <section className="card fd-card">
        <h2>Alcance</h2>
        <div className="fd-reach">
          <Stat label="Activas hoy (DAU)" value={reach.dau} />
          <Stat label="Activas en 7 días (WAU)" value={reach.wau} />
          <Stat label="Activas en 30 días (MAU)" value={reach.mau} />
          <Stat label="Hábito (DAU/MAU)" value={reach.mau ? `${Math.round((100 * reach.dau) / reach.mau)}%` : "—"} raw />
        </div>
        <span className="caption">{nf(reach.accounts)} cuentas en total ({nf(reach.students)} estudiantes, {nf(reach.teachers)} docentes) · {nf(reach.visitors_all)} navegadores · {nf(reach.answers_all)} preguntas respondidas desde el inicio. Cuentan como activas: practicar, abrir la app, entregar, jugar en vivo o crear actividades.</span>
        <h2 className="fd-sub">Dónde está cada cuenta hoy</h2>
        <ul className="fd-life">
          {Object.entries(STATUS).map(([k, [name, help]]) => (
            <li key={k}>
              <button type="button" onClick={() => openPeople(k)} title={help}>
                <span className={`fd-pill fd-st-${k}`}>{name}</span>
                <b>{nf(life[k])}</b>
              </button>
            </li>
          ))}
        </ul>
        <span className="caption">Toca un grupo para ver quiénes son. En riesgo = 8 a 21 días sin actividad; dormido = más de 21.</span>
      </section>

      <section className="card fd-card">
        <h2>De la primera visita a volver otro día</h2>
        <span className="caption">Navegadores que llegaron por primera vez en el periodo. El paso en rojo es el que más gente pierde.</span>
        <Funnel steps={[
          ["Llegaron a la página", f.visitors],
          ["Abrieron la app", f.opened_app, 0],
          ["Entraron con Google", f.signed_in, 1],
          ["Respondieron 1 pregunta", f.answered, 2],
          ["Respondieron 5 o más", f.answered5, 3],
          ["Practicaron y volvieron otro día", f.came_back, 3],
        ]} />
        <span className="caption">{nf(f.sample)} de esos visitantes respondieron la pregunta de muestra de la página. Cada % se calcula sobre el paso que lo alimenta.</span>
      </section>
    </div>
  );
}

function Kpi({ label, value, prev, sub, format = nf, points = false }) {
  const delta = value == null || prev == null ? null : points ? value - prev : prev > 0 ? Math.round((100 * (value - prev)) / prev) : value > 0 ? null : 0;
  const isNew = !points && prev != null && prev === 0 && (value ?? 0) > 0;
  return (
    <div className="card fd-kpi">
      <span className="caption">{label}</span>
      <b>{format(value)}</b>
      <span className="fd-kpi-foot">
        {isNew ? <span className="fd-delta up">nuevo</span>
          : delta != null && <span className={`fd-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`} title={`Antes: ${format(prev)}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}{points ? " pts" : "%"}</span>}
        <span className="caption">{sub}</span>
      </span>
    </div>
  );
}

function Stat({ label, value, raw }) {
  return <div className="fd-stat"><b>{raw ? value : nf(value)}</b><span className="caption">{label}</span></div>;
}

// steps: [label, n, baseIndex]. The % of each step is over its base step (the previous one unless given).
function Funnel({ steps }) {
  const top = Math.max(1, ...steps.map(([, n]) => n ?? 0));
  const baseOf = (i) => (i === 0 ? null : steps[steps[i][2] ?? i - 1][1] ?? 0);
  let worst = -1;
  let worstDrop = 0;
  steps.forEach(([, n], i) => {
    const before = baseOf(i);
    if (!before || before < 3) return;
    const drop = 1 - (n ?? 0) / before;
    if (drop > worstDrop) { worstDrop = drop; worst = i; }
  });
  return (
    <ol className="fd-funnel">
      {steps.map(([label, n], i) => {
        const before = baseOf(i);
        return (
          <li key={label} className={i === worst ? "worst" : undefined}>
            <span className="fd-f-label">{label}</span>
            <span className="fd-f-bar"><span style={{ width: `${Math.max(1.5, (100 * (n ?? 0)) / top)}%` }} /></span>
            <b>{nf(n)}</b>
            <span className="fd-f-pct">{before ? `${pct(n, before)}%` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Daily bars with a hover/tap tooltip. One series: the title names it.
function BarTrend({ rows, value, label }) {
  const [hover, setHover] = useState(null);
  const vals = rows.map((r) => Number(value(r) ?? 0));
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, b) => a + b, 0);
  const W = 640;
  const H = 150;
  const gap = rows.length > 60 ? 1 : 2;
  const bw = rows.length ? (W - gap * (rows.length - 1)) / rows.length : W;
  const ticks = niceTicks(max);
  const h = hover == null ? null : rows[hover];
  return (
    <div className="fd-trend">
      <div className="fd-trend-sum caption">{nf(total)} en total · máximo {nf(max)} en un día</div>
      <div className="fd-trend-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} por día`} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((t) => <line key={t} x1="0" x2={W} y1={H - H * t} y2={H - H * t} className="fd-grid" />)}
          {rows.map((r, i) => {
            const v = vals[i];
            const bh = v > 0 ? Math.max(2, (H * v) / ticks[ticks.length - 1]) : 0;
            const x = i * (bw + gap);
            return (
              <g key={r.day} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                <rect x={x} y="0" width={bw + gap} height={H} fill="transparent" />
                {bh > 0 && <rect x={x} y={H - bh} width={bw} height={bh} rx={Math.min(3, bw / 2)} className={hover === i ? "fd-bar on" : "fd-bar"} />}
              </g>
            );
          })}
        </svg>
        <div className="fd-yaxis caption" aria-hidden="true"><span>{nf(ticks[ticks.length - 1])}</span><span>{nf(ticks[ticks.length - 1] / 2)}</span><span>0</span></div>
        {h && (
          <div className="fd-tip" style={{ left: `${Math.min(82, Math.max(0, (100 * hover) / rows.length))}%` }}>
            <b>{dayLabel(h.day, { weekday: "short", day: "numeric", month: "short" })}</b>
            <span>{label}: <b>{nf(value(h))}</b></span>
            <span className="caption">{nf(h.visitors)} visitantes · {nf(h.signups)} cuentas · {nf(h.active)} activas · {nf(h.answers)} preguntas</span>
          </div>
        )}
      </div>
      {rows.length > 1 && <div className="fd-xaxis caption"><span>{dayLabel(rows[0].day)}</span><span>{dayLabel(rows[rows.length - 1].day)}</span></div>}
    </div>
  );
}

// A round top for the axis whose half is a whole number too (2, 4, 10, 20, 40, 50, 100…).
function niceTicks(max) {
  const step = 10 ** Math.floor(Math.log10(Math.max(1, max)));
  const top = [1, 2, 4, 5, 10].map((m) => m * step).find((t) => t >= max && Number.isInteger(t / 2)) ?? step * 10;
  return [top / 2, top];
}

// ================================================================================================= Adquisición
function Acquisition({ data, setChannel }) {
  const channels = data.channels ?? [];
  const maxV = Math.max(1, ...channels.map((c) => c.visitors));
  const leads = data.leads ?? {};
  return (
    <div className="fd-body">
      <section className="card fd-card">
        <h2>Canales</h2>
        <span className="caption">Visitantes que llegaron por primera vez y cuentas creadas en el periodo, según de dónde vino su primera visita. Toca un canal para filtrar todo el panel.</span>
        <table className="fd-table">
          <thead><tr><th>Canal</th><th>Visitantes</th><th className="fd-opt">Abrieron app</th><th>Cuentas</th><th>Conversión</th><th className="fd-opt">Practicaron</th><th className="fd-opt">Volvieron</th><th className="fd-opt">Antes</th></tr></thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.channel}>
                <td><button type="button" className="fd-link" onClick={() => setChannel(c.channel)}>{c.channel}</button>
                  <span className="fd-inline-bar" aria-hidden="true"><span style={{ width: `${(100 * c.visitors) / maxV}%` }} /></span></td>
                <td>{nf(c.visitors)}</td>
                <td className="fd-opt">{nf(c.opened_app)}</td>
                <td>{nf(c.signups)}</td>
                <td>{pctText(pct(c.signups, c.visitors))}</td>
                <td className="fd-opt">{nf(c.practiced)}</td>
                <td className="fd-opt">{nf(c.returned)}</td>
                <td className="fd-opt caption">{nf(c.prev_visitors)} / {nf(c.prev_signups)}</td>
              </tr>
            ))}
            {channels.length === 0 && <tr><td colSpan={8} className="caption">Sin visitas en el periodo.</td></tr>}
          </tbody>
        </table>
        <span className="caption">«Antes» = visitantes / cuentas del periodo anterior. Conversión = cuentas ÷ visitantes del canal.</span>
      </section>

      <div className="fd-two">
        <section className="card fd-card">
          <h2>Fuentes exactas</h2>
          <span className="caption">El sitio que los envió o la etiqueta ?fuente= del enlace.</span>
          <SimpleTable rows={data.sources ?? []} cols={[["source", "Fuente"], ["visitors", "Visitantes"], ["accounts", "Cuentas"], ["practiced", "Practicaron"]]} empty="Sin visitas." />
        </section>
        <section className="card fd-card">
          <h2>Páginas de entrada</h2>
          <span className="caption">La primera página que vio cada visitante nuevo.</span>
          <SimpleTable rows={(data.landing ?? []).map((r) => ({ ...r, conv: pctText(pct(r.accounts, r.visitors)) }))} cols={[["path", "Página"], ["visitors", "Visitantes"], ["opened_app", "App"], ["accounts", "Cuentas"], ["conv", "Conv."]]} empty="Sin visitas." mono />
        </section>
      </div>

      <div className="fd-two">
        <section className="card fd-card">
          <h2>Páginas más vistas</h2>
          <span className="caption">Visitantes distintos que abrieron cada página en el periodo (desde que corre el SQL 0039).</span>
          <SimpleTable rows={data.pages ?? []} cols={[["path", "Página"], ["visitors", "Visitantes"], ["visitor_days", "Días-visita"]]} empty="Aún no hay datos por página." mono />
        </section>
        <section className="card fd-card">
          <h2>Dispositivo</h2>
          <SimpleTable rows={(data.devices ?? []).map((d) => ({ ...d, device: DEVICE[d.device] ?? d.device }))} cols={[["device", "Dispositivo"], ["visitors", "Visitantes"], ["accounts", "Cuentas"]]} empty="Sin datos." />
          <h2 className="fd-sub">Contactos desde la página</h2>
          <div className="fd-reach">
            <Stat label="Colegios (formulario)" value={leads.schools} />
            <Stat label="Lista de espera" value={leads.waitlist} />
            <Stat label="Comentarios" value={leads.feedback} />
          </div>
          {(leads.recent ?? []).length > 0 && (
            <ul className="fd-leads">
              {leads.recent.map((l, i) => (
                <li key={i}><span className={`fd-pill ${l.kind === "colegio" ? "fd-st-activo" : ""}`}>{l.kind === "colegio" ? "Colegio" : "Lista"}</span>
                  <span className="fd-lead-text"><b>{l.contact}</b>{l.text ? ` · ${l.text}` : ""}</span><span className="caption">{dateTime(l.at)}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SimpleTable({ rows, cols, empty, mono }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <>
      <table className="fd-table">
        <thead><tr>{cols.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>{cols.map(([k], j) => <td key={k} className={j === 0 && mono ? "fd-mono" : undefined}>{typeof r[k] === "number" ? nf(r[k]) : r[k] ?? "—"}</td>)}</tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="caption">{empty}</td></tr>}
        </tbody>
      </table>
      {rows.length > 12 && <button type="button" className="fd-link" onClick={() => setAll((a) => !a)}>{all ? "Ver menos" : `Ver las ${rows.length}`}</button>}
    </>
  );
}

// ================================================================================================= Retención
function Retention({ data, openPeople }) {
  const cohorts = data.cohorts ?? [];
  const cur = data.kpis?.current ?? {};
  return (
    <div className="fd-body">
      <section className="fd-kpis three">
        <Kpi label="Activaron (5+ preguntas en 7 días)" value={pct(cur.activated, cur.signups)} prev={pct(data.kpis?.previous?.activated, data.kpis?.previous?.signups)} format={pctText} points sub={`${nf(cur.activated)} de ${nf(cur.signups)} cuentas nuevas`} />
        <Kpi label="Volvieron otro día" value={pct(cur.returned, cur.signups)} prev={pct(data.kpis?.previous?.returned, data.kpis?.previous?.signups)} format={pctText} points sub={`${nf(cur.returned)} de ${nf(cur.signups)}`} />
        <Kpi label="Visitantes que regresan" value={pct(cur.returning_visitors, cur.visitors)} prev={pct(data.kpis?.previous?.returning_visitors, data.kpis?.previous?.visitors)} format={pctText} points sub={`${nf(cur.returning_visitors)} de ${nf(cur.visitors)} navegadores`} />
      </section>

      <section className="card fd-card">
        <h2>Cohortes por semana de registro</h2>
        <span className="caption">Cada fila: las cuentas creadas esa semana. Cada columna: qué parte hizo algo (practicar, abrir la app, crear una actividad) en su semana 0, 1, 2…</span>
        <div className="fd-cohort-wrap">
          <table className="fd-cohort">
            <thead><tr><th>Semana</th><th>Cuentas</th>{Array.from({ length: 12 }, (_, i) => <th key={i}>S{i}</th>)}</tr></thead>
            <tbody>
              {[...cohorts].reverse().filter((c, i, all) => c.size > 0 || all.slice(i).some((x) => x.size > 0)).map((c) => (
                <tr key={c.week}>
                  <td>{dayLabel(c.week)}</td>
                  <td>{nf(c.size)}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const n = c.active?.[i];
                    if (n == null) return <td key={i} className="fd-c-none" />;
                    const p = c.size ? Math.round((100 * n) / c.size) : null;
                    return <td key={i} className={p >= 55 ? "fd-c strong" : "fd-c"} style={{ "--a": p == null ? 0 : Math.max(0.06, p / 100) }} title={`${nf(n)} de ${nf(c.size)}`}>{p == null ? "" : `${p}%`}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="fd-two">
        <section className="card fd-card">
          <h2>Cuándo practican</h2>
          <span className="caption">Preguntas respondidas por día de la semana y hora (Bogotá). Útil para publicar justo antes.</span>
          <HourHeat cells={data.hours ?? []} />
        </section>
        <section className="card fd-card">
          <h2>Qué practican</h2>
          <SimpleTable rows={data.areas ?? []} cols={[["area", "Área"], ["answers", "Preguntas"], ["people", "Personas"], ["accuracy", "Aciertos %"]]} empty="Sin respuestas." />
          <h2 className="fd-sub">Cómo practican</h2>
          <SimpleTable rows={data.modes ?? []} cols={[["mode", "Modo"], ["answers", "Preguntas"], ["people", "Personas"]]} empty="Sin respuestas." />
        </section>
      </div>

      <section className="card fd-card">
        <h2>Cuadernillos más usados</h2>
        <SimpleTable rows={(data.exams ?? []).map((e) => ({ ...e, exam: examName(e.exam) }))} cols={[["exam", "Cuadernillo"], ["answers", "Preguntas"], ["people", "Personas"]]} empty="Sin respuestas." />
        <button type="button" className="fd-link" onClick={() => openPeople("en_riesgo")}>Ver cuentas en riesgo de irse</button>
      </section>
    </div>
  );
}

function HourHeat({ cells }) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cells) if (c.dow >= 1 && c.dow <= 7) grid[c.dow - 1][c.hour] = c.answers;
  const max = Math.max(1, ...grid.flat());
  const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0));
  const peak = byHour.indexOf(Math.max(...byHour));
  return (
    <div className="fd-heat" role="img" aria-label={`Hora con más práctica: ${peak}:00`}>
      {grid.map((row, d) => (
        <div key={d} className="fd-heat-row">
          <span className="caption">{DOW[d]}</span>
          {row.map((n, h) => <span key={h} className="fd-heat-cell" style={{ "--a": n ? Math.max(0.12, n / max) : 0 }} title={`${DOW[d]} ${h}:00 · ${nf(n)} preguntas`} />)}
        </div>
      ))}
      <div className="fd-heat-row fd-heat-axis caption"><span />{[0, 6, 12, 18, 23].map((h) => <span key={h} style={{ gridColumn: h + 2 }}>{h}h</span>)}</div>
      {cells.length > 0 && <span className="caption">Más práctica cerca de las {peak}:00.</span>}
    </div>
  );
}

// ================================================================================================= Personas
const SORTS = [
  ["last", "Última actividad"], ["answers", "Más preguntas"], ["answers_7", "Más activas esta semana"], ["accuracy", "Mejor acierto"],
  ["streak", "Racha"], ["minutes", "Más tiempo"], ["created", "Registro más reciente"], ["reach", "Docentes con más estudiantes"],
];
function People({ people, loading, status, setStatus }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("last");
  const [limit, setLimit] = useState(100);
  const counts = useMemo(() => {
    const c = {};
    for (const p of people) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [people]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people.filter((p) => (!status || p.status === status)
      && (!q || `${p.name} ${p.email} ${p.school ?? ""} ${p.source ?? ""} ${p.channel}`.toLowerCase().includes(q)));
    const key = {
      last: (p) => p.last_day ?? "", answers: (p) => p.answers, answers_7: (p) => p.answers_7, accuracy: (p) => p.accuracy ?? -1,
      streak: (p) => p.streak, minutes: (p) => p.minutes, created: (p) => p.created_at, reach: (p) => p.reach ?? -1,
    }[sort];
    return [...list].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }, [people, query, status, sort]);

  const csv = () => {
    const head = ["name", "email", "role", "school", "status", "created_at", "last_day", "active_days", "answers", "answers_7", "accuracy", "minutes", "streak", "attempts", "channel", "source", "first_path", "device", "reach"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const text = [head.join(","), ...rows.map((u) => head.map((h) => esc(u[h])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `condor-personas-${bogotaToday()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="fd-body">
      <section className="card fd-card">
        <div className="fd-card-head">
          <h2>Personas ({nf(rows.length)})</h2>
          <button type="button" className="secondary" onClick={csv} disabled={!rows.length}>Descargar CSV</button>
        </div>
        <div className="fd-chips" role="group" aria-label="Estado">
          <button type="button" className={!status ? "fd-chip on" : "fd-chip"} onClick={() => setStatus("")}>Todas <b>{nf(people.length)}</b></button>
          {Object.entries(STATUS).map(([k, [name, help]]) => (
            <button key={k} type="button" title={help} className={status === k ? "fd-chip on" : "fd-chip"} onClick={() => setStatus(status === k ? "" : k)}>{name} <b>{nf(counts[k] ?? 0)}</b></button>
          ))}
        </div>
        <div className="fd-people-tools">
          <label className="field fd-search"><span className="label">Buscar</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, correo, colegio o fuente" /></label>
          <label className="field"><span className="label">Ordenar</span><Select value={sort} onChange={setSort} options={SORTS.map(([value, label]) => ({ value, label }))} /></label>
        </div>
        {loading && <p className="muted">Cargando…</p>}
        <ul className="fd-people">
          {rows.slice(0, limit).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go("persona", p.id)}>
                <span className="fd-p-who">
                  <strong>{p.name || p.email}</strong>
                  <span className="caption">{p.email} · {ROLE[p.role] ?? p.role}{p.school ? ` · ${p.school}` : ""}</span>
                  <span className="caption">Llegó por {p.channel}{p.source ? ` (${p.source})` : ""} · {dayLabel(p.created_at)}</span>
                </span>
                <span className="fd-p-nums">
                  <span><b>{nf(p.answers)}</b> preguntas{p.accuracy == null ? "" : ` · ${p.accuracy}%`}</span>
                  <span className="caption">{nf(p.answers_7)} esta semana · {minutesText(p.minutes)}{p.streak > 1 ? ` · racha ${p.streak} d` : ""}</span>
                  {p.role !== "student" && <span className="caption">{nf(p.reach)} estudiantes · {nf(p.teacher_actions)} acciones</span>}
                </span>
                <span className="fd-p-when">
                  <span className={`fd-pill fd-st-${p.status}`}>{STATUS[p.status]?.[0] ?? p.status}</span>
                  <span className="caption">Activo {ago(p.last_day)}</span>
                </span>
              </button>
            </li>
          ))}
          {!loading && rows.length === 0 && <li className="caption fd-empty">Nadie coincide.</li>}
        </ul>
        {rows.length > limit && <button type="button" className="secondary" onClick={() => setLimit((l) => l + 200)}>Ver más ({nf(rows.length - limit)} restantes)</button>}
      </section>
    </div>
  );
}

// ================================================================================================= Colegios
function Schools({ data, people, setSchool }) {
  const rows = data.schools ?? [];
  // Teachers ranked by students they reach: the people who can bring a whole school.
  const teachers = people.filter((p) => p.role !== "student").sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0) || (b.teacher_actions ?? 0) - (a.teacher_actions ?? 0)).slice(0, 15);
  return (
    <div className="fd-body">
      <section className="card fd-card">
        <h2>Colegios</h2>
        <span className="caption">Cuentas por colegio, actividad de esta semana y lo que hicieron en el periodo. Toca uno para filtrar el panel.</span>
        <table className="fd-table">
          <thead><tr><th>Colegio</th><th>Cuentas</th><th className="fd-opt">Estudiantes</th><th className="fd-opt">Docentes</th><th>Nuevas</th><th>Activas 7 d</th><th>Preguntas</th><th className="fd-opt">Acciones docentes</th><th className="fd-opt">Desde</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.school_id ?? "none"}>
                <td><button type="button" className="fd-link" onClick={() => setSchool(s.school_id)}>{s.school}</button></td>
                <td>{nf(s.accounts)}</td><td className="fd-opt">{nf(s.students)}</td><td className="fd-opt">{nf(s.staff)}</td>
                <td>{nf(s.new_accounts)}</td><td>{nf(s.active_7d)}</td><td>{nf(s.answers)}</td>
                <td className="fd-opt">{nf(s.teacher_actions)}</td><td className="fd-opt caption">{dayLabel(s.since)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="caption">Sin cuentas.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card fd-card">
        <h2>Docentes</h2>
        <span className="caption">Ordenados por estudiantes en sus cursos. Un docente activo es la puerta a todo su colegio.</span>
        <ul className="fd-people">
          {teachers.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go("persona", p.id)}>
                <span className="fd-p-who"><strong>{p.name || p.email}</strong><span className="caption">{p.email}{p.school ? ` · ${p.school}` : " · sin colegio"}</span></span>
                <span className="fd-p-nums"><span><b>{nf(p.reach)}</b> estudiantes</span><span className="caption">{nf(p.teacher_actions)} actividades o juegos · {nf(p.classes)} cursos</span></span>
                <span className="fd-p-when"><span className={`fd-pill fd-st-${p.status}`}>{STATUS[p.status]?.[0]}</span><span className="caption">Activo {ago(p.last_day)}</span></span>
              </button>
            </li>
          ))}
          {teachers.length === 0 && <li className="caption fd-empty">Todavía no hay docentes.</li>}
        </ul>
      </section>
    </div>
  );
}

// ================================================================================================= Ficha de una persona
function Person({ id }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let alive = true;
    setD(null);
    setError(null);
    adminPerson(id).then((x) => { if (alive) setD(x); }, (e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const back = () => { if (window.history.length > 1) window.history.back(); else go("personas"); };
  if (error) return <div className="fd-body"><p className="notice error" role="alert">{error === "not_found" ? "Esa cuenta ya no existe." : error}</p><button type="button" className="secondary" onClick={back}>Volver</button></div>;
  if (!d) return <div className="fd-body"><p className="muted">Cargando…</p></div>;

  const p = d.profile ?? {};
  const days = d.days ?? [];
  const tot = days.reduce((a, x) => ({
    answers: a.answers + x.answers, correct: a.correct + x.correct, graded: a.graded + x.graded, minutes: a.minutes + Number(x.minutes ?? 0),
    attempts: a.attempts + x.attempts, live: a.live + x.live, teacher: a.teacher + x.teacher,
  }), { answers: 0, correct: 0, graded: 0, minutes: 0, attempts: 0, live: 0, teacher: 0 });
  const answerDays = new Set(days.filter((x) => x.answers > 0).map((x) => x.day));
  let streak = 0;
  for (let day = answerDays.has(bogotaToday()) ? bogotaToday() : addDays(bogotaToday(), -1); answerDays.has(day); day = addDays(day, -1)) streak += 1;
  const last = days.length ? days[days.length - 1].day : null;
  const answers = showAll ? d.answers ?? [] : (d.answers ?? []).slice(0, 25);

  return (
    <div className="fd-body">
      <button type="button" className="fd-link fd-back" onClick={back}>← Volver</button>
      <section className="card fd-card fd-person-head">
        <div>
          <h2>{p.name || p.email}</h2>
          <span className="caption">{p.email} · {ROLE[p.role] ?? p.role} · {p.school ?? "sin colegio"}</span>
          <span className="caption">Cuenta creada {dateTime(p.created_at)} · última actividad {ago(last)}</span>
        </div>
        <dl className="fd-facts">
          <div><dt>Llegó por</dt><dd>{p.channel}{p.source ? ` · ${p.source}` : ""}</dd></div>
          <div><dt>Primera página</dt><dd className="fd-mono">{p.first_path ?? "—"}</dd></div>
          <div><dt>Primera visita</dt><dd>{dateTime(p.first_seen)}</dd></div>
          <div><dt>Dispositivo</dt><dd>{DEVICE[p.device] ?? "Sin dato"}</dd></div>
          <div><dt>Pregunta de muestra</dt><dd>{p.answered_sample ? "La respondió" : "No"}</dd></div>
          <div><dt>Código de prueba</dt><dd>{d.trial ? `${d.trial.code} (${dayLabel(d.trial.redeemed_at)})` : "—"}</dd></div>
        </dl>
      </section>

      <section className="fd-kpis">
        <Kpi label="Preguntas (180 días)" value={tot.answers} sub={`${nf(answerDays.size)} días practicando`} />
        <Kpi label="Aciertos" value={pct(tot.correct, tot.graded)} format={pctText} sub={`${nf(tot.graded)} calificadas`} />
        <Kpi label="Tiempo estimado" value={tot.minutes} format={minutesText} sub={`racha actual ${streak} d`} />
        <Kpi label={p.role === "student" ? "Simulacros entregados" : "Actividades y juegos"} value={p.role === "student" ? tot.attempts : tot.teacher} sub={`${nf(tot.live)} juegos en vivo jugados`} />
      </section>

      <section className="card fd-card">
        <h2>Actividad (últimos 6 meses)</h2>
        <Calendar days={days} />
      </section>

      <div className="fd-two">
        <section className="card fd-card">
          <h2>Por área</h2>
          <span className="caption">Aciertos de siempre, y de los últimos 30 días contra antes.</span>
          <table className="fd-table">
            <thead><tr><th>Área</th><th>Preguntas</th><th>Aciertos</th><th>30 d</th><th className="fd-opt">Antes</th></tr></thead>
            <tbody>
              {(d.areas ?? []).map((a) => {
                const diff = a.accuracy_30 != null && a.accuracy_before != null ? a.accuracy_30 - a.accuracy_before : null;
                return (
                  <tr key={a.area}>
                    <td>{a.area}</td><td>{nf(a.answers)}</td><td>{pctText(a.accuracy)}</td>
                    <td>{pctText(a.accuracy_30)}{diff != null && diff !== 0 && <span className={`fd-delta ${diff > 0 ? "up" : "down"}`}> {diff > 0 ? "▲" : "▼"}{Math.abs(diff)}</span>}</td>
                    <td className="fd-opt">{pctText(a.accuracy_before)}</td>
                  </tr>
                );
              })}
              {(d.areas ?? []).length === 0 && <tr><td colSpan={5} className="caption">No ha respondido preguntas.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card fd-card">
          <h2>Aciertos por semana</h2>
          <WeekLine weeks={d.weeks ?? []} />
        </section>
      </div>

      <section className="card fd-card">
        <h2>Simulacros y prácticas entregadas</h2>
        <table className="fd-table fd-left">
          <thead><tr><th>Fecha</th><th>Cuadernillo</th><th className="fd-opt">Modo</th><th>Resultado</th><th className="fd-opt">Duración</th></tr></thead>
          <tbody>
            {(d.attempts ?? []).map((t, i) => (
              <tr key={i}>
                <td>{dateTime(t.submitted_at ?? t.started_at)}</td>
                <td>{t.assignment ? <><b>{t.assignment}</b><br /><span className="caption">{examName(t.exam_slug)}</span></> : examName(t.exam_slug)}{t.scope && t.scope !== "all" ? <span className="caption"> · {t.scope}</span> : null}</td>
                <td className="fd-opt">{t.mode === "timed" ? "Con tiempo" : "Práctica"}{t.verified ? " ✓" : ""}</td>
                <td>{t.score ? `${nf(t.score.correct)}/${nf(t.score.total ?? t.score.answered)}` : t.submitted_at ? "—" : "Sin entregar"}</td>
                <td className="fd-opt">{t.duration_sec ? minutesText(t.duration_sec / 60) : "—"}</td>
              </tr>
            ))}
            {(d.attempts ?? []).length === 0 && <tr><td colSpan={5} className="caption">Ninguno guardado en su cuenta.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card fd-card">
        <div className="fd-card-head">
          <h2>Últimas respuestas</h2>
          {(d.answers ?? []).length > 25 && <button type="button" className="fd-link" onClick={() => setShowAll((s) => !s)}>{showAll ? "Ver menos" : `Ver las ${d.answers.length}`}</button>}
        </div>
        <table className="fd-table fd-left">
          <thead><tr><th>Cuándo</th><th>Pregunta</th><th className="fd-opt">Área</th><th>Respuesta</th></tr></thead>
          <tbody>
            {answers.map((a, i) => (
              <tr key={i}>
                <td>{dateTime(a.answered_at)}</td>
                <td>{examName(a.exam_slug)} · {a.qkey}{a.assigned ? <span className="caption"> · actividad</span> : null}</td>
                <td className="fd-opt">{a.area ?? "—"}</td>
                <td><span className={`fd-ans ${a.correct === true ? "ok" : a.correct === false ? "bad" : ""}`}>{a.answer ?? "—"} {a.correct === true ? "✓" : a.correct === false ? "✗" : ""}</span></td>
              </tr>
            ))}
            {answers.length === 0 && <tr><td colSpan={4} className="caption">Sin respuestas registradas.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="fd-two">
        <section className="card fd-card">
          <h2>Cursos</h2>
          <SimpleTable rows={(d.classes ?? []).map((c) => ({ ...c, name: [c.name, c.subject].filter(Boolean).join(" · "), role: c.role === "teacher" ? "Docente" : "Estudiante" }))}
            cols={[["name", "Curso"], ["role", "Rol"], ["teacher", "Creado por"], ["students", "Estudiantes"]]} empty="No está en ningún curso." />
        </section>
        <section className="card fd-card">
          <h2>Visitas a la página</h2>
          <ul className="fd-visits">
            {(d.pages ?? []).slice(0, 15).map((v) => (
              <li key={v.day}><b>{dayLabel(v.day)}</b><span className="caption">{nf(v.views)} vistas</span><span className="fd-mono caption">{(v.paths ?? []).filter(Boolean).slice(0, 6).join("  ")}</span></li>
            ))}
            {(d.pages ?? []).length === 0 && <li className="caption">Sin visitas registradas por día (empezaron con el SQL 0039).</li>}
          </ul>
          <span className="caption">{(d.visits ?? []).length} navegador(es) vinculados a esta cuenta.</span>
        </section>
      </div>

      {d.teaching && (
        <section className="card fd-card">
          <h2>Como docente</h2>
          <span className="caption">{nf(d.teaching.questions)} preguntas propias creadas.</span>
          <SimpleTable rows={(d.teaching.assignments ?? []).map((a) => ({ ...a, created_at: dayLabel(a.created_at) }))} cols={[["created_at", "Fecha"], ["title", "Actividad"], ["course", "Curso"], ["delivered", "Entregas"]]} empty="No ha creado actividades." />
          <SimpleTable rows={(d.teaching.live ?? []).map((a) => ({ ...a, created_at: dayLabel(a.created_at), title: a.title || examName(a.exam_slug) }))} cols={[["created_at", "Fecha"], ["title", "Juego en vivo"], ["questions", "Preguntas"], ["players", "Jugadores"]]} empty="No ha hecho juegos en vivo." />
        </section>
      )}

      <section className="card fd-card fd-fine">
        <h2>Cuenta</h2>
        <span className="caption">Consentimientos: {(d.consents ?? []).map((c) => `${c.kind} ${c.version} (${dayLabel(c.granted_at)})`).join(" · ") || "ninguno"}</span>
        <span className="caption">Práctica libre, últimos días: {(d.quota ?? []).slice(0, 7).map((q) => `${dayLabel(q.day)} ${q.questions}`).join(" · ") || "—"}</span>
        <span className="caption">Cuadernillos descargados: {(d.downloads ?? []).length ? `${d.downloads.length} (último ${dayLabel(d.downloads[0].day)})` : "ninguno"}</span>
        <span className="caption">Ver esta ficha queda registrado (admin_access_log).</span>
      </section>
    </div>
  );
}

// GitHub-style calendar of the last 26 weeks: one square per day, darker = more questions.
function Calendar({ days }) {
  const by = new Map(days.map((d) => [d.day, d]));
  const today = bogotaToday();
  const end = today;
  const dow = (new Date(`${end}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(end, -(25 * 7 + dow));
  const max = Math.max(1, ...days.map((d) => d.answers));
  const weeks = [];
  for (let w = 0; w < 26; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, w * 7 + i);
      col.push(day > end ? null : day);
    }
    weeks.push(col);
  }
  return (
    <div className="fd-cal-wrap">
      <div className="fd-cal" role="img" aria-label="Calendario de actividad">
        {weeks.map((col, w) => (
          <div key={w} className="fd-cal-col">
            {col.map((day, i) => {
              if (!day) return <span key={i} className="fd-cal-cell none" />;
              const x = by.get(day);
              const a = x ? (x.answers > 0 ? Math.max(0.25, x.answers / max) : 0.1) : 0;
              const tip = x ? `${dayLabel(day)}: ${nf(x.answers)} preguntas${x.attempts ? ` · ${x.attempts} entregas` : ""}${x.teacher ? ` · ${x.teacher} acciones docentes` : ""}${x.opens ? ` · ${x.opens} vistas` : ""}` : `${dayLabel(day)}: nada`;
              return <span key={i} className={x ? "fd-cal-cell on" : "fd-cal-cell"} style={{ "--a": a }} title={tip} />;
            })}
          </div>
        ))}
      </div>
      <span className="caption">Más oscuro = más preguntas. Claro = solo abrió la app o la página.</span>
    </div>
  );
}

function WeekLine({ weeks }) {
  const pts = weeks.filter((w) => w.accuracy != null);
  if (pts.length < 2) return <p className="caption">Hacen falta al menos dos semanas con respuestas calificadas.</p>;
  const W = 320;
  const H = 120;
  const x = (i) => 12 + (i * (W - 24)) / (pts.length - 1);
  const y = (v) => H - 10 - ((H - 20) * v) / 100;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(" ");
  return (
    <div className="fd-week">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aciertos por semana">
        {[0, 50, 100].map((t) => <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className="fd-grid" />)}
        <path d={path} className="fd-line" />
        {pts.map((p, i) => <circle key={p.week} cx={x(i)} cy={y(p.accuracy)} r="4" className="fd-dot"><title>{`Semana del ${dayLabel(p.week)}: ${p.accuracy}% en ${p.answers} preguntas`}</title></circle>)}
      </svg>
      <div className="fd-xaxis caption"><span>{dayLabel(pts[0].week)}</span><span>{pts[pts.length - 1].accuracy}% la última semana</span></div>
    </div>
  );
}

// ================================================================================================= Insights
// Short, rule-based readings of the numbers, most useful first. Each one says what to do next when there is something.
export function insights(data, people = []) {
  const out = [];
  const cur = data.kpis?.current ?? {};
  const prev = data.kpis?.previous ?? {};
  const f = data.funnel ?? {};

  if ((cur.signups ?? 0) + (prev.signups ?? 0) > 0) {
    const d = prev.signups ? Math.round((100 * (cur.signups - prev.signups)) / prev.signups) : null;
    out.push({
      tone: cur.signups >= (prev.signups ?? 0) ? "good" : "warn",
      title: `${nf(cur.signups)} cuentas nuevas${d == null ? "" : ` (${d >= 0 ? "+" : ""}${d}% vs. antes)`}`,
      text: cur.visitors ? `Se registra ${pctText(pct(cur.signups, cur.new_visitors || cur.visitors))} de los visitantes nuevos.` : "",
    });
  }

  // The step of the funnel that loses the most people.
  const steps = [["visitors", "llegar"], ["opened_app", "abrir la app"], ["signed_in", "entrar con Google"], ["answered", "responder la primera pregunta"], ["answered5", "llegar a 5 preguntas"]];
  let worst = null;
  for (let i = 1; i < steps.length; i++) {
    const a = f[steps[i - 1][0]] ?? 0;
    const b = f[steps[i][0]] ?? 0;
    if (a >= 3 && (!worst || 1 - b / a > worst.loss)) worst = { loss: 1 - b / a, from: steps[i - 1][1], to: steps[i][1], a, b };
  }
  if (worst && worst.loss > 0.3) {
    out.push({ tone: "bad", title: `El mayor escape: de ${worst.from} a ${worst.to}`, text: `Solo ${nf(worst.b)} de ${nf(worst.a)} (${pctText(pct(worst.b, worst.a))}) dan ese paso. Mejorarlo rinde más que traer más visitas.` });
  }

  const channels = (data.channels ?? []).filter((c) => c.visitors >= 5 && c.channel !== "Directo");
  const best = [...channels].sort((a, b) => b.signups / b.visitors - a.signups / a.visitors)[0];
  const biggest = [...(data.channels ?? [])].sort((a, b) => b.visitors - a.visitors)[0];
  if (best && best.signups > 0) {
    out.push({ tone: "good", title: `${best.channel} convierte mejor`, text: `${pctText(pct(best.signups, best.visitors))} de sus ${nf(best.visitors)} visitantes crearon cuenta${biggest && biggest.channel !== best.channel ? `; ${biggest.channel} trae más gente (${nf(biggest.visitors)}) pero convierte ${pctText(pct(biggest.signups, biggest.visitors))}` : ""}.`, action: { channel: best.channel, label: `Ver solo ${best.channel}` } });
  }
  const search = (data.channels ?? []).find((c) => c.channel === "Buscadores");
  if (!search || search.visitors < 5) {
    out.push({ tone: "warn", title: "Google casi no trae visitas todavía", text: `${nf(search?.visitors ?? 0)} visitantes desde buscadores en el periodo. Las páginas nuevas tardan semanas en posicionar; mira cuáles ya entran en «Páginas de entrada».`, action: { tab: "adquisicion", label: "Ver adquisición" } });
  }

  const freshIdle = people.filter((p) => p.status === "nuevo" && p.answers === 0).length;
  if (freshIdle > 0) out.push({ tone: "warn", title: `${nf(freshIdle)} cuenta${freshIdle === 1 ? "" : "s"} nueva${freshIdle === 1 ? "" : "s"} sin practicar`, text: "Entraron esta semana y no han respondido nada. Un recordatorio o un reto por WhatsApp puede activarlas.", action: { status: "nuevo", label: "Ver nuevas" } });
  const risk = data.lifecycle?.en_riesgo ?? 0;
  if (risk > 0) out.push({ tone: "warn", title: `${nf(risk)} en riesgo de irse`, text: "Practicaron antes pero llevan 8 a 21 días sin volver.", action: { status: "en_riesgo", label: "Ver quiénes" } });

  const hours = data.hours ?? [];
  if (hours.reduce((a, h) => a + h.answers, 0) >= 30) {
    const byHour = Array(24).fill(0);
    for (const h of hours) byHour[h.hour] += h.answers;
    const peak = byHour.indexOf(Math.max(...byHour));
    out.push({ tone: "info", title: `Practican más cerca de las ${peak}:00`, text: `Publica en redes o grupos un poco antes, hacia las ${(peak + 23) % 24}:00.` });
  }

  const landing = [...(data.landing ?? [])].filter((l) => l.accounts > 0).sort((a, b) => b.accounts - a.accounts)[0];
  if (landing) out.push({ tone: "info", title: `La página que más cuentas trae: ${landing.path}`, text: `${nf(landing.accounts)} cuentas de ${nf(landing.visitors)} visitantes que entraron por ahí.` });

  const teachers = people.filter((p) => p.role !== "student" && (p.reach ?? 0) > 0);
  if (teachers.length) {
    const reach = teachers.reduce((a, p) => a + (p.reach ?? 0), 0);
    out.push({ tone: "good", title: `${nf(teachers.length)} docente${teachers.length === 1 ? "" : "s"} con estudiantes`, text: `Llegan a ${nf(reach)} estudiantes en sus cursos. Cada docente activo es la entrada a su colegio.`, action: { tab: "colegios", label: "Ver colegios" } });
  }
  return out.slice(0, 6);
}
