import { useState } from "react";
import { bankItems } from "../lib/bank.js";
import { reinforcementSet } from "../lib/students.js";
import { DateField, Select } from "../components/Controls.jsx";

const isoDay = (d) => d.toISOString().slice(0, 10);

// Plan de refuerzo personal: cada estudiante recibe un set con lo que falló y lo nuevo de sus competencias más débiles.
// El docente revisa la lista y aprueba con un clic; cada estudiante ve solo el suyo.
export default function Reinforcement({ api, courses, exams, fetchExam, guard, setNotice, onSaved = null }) {
  const tagged = exams.filter((e) => e.status !== "proximamente" && e.hasEnrich);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [slug, setSlug] = useState(tagged[0]?.slug ?? "");
  const [size, setSize] = useState("15");
  const [due, setDue] = useState(isoDay(new Date(Date.now() + 7 * 864e5)));
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(false);

  const compute = () => {
    setBusy(true);
    setPlans(null);
    guard(async () => {
      const [members, all, bundle] = await Promise.all([api.listMembers(courseId), api.examAttempts(slug), fetchExam(slug)]);
      const items = bankItems(bundle.exam, { enrich: bundle.enrich, key: bundle.key, notes: bundle.notes });
      const rows = members.filter((m) => m.role === "student").map((m) => {
        const mine = m.profile_id ? all.filter((a) => a.profile_id === m.profile_id) : [];
        const plan = reinforcementSet(items, bundle.key, mine, { size: Number(size) });
        return { member: m, ...plan, on: plan.keys.length > 0 };
      });
      setPlans(rows);
    }).finally(() => setBusy(false));
  };
  const chosen = (plans ?? []).filter((p) => p.on && p.keys.length > 0);
  const assign = () => {
    setBusy(true);
    guard(async () => {
      const me = await api.getProfile();
      for (const p of chosen) {
        await api.createAssignment({
          course_id: courseId, created_by: me.id, kind: "task", title: `Refuerzo personal · ${p.competencias[0]}`, exam_slug: slug, scope: "all",
          question_keys: p.keys, assignee_id: p.member.profile_id, due_at: new Date(`${due}T23:59:00`).toISOString(), reveal_policy: "after_submit", status: "active",
        });
      }
      if (onSaved) onSaved(chosen.length);
      else setNotice(`Se asignaron ${chosen.length} planes de refuerzo. Cada estudiante ve el suyo en "Tareas de tu curso".`);
      setPlans(null);
    }).finally(() => setBusy(false));
  };

  return (
    <>
      <header className="t-head"><div><h1>Refuerzo personal</h1><span className="caption">Un set distinto para cada estudiante, armado con lo que más le cuesta.</span></div></header>
      {tagged.length === 0 && <p className="notice">Ningún cuadernillo tiene todavía competencias generadas. El refuerzo necesita ese análisis.</p>}
      <div className="card t-card assign-form">
        <label className="field"><span className="label">Curso</span>
          <Select value={courseId} onChange={(v) => { setCourseId(v); setPlans(null); }}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="field"><span className="label">Cuadernillo del que salen las respuestas</span>
          <Select value={slug} onChange={(v) => { setSlug(v); setPlans(null); }}>{tagged.map((e) => <option key={e.slug} value={e.slug}>{e.title ?? e.slug}</option>)}</Select></label>
        <label className="field"><span className="label">Preguntas por estudiante</span>
          <Select value={size} onChange={(v) => { setSize(v); setPlans(null); }}>{[10, 15, 20].map((n) => <option key={n}>{n}</option>)}</Select></label>
        <label className="field"><span className="label">Fecha de entrega</span><DateField value={due} min={isoDay(new Date())} onChange={(v) => setDue(v)} /></label>
        <div className="report-actions"><button type="button" className="primary" disabled={busy || !courseId || !slug} onClick={compute}>{busy && !plans ? "Calculando…" : "Calcular planes"}</button></div>
      </div>
      {plans && (
        <div className="card t-card">
          <div className="table-wrap">
            <table className="t-table">
              <thead><tr><th /><th>Estudiante</th><th>Competencias a reforzar</th><th>Preguntas</th></tr></thead>
              <tbody>
                {plans.map((p, i) => (
                  <tr key={p.member.id}>
                    <td><input type="checkbox" aria-label={`Incluir a ${p.member.full_name || p.member.email}`} disabled={p.keys.length === 0} checked={p.on} onChange={() => setPlans(plans.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} /></td>
                    <td>{p.member.full_name || p.member.email}</td>
                    <td>{p.keys.length ? p.competencias.join(" · ") : p.member.profile_id ? "Aún sin suficientes respuestas" : "Aún no ha ingresado"}</td>
                    <td>{p.keys.length || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-actions"><button type="button" className="primary" disabled={busy || chosen.length === 0} onClick={assign}>Asignar {chosen.length} {chosen.length === 1 ? "plan" : "planes"}</button></div>
          <span className="caption">Las preguntas son las que falló y otras nuevas de sus dos competencias más débiles. Claves preliminares.</span>
        </div>
      )}
    </>
  );
}
