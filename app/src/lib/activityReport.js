// The teacher's activity report: for every student of the chosen class spaces, what was assigned, what they delivered,
// how it went over time, how long they worked and how often a monitored exam was left. Pure functions.
import { assignmentState, scorePct, whoOf } from "./assignments.js";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function activityRows({ members, assignments, attempts }, now = Date.now()) {
  const byWho = new Map();
  for (const a of attempts) {
    if (!a.submitted_at) continue;
    const k = `${whoOf(a)}|${a.assignment_id}`;
    const prev = byWho.get(k);
    if (!prev || (scorePct(a) ?? -1) > (scorePct(prev) ?? -1)) byWho.set(k, a);
  }
  return members.filter((m) => m.role === "student").map((m) => {
    const mine = assignments.filter((a) => a.course_id === m.course_id && a.status !== "draft");
    const items = mine.map((a) => {
      const at = [m.profile_id, m.id].filter(Boolean).map((id) => byWho.get(`${id}|${a.id}`)).filter(Boolean)
        .sort((x, y) => (scorePct(y) ?? -1) - (scorePct(x) ?? -1))[0] ?? null;
      const state = assignmentState(a, now);
      return {
        id: a.id, title: a.title, kind: a.kind, due: a.due_at, state, attempt: at,
        done: Boolean(at), pct: at ? scorePct(at) : null, sec: at?.mode === "paper" ? null : at?.duration_sec ?? null,
        at: at?.submitted_at ?? null, late: !at && state === "closed",
        leaves: at?.proctor?.leaves ?? 0, awaySec: at?.proctor?.awaySec ?? 0,
      };
    }).sort((x, y) => String(x.at ?? x.due ?? "").localeCompare(String(y.at ?? y.due ?? "")));
    const done = items.filter((i) => i.done);
    const pcts = done.map((i) => i.pct).filter((p) => p != null);
    const secs = done.map((i) => i.sec).filter((s) => s != null);
    return {
      id: m.id, name: m.full_name || m.email, email: m.email, courseId: m.course_id, joined: Boolean(m.profile_id) || done.length > 0,
      assigned: items.length, done: done.length, late: items.filter((i) => i.late).length,
      avgPct: pcts.length ? Math.round(mean(pcts)) : null,
      // Change against the student's own earlier work: the last three results against the three before.
      trend: pcts.length >= 4 ? Math.round(mean(pcts.slice(-3)) - mean(pcts.slice(-6, -3).length ? pcts.slice(-6, -3) : pcts.slice(0, 1))) : null,
      totalSec: secs.reduce((a, b) => a + b, 0), lastAt: done.map((i) => i.at).sort().pop() ?? null,
      leaves: items.reduce((n, i) => n + i.leaves, 0), items,
    };
  });
}

export function summaryOf(rows) {
  const assigned = rows.reduce((n, r) => n + r.assigned, 0);
  const done = rows.reduce((n, r) => n + r.done, 0);
  const pcts = rows.map((r) => r.avgPct).filter((p) => p != null);
  return {
    students: rows.length, assigned, done,
    completion: assigned ? Math.round((done / assigned) * 100) : null,
    avgPct: pcts.length ? Math.round(mean(pcts)) : null,
    late: rows.reduce((n, r) => n + r.late, 0),
    inactive: rows.filter((r) => r.assigned > 0 && r.done === 0).length,
    leaves: rows.reduce((n, r) => n + r.leaves, 0),
  };
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// One line per student and assignment: opens in Excel and Google Sheets. Scores use the preliminary key.
export function activityCsv(rows, courseName = () => "") {
  const head = ["Estudiante", "Correo", "Espacio", "Asignación", "Estado", "Puntaje (%) clave preliminar", "Entregado", "Tiempo (s)", "Salidas de la pestaña", "Segundos fuera"];
  const lines = rows.flatMap((r) => r.items.map((i) => [r.name, r.email, courseName(r.courseId), i.title, i.done ? "Entregado" : i.late ? "Sin entregar" : "Pendiente", i.pct ?? "", i.at ?? "", i.sec ?? "", i.done ? i.leaves : "", i.done ? i.awaySec : ""].map(cell).join(",")));
  return [head.join(","), ...lines].join("\n");
}
