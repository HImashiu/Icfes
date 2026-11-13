// Past ICFES exams by year, for people who search for a specific exam ("icfes 2019-1", "icfes 2020 calendario a"):
//   /examenes-icfes-anteriores/            hub with every past exam in the bank
//   /examenes-icfes-anteriores/<exam>/     what the exam had (areas, questions), a few real questions to answer, and a
//                                          button that opens that same exam in the app (?empezar=1&cuadernillo=<slug>)
// Only a handful of questions per page (no figures, high-confidence key), so the full exam stays in the app.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PAST_EXAMS = [
  {
    slug: "icfes-2019-1", name: "ICFES 2019-1", booklets: ["ICFES-2019-1_1ra", "ICFES-2019-1_2da"], year: 2019,
    what: "el Saber 11 que se presentó en el primer semestre de 2019 (calendario B), con sus dos sesiones",
  },
  {
    slug: "icfes-2020-calendario-a", name: "ICFES 2020 calendario A", booklets: ["ICFES-2020-2A"], year: 2020,
    what: "el Saber 11 de calendario A de 2020, el que presentaron los colegios de calendario A en el segundo semestre",
  },
  {
    slug: "icfes-2020-calendario-b", name: "ICFES 2020 calendario B", booklets: ["ICFES-2020-1B_1ra", "ICFES-2020-1B_2da"], year: 2020,
    what: "el Saber 11 de calendario B de 2020 (primer semestre), con sus dos sesiones",
  },
  {
    slug: "icfes-2018-1", name: "ICFES 2018-1", booklets: ["ICFES-2018-1_1ra", "ICFES-2018-1_2da"], year: 2018,
    what: "el Saber 11 del primer semestre de 2018 (calendario B), con sus dos sesiones",
  },
  {
    slug: "icfes-2018-2", name: "ICFES 2018-2", booklets: ["ICFES-2018-2_2da"], year: 2018,
    what: "la segunda sesión del Saber 11 del segundo semestre de 2018 (calendario A)",
  },
  {
    slug: "icfes-2021-lectura-critica", name: "ICFES 2021 Lectura crítica", booklets: ["ICFES-2021-1-LC"], year: 2021,
    what: "la prueba de Lectura crítica del Saber 11 de 2021",
  },
  {
    slug: "icfes-2015-2018", name: "Preguntas ICFES 2015 a 2018", booklets: ["ICFES-2015-2018"], year: 2017,
    what: "preguntas liberadas por el ICFES entre 2015 y 2018 en sus guías de orientación",
  },
  {
    slug: "icfes-2014", name: "ICFES 2014", booklets: ["ICFES-2014"], year: 2014,
    what: "el cuadernillo de prueba del Saber 11 de 2014 que publicó el ICFES, con su clave oficial",
  },
];

const AREA_ORDER = ["Matemáticas", "Lectura crítica", "Sociales y ciudadanas", "Ciencias naturales", "Inglés"];
const sessionOf = (name) => (/_1ra$/.test(name) ? "Sesión 1" : /_2da$/.test(name) ? "Sesión 2" : "Cuadernillo único");
const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function loadBooklet(dataDir, name) {
  const file = join(dataDir, `${name}.golden.json`);
  const keysDir = join(dirname(dataDir), "answer-keys");
  if (!existsSync(file) || !existsSync(join(keysDir, `${name}.key.json`))) return null;
  const exam = JSON.parse(readFileSync(file, "utf8"));
  const answers = JSON.parse(readFileSync(join(keysDir, `${name}.key.json`), "utf8")).answers ?? {};
  const sideFile = join(keysDir, `${name}.sidecar.json`);
  const side = existsSync(sideFile) ? JSON.parse(readFileSync(sideFile, "utf8")).answers ?? {} : {};
  return { name, exam, answers, side, groups: new Map((exam.groups ?? []).map((g) => [g.id, g])) };
}

// A key we are willing to print: high confidence, and official when the booklet came with one.
function keyOf(b, q) {
  const key = b.answers[String(q.number)];
  const s = b.side[String(q.number)];
  if (!key || !s || s.confidence !== "high" || (s.answer && s.answer !== key)) return null;
  return { key, official: /oficial/i.test(String(s.reason ?? "")) };
}

function fits(ctx, b, q) {
  if (!q.ready || q.provenance?.trusted === false || q.figure || q.item_type !== "standard") return false;
  if (!Array.isArray(q.options) || q.options.length < 3 || q.options.some((o) => !String(o.text_md ?? "").trim())) return false;
  const text = [q.stimulus_md, q.stem_md, ...q.options.map((o) => o.text_md)].join(" ");
  if (ctx.PICTURE.test(text) || ctx.NEEDS_PICTURE.test(text) || !String(q.stem_md ?? "").trim()) return false;
  if ((String(q.stimulus_md ?? "") + q.stem_md).length > 1100) return false;
  return Boolean(keyOf(b, q));
}

// New items first (text written for this exam, not copied from another booklet), one area at a time.
function pickSamples(ctx, booklets, count) {
  const fresh = (q) => !(q.provenance?.notes ?? []).some((n) => /copied from/i.test(n));
  const byArea = new Map();
  for (const b of booklets) {
    for (const q of b.exam.questions) {
      if (q.group_id || !fits(ctx, b, q)) continue;
      const list = byArea.get(q.section) ?? [];
      list.push({ b, q });
      byArea.set(q.section, list);
    }
  }
  for (const list of byArea.values()) list.sort((x, y) => Number(fresh(y.q)) - Number(fresh(x.q)) || x.q.number - y.q.number);
  const out = [];
  for (let round = 0; out.length < count && round < 6; round++) {
    for (const area of AREA_ORDER) {
      const list = byArea.get(area) ?? [];
      // Spread through the booklet: the 2nd, 5th, 8th… usable question of the area.
      const it = list[(round * 3 + 1) % Math.max(1, list.length)];
      if (it && !out.includes(it) && out.length < count) out.push(it);
    }
  }
  return out;
}

// A whole reading group (text + up to 3 questions) for exams that are only Lectura crítica.
function pickGroup(ctx, b) {
  for (const g of b.groups.values()) {
    const passage = String(g.passage_md ?? "");
    if (!passage.trim() || ctx.PICTURE.test(passage) || ctx.NEEDS_PICTURE.test(passage) || passage.length > 4200 || passage.length < 300) continue;
    const qs = b.exam.questions.filter((q) => q.group_id === g.id);
    if (qs.length < 2) continue;
    const ok = qs.filter((q) => q.ready && q.item_type === "standard" && Array.isArray(q.options) && q.options.length >= 3 && keyOf(b, q)
      && !ctx.PICTURE.test([q.stem_md, ...q.options.map((o) => o.text_md)].join(" ")));
    if (ok.length < 2) continue;
    return ok.slice(0, 3).map((q, i) => ({ b, q, passage: i === 0 ? g : null, groupSize: Math.min(3, ok.length) }));
  }
  return [];
}

function cardHtml(ctx, { b, q, passage, groupSize }, label) {
  const area = ctx.AREAS.find((a) => a.name === q.section) ?? { name: q.section, color: "#9AA" };
  const { key, official } = keyOf(b, q);
  const r = ctx.renderRich;
  const passageHtml = passage
    ? `<div class="paper passage"><p class="paper-label">Texto · ${ctx.esc(label)}${groupSize > 1 ? ` · ${groupSize} preguntas` : ""}</p>${passage.directions ? `<p class="paper-dir">${ctx.esc(passage.directions)}</p>` : ""}${r(passage.passage_md)}</div>`
    : "";
  const opts = q.options.map((o) => `<li><button type="button" class="opt" data-l="${ctx.esc(o.letter)}"><span class="let">${ctx.esc(o.letter)}</span><span>${r(o.text_md)}</span></button></li>`).join("");
  return `${passageHtml}
<article class="qcard q reveal" id="${`${b.name}-${q.number}`.toLowerCase()}" data-key="${ctx.esc(key)}">
  <div class="qbar"><span class="qarea"><span class="dot" style="--c:${area.color}"></span>${ctx.esc(area.name)}</span></div>
  <div class="paper">
    <p class="paper-label">Pregunta ${q.number} · ${ctx.esc(label)} · ${sessionOf(b.name)}</p>
    ${q.stimulus_md && plain(q.stimulus_md) !== plain(q.stem_md) ? r(q.stimulus_md) : ""}
    <div class="paper-stem">${r(q.stem_md)}</div>
  </div>
  <ul class="opts" aria-label="Opciones">${opts}</ul>
  <details class="ans"><summary>Ver la respuesta</summary><p>La respuesta es la <b>${ctx.esc(key)}</b>. ${official ? "Clave oficial publicada por el ICFES." : "Clave preliminar de Cóndor: este cuadernillo se publicó sin clave."}</p></details>
  <p class="source">Fuente: ICFES, Saber 11, ${ctx.esc(label)}, ${sessionOf(b.name).toLowerCase()}, pregunta ${q.number}</p>
</article>`;
}

const appLink = (up, slug) => `${up}app/?empezar=1&amp;cuadernillo=${encodeURIComponent(slug)}`;

export function buildExamPages(ctx) {
  const pages = [];
  const built = [];
  for (const ex of PAST_EXAMS) {
    const booklets = ex.booklets.map((n) => loadBooklet(ctx.dataDir, n)).filter(Boolean);
    if (!booklets.length) { console.warn(`[build-seo] ${ex.name}: no data, page skipped`); continue; }
    const total = booklets.reduce((n, b) => n + b.exam.questions.length, 0);
    const counts = new Map();
    for (const b of booklets) for (const q of b.exam.questions) counts.set(q.section, (counts.get(q.section) ?? 0) + 1);
    const areas = AREA_ORDER.filter((a) => counts.has(a));
    const onlyReading = areas.length === 1 && areas[0] === "Lectura crítica";
    const items = onlyReading ? pickGroup(ctx, booklets[0]) : pickSamples(ctx, booklets, 6);
    const official = booklets.some((b) => Object.values(b.side).some((s) => /oficial/i.test(String(s.reason ?? ""))));
    const path = `examenes-icfes-anteriores/${ex.slug}/`;
    const up = "../../";
    const qs = items.map((it) => cardHtml(ctx, it, ex.name)).join("\n");
    if (qs.includes('class="katex')) ctx.markKatex();
    const sessionBtns = booklets.map((b, i) => `<a class="btn ${i === 0 ? "btn-primary" : "btn-ghost"}" href="${appLink(up, b.name)}">${booklets.length > 1 ? `Presentar la ${sessionOf(b.name)}` : `Presentar el ${ctx.esc(ex.name)} completo`}</a>`).join("");
    const rows = areas.map((a) => {
      const per = booklets.map((b) => b.exam.questions.filter((q) => q.section === a).length);
      return `<tr><td>${ctx.esc(a)}</td>${booklets.length > 1 ? per.map((n) => `<td>${n || "–"}</td>`).join("") : ""}<td>${counts.get(a)}</td></tr>`;
    }).join("");
    const head = `<tr><th>Prueba</th>${booklets.length > 1 ? booklets.map((b) => `<th>${sessionOf(b.name)}</th>`).join("") : ""}<th>Preguntas</th></tr>`;
    const faq = [
      [`¿Dónde descargo el ${ex.name} en PDF?`, `El ICFES publica sus cuadernillos en icfes.gov.co. En Cóndor no necesitas descargar nada: resuelves el ${ex.name} en línea, con cronómetro, corrección al instante y tu puntaje estimado de 0 a 500, gratis.`],
      [`¿El ${ex.name} trae las respuestas?`, official ? "Sí: este cuadernillo se publicó con su clave oficial, y es la que usamos." : "El cuadernillo se publicó sin clave. Cóndor resolvió cada pregunta y la clave se marca como preliminar; si encuentras un error, repórtalo desde la app y lo revisamos."],
      [`¿Sirve practicar con el ${ex.name} para el Saber 11 de 2027?`, "Sí. La estructura del examen (cinco pruebas, dos sesiones, preguntas de selección múltiple) es la misma desde 2014, y el ICFES vuelve a usar el mismo tipo de preguntas. Practicar con exámenes reales es la mejor forma de acostumbrarte al formato y al tiempo."],
      ["¿Cuánto cuesta?", "Durante la demostración es gratis. Entras con tu cuenta de Google y empiezas."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Examen real · ${ex.year}</span>
  <h1>${ctx.esc(ex.name)}: preguntas reales con respuestas y simulacro gratis</h1>
  <p class="prose">Este es ${ex.what}: ${total} preguntas que puedes resolver en línea, con el tiempo del examen y tu puntaje estimado de 0 a 500 al terminar. Abajo tienes ${items.length} preguntas de muestra: toca una opción para ver si acertaste.</p>
  <div class="cta-row">${sessionBtns}</div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Qué trae el ${ctx.esc(ex.name)}</h2>
  <div class="tbl"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>
</section>
<section class="qlist wrap narrow mini" aria-label="Preguntas de muestra del ${ctx.esc(ex.name)}" data-total="${items.length}">
${qs}
<div class="card mini-score" hidden><strong></strong><span></span><a class="btn btn-primary btn-sm" href="${appLink(up, booklets[0].name)}">Presentar el examen completo</a></div>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo practicar con este examen</h2>
  <ul class="checks">
    <li><b>Hazlo con tiempo:</b> cada sesión del Saber 11 dura 4 horas y 30 minutos. En la app el cronómetro lleva la cuenta.</li>
    <li><b>Mira tu puntaje:</b> al entregar ves tu puntaje estimado por prueba y global, con el nivel de desempeño.</li>
    <li><b>Repasa tus errores:</b> la app te guarda las preguntas que fallaste para que las vuelvas a intentar.</li>
  </ul>
  <p class="prose">Otros exámenes: ${PAST_EXAMS.filter((x) => x !== ex).map((x) => `<a href="../${x.slug}/">${ctx.esc(x.name)}</a>`).join(" · ")}. También puedes hacer un <a href="${up}simulacro-icfes/">simulacro ICFES por área</a> o calcular tu puntaje con la <a href="${up}calculadora-puntaje-icfes/">calculadora ICFES</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta(up, `Presenta el ${ctx.esc(ex.name)} completo gratis`)}`;
    ctx.write(path, ctx.page({
      siteUrl: ctx.siteUrl, path,
      title: `${ex.name} con respuestas: preguntas reales y simulacro gratis | Cóndor`,
      desc: `${ex.name}: ${total} preguntas reales del Saber 11 para resolver en línea, con respuestas, cronómetro y puntaje de 0 a 500. Gratis, sin descargar el PDF.`,
      body, katex: qs.includes('class="katex'),
      crumbs: [{ name: "Exámenes ICFES anteriores", path: "examenes-icfes-anteriores/" }, { name: ex.name, path }],
      jsonLd: [ctx.faqLd(faq), { "@type": "Quiz", name: ex.name, about: { "@type": "Thing", name: "Examen Saber 11" }, educationalLevel: "Grado 11", inLanguage: "es-CO", url: ctx.siteUrl + path, isAccessibleForFree: true, citation: "ICFES, Saber 11" }],
    }));
    pages.push(path);
    built.push({ ex, total, areas, booklets });
  }

  if (built.length) {
    const path = "examenes-icfes-anteriores/";
    const cards = built.map(({ ex, total, areas }) => `<a class="area" href="${ex.slug}/" style="--c:#C7F25B"><span class="dot"></span><b>${ctx.esc(ex.name)}</b><span>${total} preguntas · ${areas.length === 5 ? "las 5 pruebas" : areas.join(", ")}</span></a>`).join("");
    const faq = [
      ["¿Se repiten preguntas del ICFES de un año a otro?", "Las preguntas exactas casi nunca se repiten, pero el tipo de pregunta, las competencias y el formato sí. Por eso practicar con exámenes reales anteriores es la mejor preparación."],
      ["¿Qué examen anterior me sirve más?", "Los más recientes (2019 y 2020) se parecen más al examen actual. Si vas a presentar el calendario B, empieza por el 2019-1 o el 2020 calendario B; si eres de calendario A, por el 2020 calendario A."],
      ["¿Necesito descargar el PDF?", "No. En Cóndor resuelves cada examen en línea, con cronómetro, corrección y puntaje estimado, gratis."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <h1>Exámenes ICFES anteriores con respuestas: resuélvelos en línea gratis</h1>
  <p class="prose">Exámenes reales del Saber 11 de 2014 a 2021, listos para resolver en línea con cronómetro, respuestas y tu puntaje estimado de 0 a 500. Sin descargar PDF.</p>
  <div class="areas">${cards}</div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Cómo usar los exámenes anteriores</h2>
  <ul class="checks">
    <li><b>Empieza por el más reciente</b> de tu calendario y preséntalo completo, con tiempo.</li>
    <li><b>Revisa tus errores</b> el mismo día: ahí está lo que más te sube el puntaje.</li>
    <li><b>Repite cada dos o tres semanas</b> con otro examen y compara tu puntaje con tu meta, no con el de otros.</li>
  </ul>
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta("../", "Presenta un examen ICFES completo gratis")}`;
    ctx.write(path, ctx.page({
      siteUrl: ctx.siteUrl, path,
      title: "Exámenes ICFES anteriores con respuestas (2014-2021) · Saber 11 gratis | Cóndor",
      desc: "Exámenes ICFES de años anteriores (2014, 2018, 2019, 2020, 2021) con respuestas, para resolver en línea gratis con cronómetro y puntaje de 0 a 500.",
      body, crumbs: [{ name: "Exámenes ICFES anteriores", path }],
      jsonLd: [ctx.faqLd(faq), { "@type": "CollectionPage", name: "Exámenes ICFES anteriores", url: ctx.siteUrl + path, inLanguage: "es-CO", hasPart: built.map(({ ex }) => ({ "@type": "Quiz", name: ex.name, url: `${ctx.siteUrl}examenes-icfes-anteriores/${ex.slug}/` })) }],
    }));
    pages.push(path);
  }
  return pages;
}
