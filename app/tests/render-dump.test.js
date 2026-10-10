// Renders every shown question of the ready exams through the app's renderer and writes the
// result to RENDER_DUMP, for the quality checks in icfes/quality/tools. Skipped in normal runs.
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRich, plainText } from "../src/lib/render.js";

const exams = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "exams");

it.skipIf(!process.env.RENDER_DUMP)("dumps rendered question text", () => {
  const index = JSON.parse(readFileSync(join(exams, "index.json"), "utf8"));
  const out = {};
  for (const entry of index.exams.filter((e) => e.status === "ready")) {
    const exam = JSON.parse(readFileSync(join(exams, `${entry.slug}.json`), "utf8"));
    const groups = new Map((exam.groups ?? []).map((g) => [g.id, g]));
    out[entry.slug] = exam.questions.map((q) => {
      const g = groups.get(q.group_id);
      const fields = {
        stem: renderRich(q.stem_md),
        stim: renderRich(q.stimulus_md),
        grp: renderRich(g?.stimulus_md),
        dir: plainText(g?.directions),
      };
      for (const o of q.options ?? []) fields[`opt${o.letter}`] = renderRich(o.text_md);
      return { n: q.number, fields };
    });
  }
  writeFileSync(process.env.RENDER_DUMP, JSON.stringify(out));
});
