// Shared rules for the public question set (SEO plan: at most 550 questions, only from exams the ICFES published,
// only keys checked twice). Used by build-seo-bank.mjs and by pick.mjs, the tool that proposes questions to explain.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PUBLIC_CAP = 550;
export const PICTURE = /<img\b|\[\[?\s*figura|!\[|<svg\b/i;
// A stem that talks about a drawing, chart or map needs that picture, which the static pages cannot show.
export const NEEDS_PICTURE = /\b(gr[aá]fic[oa]s?|figuras?|imagen(es)?|dibujos?|mapas?|diagramas?|esquemas?|ilustraci[oó]n|fotograf[ií]a|plano cartesiano|caricatura|historieta|infograf[ií]a|muestra[n]? a continuaci[oó]n|siguientes? (reacci[oó]n|ecuaci[oó]n qu[ií]mica))\b/i;
export const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const AREA_SLUG = { "Matemáticas": "matematicas", "Lectura crítica": "lectura-critica", "Sociales y ciudadanas": "sociales-y-ciudadanas", "Ciencias naturales": "ciencias-naturales", "Inglés": "ingles" };
export const AREA_ORDER = Object.keys(AREA_SLUG);
export const sessionOf = (name) => (/_1ra$/.test(name) ? "Sesión 1" : /_2da$/.test(name) ? "Sesión 2" : "Cuadernillo único");

const cache = new Map();
const readJson = (f) => { if (!cache.has(f)) cache.set(f, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null); return cache.get(f); };

// A past-exam booklet (ICFES-*): golden text, key and the key's notes.
export function loadPastBooklet(dataDir, name) {
  const keysDir = join(dirname(dataDir), "answer-keys");
  const exam = readJson(join(dataDir, `${name}.golden.json`));
  const key = readJson(join(keysDir, `${name}.key.json`));
  if (!exam || !key) return null;
  const side = readJson(join(keysDir, `${name}.sidecar.json`))?.answers ?? {};
  return { name, exam, answers: key.answers ?? {}, side, groups: new Map((exam.groups ?? []).map((g) => [g.id, g])) };
}

// Where a past-exam item was copied from in the S11 bank ("text copied from S11-L_1ra q27 …"), if anywhere.
export function originOf(q) {
  for (const n of q.provenance?.notes ?? []) {
    const m = /copied from (S11-[A-Z0-9]+_(?:1ra|2da)) q(\d+)/i.exec(n);
    if (m) return { name: m[1], number: Number(m[2]) };
  }
  return null;
}

// How sure the key is:
//   "oficial"  the booklet came with the ICFES key;
//   "punto"    the same item in an S11 booklet carries the printed blue dot and it agrees with Claude's solve;
//   "resuelta" only Claude's solve (no key published): shown as a preliminary key, and a second solve must agree.
export function keyBasis(dataDir, b, q) {
  const key = b.answers[String(q.number)];
  const s = b.side[String(q.number)];
  if (!key || !s || s.confidence !== "high" || (s.answer && s.answer !== key)) return null;
  if (/oficial/i.test(String(s.reason ?? ""))) return { key, basis: "oficial" };
  const o = originOf(q);
  if (o) {
    const keysDir = join(dirname(dataDir), "answer-keys");
    const ok = readJson(join(keysDir, `${o.name}.key.json`))?.answers?.[String(o.number)];
    const os = readJson(join(keysDir, `${o.name}.sidecar.json`))?.questions?.[String(o.number)];
    if (ok === key && os && ["blue_dot", "dot_hand"].includes(os.status) && ["dot", "dot+solve", "dot_hand"].includes(os.confidence)) return { key, basis: "punto", origin: `${o.name}-${o.number}` };
    if (ok && ok !== key) return null; // the bank's dot and Claude's solve disagree: not public
  }
  return { key, basis: "resuelta" };
}

// A question the static pages can show whole: text only, all options written, a key we trust.
export function fitsPublic(dataDir, b, q) {
  if (!q.ready || q.provenance?.trusted === false || q.figure || q.item_type === "open") return false;
  if (!Array.isArray(q.options) || q.options.length < 3 || q.options.some((o) => !String(o.text_md ?? "").trim() || o.figure)) return false;
  if (!String(q.stem_md ?? "").trim()) return false;
  // "Teniendo en cuenta la información anterior…" with nothing before it: the context lives in a picture or another item.
  if (!q.group_id && !plain(q.stimulus_md) && /\banterior(es)?\b|\bla tabla\b|\bel texto\b|\bambas fuentes\b|\bla gr[aá]fica\b|\bel gr[aá]fico\b|\bla imagen\b/i.test(plain(q.stem_md))) return false;
  const g = q.group_id ? b.groups.get(q.group_id) : null;
  const text = [g?.passage_md, q.stimulus_md, q.stem_md, ...q.options.map((o) => o.text_md)].join(" ");
  if (PICTURE.test(text) || NEEDS_PICTURE.test(text)) return false;
  if (g && (String(g.passage_md ?? "").length > 4200 || g.figure)) return false;
  if (!g && (String(q.stimulus_md ?? "") + q.stem_md).length > 1400) return false;
  return Boolean(keyBasis(dataDir, b, q));
}

export const idOf = (b, q) => `${b.name}-${q.number}`;
