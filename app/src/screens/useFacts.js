import { useEffect, useState } from "react";
import { buildFacts } from "../lib/chartBuilder.js";

// Every answer of the teacher's activities as facts (area, topic, time, result…), with the booklets they need.
// Loads only while `on`; returns null until ready.
export function useFacts({ api, assignments, courses, fetchExam, ws = null, on = true }) {
  const [facts, setFacts] = useState(null);
  useEffect(() => {
    if (!on || !fetchExam) return undefined;
    let alive = true;
    (async () => {
      const [attempts, members] = await Promise.all([api.chartAttempts ? api.chartAttempts() : api.reportAttempts(), api.allMembers()]);
      const mine = assignments.filter((a) => a.status !== "draft");
      const slugs = [...new Set(mine.map((a) => a.exam_slug))];
      const keysOf = (slug) => [...new Set(mine.filter((a) => a.exam_slug === slug).flatMap((a) => a.question_keys ?? []))];
      const bundles = new Map();
      for (const s of slugs) { try { bundles.set(s, await fetchExam(s, s === "teacher" ? keysOf(s) : null)); } catch { /* booklet missing: its answers are left out */ } }
      if (alive) setFacts(buildFacts({ attempts, assignments: mine, members, courses, bundles, ws }));
    })().catch(() => alive && setFacts([]));
    return () => { alive = false; };
  }, [api, assignments, courses, fetchExam, ws, on]);
  return facts;
}
