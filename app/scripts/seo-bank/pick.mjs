// Proposes the questions for the next batch of solved-question pages and prints them for writing explanations:
//   node scripts/seo-bank/pick.mjs [perPage=2] > worklist.md
// Per past exam and area: questions with the strongest key first (official, then blue dot), standalone before reading
// groups (except Lectura crítica and Inglés), never the samples the exam page already shows, never one already in
// solved.json, at most one question per reading text.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PAST_EXAMS, pickSamples, pickGroup } from "../build-seo-exams.mjs";
import { loadPastBooklet, fitsPublic, keyBasis, idOf, plain, AREA_ORDER, PICTURE, NEEDS_PICTURE, originOf } from "./common.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.ICFES_DATA_DIR || "/mnt/project-files/icfes/data";
const per = Number(process.argv[2] ?? 2);
const file = JSON.parse(readFileSync(join(here, "solved.json"), "utf8"));
const solved = file.questions;
const taken = new Set([...Object.keys(solved), ...Object.keys(file.rejected)]);
const takenOrigins = new Set(Object.values(solved).map((s) => s.origin).filter(Boolean));
const ctx = { PICTURE, NEEDS_PICTURE };
// The same item can appear in several exams with no "copied from" note (Inglés): compare the words.
const norm = (t) => plain(t).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, " ").trim();
const sig = (b, q) => { const st = norm(q.stem_md); return st.length > 40 ? st.slice(0, 45) : `${st}|${norm(q.options[0]?.text_md).slice(0, 30)}`; };
const seenSig = new Set();
const solvedSigs = new Set();
for (const id of Object.keys(solved)) {
  const m = /^(.*)-(\d+)$/.exec(id);
  const b = loadPastBooklet(dataDir, m[1]);
  const q = b?.exam.questions.find((x) => x.number === Number(m[2]));
  if (q) solvedSigs.add(sig(b, q));
}
// MATCH=<regex> [AREA=<area>]: only questions whose text matches (for topic pages), up to perPage per exam and area.
const MATCH = process.env.MATCH ? new RegExp(process.env.MATCH, "i") : null;
const textOf = (b, q) => plain([q.group_id ? b.groups.get(q.group_id)?.passage_md : "", q.stimulus_md, q.stem_md, ...q.options.map((o) => o.text_md)].filter(Boolean).join(" "));
const rank = { oficial: 0, punto: 1, resuelta: 2 };
const out = [];
for (const ex of PAST_EXAMS.filter((x) => process.env.ALL || !["icfes-2015-2018", "icfes-2021-lectura-critica"].includes(x.slug))) {
  const booklets = ex.booklets.map((n) => loadPastBooklet(dataDir, n)).filter(Boolean);
  const samples = new Set();
  const areas = new Set(booklets.flatMap((b) => b.exam.questions.map((q) => q.section)));
  const onlyReading = areas.size === 1;
  for (const it of onlyReading ? pickGroup(ctx, booklets[0]) : pickSamples(ctx, booklets, 6)) samples.add(idOf(it.b, it.q));
  for (const area of AREO(areas)) {
    if (process.env.AREA && area !== process.env.AREA) continue;
    const reading = area === "Lectura crítica" || area === "Inglés";
    const have = MATCH ? 0 : Object.values(solved).filter((s) => s.exam === ex.slug && s.areaName === area).length;
    const cands = [];
    for (const b of booklets) for (const q of b.exam.questions) {
      if (q.section !== area || samples.has(idOf(b, q)) || taken.has(idOf(b, q)) || !fitsPublic(dataDir, b, q)) continue;
      const kb = keyBasis(dataDir, b, q);
      if (MATCH && !MATCH.test(textOf(b, q))) continue;
      if (kb.origin && takenOrigins.has(kb.origin)) continue;
      if (solvedSigs.has(sig(b, q))) continue;
      cands.push({ b, q, kb, score: rank[kb.basis] * 10 + (q.group_id && !reading ? 5 : 0) });
    }
    cands.sort((x, y) => x.score - y.score || x.q.number - y.q.number);
    const pick = [];
    const groupsUsed = new Set(Object.values(solved).filter((s) => s.group).map((s) => s.group));
    // spread through the list: every third good candidate
    for (let i = 0; pick.length < per - have && i < cands.length * 3; i++) {
      const c = cands[(i * 3) % cands.length];
      if (!c || pick.includes(c) || seenSig.has(sig(c.b, c.q))) continue;
      const gk = c.q.group_id ? `${c.b.name}-${c.q.group_id}` : null;
      if (gk && groupsUsed.has(gk)) continue;
      if (gk) groupsUsed.add(gk);
      pick.push(c);
      seenSig.add(sig(c.b, c.q));
    }
    for (const c of pick) out.push({ ex, area, ...c });
  }
}
function AREO(set) { return AREA_ORDER.filter((a) => set.has(a)); }

// JSON=1: the same proposal as data, to merge with the explanations into solved.json.
if (process.env.JSON) {
  console.log(JSON.stringify(out.map(({ ex, area, b, q, kb }) => ({ id: idOf(b, q), exam: ex.slug, areaName: area, key: kb.key, basis: kb.basis, origin: kb.origin ?? null,
    group: q.group_id ? `${b.name}-${q.group_id}` : null, sig: sig(b, q) })), null, 1));
  process.exit(0);
}
for (const { ex, area, b, q, kb } of out) {
  const g = q.group_id ? b.groups.get(q.group_id) : null;
  console.log(`\n### ${idOf(b, q)} | ${ex.slug} | ${area} | key ${kb.key} (${kb.basis}${kb.origin ? ` = ${kb.origin}` : ""})${g ? ` | group ${g.id}` : ""}`);
  if (g) console.log(`PASSAGE: ${plain(g.directions ?? "")} :: ${plain(g.passage_md)}`);
  if (q.stimulus_md && plain(q.stimulus_md) !== plain(q.stem_md)) console.log(`STIM: ${plain(q.stimulus_md)}`);
  console.log(`STEM: ${plain(q.stem_md)}`);
  for (const o of q.options) console.log(`  ${o.letter}) ${plain(o.text_md)}`);
}
console.error(`${out.length} questions proposed`);
