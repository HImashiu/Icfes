// Word definitions a teacher writes for an assignment. Terms are matched as whole words, ignoring case and accents.
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// [{ term, def }] without blanks or duplicates, longest term first so "calentamiento global" wins over "global".
export function cleanGlossary(list) {
  const seen = new Set();
  const out = [];
  for (const g of list ?? []) {
    const term = String(g?.term ?? "").trim();
    const def = String(g?.def ?? "").trim();
    if (!term || !def || seen.has(fold(term))) continue;
    seen.add(fold(term));
    out.push({ term, def });
  }
  return out.sort((a, b) => b.term.length - a.term.length);
}

// Folding removes marks one-for-one for precomposed letters, so offsets in the folded text hold in the original.
// Returns [{ start, end, def }] non-overlapping matches in `text`.
export function findTerms(text, glossary) {
  if (!glossary?.length || !text) return [];
  const hay = fold(text);
  const found = [];
  for (const g of glossary) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(fold(g.term))}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of hay.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (!found.some((f) => start < f.end && end > f.start)) found.push({ start, end, def: g.def, term: g.term });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
