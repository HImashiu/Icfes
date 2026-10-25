// Only first tries count. A student can redo the same questions (or look the answers up) as often as they like in
// practice, so any score built from their history would grow just from repeating. Every result that spans more
// than one activity (simulacro scores, the analysis by area) uses only attempts whose questions were new to them.
// A repeat still shows its own result, labelled as a repeat.

// Share of an attempt's questions already answered before for it to count as a repeat.
export const REPEAT_SHARE = 0.2;

const keysOf = (h) => [...(h.right ?? []), ...(h.missed ?? [])].map(String);
const slugOf = (h) => h.snapshot?.slug ?? h.slug ?? "";

// history rows (any order) -> Map row -> { first: bool, seenShare: 0..1 }. Rows without their question lists
// (older ones) are a repeat when the same booklet, scope and question set was done before.
export function firstTries(history = []) {
  const seen = new Set();
  const sigs = new Set();
  const out = new Map();
  for (const h of [...history].sort((a, b) => a.at - b.at)) {
    const slug = slugOf(h);
    const keys = keysOf(h);
    const sig = `${slug}|${h.snapshot?.scope ?? ""}|${(h.snapshot?.keys ?? []).join(",")}`;
    const share = keys.length ? keys.filter((k) => seen.has(`${slug}|${k}`)).length / keys.length : slug && sigs.has(sig) ? 1 : 0;
    keys.forEach((k) => seen.add(`${slug}|${k}`));
    sigs.add(sig);
    out.set(h, { first: share <= REPEAT_SHARE, seenShare: share });
  }
  return out;
}

// The rows that count: first tries only.
export function onlyFirstTries(history = []) {
  const map = firstTries(history);
  return history.filter((h) => map.get(h)?.first !== false);
}

// For one attempt against the stored history: the share of its questions answered in an earlier attempt.
// keys: the attempt's graded question keys; before: when the attempt started.
export function seenBefore(history = [], slug, keys = [], before = Infinity) {
  if (!keys.length) return 0;
  const seen = new Set();
  for (const h of history) if (h.at < before && slugOf(h) === slug) keysOf(h).forEach((k) => seen.add(k));
  return keys.filter((k) => seen.has(String(k))).length / keys.length;
}
