// Teaching lessons: an ordered run of bank questions and text slides that a teacher presents, prints, plays live
// or turns into an assignment. Pure helpers, no network and no React. A lesson stores question keys only;
// the questions themselves stay in the exam files. All the questions of one lesson come from one booklet.

export const DEFAULT_SETTINGS = { hideOptions: false, seconds: 60, titleSlide: true };

export const cleanSettings = (s) => {
  const seconds = Number(s?.seconds);
  return {
    hideOptions: s?.hideOptions === true,
    seconds: Number.isFinite(seconds) && seconds >= 10 && seconds <= 600 ? Math.round(seconds) : DEFAULT_SETTINGS.seconds,
    titleSlide: s?.titleSlide !== false,
  };
};

// Items as stored: { type: "q", key } or { type: "text", title, body }. Anything else is dropped.
export function cleanItems(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.type === "q" && (typeof it.key === "string" || typeof it.key === "number")) out.push({ type: "q", key: String(it.key) });
    else if (it?.type === "text") {
      const title = String(it.title ?? "").trim();
      const body = String(it.body ?? "").trim();
      if (title || body) out.push({ type: "text", title, body });
    }
  }
  return out;
}

export const questionKeys = (items) => cleanItems(items).filter((i) => i.type === "q").map((i) => i.key);
export const questionItems = (keys) => keys.map((key) => ({ type: "q", key: String(key) }));

// Adds keys that are not in the lesson yet, at the end.
export function appendKeys(items, keys) {
  const have = new Set(questionKeys(items));
  return [...items, ...questionItems(keys.filter((k) => !have.has(String(k))))];
}

// Plain text of a text slide -> blocks: paragraphs and bullet lists ("- " or "• " at the start of a line).
export function bodyBlocks(body) {
  const blocks = [];
  for (const raw of String(body ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else blocks.push({ type: "p", text: line });
  }
  return blocks;
}

// What the presenter may show about a question's explanation. Only a question whose key is settled gets one:
// the enrichment marks the others `hidden`, and an empty explanation is never shown.
export function explanationOf(row) {
  if (!row || row.hidden === true) return null;
  const text = String(row.explicacion ?? "").trim();
  return text ? { text, wrong: Object.entries(row.distractores ?? {}) } : null;
}

// Reveal steps of one question, in order. "question" is always first; "options" exists only when the teacher
// hides them at first; "answer" needs a key; "explanation" needs a key and a settled explanation.
export function stagesFor({ hasKey, explainable, hideOptions }) {
  return ["question", ...(hideOptions ? ["options"] : []), ...(hasKey ? ["answer"] : []), ...(hasKey && explainable ? ["explanation"] : [])];
}

export const STAGE_LABEL = { question: "Pregunta", options: "Mostrar opciones", answer: "Mostrar respuesta", explanation: "Mostrar explicación" };

// The slides of a lesson. `bundle` is the loaded booklet ({ exam, key, enrich }). Questions missing from it are skipped.
export function buildDeck(lesson, bundle) {
  const settings = cleanSettings(lesson.settings);
  const byKey = new Map((bundle?.exam?.questions ?? []).map((q) => [q.key, q]));
  const slides = [];
  const items = cleanItems(lesson.items);
  const keys = items.filter((i) => i.type === "q" && byKey.has(i.key));
  if (settings.titleSlide) slides.push({ type: "title", title: lesson.title, count: keys.length });
  for (const it of items) {
    if (it.type === "text") slides.push({ type: "text", title: it.title, body: it.body });
    else if (byKey.has(it.key)) {
      const question = byKey.get(it.key);
      const letter = bundle.key?.get(it.key) ?? null;
      const stages = stagesFor({ hasKey: Boolean(letter), explainable: Boolean(explanationOf(bundle.enrich?.[String(question.number)])), hideOptions: settings.hideOptions });
      slides.push({ type: "question", key: it.key, question, letter, stages });
    }
  }
  slides.push({ type: "end", title: lesson.title });
  return slides;
}

export const slideStages = (slide) => (slide?.type === "question" ? slide.stages : ["question"]);

// Navigation over a deck: state is { i: slide, s: step inside the slide }. Moving forward reveals the next step
// of a question before changing slide; moving back undoes the last step first.
export function advance(deck, pos) {
  const stages = slideStages(deck[pos.i]);
  if (pos.s < stages.length - 1) return { i: pos.i, s: pos.s + 1 };
  if (pos.i < deck.length - 1) return { i: pos.i + 1, s: 0 };
  return pos;
}
export function retreat(deck, pos) {
  if (pos.s > 0) return { i: pos.i, s: pos.s - 1 };
  if (pos.i > 0) return { i: pos.i - 1, s: slideStages(deck[pos.i - 1]).length - 1 };
  return pos;
}
// Jumps to a step by name inside the current question (A = answer, E = explanation); stays put if it does not exist.
export function jumpStage(deck, pos, stage) {
  const s = slideStages(deck[pos.i]).indexOf(stage);
  return s < 0 ? pos : { i: pos.i, s };
}
export const clampPos = (deck, i) => ({ i: Math.min(Math.max(0, i), Math.max(0, deck.length - 1)), s: 0 });

// The label of the main button: what pressing it does next.
export function nextLabel(deck, pos) {
  const stages = slideStages(deck[pos.i]);
  if (pos.s < stages.length - 1) return STAGE_LABEL[stages[pos.s + 1]];
  return pos.i < deck.length - 1 ? "Siguiente" : "Terminar";
}

export const formatClock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- Activity formats ----------
// A format is the set of rules an activity is created with. The built-in ones cover the usual classroom uses;
// teachers save their own (activity_formats). `attempts` and `limit` are "" for "no limit" / "standard time".
export const BUILTIN_FORMATS = [
  { id: "guided", name: "Práctica guiada", help: "En clase: corrección inmediata y pistas, sin nota.",
    config: { kind: "task", instant: true, hints: true, reveal: "after_submit", attempts: "", limit: "", proctor: false } },
  { id: "homework", name: "Tarea para casa", help: "Con fecha de entrega, corrección inmediata y pistas.",
    config: { kind: "homework", instant: true, hints: true, reveal: "after_submit", attempts: "", limit: "", proctor: false } },
  { id: "quiz", name: "Quiz sin pistas", help: "Un intento, sin pistas; las respuestas salen al cerrar.",
    config: { kind: "homework", instant: false, hints: false, reveal: "after_close", attempts: 1, limit: "", proctor: false } },
  { id: "exam", name: "Examen con tiempo", help: "Cronómetro, un intento, sin pistas y con monitoreo.",
    config: { kind: "exam", instant: false, hints: false, reveal: "after_close", attempts: 1, limit: "", proctor: true } },
];

export const DEFAULT_CONFIG = BUILTIN_FORMATS[1].config;

export function cleanConfig(c) {
  const base = { ...DEFAULT_CONFIG, ...(c ?? {}) };
  const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? "" : Math.floor(Number(v)));
  const kind = ["task", "homework", "exam"].includes(base.kind) ? base.kind : "homework";
  return {
    kind,
    instant: base.instant !== false,
    hints: base.hints !== false,
    reveal: ["after_submit", "after_close", "never"].includes(base.reveal) ? base.reveal : "after_submit",
    attempts: num(base.attempts),
    limit: kind === "exam" ? num(base.limit) : "",
    proctor: base.proctor === true,
  };
}

const KIND_LABEL = { task: "Práctica", homework: "Tarea", exam: "Examen" };
export const REVEAL_LABEL = { after_submit: "respuestas al entregar", after_close: "respuestas al cerrar", never: "sin respuestas" };

export function configSummary(config) {
  const c = cleanConfig(config);
  const parts = [KIND_LABEL[c.kind], c.kind === "exam" ? "corrección al final" : c.instant ? "corrección inmediata" : "corrección al final"];
  if (c.kind !== "exam") parts.push(c.hints ? "con pistas" : "sin pistas");
  parts.push(c.attempts ? `${c.attempts} ${c.attempts === 1 ? "intento" : "intentos"}` : "intentos libres");
  if (c.kind === "exam" && c.limit) parts.push(`${c.limit} min`);
  parts.push(REVEAL_LABEL[c.reveal]);
  if (c.proctor) parts.push("monitoreado");
  return parts.join(" · ");
}

// The row for api.createAssignment. Optional rules are sent only when they differ from the database default,
// so creating assignments keeps working before the migrations that added those columns have run.
export function assignmentRow({ lesson, courseId, userId, title, opens, due, config }) {
  const c = cleanConfig(config);
  return {
    course_id: courseId, created_by: userId, kind: c.kind,
    title: title.trim() || lesson.title,
    exam_slug: lesson.exam_slug, scope: "all", question_keys: questionKeys(lesson.items),
    opens_at: new Date(`${opens}T00:00:00`).toISOString(),
    due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null,
    time_limit_min: c.kind === "exam" && c.limit ? c.limit : null,
    max_attempts: c.attempts || (c.kind === "exam" ? 1 : null),
    reveal_policy: c.reveal, status: "active", lesson_id: lesson.id,
    ...(c.hints || c.kind === "exam" ? {} : { allow_hints: false }),
    ...(c.proctor ? { proctor: true } : {}),
    ...(c.instant || c.kind === "exam" ? {} : { instant_feedback: false }),
  };
}

// ---------- Teacher's key ----------
// One row per question for the printed key: the letter, the skill and, only when the key is settled, the explanation.
export function keyRows(questions, bundle) {
  return questions.map((q, i) => {
    const row = bundle.enrich?.[String(q.number)] ?? null;
    return {
      n: i + 1,
      number: q.number,
      section: q.section,
      letter: bundle.key?.get(q.key) ?? null,
      skill: [row?.competencia, row?.tema].filter(Boolean).join(" · "),
      explanation: explanationOf(row)?.text ?? null,
    };
  });
}

// Questions of a lesson in lesson order (text slides left out), for printing.
export function lessonQuestions(lesson, bundle) {
  const byKey = new Map((bundle?.exam?.questions ?? []).map((q) => [q.key, q]));
  return questionKeys(lesson.items).map((k) => byKey.get(k)).filter(Boolean);
}
