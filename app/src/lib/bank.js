// The question bank as a teacher browses it: flat items with their tags, filters, automatic picking and ordering.
// Pure functions. Question content stays in the exam files; an assignment only stores question keys.

const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const DIFFICULTY_LABEL = { 1: "Muy fácil", 2: "Fácil", 3: "Media", 4: "Difícil", 5: "Muy difícil" };

// enrich: { "<number>": { competencia, componente, tema, dificultad, nivel_desempeno } } or null.
// key: Map number -> letter or null. notes: Map number -> { confidence } or null.
export function bankItems(exam, { enrich, key, notes } = {}) {
  const groupSize = new Map();
  for (const q of exam.questions) if (q.group) groupSize.set(q.group.id, (groupSize.get(q.group.id) ?? 0) + 1);
  return exam.questions.map((q) => {
    const e = enrich?.[String(q.number)] ?? null;
    const stem = plain(q.stem_md) || plain(q.stimulus_md) || plain(q.group?.stimulus_md);
    return {
      key: q.key,
      number: q.number,
      section: q.section,
      groupId: q.group?.id ?? null,
      groupSize: q.group ? groupSize.get(q.group.id) : 1,
      competencia: e?.competencia ?? null,
      componente: e?.componente ?? null,
      tema: e?.tema ?? null,
      dificultad: e?.dificultad ?? null,
      nivel: e?.nivel_desempeno ?? null,
      hasKey: Boolean(key?.get(q.key)),
      keyDoubt: notes?.get(q.key)?.confidence === "low" || e?.hidden === true,
      text: `${stem} ${plain(q.group?.stimulus_md)} ${e?.tema ?? ""} ${e?.competencia ?? ""}`.toLowerCase(),
      preview: stem.length > 140 ? `${stem.slice(0, 140)}…` : stem,
      question: q,
    };
  });
}

export const EMPTY_FILTER = { areas: [], competencias: [], componentes: [], difficulty: [], text: "", onlyKeyed: false, onlyTagged: false };

export function filterItems(items, f) {
  const text = f.text.trim().toLowerCase();
  return items.filter((it) => {
    if (f.areas.length && !f.areas.includes(it.section)) return false;
    if (f.competencias.length && !f.competencias.includes(it.competencia)) return false;
    if (f.componentes.length && !f.componentes.includes(it.componente)) return false;
    if (f.difficulty.length && !f.difficulty.includes(it.dificultad)) return false;
    if (f.onlyKeyed && !it.hasKey) return false;
    if (f.onlyTagged && !it.competencia) return false;
    if (text && !it.text.includes(text)) return false;
    return true;
  });
}

// Counts per value for one field, among items that match every OTHER filter, so the chips show what is left.
export function facet(items, field, filter, filterField) {
  const base = filterItems(items, { ...filter, [filterField]: [] });
  const counts = new Map();
  for (const it of base) {
    const v = it[field];
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (typeof a[0] === "number" ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]), "es")));
}

// `count` keys spread over the candidates. With balance, each area gets an equal share (a short set covers every area).
// Inside a pool the picks are evenly spaced, so the result is repeatable and not clustered.
export function autoPick(items, count, { balance = true } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n || items.length === 0) return [];
  if (n >= items.length) return items.map((i) => i.key);
  const spread = (pool, k) => {
    if (k >= pool.length) return pool;
    const step = pool.length / k;
    return Array.from({ length: k }, (_, i) => pool[Math.floor(i * step)]);
  };
  if (!balance) return spread(items, n).map((i) => i.key);
  const pools = new Map();
  for (const it of items) pools.set(it.section, [...(pools.get(it.section) ?? []), it]);
  const areas = [...pools.keys()];
  const share = new Map(areas.map((a) => [a, 0]));
  let left = n;
  // Hand out one at a time, round-robin, to areas that still have room.
  while (left > 0) {
    let moved = false;
    for (const a of areas) {
      if (left > 0 && share.get(a) < pools.get(a).length) {
        share.set(a, share.get(a) + 1);
        left -= 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return areas.flatMap((a) => spread(pools.get(a), share.get(a))).map((i) => i.key);
}

// Questions of one reading text only make sense together. Adds the missing members of every group touched.
export function withGroupMates(keys, items) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const groups = new Set(keys.map((k) => byKey.get(k)?.groupId).filter(Boolean));
  const out = [...keys];
  for (const it of items) if (it.groupId && groups.has(it.groupId) && !out.includes(it.key)) out.push(it.key);
  return out;
}

export function moveKey(keys, index, dir) {
  const j = index + dir;
  if (index < 0 || j < 0 || j >= keys.length) return keys;
  const next = keys.slice();
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export const sortByBooklet = (keys, items) => {
  const order = new Map(items.map((i, idx) => [i.key, idx]));
  return keys.slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
};

// Totals for the "Tu asignación" panel. The time is a practice estimate (about 1.3 min per question), not an ICFES figure.
export function summarize(keys, items) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const chosen = keys.map((k) => byKey.get(k)).filter(Boolean);
  const areas = new Map();
  for (const it of chosen) areas.set(it.section, (areas.get(it.section) ?? 0) + 1);
  const diffs = chosen.map((i) => i.dificultad).filter((d) => d != null);
  return {
    total: chosen.length,
    areas: [...areas.entries()].map(([name, n]) => ({ name, n })),
    avgDifficulty: diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : null,
    minutes: Math.round(chosen.length * 1.3),
    noKey: chosen.filter((i) => !i.hasKey).length,
    doubt: chosen.filter((i) => i.keyDoubt).length,
  };
}
