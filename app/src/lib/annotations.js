// A student's highlights and sticky notes. Each item belongs to a text block of a question (`ann`, an id such as
// "q:12:stem" or "g:3:stimulus") and stores where it sits as character offsets plus the text itself, so it can be found
// again if the block changes a little. An item with no `ann` is a note on the whole question (`qkey`).
// Kept per student in this browser; with an account it is also saved to the backend (see api.js).

export const COLORS = ["lime", "amber", "pink", "blue"];
export const COLOR_LABEL = { lime: "Verde", amber: "Amarillo", pink: "Rosa", blue: "Azul" };

const storeKey = (owner, slug) => `condor:ann:${owner || "local"}:${slug}`;

export function loadLocal(owner, slug) {
  try {
    const list = JSON.parse(window.localStorage.getItem(storeKey(owner, slug)) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export function saveLocal(owner, slug, items) {
  try { window.localStorage.setItem(storeKey(owner, slug), JSON.stringify(items)); } catch { /* storage unavailable */ }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Two copies of the same student's items (this browser and the backend): the newest version of each item wins,
// and an item deleted on one side stays deleted (it is kept as a tombstone with `gone`).
export function mergeItems(a, b) {
  const byId = new Map();
  for (const it of [...a, ...b]) {
    const prev = byId.get(it.id);
    if (!prev || (it.at ?? 0) >= (prev.at ?? 0)) byId.set(it.id, it);
  }
  return [...byId.values()];
}
export const visible = (items) => items.filter((i) => !i.gone);

// Where the item sits now: its stored offsets if they still hold the same text, else the first place the text appears.
export function locate(text, item) {
  if (text.slice(item.start, item.end) === item.text) return [item.start, item.end];
  const at = text.indexOf(item.text);
  return at >= 0 ? [at, at + item.text.length] : null;
}

// Plain-text offsets of a range inside `el` (the same text a walk over its text nodes gives).
export function offsetsIn(el, range) {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const whole = el.textContent.length;
  const end = Math.min(whole, start + range.toString().length);
  return [start, end];
}

// A DOM range for offsets inside `el`.
export function rangeAt(el, start, end) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let setStart = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.data.length;
    if (!setStart && start < pos + len) { range.setStart(n, start - pos); setStart = true; }
    if (setStart && end <= pos + len) { range.setEnd(n, end - pos); return range; }
    pos += len;
  }
  return null;
}
