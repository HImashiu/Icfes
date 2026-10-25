// Depth for Resultados › Resumen, computed from every answer (the chart builder's facts). Pure functions.
// Thin samples never become findings: every cell carries its n, and cells under a minimum are left empty.
const pct = (c, n) => (n ? Math.round((c / n) * 1000) / 10 : null);
const AREA_ORDER = ["Lectura crítica", "Matemáticas", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"];
const byArea = (a, b) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b, "es");

function tally(facts, keyOf) {
  const m = new Map();
  for (const f of facts) {
    if (f.correct == null) continue;
    const k = keyOf(f);
    if (k == null || k === "") continue;
    const cur = m.get(k) ?? { n: 0, c: 0 };
    cur.n += 1;
    if (f.correct) cur.c += 1;
    m.set(k, cur);
  }
  return m;
}

// Course (11 A…) × area share right. { rows: [course], cols: [area], cell(r, c) -> { pct, n } | null }.
export function courseAreaGrid(facts, { minN = 20 } = {}) {
  const t = tally(facts, (f) => `${f.course || f.space}\u0000${f.area}`);
  const rows = [...new Set(facts.map((f) => f.course || f.space))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const cols = [...new Set(facts.map((f) => f.area))].filter(Boolean).sort(byArea);
  return { rows, cols, cell: (r, c) => { const x = t.get(`${r}\u0000${c}`); return x && x.n >= minN ? { pct: pct(x.c, x.n), n: x.n } : x ? { pct: null, n: x.n } : null; } };
}

// Share right per week and area, the last `weeks` weeks with answers.
export function weeklyByArea(facts, { weeks = 10, minN = 15 } = {}) {
  const all = [...new Set(facts.map((f) => f.week))].filter(Boolean).sort().slice(-weeks);
  const keep = new Set(all);
  const t = tally(facts.filter((f) => keep.has(f.week)), (f) => `${f.week}\u0000${f.area}`);
  const areas = [...new Set(facts.map((f) => f.area))].filter(Boolean).sort(byArea);
  return {
    labels: all,
    series: areas.map((a) => ({ name: a, values: all.map((w) => { const x = t.get(`${w}\u0000${a}`); return x && x.n >= minN ? pct(x.c, x.n) : null; }) })).filter((s) => s.values.some((v) => v != null)),
  };
}

// Topics (or competencias) where the group does worst, with enough answers to trust it.
export function weakest(facts, dim = "tema", { minN = 15, limit = 8 } = {}) {
  const t = tally(facts, (f) => (f[dim] && f[dim] !== "Sin etiquetar" ? f[dim] : null));
  return [...t.entries()].filter(([, x]) => x.n >= minN).map(([name, x]) => ({ name, pct: pct(x.c, x.n), n: x.n }))
    .sort((a, b) => a.pct - b.pct).slice(0, limit);
}

// Time against correctness: share right per time bucket, and answers that look rushed (under 15 s and wrong).
export function timeVsAccuracy(facts, buckets) {
  const timed = facts.filter((f) => f.sec != null && f.correct != null);
  const t = tally(timed, (f) => f.timeBucket);
  const rushed = timed.filter((f) => f.sec < 15);
  return {
    n: timed.length,
    buckets: buckets.map((b) => ({ name: b, pct: t.get(b) ? pct(t.get(b).c, t.get(b).n) : null, n: t.get(b)?.n ?? 0 })),
    rushedShare: timed.length ? pct(rushed.length, timed.length) : null,
    rushedWrong: rushed.length ? pct(rushed.filter((f) => !f.correct).length, rushed.length) : null,
    rushedStudents: new Set(rushed.filter((f) => !f.correct).map((f) => f.studentId)).size,
  };
}

// How hard the questions were across every activity: how many hard / medium / easy, and the hardest ones.
export function questionDifficulty(facts, { minN = 10, limit = 6 } = {}) {
  const t = tally(facts, (f) => `${f.assignment}\u0000${f.qkey}`);
  const meta = new Map(facts.map((f) => [`${f.assignment}\u0000${f.qkey}`, f]));
  const items = [...t.entries()].filter(([, x]) => x.n >= minN).map(([k, x]) => ({ key: k, pct: pct(x.c, x.n), n: x.n, assignment: meta.get(k).assignment, area: meta.get(k).area, tema: meta.get(k).tema, qkey: meta.get(k).qkey }));
  return {
    total: items.length,
    hard: items.filter((i) => i.pct < 40).length,
    mid: items.filter((i) => i.pct >= 40 && i.pct < 70).length,
    easy: items.filter((i) => i.pct >= 70).length,
    hardest: [...items].sort((a, b) => a.pct - b.pct).slice(0, limit),
  };
}

// Plain-language findings for the top of Resumen, most actionable first.
export function summaryFindings({ grid, weekly, topics, time, diff }) {
  const out = [];
  // Biggest gap between courses in one area (courses compared on an area, never students against students).
  let gap = null;
  for (const c of grid.cols) {
    const vals = grid.rows.map((r) => ({ r, x: grid.cell(r, c) })).filter((v) => v.x?.pct != null);
    if (vals.length < 2) continue;
    vals.sort((a, b) => a.x.pct - b.x.pct);
    const d = vals[vals.length - 1].x.pct - vals[0].x.pct;
    if (!gap || d > gap.d) gap = { d, area: c, lo: vals[0], hi: vals[vals.length - 1] };
  }
  if (gap && gap.d >= 10) out.push({ tone: "mid", text: `En ${gap.area}, ${gap.lo.r} va ${Math.round(gap.d)} puntos por debajo de ${gap.hi.r} (${Math.round(gap.lo.x.pct)} % frente a ${Math.round(gap.hi.x.pct)} %).` });
  for (const s of weekly.series) {
    const v = s.values.filter((x) => x != null);
    if (v.length >= 3) {
      const d = v[v.length - 1] - v[0];
      if (Math.abs(d) >= 8) out.push({ tone: d > 0 ? "ok" : "bad", text: `${s.name} ${d > 0 ? "sube" : "baja"} ${Math.abs(Math.round(d))} puntos desde la primera semana con datos (${Math.round(v[0])} % → ${Math.round(v[v.length - 1])} %).` });
    }
  }
  if (topics[0]) out.push({ tone: "bad", text: `El tema más bajo es «${topics[0].name}» (${Math.round(topics[0].pct)} % en ${topics[0].n} respuestas). Buen candidato para un refuerzo.` });
  if (time.rushedShare != null && time.rushedShare >= 10) out.push({ tone: "mid", text: `${Math.round(time.rushedShare)} % de las respuestas se dieron en menos de 15 segundos y ${Math.round(time.rushedWrong)} % de ellas fueron incorrectas: ${time.rushedStudents} estudiantes parecen responder al azar.` });
  if (diff.total && diff.hard / diff.total >= 0.25) out.push({ tone: "mid", text: `${diff.hard} de ${diff.total} preguntas usadas las acierta menos del 40 %: el material puede estar por encima del nivel actual.` });
  return out.slice(0, 5);
}
