// Planilla de notas: every student of a class against every activity of the class, each activity graded with its own
// model, and a final note built from the class's rule (weight per kind of activity, missing work, period). Pure.
import { assignmentState, progressRows, questionsForAttempt } from "./assignments.js";
import { formatValue, gradeMany, itemFromRow, normalizeModel, resolveModel, toScale } from "./grading.js";

export const FINAL_KINDS = [
  { id: "task", label: "Prácticas" },
  { id: "homework", label: "Tareas" },
  { id: "exam", label: "Simulacros y exámenes" },
];
const dayOf = (a) => String(a.due_at ?? a.opens_at ?? a.created_at ?? "").slice(0, 10);
const fmt = (v, d = 1) => Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

// Activities that count for the final note: of the class, not drafts, inside the period.
export function periodActivities(assignments, final) {
  return assignments
    .filter((a) => a.status !== "draft")
    .filter((a) => (!final.from || dayOf(a) >= final.from) && (!final.to || dayOf(a) <= final.to))
    .sort((x, y) => dayOf(x).localeCompare(dayOf(y)));
}

// bundles: Map assignment id -> { exam, key } (may lack entries: then stored per-area scores are used).
export function computeGradebook({ members, assignments, attempts, models = [], schoolId, courseId, bundles = new Map(), now = Date.now() }) {
  const { model: classModel } = resolveModel(models, { courseId, schoolId });
  const cm = normalizeModel(classModel);
  const final = cm.final;
  const acts = periodActivities(assignments.filter((a) => a.course_id === courseId), final);
  const students = members.filter((m) => m.role === "student" && m.course_id === courseId);
  const columns = acts.map((a) => {
    const { model, source } = resolveModel(models, { assignmentId: a.id, courseId, schoolId });
    const b = bundles.get(a.id);
    const ctx = b ? { questions: questionsForAttempt(b.exam, { scope: a.scope, keys: a.question_keys }), key: b.key, enrich: b.enrich } : {};
    const prog = progressRows(students, attempts.filter((t) => t.assignment_id === a.id));
    const graded = prog.rows.filter((r) => r.attempt);
    const out = gradeMany(graded.map((r) => itemFromRow(r.attempt)), model, ctx);
    const cells = new Map(graded.map((r, i) => [r.id, out[i]]));
    const open = assignmentState(a, now) !== "closed";
    return { id: a.id, title: a.title, kind: a.kind ?? "task", due: a.due_at, open, model, source, cells, weight: final.weights[a.kind ?? "task"] ?? 0 };
  });
  const scaleLike = cm.kind === "percent" || cm.kind === "scale";
  const rows = students.map((m) => {
    const cells = {};
    const byKind = {};
    let missing = 0;
    for (const c of columns) {
      const g = c.cells.get(m.id);
      const done = Boolean(g?.ok);
      // Open activities never count as missing: the student still has time.
      const counts = done || (!c.open && final.missing === "zero");
      if (!done && !c.open) missing += 1;
      cells[c.id] = { done, display: done ? g.display : c.open ? "Abierta" : "Sin entregar", pct: done ? g.pct : null, value: done ? g.value : null, passed: g?.passed ?? null };
      if (!counts || c.weight <= 0) continue;
      (byKind[c.kind] ??= []).push({ pct: done ? g.pct ?? 0 : 0, value: done ? g.value : null, max: done ? g.max : null });
    }
    let wsum = 0, psum = 0, vsum = 0, vw = 0;
    for (const [kind, list] of Object.entries(byKind)) {
      const w = final.weights[kind] ?? 0;
      if (!w || !list.length) continue;
      wsum += w;
      psum += w * (list.reduce((n, x) => n + x.pct, 0) / list.length);
      const vals = list.filter((x) => x.value != null);
      if (vals.length) { vw += w; vsum += w * (vals.reduce((n, x) => n + x.value, 0) / vals.length); }
    }
    const finalPct = wsum ? psum / wsum : null;
    let value = null;
    if (finalPct != null) {
      if (cm.kind === "percent") value = Math.round(finalPct);
      else if (cm.kind === "scale") value = Number(toScale(finalPct, cm.scale).toFixed(cm.scale.decimals));
      else value = vw ? vsum / vw : null;
    }
    return {
      id: m.id, name: m.full_name || m.email, email: m.email, cells, missing,
      finalPct: finalPct == null ? null : Math.round(finalPct),
      final: value == null ? null : { value, display: formatValue(cm, value), passed: cm.kind === "scale" ? value >= cm.scale.pass : null },
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { columns, rows, model: cm, final, explain: explainFinal(cm, columns), scaleLike };
}

// The rule in one sentence, with the weights actually in use (kinds without activities drop out).
export function explainFinal(rawModel, columns = null) {
  const m = normalizeModel(rawModel);
  const f = m.final;
  const present = columns ? new Set(columns.map((c) => c.kind)) : new Set(FINAL_KINDS.map((k) => k.id));
  const parts = FINAL_KINDS.filter((k) => present.has(k.id) && f.weights[k.id] > 0);
  const total = parts.reduce((n, k) => n + f.weights[k.id], 0);
  const mix = parts.length ? parts.map((k) => `${k.label.toLowerCase()} ${Math.round((f.weights[k.id] / total) * 100)} %`).join(", ") : "sin actividades que cuenten";
  const to = m.kind === "scale" ? `y se convierte a la escala ${fmt(m.scale.min)}–${fmt(m.scale.max)} (aprueba con ${fmt(m.scale.pass, m.scale.decimals)}, es decir ${m.scale.passPct} % de aciertos)`
    : m.kind === "percent" ? "y se muestra como porcentaje"
      : "y la nota es el promedio ponderado de las notas de cada actividad";
  return `Nota final = promedio de aciertos por tipo de actividad (${mix}) ${to}. ${f.missing === "zero" ? "Lo no entregado en actividades cerradas cuenta como 0." : "Lo no entregado no cuenta."} Las actividades abiertas aún no cuentan en contra.`;
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// For Excel or Sheets: one row per student, one column per activity, then the final note. sep "," (CSV) or "\t" (paste).
export function gradebookTable(book, sep = ",") {
  const head = ["Estudiante", "Correo", ...book.columns.map((c) => c.title), "Aciertos ponderados (%)", "Nota final", "Sin entregar"];
  const lines = book.rows.map((r) => [r.name, r.email, ...book.columns.map((c) => (r.cells[c.id].done ? r.cells[c.id].display : r.cells[c.id].display)), r.finalPct ?? "", r.final?.display ?? "", r.missing]
    .map((v) => (sep === "," ? csvCell(v) : String(v ?? "").replace(/\t|\n/g, " "))).join(sep));
  return [head.map((v) => (sep === "," ? csvCell(v) : v)).join(sep), ...lines].join("\n");
}
