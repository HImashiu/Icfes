// A school's own version of a bank question. The shared bank is never touched: the exam is loaded as usual and these
// rows are laid over it for the people of that school. Pure functions, no network.
import { draftFromRow, draftToRow } from "./teacherExam.js";

// The bundle `fetchExam` builds, with each overridden question replaced (stem, text, options, images, key, explanation).
export function applyOverrides(bundle, rows) {
  if (!bundle || !rows?.length) return bundle;
  const byKey = new Map(rows.map((r) => [r.qkey, r]));
  const key = new Map(bundle.key ?? []);
  const enrich = bundle.enrich ? { ...bundle.enrich } : null;
  const questions = bundle.exam.questions.map((q) => {
    const row = byKey.get(q.key);
    if (!row) return q;
    const j = row.question_json ?? {};
    if (row.answer) key.set(q.key, row.answer);
    if (enrich) {
      const original = bundle.key?.get(q.key);
      const changedKey = row.answer && original && row.answer !== original;
      // The AI explanation was written for the original question: keep it only while the text and the key still match.
      enrich[q.key] = { ...(enrich[q.key] ?? {}), explicacion: row.explanation ?? null, hidden: !row.explanation };
      if (!changedKey && !row.explanation) enrich[q.key].hidden = true;
    }
    return {
      ...q,
      stimulus_md: j.stimulus_md ?? q.stimulus_md,
      stem_md: j.stem_md ?? q.stem_md,
      options: (j.options ?? []).map((o) => ({ letter: o.letter, text_md: o.text_md ?? "", marked_in_scan: false, ...(o.traced?.url ? { traced: o.traced } : {}) })),
      traced: [...(q.traced ?? []), ...(j.traced ?? [])],
      ...(j.group ? { group: { ...(q.group ?? {}), ...j.group, from: q.group?.from, to: q.group?.to } } : {}),
      adapted: true,
    };
  });
  const byNumber = new Map(questions.map((q) => [q.key, q]));
  const sections = bundle.exam.sections.map((s) => ({ ...s, questions: s.questions.map((q) => byNumber.get(q.key) ?? q) }));
  return { ...bundle, key, enrich, exam: { ...bundle.exam, questions, sections } };
}

// What the builder opens for a bank question: the question as this school sees it now.
export function draftFromBank(q, answer, row = null) {
  const j = row?.question_json;
  return draftFromRow({
    id: row?.id,
    area: q.section,
    visibility: "school",
    answer: row?.answer ?? answer ?? "",
    explanation: row?.explanation ?? null,
    question_json: {
      stimulus_md: j?.stimulus_md ?? q.stimulus_md ?? "",
      stem_md: j?.stem_md ?? q.stem_md ?? "",
      options: (j?.options ?? q.options ?? []).map((o) => ({ letter: o.letter, text_md: o.text_md ?? "", ...(o.traced?.url ? { traced: o.traced } : {}) })),
      traced: j?.traced ?? [],
    },
  });
}

// The row to store for an edited draft.
export function overrideRow(draft, { schoolId, userId, slug, qkey }) {
  const row = draftToRow(draft, { schoolId, ownerId: userId });
  return { school_id: schoolId, exam_slug: slug, qkey, question_json: row.question_json, answer: row.answer, explanation: row.explanation, edited_by: userId };
}
