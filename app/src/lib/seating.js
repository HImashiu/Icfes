// Seating plans for paper tests: booklet versions (the question order shuffled) and a room layout in which no two
// students who touch each other (sides, front/back or diagonal) get the same version. Pure, so it is tested without a browser.
export const MIN_VERSIONS = 4;
export const MAX_VERSIONS = 6;
export const versionLabel = (v) => String.fromCharCode(65 + v);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, rand) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const seatId = (r, c) => `${r},${c}`;

// Version 0 is the original order. Any other version shuffles the units inside each area; a unit is a shared text with
// all its questions (kept together and in order) or a single question. Areas stay in their order.
export function orderForVersion(questions, version, orderSeed) {
  if (!version) return questions;
  const rand = rng(orderSeed * 31 + version);
  const sections = [];
  for (const q of questions) {
    if (!sections.length || sections.at(-1).name !== q.section) sections.push({ name: q.section, units: [] });
    const units = sections.at(-1).units;
    const last = units.at(-1);
    if (q.group?.id && last?.group === q.group.id) last.items.push(q);
    else units.push({ group: q.group?.id ?? null, items: [q] });
  }
  return sections.flatMap((s) => shuffled(s.units, rand).flatMap((u) => u.items));
}

export const neighbours = (r, c) => {
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if (dr || dc) out.push([r + dr, c + dc]);
  return out;
};

// seats: every usable seat id. With 4 versions the classic 2x2 tiling is the only safe pattern; with more, a random greedy fill
// always has a free version because a seat has at most 4 neighbours already filled.
function assignVersions(rows, cols, blocked, versions, rand) {
  const out = {};
  if (versions === MIN_VERSIONS) {
    const perm = shuffled([0, 1, 2, 3], rand);
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) if (!blocked.has(seatId(r, c))) out[seatId(r, c)] = perm[(r % 2) * 2 + (c % 2)];
    return out;
  }
  const used = new Array(versions).fill(0);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (blocked.has(seatId(r, c))) continue;
    const taken = new Set(neighbours(r, c).map(([a, b]) => out[seatId(a, b)]));
    const free = shuffled([...Array(versions).keys()].filter((v) => !taken.has(v)), rand).sort((a, b) => used[a] - used[b]);
    out[seatId(r, c)] = free[0];
    used[free[0]] += 1;
  }
  return out;
}

const tooClose = (a, b) => {
  const [r1, c1] = a.split(",").map(Number);
  const [r2, c2] = b.split(",").map(Number);
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) <= 1;
};
export function apartViolations(plan) {
  const seatOf = Object.fromEntries(Object.entries(plan.seats).map(([s, id]) => [id, s]));
  return (plan.apart ?? []).filter(([a, b]) => seatOf[a] && seatOf[b] && tooClose(seatOf[a], seatOf[b]));
}

// Builds a plan: students go to random seats (empty seats where there are fewer students than seats), and pairs that must be apart
// are separated by swapping students who share a version, which keeps every version rule intact.
export function generatePlan({ rows, cols, blocked = [], versions = MIN_VERSIONS, studentIds, apart = [], seed = newSeed(), orderSeed = newSeed() }) {
  const block = new Set(blocked);
  const seatCount = rows * cols - [...block].filter((s) => { const [r, c] = s.split(",").map(Number); return r < rows && c < cols; }).length;
  if (studentIds.length > seatCount) throw new Error(`Hay ${studentIds.length} estudiantes y solo ${seatCount} puestos.`);
  const rand = rng(seed);
  const seatVersion = assignVersions(rows, cols, block, versions, rand);
  const seatIds = Object.keys(seatVersion);
  // Spread the empty seats through the room by dropping random seats rather than the last ones.
  const used = shuffled(seatIds, rand).slice(0, studentIds.length);
  let people = shuffled(studentIds, rand);
  const base = { rows, cols, blocked: [...block], versions, seed, orderSeed, apart, seatVersion };
  const build = (list) => ({ ...base, seats: Object.fromEntries(used.map((s, i) => [s, list[i]])) });
  let plan = build(people);
  for (let tries = 0; tries < 400 && apartViolations(plan).length; tries += 1) {
    const [a] = apartViolations(plan)[0];
    const seatOf = Object.fromEntries(Object.entries(plan.seats).map(([s, id]) => [id, s]));
    const mine = seatOf[a];
    const candidates = used.filter((s) => s !== mine && seatVersion[s] === seatVersion[mine]);
    if (!candidates.length) break;
    const other = candidates[Math.floor(rand() * candidates.length)];
    const next = { ...plan.seats, [mine]: plan.seats[other], [other]: a };
    plan = { ...plan, seats: next };
  }
  return plan;
}

// Checks the rule the whole feature is about. Returns the pairs of seats that touch and share a version.
export function sameVersionNeighbours(plan) {
  const bad = [];
  for (const s of Object.keys(plan.seats)) {
    const [r, c] = s.split(",").map(Number);
    for (const [a, b] of neighbours(r, c)) {
      const t = seatId(a, b);
      if (s < t && plan.seats[t] && plan.seatVersion[t] === plan.seatVersion[s]) bad.push([s, t]);
    }
  }
  return bad;
}

export const versionOfMember = (plan, memberId) => {
  const seat = Object.keys(plan.seats).find((s) => plan.seats[s] === memberId);
  return seat ? plan.seatVersion[seat] : null;
};
export const seatOfMember = (plan, memberId) => Object.keys(plan.seats).find((s) => plan.seats[s] === memberId) ?? null;
// How many students got each version (the copies to print).
export function versionCounts(plan) {
  const counts = new Array(plan.versions).fill(0);
  for (const s of Object.keys(plan.seats)) counts[plan.seatVersion[s]] += 1;
  return counts;
}
// Students in the plan who are no longer on the roster, or roster students without a seat: the plan is out of date.
export function planMatches(plan, studentIds) {
  const ids = new Set(Object.values(plan.seats));
  return studentIds.length === ids.size && studentIds.every((id) => ids.has(id));
}

const KEY = (assignmentId) => `condor:seating:${assignmentId}`;
export function loadLocalPlan(assignmentId) {
  try { return JSON.parse(window.localStorage.getItem(KEY(assignmentId)) ?? "null"); } catch { return null; }
}
export function saveLocalPlan(assignmentId, plan) {
  try { window.localStorage.setItem(KEY(assignmentId), JSON.stringify(plan)); } catch { /* the plan then lasts only for this visit */ }
}
