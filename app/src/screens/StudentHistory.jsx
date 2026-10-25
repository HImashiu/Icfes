import { useEffect, useMemo, useState } from "react";
import { areaColor } from "../lib/brand.js";
import { gradeMany, itemFromRow, resolveModel } from "../lib/grading.js";
import { scoreHistory } from "../lib/simulacro.js";
import Saber11Report from "../components/Saber11Report.jsx";
import { profilePanels } from "../lib/workspaceSlots.js";
import "./results.css";

const AREAS = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"];
const SHORT = { "Lectura crítica": "Lectura", Matemáticas: "Mate", "Sociales y ciudadanas": "Sociales", "Ciencias naturales": "Ciencias", Inglés: "Inglés" };
const KIND = { task: "Práctica", homework: "Tarea", exam: "Simulacro" };
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const heat = (p) => (p == null ? "transparent" : p < 40 ? "var(--bad-soft)" : p < 60 ? "rgba(255, 159, 67, 0.16)" : p < 75 ? "rgba(200, 240, 74, 0.12)" : "var(--ok-soft)");
const areaPct = (attempt, name) => {
  const a = attempt?.score?.perArea?.find((x) => x.name === name);
  return a && a.total ? Math.round((a.correct / a.total) * 100) : null;
};

// The whole record of one student, oldest first: every delivery with its grade under that activity's model,
// how each area moved, every Saber 11 estimate (Sesión 1 + Sesión 2) and the questions they keep missing.
// Compared only with their own earlier work.
export function StudentHistory({ student: s, api, assignments }) {
  const [models, setModels] = useState([]);
  const [all, setAll] = useState(false);
  useEffect(() => { let alive = true; api.gradingModels?.().then((m) => alive && setModels(m ?? [])).catch(() => {}); return () => { alive = false; }; }, [api]);
  const done = useMemo(() => s.items.filter((i) => i.done && i.attempt).sort((a, b) => String(a.at).localeCompare(String(b.at))), [s.items]);
  const byId = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
  const graded = useMemo(() => done.map((i) => {
    const a = byId.get(i.id);
    const { model } = resolveModel(models, { assignmentId: i.id, courseId: i.courseId ?? a?.course_id, schoolId: a?.school_id });
    return { ...i, grade: gradeMany([itemFromRow(i.attempt)], model, {})[0] };
  }), [done, byId, models]);
  const sims = useMemo(() => scoreHistory(done.map((i) => ({ ...i.attempt, assignment_id: i.id })), assignments), [done, assignments]);
  const areas = AREAS.filter((n) => done.some((i) => areaPct(i.attempt, n) != null));
  // Per area: first third against last third of their deliveries in that area.
  const moves = areas.map((n) => {
    const v = done.map((i) => areaPct(i.attempt, n)).filter((x) => x != null);
    const k = Math.max(1, Math.floor(v.length / 3));
    const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    return { name: n, n: v.length, now: v.length ? avg(v.slice(-k)) : null, before: v.length >= 2 ? avg(v.slice(0, k)) : null, all: v.length ? avg(v) : null };
  });
  // Questions answered wrong in two deliveries or more (the same booklet question).
  const repeat = useMemo(() => {
    const seen = new Map();
    for (const i of done) {
      const a = byId.get(i.id);
      for (const [qk, given] of Object.entries(i.attempt.answers ?? {})) {
        const k = `${a?.exam_slug}|${qk}`;
        const cur = seen.get(k) ?? { qk, slug: a?.exam_slug, times: 0, titles: [] };
        cur.times += 1;
        cur.titles.push(i.title);
        cur.given = given;
        seen.set(k, cur);
      }
    }
    return [...seen.values()].filter((x) => x.times >= 2);
  }, [done, byId]);
  const shown = all ? [...graded].reverse() : [...graded].reverse().slice(0, 12);

  if (!done.length) return <p className="caption">Aún no tiene entregas: aquí aparecerá todo su historial.</p>;
  return (
    <div className="sth">
      <div className="sth-moves">
        {moves.map((m) => {
          const d = m.before != null && m.n >= 3 ? m.now - m.before : null;
          return (
            <div key={m.name} className="sth-move" style={{ "--a": areaColor(m.name) }}>
              <span className="label"><span className="dot" style={{ background: areaColor(m.name) }} /> {m.name}</span>
              <strong>{m.now == null ? "—" : `${m.now} %`}</strong>
              <span className={d == null ? "caption" : d > 0 ? "caption gw-up" : d < 0 ? "caption gw-down" : "caption"}>{d == null ? `${m.n} ${m.n === 1 ? "entrega" : "entregas"}` : `${d > 0 ? "+" : ""}${d} pts desde sus primeras entregas`}</span>
            </div>
          );
        })}
      </div>

      {sims.trend.length > 0 && (
        <div className="sth-sims">
          <span className="label">Simulacros completos (Sesión 1 + Sesión 2) · estimado 0–500</span>
          <div className="sth-sim-row">
            {sims.trend.map((t, i) => (
              <div key={`${t.code}-${i}`} className="sth-sim">
                <strong>{t.global}</strong>
                <span className="caption">{t.code} · {shortDate(new Date(t.at).toISOString())}</span>
                {i > 0 && <span className={t.global >= sims.trend[i - 1].global ? "caption gw-up" : "caption gw-down"}>{t.global >= sims.trend[i - 1].global ? "+" : ""}{t.global - sims.trend[i - 1].global}</span>}
              </div>
            ))}
            {sims.open && <div className="sth-sim open"><strong>…</strong><span className="caption">{sims.open.code}: falta la {sims.open.s1 ? "Sesión 2" : "Sesión 1"}</span></div>}
          </div>
          {sims.latest && <Saber11Report sim={sims.latest} />}
          <span className="caption">Calculado como el ICFES con parámetros de preguntas estimados y clave preliminar: sirve para ver su avance, no es el puntaje oficial.</span>
        </div>
      )}

      <div className="table-wrap">
        <table className="t-table sth-table">
          <thead><tr><th>Fecha</th><th>Actividad</th><th>Tipo</th><th>Nota</th><th>Aciertos</th>{areas.map((n) => <th key={n} title={n}>{SHORT[n]}</th>)}</tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={`${i.id}-${i.memberId}`}>
                <td>{shortDate(i.at)}</td>
                <td>{i.title}{i.attempt.mode === "paper" ? <span className="caption"> · papel</span> : null}</td>
                <td>{KIND[i.kind] ?? "—"}</td>
                <td><strong>{i.grade?.ok ? i.grade.display : "—"}</strong>{i.grade?.passed === false && <span className="badge pending"> no aprueba</span>}</td>
                <td>{i.pct == null ? "—" : `${i.pct} %`}</td>
                {areas.map((n) => { const p = areaPct(i.attempt, n); return <td key={n} className="sth-cell" style={{ background: heat(p) }}>{p == null ? "" : p}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {graded.length > 12 && <button type="button" className="link" onClick={() => setAll(!all)}>{all ? "Ver solo las 12 más recientes" : `Ver las ${graded.length} entregas`}</button>}
      {repeat.length > 0 && <span className="caption">{repeat.length} {repeat.length === 1 ? "pregunta le salió" : "preguntas le salieron"} en más de una actividad: el banco de preguntas ayuda a no repetirlas.</span>}
    </div>
  );
}

if (!profilePanels.some((p) => p.id === "history")) profilePanels.push({ id: "history", title: "Historial completo", order: 10, Component: StudentHistory });
