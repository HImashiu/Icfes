import { useEffect, useState } from "react";
import { amAdmin } from "../lib/usage.js";
import { call } from "../lib/growth/app.js";
import { experimentVerdict, nps, tally, vanWestendorp } from "../lib/growth/stats.js";
import "./growth/growth.css";

// Growth control room (#admin/crecimiento, F7 in docs/growth/LEDGER.md). Only app_admins (migration 0037) get data.
// Funnel, experiments with a verdict, referrals, partners, leads, surveys, content gaps, errors, web vitals, item
// statistics (keys to check), school demand, short links and notices. Everything comes from migration 0050.
const PERIODS = [[7, "7 días"], [30, "30 días"], [90, "90 días"]];
const nf = (n) => (n ?? 0).toLocaleString("es-CO");
const pct = (x) => (x == null ? "—" : `${Math.round(x * 1000) / 10} %`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");

function Card({ title, note, children }) {
  return <section className="card au-card"><div className="section-head"><span className="label">{title}</span>{note && <span className="caption">{note}</span>}</div>{children}</section>;
}
function Table({ head, rows, empty = "Todavía no hay datos." }) {
  return <table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={head.length} className="caption">{empty}</td></tr>}</tbody></table>;
}

export default function AdminGrowth({ onExit }) {
  const [allowed, setAllowed] = useState(null);
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [link, setLink] = useState({ code: "", target: "", label: "" });

  useEffect(() => { amAdmin().then(setAllowed, () => setAllowed(false)); }, []);
  const load = async () => {
    setError(null);
    try {
      const names = ["admin_growth_overview", "admin_growth_funnel", "admin_experiment_readout", "admin_referrals", "admin_partners", "admin_leads", "admin_surveys", "admin_content_gaps", "admin_client_errors", "admin_web_vitals", "admin_item_stats", "admin_school_demand", "admin_short_links", "admin_testimonials", "admin_growth_events"];
      const withDays = new Set(["admin_growth_overview", "admin_growth_funnel", "admin_referrals", "admin_leads", "admin_surveys", "admin_content_gaps", "admin_client_errors", "admin_web_vitals", "admin_growth_events"]);
      const out = await Promise.all(names.map((n) => call(n, withDays.has(n) ? { p_days: days } : n === "admin_item_stats" ? { p_min: 20 } : {}).catch((e) => ({ __error: e.message }))));
      const firstErr = out.find((x) => x?.__error);
      if (firstErr && out.every((x) => x?.__error)) throw new Error(firstErr.__error);
      setD(Object.fromEntries(names.map((n, i) => [n.replace("admin_", ""), out[i]?.__error ? null : out[i]])));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (allowed) load(); }, [allowed, days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed === null) return <main className="frame"><p className="muted">Cargando…</p></main>;
  if (!allowed) return <main className="frame"><div className="card"><p className="caption">Esta página es solo para el equipo de Cóndor.</p><button type="button" className="secondary" onClick={onExit}>Volver a la app</button></div></main>;

  const act = (fn) => async () => { try { await fn(); await load(); } catch (e) { setError(e.message); } };
  const o = d?.growth_overview ?? {};
  const funnel = d?.growth_funnel?.steps ?? [];
  const top = Math.max(1, ...funnel.map((s) => s.visitors));
  const surveys = d?.surveys ?? {};
  const npsScore = nps((surveys.nps ?? []).map((r) => Number(r.answer?.score)));
  const canal = tally((surveys.canal ?? []).map((r) => r.answer), "c");
  const vw = vanWestendorp((surveys.precio ?? []).map((r) => r.answer));
  const vwSchool = vanWestendorp((surveys.precio_colegio ?? []).map((r) => r.answer));

  return (
    <main className="frame au gr-admin">
      <header className="au-head">
        <div><h1>Crecimiento</h1><span className="caption">Embudo, experimentos, invitaciones, encuestas y qué falta en el sitio.</span></div>
        <div className="gr-row"><a className="link" href="#admin/uso">Uso</a><button type="button" className="secondary" onClick={onExit}>Volver a la app</button></div>
      </header>
      <div className="segmented au-period" role="radiogroup" aria-label="Periodo">
        {PERIODS.map(([n, label]) => <button key={n} type="button" role="radio" aria-checked={days === n} className={days === n ? "seg active" : "seg"} onClick={() => setDays(n)}>{label}</button>)}
      </div>
      {error && <p className="notice error" role="alert">{/function|does not exist/.test(error) ? "Falta correr el SQL 0050 en Supabase." : error}</p>}
      {!d && !error && <p className="muted">Cargando…</p>}
      {d && (
        <>
          <section className="au-tiles">
            {[["Visitantes", o.visitors], ["Llegaron invitados", o.referral_signups], ["Correos (leads)", o.leads], ["Diagnósticos de curso", o.class_diagnostics], ["Respuestas en el sitio", o.public_answers], ["Parches", o.study_groups], ["Inscritos a eventos", o.event_signups], ["Avisos push", o.push_subscribers], ["Aliados por revisar", o.partner_applications], ["Testimonios por revisar", o.testimonials_pending], ["Errores", o.errors], ["Colegios nombrados", o.schools_named]].map(([l, v]) => (
              <div key={l} className="card au-tile"><b>{nf(v)}</b><span className="caption">{l}</span></div>
            ))}
          </section>

          <Card title="Embudo de activación" note={`${nf(d.growth_funnel?.visitors)} visitantes · ${nf(d.growth_funnel?.returned)} volvieron otro día`}>
            <ol className="au-funnel">
              {funnel.map((s, i) => (
                <li key={s.step}><span className="au-f-label">{s.label}</span><span className="au-f-bar"><span style={{ width: `${Math.max(2, (100 * s.visitors) / top)}%` }} /></span><b>{nf(s.visitors)}</b><span className="au-f-pct">{i > 0 && funnel[i - 1].visitors ? `${Math.round((100 * s.visitors) / funnel[i - 1].visitors)}%` : ""}</span></li>
              ))}
            </ol>
          </Card>

          <Card title="Experimentos" note="El primer grupo es el control. Veredicto con 100+ por grupo y 10+ conversiones.">
            {(d.experiment_readout ?? []).map((e) => (
              <div key={e.key} style={{ marginBottom: 14 }}>
                <b>{e.key}</b> <span className="caption">· {e.description} · meta: {e.goal} · {e.status === "running" ? "corriendo" : `detenido${e.winner ? `, ganó ${e.winner}` : ""}`}</span>
                <Table head={["Variante", "Expuestos", "Convirtieron", "Tasa", "Mejora", "p", "Prob. de ganar", "Veredicto"]} rows={experimentVerdict(e).map((v) => (
                  <tr key={v.variant}><td>{v.variant} vs {e.variants[0]}</td><td>{nf(v.arm.exposed)} / {nf(v.control.exposed)}</td><td>{nf(v.arm.converted)} / {nf(v.control.converted)}</td><td>{pct(v.rate)} / {pct(v.rateControl)}</td><td>{v.lift == null ? "—" : pct(v.lift)}</td><td>{v.p == null ? "—" : v.p.toFixed(3)}</td><td>{v.beat == null ? "—" : pct(v.beat)}</td>
                    <td className={`gr-verdict ${v.verdict === "Gana la variante" ? "win" : v.verdict === "Gana el control" ? "lose" : ""}`}>{v.verdict}</td></tr>
                ))} />
                {e.status === "running"
                  ? <div className="gr-row">{e.variants.map((w) => <button key={w} type="button" className="secondary small" onClick={act(() => call("admin_set_experiment", { p_key: e.key, p_status: "stopped", p_winner: w }))}>Detener: dejar «{w}»</button>)}</div>
                  : <button type="button" className="link small" onClick={act(() => call("admin_set_experiment", { p_key: e.key, p_status: "running", p_winner: null }))}>Volver a correr</button>}
              </div>
            ))}
          </Card>

          <div className="au-two">
            <Card title="Invitaciones" note={`k ≈ ${d.referrals?.k_factor_hint ?? "—"} invitados por cuenta nueva`}>
              <Table head={["Por", "Cuentas"]} rows={Object.entries(d.referrals?.by_via ?? {}).map(([k, v]) => <tr key={k}><td>{k}</td><td>{nf(v)}</td></tr>)} />
              <p className="caption">{nf(d.referrals?.signups)} llegaron invitados, {nf(d.referrals?.activated)} ya practican · {nf(d.referrals?.share_clicks)} toques en «compartir» · {nf(d.referrals?.codes)} códigos de estudiantes.</p>
            </Card>
            <Card title="Encuestas" note={`NPS con ${npsScore.n} respuestas`}>
              <p><b style={{ fontSize: 28 }}>{npsScore.score ?? "—"}</b> <span className="caption">NPS · {npsScore.promoters} promotores, {npsScore.passives} pasivos, {npsScore.detractors} detractores</span></p>
              <Table head={["¿Cómo nos conociste?", "Respuestas", "%"]} rows={canal.map((c) => <tr key={c.value}><td>{c.value}</td><td>{c.count}</td><td>{c.pct} %</td></tr>)} />
              <p className="caption">Precio (estudiantes, Van Westendorp): {vw.enough ? `rango aceptable $${nf(vw.pmc)} a $${nf(vw.pme)}, precio óptimo ≈ $${nf(vw.opp)}, indiferencia ≈ $${nf(vw.ipp)} (${vw.n} respuestas)` : `faltan respuestas (${vw.n} de 5)`}.{vwSchool.enough ? ` Colegios: $${nf(vwSchool.pmc)} a $${nf(vwSchool.pme)}.` : ""}</p>
              {(surveys.nps ?? []).filter((r) => r.answer?.reason).slice(0, 8).map((r, i) => <p key={i} className="caption">«{r.answer.reason}» ({r.answer.score})</p>)}
            </Card>
          </div>

          <div className="au-two">
            <Card title="Aliados" note="Solicitudes del sitio /aliados/">
              <Table head={["Nombre", "Tipo", "Correo", "Estudiantes", "Estado", ""]} rows={(d.partners?.applications ?? []).map((a) => (
                <tr key={a.id}><td>{a.name}<br /><span className="caption">{a.city ?? ""} · {a.message ?? ""}</span></td><td>{a.kind}</td><td>{a.email}</td><td>{a.audience ?? "—"}</td><td>{a.code ?? a.status}</td>
                  <td>{a.status === "nueva" && <button type="button" className="secondary small" onClick={act(async () => {
                    const code = a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || `aliado-${a.id.slice(0, 4)}`;
                    await call("admin_make_partner", { p_application: a.id, p_code: code, p_label: a.name, p_email: a.email });
                  })}>Aprobar</button>}</td></tr>
              ))} />
              <Table head={["Código", "Aliado", "Cuentas", "Practican"]} rows={(d.partners?.codes ?? []).map((c) => <tr key={c.code}><td>{c.code}</td><td>{c.label}</td><td>{nf(c.signups)}</td><td>{nf(c.activated)}</td></tr>)} empty="Aún no hay aliados aprobados." />
            </Card>
            <Card title="Correos (leads)" note="Con permiso para escribirles">
              <Table head={["Correo", "De", "Datos", "Fecha"]} rows={(d.leads ?? []).slice(0, 60).map((l) => <tr key={l.id}><td>{l.email}</td><td>{l.kind}{l.role ? ` · ${l.role}` : ""}</td><td className="caption">{Object.entries(l.payload ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : v}`).join(" · ")}</td><td>{day(l.created_at)}</td></tr>)} />
            </Card>
          </div>

          <div className="au-two">
            <Card title="Lo que buscan y no encuentran" note="Búsquedas sin resultado y páginas que no existen">
              <Table head={["Búsqueda", "Veces", "Resultados"]} rows={(d.content_gaps?.searches ?? []).slice(0, 25).map((s) => <tr key={s.query}><td>{s.query}</td><td>{s.times}</td><td>{s.hits}</td></tr>)} />
              <Table head={["Página que no existe", "Desde", "Personas"]} rows={(d.content_gaps?.not_found ?? []).slice(0, 25).map((s, i) => <tr key={i}><td>{s.path}</td><td>{s.referrer || "—"}</td><td>{s.visitors}</td></tr>)} />
            </Card>
            <Card title="Colegios donde ya practican" note="Estudiantes que escribieron su colegio: los mejores colegios para ofrecer Cóndor">
              <Table head={["Colegio", "Ciudad", "Estudiantes", "Activos 7 d", "Cuenta"]} rows={(d.school_demand ?? []).slice(0, 40).map((s) => <tr key={s.norm}><td>{s.school}</td><td>{s.city ?? "—"}</td><td>{s.students}</td><td>{s.active_7d}</td><td>{s.has_account ? "Sí" : "No"}</td></tr>)} />
            </Card>
          </div>

          <Card title="Preguntas para revisar" note="Con 20+ respuestas: clave dudosa = la opción incorrecta más elegida gana a la clave y casi nadie acierta">
            <Table head={["Cuadernillo", "Pregunta", "Área", "Respuestas", "Aciertan", "Discriminación", "Más elegida mal", "Alerta"]} rows={(d.item_stats ?? []).filter((x) => x.flag).slice(0, 40).map((x) => <tr key={`${x.exam_slug}-${x.qkey}`}><td>{x.exam_slug}</td><td>{x.qkey}</td><td>{x.area ?? "—"}</td><td>{x.n}</td><td>{pct(x.p)}</td><td>{x.disc ?? "—"}</td><td>{x.top_wrong ?? "—"}</td><td>{x.flag}</td></tr>)} empty="Ninguna pregunta con alerta todavía." />
          </Card>

          <div className="au-two">
            <Card title="Errores en el navegador">
              <Table head={["Mensaje", "Dónde", "Personas", "Veces"]} rows={(d.client_errors ?? []).slice(0, 20).map((e) => <tr key={e.fingerprint}><td>{e.message}</td><td className="caption">{e.surface} · {e.path}</td><td>{e.visitors}</td><td>{e.count}</td></tr>)} empty="Sin errores." />
            </Card>
            <Card title="Velocidad real (p75)" note="LCP y TTFB en segundos; CLS sin unidad">
              <Table head={["Páginas", "Métrica", "p75", "Medidas"]} rows={(d.web_vitals ?? []).map((v, i) => <tr key={i}><td>{v.tpl}</td><td>{v.metric}</td><td>{v.p75}</td><td>{v.n}</td></tr>)} />
            </Card>
          </div>

          <div className="au-two">
            <Card title="Enlaces cortos" note="condoricfes.com/r/código">
              <Table head={["Código", "Va a", "Clics"]} rows={(d.short_links ?? []).map((s) => <tr key={s.code}><td>{s.code}</td><td className="caption">{s.target}</td><td>{nf(s.clicks)}</td></tr>)} />
              <div className="gr-grid2">
                <input placeholder="código" value={link.code} onChange={(e) => setLink({ ...link, code: e.target.value })} />
                <input placeholder="/simulacro-icfes/?fuente=qr" value={link.target} onChange={(e) => setLink({ ...link, target: e.target.value })} />
                <input placeholder="nota" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} />
              </div>
              <button type="button" className="secondary small" disabled={!link.code || !link.target.startsWith("/")} onClick={act(async () => { await call("admin_save_short_link", { p_code: link.code, p_target: link.target, p_label: link.label }); setLink({ code: "", target: "", label: "" }); })}>Guardar enlace</button>
            </Card>
            <Card title="Testimonios" note="Solo salen en el sitio los aprobados">
              <Table head={["Quién", "Texto", ""]} rows={(d.testimonials ?? []).map((t) => <tr key={t.id}><td>{t.display_name}<br /><span className="caption">{t.detail}</span></td><td>{t.body}</td><td><button type="button" className="secondary small" onClick={act(() => call("admin_set_testimonial", { p_id: t.id, p_approved: !t.approved }))}>{t.approved ? "Quitar" : "Aprobar"}</button></td></tr>)} />
            </Card>
          </div>

          <Card title="Eventos" note="Visitantes distintos por evento">
            <Table head={["Evento", "Personas", "Veces"]} rows={(d.growth_events ?? []).map((e) => <tr key={e.name}><td>{e.name}</td><td>{nf(e.visitors)}</td><td>{nf(e.events)}</td></tr>)} />
          </Card>
        </>
      )}
    </main>
  );
}
