// Loads the booklets the demo school works on and builds the in-memory school. Only reads files the app already serves.
import { parseExam, parseKey } from "../lib/exam.js";
import { linkFigures, parseFigureSpecs, prepareExam } from "../lib/figures.js";
import { buildDemo } from "./seed.js";
import { createDemoClient } from "./client.js";

const base = import.meta.env.BASE_URL;
const getJson = async (path) => {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
};

export async function loadDemo() {
  const index = (await getJson("exams/index.json")).exams ?? [];
  const ready = index.filter((e) => e.status !== "proximamente" && e.hasKey).slice(0, 2);
  const bundles = new Map();
  for (const entry of ready) {
    const [raw, rawKey, rawFigures, rawEnrich] = await Promise.all([
      getJson(`exams/${entry.slug}.json`), getJson(`exams/${entry.slug}.key.json`),
      entry.hasFigures ? getJson(`exams/${entry.slug}.figures.json`) : null,
      entry.hasEnrich ? getJson(`exams/${entry.slug}.enrich.json`) : null,
    ]);
    const parsed = parseExam(raw);
    const figures = linkFigures(parsed, parseFigureSpecs(rawFigures), rawFigures);
    bundles.set(entry.slug, { exam: prepareExam(parsed, figures), key: parseKey(rawKey), enrich: rawEnrich?.questions ?? null });
  }
  const { profile, tables } = buildDemo({ bundles });
  return { client: createDemoClient({ tables, profile }), profile };
}
