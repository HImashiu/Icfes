// The public question set behind the solved-question pages (scripts/seo-bank/solved.json) stays well-formed.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fitsPublic, keyBasis, loadPastBooklet, PUBLIC_CAP } from "../scripts/seo-bank/common.mjs";

const file = JSON.parse(readFileSync(join(__dirname, "..", "scripts", "seo-bank", "solved.json"), "utf8"));
const entries = Object.entries(file.questions);
const dataDir = process.env.ICFES_DATA_DIR || "/mnt/project-files/icfes/data";

describe("solved.json", () => {
  it("has every field a page needs, and short unique titles and slugs", () => {
    const slugs = new Set();
    const titles = new Set();
    for (const [id, s] of entries) {
      expect(id).toMatch(/^ICFES-[A-Za-z0-9_-]+-\d+$/);
      for (const k of ["exam", "areaName", "key", "basis", "batch", "titulo", "slug", "tema", "competencia", "corta"]) expect(s[k], `${id}.${k}`).toBeTruthy();
      expect(Array.isArray(s.expl) && s.expl.length >= 2, id).toBe(true);
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(`${s.titulo} | Cóndor`.length, id).toBeLessThanOrEqual(60);
      expect(slugs.has(`${s.areaName}/${s.slug}`), s.slug).toBe(false);
      expect(titles.has(s.titulo), s.titulo).toBe(false);
      slugs.add(`${s.areaName}/${s.slug}`);
      titles.add(s.titulo);
      expect(file.rejected[id], id).toBeUndefined();
    }
    expect(entries.length).toBeLessThanOrEqual(PUBLIC_CAP);
  });

  it.skipIf(!existsSync(dataDir))("matches the bank: question still public and same key", () => {
    for (const [id, s] of entries) {
      const m = /^(.*)-(\d+)$/.exec(id);
      const b = loadPastBooklet(dataDir, m[1]);
      const q = b.exam.questions.find((x) => x.number === Number(m[2]));
      expect(fitsPublic(dataDir, b, q), id).toBe(true);
      expect(keyBasis(dataDir, b, q).key, id).toBe(s.key);
    }
  });
});
