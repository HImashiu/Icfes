// Per-student views built from delivered attempts: summaries, early-warning alerts, reinforcement plans and the
// projected school category. Pure functions; the thresholds and rules are visible constants so they can be tuned.
import { areaAverages, bandFor, mean, round } from "./analytics.js";

const DAY = 864e5;
const ts = (a) => new Date(a.submitted_at).getTime();
const pctOf = (a) => (a.score?.total ? (a.score.correct / a.score.total) * 100 : null);

// members: student course_members; attempts: delivered attempts with score (profile_id, submitted_at, mode).
export function studentSummaries(members, attempts) {
  const byProfile = new Map();
  const who = (a) => a.profile_id ?? a.member_id;
  for (const a of attempts) if (a.submitted_at && a.score?.keyed) byProfile.set(who(a), [...(byProfile.get(who(a)) ?? []), a]);
  const seen = new Set();
  const out = [];
  for (const m of members) {
    if (m.role !== "student") continue;
    const key = m.profile_id ?? m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = [...new Set([...(m.profile_id ? byProfile.get(m.profile_id) ?? [] : []), ...(byProfile.get(m.id) ?? [])])].sort((x, y) => ts(x) - ts(y));
    const pcts = list.map(pctOf).filter((p) => p != null);
    const timed = list.filter((a) => a.mode !== "practice");
    const lastTimed = timed[timed.length - 1];
    out.push({
      profileId: m.profile_id, email: m.email, name: m.full_name || m.email, courseId: m.course_id, joined: Boolean(m.profile_id) || list.length > 0,
      attempts: list, count: list.length,
      avg: round(mean(pcts)), last: pcts.length ? round(pcts[pcts.length - 1]) : null,
      lastAt: list.length ? ts(list[list.length - 1]) : null,
      band: lastTimed ? bandFor(lastTimed.score.perArea) : null,
      areas: areaAverages(list),
    });
  }
  return out;
}

export const ALERT_RULES = { dropPoints: 15, inactiveDays: 14, lowAvg: 35, minForTrend: 3 };

const ACTION = {
  drop: "Hablar con el estudiante esta semana y asignarle un refuerzo en su área más baja.",
  inactive: "Escribirle o avisar al director de curso: no ha entregado trabajo reciente.",
  never: "Confirmar que pudo ingresar con su correo del colegio.",
  low: "Asignarle un refuerzo personal y revisar si necesita acompañamiento.",
};

// Weekly list of students to look at, most urgent first. `assignmentsOpen`: whether the course had work to deliver.
export function alerts(summaries, { now = Date.now(), rules = ALERT_RULES } = {}) {
  const out = [];
  for (const s of summaries) {
    const weak = s.areas[0];
    const area = weak ? `${weak.name} (${weak.pct} %)` : null;
    if (!s.joined) { out.push({ ...s, kind: "never", severity: 1, reason: "Aún no ha ingresado a la plataforma.", action: ACTION.never }); continue; }
    if (s.count === 0) { out.push({ ...s, kind: "inactive", severity: 2, reason: "Ingresó pero no ha entregado nada.", action: ACTION.inactive }); continue; }
    if (s.lastAt != null && now - s.lastAt > rules.inactiveDays * DAY) {
      out.push({ ...s, kind: "inactive", severity: 3, reason: `Sin entregar hace ${Math.floor((now - s.lastAt) / DAY)} días.`, action: ACTION.inactive, area });
      continue;
    }
    if (s.count >= rules.minForTrend) {
      const before = mean(s.attempts.slice(0, -1).map(pctOf).filter((p) => p != null));
      if (before != null && s.last != null && before - s.last >= rules.dropPoints) {
        out.push({ ...s, kind: "drop", severity: 5, reason: `Bajó ${Math.round(before - s.last)} puntos frente a su promedio anterior.`, action: ACTION.drop, area });
        continue;
      }
    }
    if (s.count >= 2 && s.avg != null && s.avg < rules.lowAvg) {
      out.push({ ...s, kind: "low", severity: 4, reason: `Promedio bajo: ${s.avg} % de aciertos.`, action: ACTION.low, area });
    }
  }
  return out.sort((a, b) => b.severity - a.severity || (a.avg ?? 0) - (b.avg ?? 0));
}

// ---------------------------------------------------------------- reinforcement plan
// items: bankItems of one booklet (needs competencia tags); key: Map; attempts: that student's delivered attempts on the
// booklet WITH answers. The set is the questions they missed in their weakest competencies, filled with unseen ones there.
export function reinforcementSet(items, key, attempts, { size = 15 } = {}) {
  const tag = new Map(items.map((i) => [i.key, i.competencia]));
  const seen = new Set();
  const missed = new Set();
  const stats = new Map();
  for (const a of attempts) {
    for (const [qk, given] of Object.entries(a.answers ?? {})) {
      const right = key?.get(qk);
      if (!given || !right) continue;
      seen.add(qk);
      const c = tag.get(qk);
      if (!c) continue;
      const cur = stats.get(c) ?? { c, n: 0, ok: 0 };
      cur.n += 1;
      if (given === right) cur.ok += 1; else missed.add(qk);
      stats.set(c, cur);
    }
  }
  const weakest = [...stats.values()].filter((s) => s.n >= 3).sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 2).map((s) => s.c);
  if (weakest.length === 0) return { keys: [], competencias: [] };
  const inWeak = items.filter((i) => weakest.includes(i.competencia) && i.hasKey);
  const retry = inWeak.filter((i) => missed.has(i.key)).slice(0, Math.ceil(size / 2));
  const fresh = inWeak.filter((i) => !seen.has(i.key));
  const rest = inWeak.filter((i) => seen.has(i.key) && !missed.has(i.key));
  const keys = [...retry, ...fresh, ...rest].map((i) => i.key).filter((k, i, all) => all.indexOf(k) === i).slice(0, size);
  return { keys, competencias: weakest };
}

// ---------------------------------------------------------------- school category (projection)
// PLACEHOLDER thresholds on the 0-500 global mean. ICFES publishes the real cut-offs each year: verify and replace.
export const CATEGORY_VERSION = "ejemplo-2026";
export const CATEGORIES = [
  { id: "A+", min: 330 },
  { id: "A", min: 300 },
  { id: "B", min: 270 },
  { id: "C", min: 240 },
  { id: "D", min: 0 },
];
export function schoolCategory(meanBand) {
  if (meanBand == null) return null;
  const i = CATEGORIES.findIndex((c) => meanBand >= c.min);
  const here = CATEGORIES[i];
  const up = i > 0 ? CATEGORIES[i - 1] : null;
  return { id: here.id, toNext: up ? Math.ceil(up.min - meanBand) : 0, next: up?.id ?? null };
}

// Latest full timed exam per student, then the mean band. `students` are summaries (their .band is the latest timed).
export function cohortProjection(summaries) {
  const bands = summaries.map((s) => s.band?.global).filter((g) => g != null);
  const m = round(mean(bands));
  return { n: bands.length, mean: m, category: schoolCategory(m) };
}
