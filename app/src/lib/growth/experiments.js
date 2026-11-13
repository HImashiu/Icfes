// A/B experiments in the app (F3). Same bucketing as the site (site/growth.js bucket()): FNV-1a of
// "visitor:experiment" mod 100 against the weights, so a visitor keeps one variant on the site and in the app.
// The list comes from active_experiments() (migration 0050); stopped experiments return their winner.
import { supabase } from "../supabase.js";
import { visitorId } from "../usage.js";
import { track } from "./events.js";

export function bucketOf(visitor, key) {
  let h = 2166136261;
  const s = `${visitor}:${key}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100;
}

export function pickVariant(exp, visitor, forced = null) {
  const vs = exp?.variants ?? [];
  if (!vs.length) return null;
  if (!exp.running) return exp.winner || vs[0];
  if (forced && vs.includes(forced)) return forced;
  const ws = Array.isArray(exp.weights) && exp.weights.length === vs.length ? exp.weights : vs.map(() => 100 / vs.length);
  const b = bucketOf(visitor, exp.key);
  let acc = 0;
  for (let i = 0; i < vs.length; i++) { acc += ws[i]; if (b < acc) return vs[i]; }
  return vs[vs.length - 1];
}

let list = null;
export async function loadExperiments() {
  if (list) return list;
  if (!supabase) return (list = []);
  try {
    const { data } = await supabase.rpc("active_experiments");
    list = Array.isArray(data) ? data : [];
  } catch { list = []; }
  return list;
}

const exposed = new Set();
// The variant this visitor sees for `key` (null when the experiment doesn't exist). Records the exposure once.
export async function variant(key) {
  const exps = await loadExperiments();
  const exp = exps.find((e) => e.key === key);
  if (!exp) return null;
  let forced = null;
  try { forced = new URLSearchParams(window.location.search).get(`exp_${key}`); } catch { /* none */ }
  const v = pickVariant(exp, visitorId() ?? "x", forced);
  if (exp.running && !exposed.has(key)) { exposed.add(key); track("exp:expose", { k: key, v }); }
  return v;
}
