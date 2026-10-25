// Analysis behind the results screens: score spread, what each question tells about the group, plain-language
// findings, and lists grouped by class (11 A, 11 B…). Pure functions: no network, no React.
import { mean } from "./analytics.js";

const sortNum = (xs) => [...xs].sort((a, b) => a - b);
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Spread of a list of numbers: n, mean, median, sd, min, max and quartiles.
export function scoreStats(values) {
  const xs = sortNum(values.filter((v) => v != null && Number.isFinite(v)));
  if (!xs.length) return { n: 0, mean: null, median: null, sd: null, min: null, max: null, q1: null, q3: null };
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((n, v) => n + (v - m) ** 2, 0) / xs.length);
  return { n: xs.length, mean: m, median: quantile(xs, 0.5), sd, min: xs[0], max: xs[xs.length - 1], q1: quantile(xs, 0.25), q3: quantile(xs, 0.75) };
}

// How hard a question was for the group, in words a teacher reads at a glance.
export const DIFFICULTY = [
  { id: "hard", label: "Difícil", max: 40, tone: "bad" },
  { id: "mid", label: "Media", max: 70, tone: "mid" },
  { id: "easy", label: "Fácil", max: 101, tone: "ok" },
];
export const difficultyOf = (pct) => (pct == null ? null : DIFFICULTY.find((d) => pct < d.max));

// Discrimination: share right among the top 27 % of the group minus the share right among the bottom 27 %
// (ranked by their total). Near 0 or negative = the question does not separate who masters the topic from who does not.
export function discrimination(questionKey, keyed, rows) {
  const scored = rows.filter((r) => r.answers && r.pct != null && r.answers[questionKey]);
  if (!keyed || scored.length < 8) return null;
  const sorted = [...scored].sort((a, b) => a.pct - b.pct);
  const k = Math.max(2, Math.round(sorted.length * 0.27));
  const share = (list) => list.filter((r) => r.answers[questionKey] === keyed).length / list.length;
  return Math.round((share(sorted.slice(-k)) - share(sorted.slice(0, k))) * 100) / 100;
}
export function discriminationLabel(d) {
  if (d == null) return { label: "Sin datos suficientes", tone: "mid", text: "Hacen falta al menos 8 entregas para saber si la pregunta separa a quienes dominan el tema." };
  if (d >= 0.3) return { label: "Separa bien", tone: "ok", text: "Quienes van mejor en la actividad la aciertan mucho más que quienes van peor: mide bien el tema." };
  if (d >= 0.15) return { label: "Separa un poco", tone: "mid", text: "Hay algo de diferencia entre quienes van mejor y peor." };
  if (d >= 0) return { label: "No separa", tone: "mid", text: "Les fue parecido a todos: puede ser muy fácil, muy difícil o confusa." };
  return { label: "Separa al revés", tone: "bad", text: "Quienes van mejor la fallan más que quienes van peor: revisa la clave (es preliminar) o el enunciado." };
}

// Everything the per-question view needs for one question across the group.
// item: an itemStats row; rows: progress rows ({ id, name, answers, pct, done }).
export function questionDetail(item, rows) {
  const done = rows.filter((r) => r.done);
  const who = {};
  const blank = [];
  for (const r of done) {
    const given = r.answers?.[item.key];
    if (!given) { blank.push(r.name); continue; }
    (who[given] ??= []).push(r.name);
  }
  for (const l of Object.keys(who)) who[l].sort((a, b) => a.localeCompare(b, "es"));
  const d = discrimination(item.key, item.keyed, done);
  const top = item.topWrong && item.dist[item.topWrong] ? item.topWrong : null;
  const topShare = top && item.answered ? Math.round((item.dist[top] / item.answered) * 100) : 0;
  const reading = [];
  if (item.pct != null) reading.push(`${item.pct} % del grupo la acertó (${item.dist[item.keyed] ?? 0} de ${item.answered}).`);
  if (top && topShare >= 25) reading.push(`La opción ${top} atrajo al ${topShare} %: es la confusión más común, vale la pena explicarla en clase.`);
  if (item.suspect) reading.push("La mayoría eligió otra opción distinta a la clave: revisa la clave, que es preliminar.");
  if (blank.length) reading.push(`${blank.length} ${blank.length === 1 ? "estudiante la dejó" : "estudiantes la dejaron"} en blanco.`);
  return { ...item, who, blank, disc: d, discInfo: discriminationLabel(d), difficulty: difficultyOf(item.pct), topShare, reading };
}

// Short findings for the top of an activity's results, most useful first. rows: graded progress rows.
export function activityFindings({ rows, items, areas, stats, passLabel }) {
  const out = [];
  const done = rows.filter((r) => r.done);
  const pending = rows.length - done.length;
  if (!done.length) return out;
  const hard = items.filter((i) => i.pct != null && i.pct < 40);
  if (areas.length > 1) {
    const lo = areas[0];
    const hi = areas[areas.length - 1];
    if (hi.pct - lo.pct >= 10) out.push({ tone: "bad", text: `El área más baja fue ${lo.name} (${lo.pct} %), ${hi.pct - lo.pct} puntos por debajo de ${hi.name}.` });
  }
  if (hard.length) out.push({ tone: "bad", text: `${hard.length} ${hard.length === 1 ? "pregunta la acertó" : "preguntas las acertó"} menos del 40 % del grupo. Ábrelas en «Preguntas» para ver qué opción los confundió.` });
  const suspect = items.filter((i) => i.suspect);
  if (suspect.length) out.push({ tone: "mid", text: `En ${suspect.length} ${suspect.length === 1 ? "pregunta" : "preguntas"} la mayoría eligió otra opción: revisa la clave (preliminar) de la N.° ${suspect.slice(0, 4).map((i) => i.number).join(", ")}.` });
  if (stats.sd != null && stats.n >= 6) {
    const spreadPts = stats.q3 - stats.q1;
    if (spreadPts >= 30) out.push({ tone: "mid", text: `El grupo está muy disperso: la mitad central va de ${Math.round(stats.q1)} % a ${Math.round(stats.q3)} % de aciertos. Conviene trabajar por niveles.` });
    else if (spreadPts <= 12) out.push({ tone: "ok", text: `El grupo es parejo: la mitad central va de ${Math.round(stats.q1)} % a ${Math.round(stats.q3)} % de aciertos.` });
  }
  const low = done.filter((r) => r.pct != null && r.pct < 40).length;
  if (low) out.push({ tone: "bad", text: `${low} ${low === 1 ? "estudiante quedó" : "estudiantes quedaron"} por debajo del 40 % de aciertos.${passLabel ? ` ${passLabel}` : ""}` });
  else if (passLabel) out.push({ tone: "ok", text: passLabel });
  if (pending) out.push({ tone: "mid", text: `Faltan ${pending} ${pending === 1 ? "entrega" : "entregas"}: los números pueden cambiar.` });
  return out.slice(0, 5);
}

// Rows grouped by their class group (11 A, 11 B…), each group with its own count and average. groupName(row) -> label.
export function groupRows(rows, groupName) {
  const map = new Map();
  for (const r of rows) {
    const g = groupName(r) || "Sin grupo";
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(r);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }))
    .map(([name, list]) => {
      const pcts = list.map((r) => r.pct ?? r.avgPct).filter((p) => p != null);
      return { name, rows: list, n: list.length, done: list.filter((r) => r.done || r.doneCount > 0 || (r.done ?? 0) > 0).length, avg: pcts.length ? Math.round(mean(pcts)) : null };
    });
}
