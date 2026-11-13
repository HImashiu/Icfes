// Prints questions by id for writing explanations, with the key basis and whether they fit the public set:
//   node scripts/seo-bank/show.mjs ICFES-2019-1_1ra-78 ...   (JSON=1: entries to merge into solved.json)
import { loadPastBooklet, fitsPublic, keyBasis, plain } from "./common.mjs";
import { PAST_EXAMS } from "../build-seo-exams.mjs";

const dataDir = process.env.ICFES_DATA_DIR || "/mnt/project-files/icfes/data";
const rows = [];
for (const id of process.argv.slice(2)) {
  const m = /^(.*)-(\d+)$/.exec(id);
  const b = loadPastBooklet(dataDir, m[1]);
  const q = b?.exam.questions.find((x) => x.number === Number(m[2]));
  if (!q) { console.error(`${id}: not found`); continue; }
  const kb = keyBasis(dataDir, b, q);
  const ex = PAST_EXAMS.find((x) => x.booklets.includes(b.name));
  const ok = fitsPublic(dataDir, b, q);
  rows.push({ id, exam: ex?.slug, areaName: q.section, key: kb?.key, basis: kb?.basis, origin: kb?.origin ?? null, group: q.group_id ? `${b.name}-${q.group_id}` : null, ok });
  if (process.env.JSON) continue;
  const g = q.group_id ? b.groups.get(q.group_id) : null;
  console.log(`\n### ${id} | ${ex?.slug} | ${q.section} | key ${kb?.key} (${kb?.basis}${kb?.origin ? ` = ${kb.origin}` : ""})${g ? ` | group ${g.id}` : ""}${ok ? "" : " | DOES NOT FIT PUBLIC SET"}`);
  if (g) console.log(`PASSAGE: ${plain(g.directions ?? "")} :: ${plain(g.passage_md)}`);
  if (q.stimulus_md && plain(q.stimulus_md) !== plain(q.stem_md)) console.log(`STIM: ${plain(q.stimulus_md)}`);
  console.log(`STEM: ${plain(q.stem_md)}`);
  for (const o of q.options) console.log(`  ${o.letter}) ${plain(o.text_md)}`);
}
if (process.env.JSON) console.log(JSON.stringify(rows, null, 1));
