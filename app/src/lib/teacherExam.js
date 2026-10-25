// Questions written by teachers, shaped like exam questions so the same screens draw and grade them.
// They live in their own table; an assignment or live room made of them uses the slug "teacher" and the question ids as keys.
export const TEACHER_SLUG = "teacher";
export const TEACHER_ENTRY = { slug: TEACHER_SLUG, title: "Mis preguntas y las de mi colegio", status: "ready", sections: [], hasKey: true, teacher: true };
export const TEACHER_AREAS = ["Matemáticas", "Lectura crítica", "Sociales y ciudadanas", "Ciencias naturales", "Inglés", "Otra"];
const LETTERS = ["A", "B", "C", "D"];

// Row from teacher_questions -> question the app draws. `number` is the position in the list shown.
// A question that shares its text with others carries `group` ({ id, stimulus_md, traced }); teacherExam numbers it.
export function rowToQuestion(row, number) {
  const j = row.question_json ?? {};
  return {
    key: row.id,
    number,
    section: row.area || "Otra",
    part: null,
    item_type: "standard",
    group_id: j.group?.id ?? null,
    group: j.group ? { id: j.group.id, stimulus_md: j.group.stimulus_md ?? "", traced: j.group.traced ?? [], directions: null, from: number, to: number } : null,
    stimulus_md: j.stimulus_md ?? "",
    stem_md: j.stem_md ?? "",
    expected_options: 4,
    options: (j.options ?? []).map((o) => ({ letter: o.letter, text_md: o.text_md ?? "", marked_in_scan: false, ...(o.traced?.url ? { traced: o.traced } : {}) })),
    traced: j.traced ?? [],
    sourceLine: "Pregunta de tu docente",
  };
}

// The pseudo-exam for a list of rows. With `order` (assignment keys) the teacher's order is kept.
export function teacherExam(rows, order = null) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list = order ? order.map((id) => byId.get(id)).filter(Boolean) : rows;
  const questions = list.map((r, i) => rowToQuestion(r, i + 1));
  // Questions that share a text are numbered "from–to" by the run they form in this list.
  for (const q of questions) {
    if (!q.group) continue;
    const same = questions.filter((o) => o.group?.id === q.group.id).map((o) => o.number);
    q.group = { ...q.group, from: Math.min(...same), to: Math.max(...same) };
  }
  const names = [...new Set(questions.map((q) => q.section))];
  const sections = names.map((name) => ({ name, expected: null, questions: questions.filter((q) => q.section === name) }));
  const enrich = {};
  list.forEach((r, i) => {
    // The teacher's hint and the feedback for each wrong option travel like the bank's AI analysis (pista, distractores).
    const j = r.question_json ?? {};
    const feedback = Object.fromEntries(Object.entries(j.feedback ?? {}).filter(([, t]) => String(t ?? "").trim()));
    enrich[String(i + 1)] = {
      competencia: r.competencia ?? null, tema: r.tema ?? null, dificultad: r.dificultad ?? null, explicacion: r.explanation ?? null,
      pista: j.hint?.trim() || null, distractores: Object.keys(feedback).length ? feedback : null,
      hidden: !(r.explanation || j.hint?.trim() || Object.keys(feedback).length),
    };
  });
  return {
    slug: TEACHER_SLUG,
    exam: { title: "Preguntas del docente", docId: null, warnings: [], sections, questions },
    key: new Map(list.map((r) => [r.id, r.answer])),
    keyStatus: "teacher",
    notes: null,
    enrich,
    enrichMeta: { note: "Escrito por el docente", estimated: false, teacher: true },
    figures: new Map(),
  };
}

// A question being written. Figures are crops or photos kept inside the question ({ id, url }); `optionImages`
// holds an image per option (or null). Questions of one group share `groupId`, `groupText` and `groupFigures`.
export const emptyDraft = (over = {}) => ({
  area: "Matemáticas", competencia: "", tema: "", dificultad: "", visibility: "private",
  stimulus: "", stem: "", options: ["", "", "", ""], optionImages: [null, null, null, null], answer: "", explanation: "", hint: "", feedback: ["", "", "", ""],
  figures: [], groupId: null, groupText: "", groupFigures: [], source: null, ...over,
});

export function draftFromRow(row) {
  const j = row.question_json ?? {};
  const opt = (l) => (j.options ?? []).find((o) => o.letter === l);
  return emptyDraft({
    id: row.id, area: row.area || "Otra", competencia: row.competencia ?? "", tema: row.tema ?? "", dificultad: row.dificultad ? String(row.dificultad) : "",
    visibility: row.visibility, stimulus: j.stimulus_md ?? "", stem: j.stem_md ?? "",
    options: LETTERS.map((l) => opt(l)?.text_md ?? ""),
    optionImages: LETTERS.map((l) => opt(l)?.traced?.url ?? null),
    answer: row.answer, explanation: row.explanation ?? "", hint: j.hint ?? "", feedback: LETTERS.map((l) => j.feedback?.[l] ?? ""),
    figures: (j.traced ?? []).map((t) => ({ id: t.figure_id, url: t.url })),
    groupId: j.group?.id ?? null, groupText: j.group?.stimulus_md ?? "", groupFigures: (j.group?.traced ?? []).map((t) => ({ id: t.figure_id, url: t.url })),
    source: j.source ?? null,
  });
}

// The row may hold up to 800 KB (a database check); a little room is left for the rest of the row.
export const QUESTION_BYTES = 760000;

// Problems that keep a question from being used; empty when it is ready.
export function validateDraft(d) {
  const out = [];
  if (!d.stem.trim() && !(d.groupId && d.groupText.trim())) out.push("Escribe el enunciado.");
  const images = d.optionImages ?? [];
  d.options.forEach((o, i) => { if (!o.trim() && !images[i]) out.push(`Falta la opción ${LETTERS[i]}.`); });
  const filled = d.options.map((o) => o.trim().toLowerCase()).filter(Boolean);
  if (new Set(filled).size !== filled.length) out.push("Hay opciones repetidas.");
  if (!d.answer) out.push("Marca cuál es la respuesta correcta.");
  if (out.length === 0 && JSON.stringify(draftToRow(d, {}).question_json).length > QUESTION_BYTES) {
    out.push("La pregunta pesa demasiado: quita alguna imagen o recórtala más pequeña.");
  }
  return out;
}

const traced = (figs) => (figs ?? []).map((f) => ({ figure_id: f.id, url: f.url }));
const placed = (text, id) => text.includes(`[[figura:${id}]]`);

export function draftToRow(d, { schoolId, ownerId }) {
  const images = d.optionImages ?? [];
  // A figure of the shared text that is not placed in it goes at its end, so every question of the group shows it.
  const groupText = d.groupId
    ? [d.groupText.trim(), ...(d.groupFigures ?? []).filter((f) => !placed(d.groupText, f.id)).map((f) => `[[figura:${f.id}]]`)].filter(Boolean).join("\n\n")
    : "";
  return {
    school_id: schoolId,
    owner_id: ownerId,
    visibility: d.visibility,
    area: d.area === "Otra" ? "" : d.area,
    competencia: d.competencia.trim() || null,
    tema: d.tema.trim() || null,
    dificultad: d.dificultad ? Number(d.dificultad) : null,
    question_json: {
      stimulus_md: d.stimulus.trim(),
      stem_md: d.stem.trim(),
      options: d.options.map((text, i) => ({ letter: LETTERS[i], text_md: text.trim(), ...(images[i] ? { traced: { figure_id: `opt-${LETTERS[i]}`, url: images[i] } } : {}) })),
      traced: traced(d.figures ?? (d.image ? [{ id: "img1", url: d.image }] : [])),
      ...(d.groupId ? { group: { id: d.groupId, stimulus_md: groupText, traced: traced(d.groupFigures) } } : {}),
      ...(d.source ? { source: d.source } : {}),
      ...(d.hint?.trim() ? { hint: d.hint.trim() } : {}),
      ...((d.feedback ?? []).some((t) => t.trim()) ? { feedback: Object.fromEntries(LETTERS.map((l, i) => [l, (d.feedback[i] ?? "").trim()]).filter(([, t]) => t)) } : {}),
    },
    answer: d.answer,
    explanation: d.explanation.trim() || null,
  };
}

// A photo is shrunk and re-encoded so it stays small enough to live in the question row (about 100-250 KB).
export async function shrinkImage(file, maxSide = 1000, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
