// Questions written by teachers, shaped like exam questions so the same screens draw and grade them.
// They live in their own table; an assignment or live room made of them uses the slug "teacher" and the question ids as keys.
export const TEACHER_SLUG = "teacher";
export const TEACHER_ENTRY = { slug: TEACHER_SLUG, title: "Mis preguntas y las de mi colegio", status: "ready", sections: [], hasKey: true, teacher: true };
export const TEACHER_AREAS = ["Matemáticas", "Lectura crítica", "Sociales y ciudadanas", "Ciencias naturales", "Inglés", "Otra"];
const LETTERS = ["A", "B", "C", "D"];

// Row from teacher_questions -> question the app draws. `number` is the position in the list shown.
export function rowToQuestion(row, number) {
  const j = row.question_json ?? {};
  return {
    key: row.id,
    number,
    section: row.area || "Otra",
    part: null,
    item_type: "standard",
    group_id: null,
    group: null,
    stimulus_md: j.stimulus_md ?? "",
    stem_md: j.stem_md ?? "",
    expected_options: 4,
    options: (j.options ?? []).map((o) => ({ letter: o.letter, text_md: o.text_md ?? "", marked_in_scan: false })),
    traced: j.traced ?? [],
    sourceLine: "Pregunta de tu docente",
  };
}

// The pseudo-exam for a list of rows. With `order` (assignment keys) the teacher's order is kept.
export function teacherExam(rows, order = null) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list = order ? order.map((id) => byId.get(id)).filter(Boolean) : rows;
  const questions = list.map((r, i) => rowToQuestion(r, i + 1));
  const names = [...new Set(questions.map((q) => q.section))];
  const sections = names.map((name) => ({ name, expected: null, questions: questions.filter((q) => q.section === name) }));
  const enrich = {};
  list.forEach((r, i) => {
    enrich[String(i + 1)] = { competencia: r.competencia ?? null, tema: r.tema ?? null, dificultad: r.dificultad ?? null, explicacion: r.explanation ?? null, hidden: !r.explanation };
  });
  return {
    slug: TEACHER_SLUG,
    exam: { title: "Preguntas del docente", docId: null, warnings: [], sections, questions },
    key: new Map(list.map((r) => [r.id, r.answer])),
    keyStatus: "teacher",
    notes: null,
    enrich,
    enrichMeta: { note: "Escrito por el docente", estimated: false },
    figures: new Map(),
  };
}

export const emptyDraft = () => ({
  area: "Matemáticas", competencia: "", tema: "", dificultad: "", visibility: "private",
  stimulus: "", stem: "", options: ["", "", "", ""], answer: "", explanation: "", image: null,
});

export function draftFromRow(row) {
  const j = row.question_json ?? {};
  return {
    id: row.id, area: row.area || "Otra", competencia: row.competencia ?? "", tema: row.tema ?? "", dificultad: row.dificultad ? String(row.dificultad) : "",
    visibility: row.visibility, stimulus: j.stimulus_md ?? "", stem: j.stem_md ?? "",
    options: LETTERS.map((l) => (j.options ?? []).find((o) => o.letter === l)?.text_md ?? ""),
    answer: row.answer, explanation: row.explanation ?? "", image: j.traced?.[0]?.url ?? null,
  };
}

// Problems that keep a question from being used; empty when it is ready.
export function validateDraft(d) {
  const out = [];
  if (!d.stem.trim()) out.push("Escribe el enunciado.");
  d.options.forEach((o, i) => { if (!o.trim()) out.push(`Falta la opción ${LETTERS[i]}.`); });
  const filled = d.options.map((o) => o.trim().toLowerCase()).filter(Boolean);
  if (new Set(filled).size !== filled.length) out.push("Hay opciones repetidas.");
  if (!d.answer) out.push("Marca cuál es la respuesta correcta.");
  return out;
}

export function draftToRow(d, { schoolId, ownerId }) {
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
      options: d.options.map((text, i) => ({ letter: LETTERS[i], text_md: text.trim() })),
      traced: d.image ? [{ figure_id: "img1", url: d.image }] : [],
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
