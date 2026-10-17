import { useEffect, useState } from "react";
import { Bars } from "./Dashboard.jsx";
import { areaColor } from "../lib/brand.js";

// Lo que ve la familia al abrir el enlace: sin iniciar sesión, una sola página, en español sencillo.
export default function FamilyReport({ api, token }) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    api.familyReport(token).then((data) => setState({ status: data ? "ok" : "missing", data })).catch(() => setState({ status: "error", data: null }));
  }, [api, token]);
  if (state.status === "loading") return <main className="frame"><p className="muted">Cargando…</p></main>;
  if (state.status !== "ok") {
    return <main className="frame"><div className="card"><h1>No pudimos abrir este informe</h1><p className="caption">El enlace venció o fue retirado. Pídele al colegio uno nuevo.</p></div></main>;
  }
  const r = state.data;
  return (
    <main className="frame family" style={{ maxWidth: 640, margin: "0 auto", padding: 16, display: "grid", gap: 14 }}>
      <header>
        <span className="caption">{r.school}</span>
        <h1 style={{ margin: "2px 0" }}>Informe de {r.student}</h1>
        <span className="caption">Preparación para la prueba Saber 11 · {new Date(r.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</span>
      </header>
      <section className="card">
        <span className="label">Puntaje global estimado</span>
        {r.band ? (
          <><strong className="display">{r.band.low}–{r.band.high}</strong><span className="caption">sobre 500. Es un rango estimado, no el puntaje oficial.</span></>
        ) : <span className="caption">Todavía no hay un simulacro completo con tiempo. Este resumen se basa en prácticas ({r.attempts} {r.attempts === 1 ? "entrega" : "entregas"}).</span>}
      </section>
      {r.areas.length > 0 && (
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <span className="label">Respuestas correctas por área</span>
          <Bars rows={r.areas.map((a) => ({ label: a.name, value: a.pct, color: areaColor(a.name) }))} />
          {r.strongest && <p className="caption">Lo que mejor le va: <strong>{r.strongest}</strong>. Lo que más puede mejorar: <strong>{r.weakest}</strong>.</p>}
        </section>
      )}
      {r.plan.length > 0 && (
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <span className="label">Qué practicar esta semana</span>
          {r.plan.map((p) => <div key={p.area}><strong>{p.area}</strong><p className="caption" style={{ margin: "2px 0 0" }}>{p.tip} Tres sesiones de unos 20 minutos bastan.</p></div>)}
        </section>
      )}
      <p className="caption">{r.note}</p>
      <button type="button" className="secondary no-print" onClick={() => window.print()}>Imprimir o guardar PDF</button>
    </main>
  );
}
