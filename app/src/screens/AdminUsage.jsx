import { useEffect, useMemo, useState } from "react";
import { adminUsage, amAdmin } from "../lib/usage.js";
import Loading from "../components/Loading.jsx";

// «Uso»: who comes to Cóndor and how much they practice. Only for the owner's accounts (app_admins, migration 0037).
// Open it at /app/#admin/uso. Data: admin_usage() — visitors of the site (anonymous), accounts, questions answered.

const PERIODS = [[1, "Hoy"], [7, "7 días"], [30, "30 días"], [90, "90 días"]];
const nf = (n) => (n ?? 0).toLocaleString("es-CO");
const when = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 60 * 24) return `hace ${Math.round(mins / 60)} h`;
  if (mins < 60 * 24 * 7) return `hace ${Math.round(mins / 1440)} d`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");
const ROLE = { student: "Estudiante", teacher: "Docente", school_admin: "Coordinación" };

export default function AdminUsage({ onExit }) {
  const [allowed, setAllowed] = useState(null);
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  useEffect(() => { amAdmin().then(setAllowed, () => setAllowed(false)); }, []);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    setError(null);
    adminUsage(days).then((d) => { if (alive) setData(d); }, (e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [allowed, days]);

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => (!onlyActive || u.preguntas > 0)
      && (!q || `${u.nombre} ${u.correo} ${u.colegio ?? ""} ${u.fuente ?? ""}`.toLowerCase().includes(q)));
  }, [data, query, onlyActive]);

  if (allowed === null) return <Loading page label="Cargando…" />;
  if (!allowed) {
    return (
      <main className="frame">
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h1>Uso</h1>
          <p className="caption">Esta página es solo para el equipo de Cóndor. Si eres tú, agrega tu cuenta a <code>app_admins</code> en Supabase (está en el archivo SQL 0037).</p>
          <button type="button" className="secondary" onClick={onExit}>Volver a la app</button>
        </div>
      </main>
    );
  }

  const t = data?.totals ?? {};
  const funnel = [
    ["Visitaron la página", t.visitors],
    ["Respondieron la pregunta de muestra", t.sample],
    ["Abrieron la app", t.opened_app],
    ["Entraron con Google", t.signed_in],
    ["Respondieron en la app", t.answered_in_app],
  ];
  const top = Math.max(1, ...funnel.map(([, n]) => n ?? 0));
  const daily = data?.daily ?? [];
  const maxDay = Math.max(1, ...daily.map((d) => d.answers));

  const csv = () => {
    const head = ["nombre", "correo", "rol", "colegio", "registro", "ultima_actividad", "preguntas", "preguntas_7d", "preguntas_hoy", "practicas", "pct_correctas", "fuente"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const text = [head.join(","), ...users.map((u) => head.map((h) => esc(u[h])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `condor-uso-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <main className="frame au">
      <header className="au-head">
        <div>
          <h1>Uso de Cóndor</h1>
          <span className="caption">Visitantes anónimos, cuentas y preguntas respondidas. Solo tú ves esta página.</span>
        </div>
        <button type="button" className="secondary" onClick={onExit}>Volver a la app</button>
      </header>

      <div className="segmented au-period" role="radiogroup" aria-label="Periodo">
        {PERIODS.map(([d, label]) => (
          <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? "seg active" : "seg"} onClick={() => setDays(d)}>{label}</button>
        ))}
      </div>

      {error && <p className="notice error" role="alert">{/admin_usage|function/.test(error) ? "Falta correr el SQL 0037 en Supabase." : error}</p>}
      {!data && !error && <Loading label="Cargando…" />}

      {data && (
        <>
          <section className="au-tiles">
            <Tile label="Visitantes" value={t.visitors} sub={`${nf(t.visitors_today)} hoy`} />
            <Tile label="Cuentas nuevas" value={t.accounts_new} sub={`${nf(t.accounts)} en total`} />
            <Tile label="Practicaron" value={t.active} sub={`${nf(t.active_today)} hoy`} />
            <Tile label="Preguntas respondidas" value={t.answers} sub={`${nf(t.answers_today)} hoy · ${nf(t.answers_all)} en total`} />
          </section>

          <section className="card au-card">
            <h2>Del anuncio a la primera pregunta</h2>
            <span className="caption">Cada navegador cuenta una vez. Solo cuenta visitas desde que se activó el registro de uso.</span>
            <ol className="au-funnel">
              {funnel.map(([label, n], i) => (
                <li key={label}>
                  <span className="au-f-label">{label}</span>
                  <span className="au-f-bar"><span style={{ width: `${Math.max(2, (100 * (n ?? 0)) / top)}%` }} /></span>
                  <b>{nf(n)}</b>
                  <span className="au-f-pct">{i > 0 && funnel[i - 1][1] ? `${Math.round((100 * (n ?? 0)) / funnel[i - 1][1])}%` : ""}</span>
                </li>
              ))}
            </ol>
          </section>

          {daily.length > 1 && (
            <section className="card au-card">
              <h2>Preguntas por día</h2>
              <div className="au-days" role="img" aria-label="Preguntas respondidas por día">
                {daily.map((d) => (
                  <div key={d.day} className="au-day" title={`${day(d.day + "T12:00:00")}: ${nf(d.answers)} preguntas · ${nf(d.active)} personas · ${nf(d.visitors)} visitantes nuevos`}>
                    <span className="au-day-bar" style={{ height: `${(100 * d.answers) / maxDay}%` }} />
                  </div>
                ))}
              </div>
              <div className="au-days-axis caption"><span>{day(daily[0].day + "T12:00:00")}</span><span>{day(daily[daily.length - 1].day + "T12:00:00")}</span></div>
            </section>
          )}

          <div className="au-two">
            <section className="card au-card">
              <h2>De dónde llegan</h2>
              <table className="au-table">
                <thead><tr><th>Fuente</th><th>Visitantes</th><th>Con cuenta</th></tr></thead>
                <tbody>
                  {(data.sources ?? []).map((s) => <tr key={s.source}><td>{s.source}</td><td>{nf(s.n)}</td><td>{nf(s.accounts)}</td></tr>)}
                  {(data.sources ?? []).length === 0 && <tr><td colSpan={3} className="caption">Todavía no hay visitas registradas.</td></tr>}
                </tbody>
              </table>
            </section>
            <section className="card au-card">
              <h2>Por área</h2>
              <table className="au-table">
                <thead><tr><th>Área</th><th>Preguntas</th><th>Aciertos</th></tr></thead>
                <tbody>
                  {(data.areas ?? []).map((a) => <tr key={a.area}><td>{a.area}</td><td>{nf(a.n)}</td><td>{a.pct == null ? "—" : `${a.pct}%`}</td></tr>)}
                  {(data.areas ?? []).length === 0 && <tr><td colSpan={3} className="caption">Sin respuestas en este periodo.</td></tr>}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card au-card">
            <div className="au-users-head">
              <h2>Personas ({nf(users.length)})</h2>
              <button type="button" className="secondary" onClick={csv}>Descargar CSV</button>
            </div>
            <div className="au-filters">
              <label className="field au-search"><span className="label">Buscar</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, correo, colegio o fuente" /></label>
              <label className="b-check"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Solo quienes han respondido</label>
            </div>
            <ul className="au-users">
              {users.slice(0, 500).map((u) => (
                <li key={u.user_id}>
                  <div className="au-u-who">
                    <strong>{u.nombre || u.correo}</strong>
                    <span className="caption">{u.correo} · {ROLE[u.rol] ?? u.rol}{u.colegio ? ` · ${u.colegio}` : ""}{u.fuente ? ` · llegó de ${u.fuente}` : ""}</span>
                  </div>
                  <div className="au-u-nums">
                    <span><b>{nf(u.preguntas)}</b> preguntas</span>
                    <span className="caption">{nf(u.preguntas_7d)} esta semana{u.pct_correctas == null ? "" : ` · ${u.pct_correctas}% aciertos`}</span>
                  </div>
                  <div className="au-u-when caption">
                    <span>Activo {when(u.ultima_actividad)}</span>
                    <span>Desde {day(u.registro)}</span>
                  </div>
                </li>
              ))}
              {users.length === 0 && <li className="caption">Nadie coincide con la búsqueda.</li>}
            </ul>
            {users.length > 500 && <p className="caption">Se muestran 500. Descarga el CSV para ver a todos.</p>}
          </section>
        </>
      )}
    </main>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="card au-tile">
      <span className="caption">{label}</span>
      <b>{nf(value)}</b>
      <span className="caption">{sub}</span>
    </div>
  );
}
