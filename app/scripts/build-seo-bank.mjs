// Programmatic pages from the question bank (SEO plan, "Programmatic pages from the question bank"):
//   /pregunta-icfes/                               hub of solved questions, by area
//   /pregunta-icfes/<area>/[pagina-N/]             the area's solved questions, 20 per page
//   /pregunta-icfes/<area>/<slug>/                 one question you can answer, the key, why, what it evaluates, its source
//   /examenes-icfes-anteriores/<exam>/<area>/      one test of a past exam: what it had, solved questions, start it in the app
// Every question shown here comes from scripts/seo-bank/solved.json: past exams the ICFES published, a key that is the
// official one or the blue dot of the same item in the bank and that Claude's own solve agrees with, and an
// explanation written and checked for this site (the app keeps the hints, statistics and full practice).
// Only batches up to PUBLISHED_BATCH are built, so a batch can be written before it ships. The build stops if the
// public pages, all families together, ever show more than PUBLIC_CAP (550, 10 % of the bank) questions.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAST_EXAMS } from "./build-seo-exams.mjs";
import { AREA_SLUG, PUBLIC_CAP, fitsPublic, keyBasis, loadPastBooklet, plain, sessionOf } from "./seo-bank/common.mjs";

export const PUBLISHED_BATCH = 2;
const here = dirname(fileURLToPath(import.meta.url));
const PER_PAGE = 20;
// Exams that get one page per test. The 2015-2018 guide questions and the 2021 Lectura crítica booklet are not full exams.
const EXAMS_BY_AREA = new Set(["icfes-2019-1", "icfes-2020-calendario-a", "icfes-2020-calendario-b", "icfes-2018-1", "icfes-2018-2", "icfes-2014"]);

const AREA_INTRO = {
  "Matemáticas": "Problemas de estadística, conteo, porcentajes, funciones y geometría como los que pone el ICFES, cada uno con su respuesta y el procedimiento paso a paso.",
  "Lectura crítica": "Preguntas sobre textos literarios, filosóficos e informativos, resueltas: qué dice el texto, cómo se organiza y cómo se evalúa, con la pista que lleva a la respuesta.",
  "Sociales y ciudadanas": "Casos de historia, Constitución, economía y convivencia del Saber 11, resueltos: qué concepto está en juego y por qué las otras opciones fallan.",
  "Ciencias naturales": "Preguntas de biología, química y física del ICFES con su solución: el concepto, el cálculo cuando lo hay y cómo leer el experimento.",
  "Inglés": "Avisos, vocabulario, conversaciones y textos con espacios del Saber 11, resueltos y explicados en español.",
};

function load(dataDir) {
  const file = JSON.parse(readFileSync(join(here, "seo-bank", "solved.json"), "utf8"));
  const booklets = new Map();
  const out = [];
  for (const [id, s] of Object.entries(file.questions)) {
    if ((s.batch ?? 99) > PUBLISHED_BATCH) continue;
    const m = /^(.*)-(\d+)$/.exec(id);
    if (!booklets.has(m[1])) booklets.set(m[1], loadPastBooklet(dataDir, m[1]));
    const b = booklets.get(m[1]);
    const q = b?.exam.questions.find((x) => x.number === Number(m[2]));
    if (!b || !q) { console.warn(`[build-seo-bank] ${id}: not in the data, skipped`); continue; }
    const kb = fitsPublic(dataDir, b, q) ? keyBasis(dataDir, b, q) : null;
    // The key or the text changed since the explanation was written: leave it out until it is checked again.
    if (!kb || kb.key !== s.key) { console.warn(`[build-seo-bank] ${id}: key or text changed since it was explained, skipped`); continue; }
    const areaSlug = AREA_SLUG[q.section];
    out.push({ id, b, q, s, kb, areaSlug, area: q.section, path: `pregunta-icfes/${areaSlug}/${s.slug}/`, group: q.group_id ? b.groups.get(q.group_id) : null });
  }
  const slugs = new Set();
  for (const it of out) {
    if (slugs.has(it.path)) throw new Error(`[build-seo-bank] two questions share ${it.path}`);
    slugs.add(it.path);
  }
  // Stable order: by exam (as listed in PAST_EXAMS), then booklet, then number.
  const examOrder = new Map(PAST_EXAMS.map((x, i) => [x.slug, i]));
  out.sort((x, y) => examOrder.get(x.s.exam) - examOrder.get(y.s.exam) || x.b.name.localeCompare(y.b.name) || x.q.number - y.q.number);
  return out;
}

// Pages that the other families link to, known before any page is written (build-seo.mjs asks before building them).
export function bankLinks(dataDir) {
  const items = load(dataDir);
  const examAreas = new Map();
  for (const it of items) {
    if (!EXAMS_BY_AREA.has(it.s.exam)) continue;
    const k = `${it.s.exam}/${it.areaSlug}`;
    if (!examAreas.has(k)) examAreas.set(k, { exam: it.s.exam, examName: examOf(it.s.exam).name, area: it.area, areaSlug: it.areaSlug, path: `examenes-icfes-anteriores/${it.s.exam}/${it.areaSlug}/` });
  }
  const areas = [...new Set(items.map((it) => it.area))];
  return { items, examAreas: [...examAreas.values()], areas };
}

// A description cut at a word, at most 158 characters.
const clip = (t) => (t.length <= 158 ? t : `${t.slice(0, 157).replace(/\s+\S*$/, "")}…`);
const examOf = (slug) => PAST_EXAMS.find((x) => x.slug === slug);
const basisNote = (kb, exName) => kb.basis === "oficial" ? "Clave oficial publicada por el ICFES."
  : kb.basis === "punto" ? `La clave coincide con la marca del cuadernillo publicado y con la resolución de Cóndor.`
    : `El ${exName} se publicó sin clave: la respuesta es de Cóndor, resuelta dos veces de forma independiente.`;
const sourceLine = (it) => `Fuente: ICFES, Saber 11, ${examOf(it.s.exam).name}, ${sessionOf(it.b.name).toLowerCase()}, pregunta ${it.q.number}`;

function cardHtml(ctx, it, { full, up }) {
  // Justified text leaves wide gaps on phones: the pages read left-aligned.
  const r = (md) => ctx.renderRich(md).replace(/text-align:\s*justify;?/g, "");
  const color = ctx.AREAS.find((a) => a.name === it.area)?.color ?? "#9AA";
  const g = it.group;
  const passage = g ? `<div class="paper passage"><p class="paper-label">Texto · ${ctx.esc(examOf(it.s.exam).name)}</p>${g.directions ? `<p class="paper-dir">${ctx.esc(g.directions)}</p>` : ""}${r(g.passage_md)}</div>` : "";
  const opts = it.q.options.map((o) => `<li><button type="button" class="opt" data-l="${ctx.esc(o.letter)}"><span class="let">${ctx.esc(o.letter)}</span><span>${r(o.text_md)}</span></button></li>`).join("");
  const exName = examOf(it.s.exam).name;
  const answer = full
    ? `<p>La respuesta es la <b>${ctx.esc(it.s.key)}</b>.</p>${it.s.expl.map((p) => `<p>${ctx.esc(p)}</p>`).join("")}<p class="source">${ctx.esc(basisNote(it.kb, exName))}</p>`
    : `<p>La respuesta es la <b>${ctx.esc(it.s.key)}</b>. ${ctx.esc(it.s.corta)}</p><p><a href="${up}${it.path}">Ver la explicación completa</a></p>`;
  return `${passage}
<article class="qcard q reveal" id="${it.id.toLowerCase()}" data-key="${ctx.esc(it.s.key)}">
  <div class="qbar"><span class="qarea"><span class="dot" style="--c:${color}"></span>${ctx.esc(it.area)}</span></div>
  <div class="paper">
    <p class="paper-label">Pregunta ${it.q.number} · ${ctx.esc(exName)} · ${sessionOf(it.b.name)}</p>
    ${it.q.stimulus_md && plain(it.q.stimulus_md) !== plain(it.q.stem_md) ? r(it.q.stimulus_md) : ""}
    <div class="paper-stem">${r(it.q.stem_md)}</div>
  </div>
  <ul class="opts" aria-label="Opciones">${opts}</ul>
  <details class="ans"><summary>${full ? "Ver la respuesta y la explicación" : "Ver la respuesta"}</summary>${answer}</details>
  <p class="source">${ctx.esc(sourceLine(it))}</p>
</article>`;
}

// schema.org Question for one item, with the explanation when the page shows it.
function questionLd(it, siteUrl, full) {
  const text = [it.group ? plain(it.group.passage_md).slice(0, 600) : "", plain(it.q.stimulus_md), plain(it.q.stem_md)].filter(Boolean).join(" ");
  const answers = it.q.options.map((o, i) => ({ "@type": "Answer", position: i, text: `${o.letter}. ${plain(o.text_md)}` }));
  const right = answers.find((a) => a.text.startsWith(`${it.s.key}.`));
  return {
    "@type": "Question", eduQuestionType: "Multiple choice", learningResourceType: "Practice problem", text,
    url: siteUrl + it.path,
    suggestedAnswer: answers.filter((a) => a !== right),
    acceptedAnswer: { ...right, ...(full ? { answerExplanation: { "@type": "Comment", text: it.s.expl.join(" ") } } : {}) },
  };
}

const quizLd = (it, siteUrl) => ({
  "@type": "Quiz", name: it.s.titulo, url: siteUrl + it.path, inLanguage: "es-CO", educationalLevel: "Grado 11", isAccessibleForFree: true,
  about: { "@type": "Thing", name: it.s.tema },
  ...(it.area !== "Inglés" ? { educationalAlignment: { "@type": "AlignmentObject", alignmentType: "assesses", educationalFramework: "Saber 11 (ICFES)", targetName: it.s.competencia } } : {}),
  citation: sourceLine(it).replace(/^Fuente: /, ""),
  hasPart: [questionLd(it, siteUrl, true)],
});

// Three questions to go on with: same topic first, then same competency, then the same test.
function similar(items, it, n = 3) {
  const same = items.filter((x) => x !== it && x.area === it.area);
  const score = (x) => (x.s.tema === it.s.tema ? 0 : x.s.competencia === it.s.competencia ? 1 : 2);
  const start = same.findIndex((x) => items.indexOf(x) > items.indexOf(it));
  const rotated = start < 0 ? same : [...same.slice(start), ...same.slice(0, start)];
  return rotated.map((x, i) => [x, score(x), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).slice(0, n).map((x) => x[0]);
}

const appArea = (up, slug, booklet) => `${up}app/?empezar=1${booklet ? `&amp;cuadernillo=${encodeURIComponent(booklet)}` : ""}&amp;area=${slug}`;

export function buildBankPages(ctx) {
  const { items, examAreas } = bankLinks(ctx.dataDir);
  if (!items.length) return [];
  const pages = [];
  const write = (path, html) => { ctx.write(path, html); pages.push(path); };
  const byArea = new Map();
  for (const it of items) byArea.set(it.area, [...(byArea.get(it.area) ?? []), it]);
  const areaInfo = (name) => ctx.AREAS.find((a) => a.name === name);
  const examAreaPath = (exam, areaSlug) => examAreas.find((x) => x.exam === exam && x.areaSlug === areaSlug)?.path;

  // ---- one page per solved question
  for (const it of items) {
    const up = "../../../";
    const list = byArea.get(it.area);
    const next = list[(list.indexOf(it) + 1) % list.length];
    const sim = similar(items, it).filter((x) => x !== next).slice(0, 3);
    const ex = examOf(it.s.exam);
    const ea = examAreaPath(it.s.exam, it.areaSlug);
    const card = cardHtml(ctx, it, { full: true, up });
    if (card.includes('class="katex')) ctx.markKatex();
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${areaInfo(it.area)?.color ?? "#C8F04A"}">${ctx.esc(it.area)} · ${ctx.esc(ex.name)}</span>
  <h1>${ctx.esc(it.s.titulo)}</h1>
  <p class="prose">Pregunta real del Saber 11 (${ctx.esc(ex.name)}, ${sessionOf(it.b.name).toLowerCase()}, pregunta ${it.q.number}). Respóndela tocando una opción y luego mira la explicación.</p>
</div></section>
<section class="qlist wrap narrow" aria-label="Pregunta">
${card}
</section>
<section class="wrap narrow guide-body">
  <h2>Qué evalúa esta pregunta</h2>
  <div class="tbl"><table><tbody>
    <tr><th>Prueba</th><td><a href="${up}preguntas-icfes/${it.areaSlug}/">${ctx.esc(it.area)}</a></td></tr>
    ${it.area !== "Inglés" ? `<tr><th>Competencia</th><td>${ctx.esc(it.s.competencia)}</td></tr>` : ""}
    <tr><th>Tema</th><td>${ctx.esc(it.s.tema)}</td></tr>
    <tr><th>Examen</th><td>${ea ? `<a href="${up}${ea}">${ctx.esc(it.area)} del ${ctx.esc(ex.name)}</a>` : `<a href="${up}examenes-icfes-anteriores/${ex.slug}/">${ctx.esc(ex.name)}</a>`}, ${sessionOf(it.b.name).toLowerCase()}</td></tr>
  </tbody></table></div>
  <h2>Sigue practicando</h2>
  <ul class="checks">
    <li><a href="${up}${next.path}"><b>Siguiente pregunta:</b> ${ctx.esc(next.s.titulo)}</a></li>
    ${sim.map((x) => `<li><a href="${up}${x.path}">${ctx.esc(x.s.titulo)}</a> <span>(${ctx.esc(examOf(x.s.exam).name)})</span></li>`).join("\n    ")}
  </ul>
  <p class="prose">Más <a href="${up}pregunta-icfes/${it.areaSlug}/">preguntas ICFES de ${ctx.esc(it.area)} resueltas</a>, el <a href="${up}examenes-icfes-anteriores/${ex.slug}/">${ctx.esc(ex.name)} completo</a> o un <a href="${up}simulacro-icfes/${it.areaSlug}/">mini simulacro de ${ctx.esc(it.area)}</a>.</p>
</section>
${ctx.cta(up, `Practica más preguntas de ${ctx.esc(it.area)}`).replace(`href="${up}app/?empezar=1"`, `href="${appArea(up, it.areaSlug)}"`)}`;
    const title = `${it.s.titulo} · ICFES | Cóndor`.length <= 60 ? `${it.s.titulo} · ICFES | Cóndor` : `${it.s.titulo} | Cóndor`;
    write(it.path, ctx.page({
      siteUrl: ctx.siteUrl, path: it.path, title,
      desc: clip(`Pregunta ICFES de ${it.area} resuelta (${ex.name}): ${it.s.corta}`),
      body, katex: card.includes('class="katex'),
      crumbs: [{ name: "Preguntas resueltas", path: "pregunta-icfes/" }, { name: it.area, path: `pregunta-icfes/${it.areaSlug}/` }, { name: it.s.titulo, path: it.path }],
      jsonLd: [quizLd(it, ctx.siteUrl)],
    }));
  }

  // ---- the area lists, 20 per page
  for (const [area, list] of byArea) {
    const slug = AREA_SLUG[area];
    const nPages = Math.ceil(list.length / PER_PAGE);
    for (let p = 1; p <= nPages; p++) {
      const path = p === 1 ? `pregunta-icfes/${slug}/` : `pregunta-icfes/${slug}/pagina-${p}/`;
      const up = "../".repeat(path.split("/").filter(Boolean).length);
      const base = `${up}pregunta-icfes/${slug}/`;
      const chunk = list.slice((p - 1) * PER_PAGE, p * PER_PAGE);
      const pager = nPages > 1 ? `<p class="prose">Página ${p} de ${nPages}: ${Array.from({ length: nPages }, (_, i) => i + 1 === p ? `<b>${i + 1}</b>` : `<a href="${i === 0 ? base : `${base}pagina-${i + 1}/`}">${i + 1}</a>`).join(" · ")}</p>` : "";
      const exams = examAreas.filter((x) => x.area === area);
      const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${areaInfo(area)?.color ?? "#C8F04A"}">${ctx.esc(area)}</span>
  <h1>Preguntas ICFES de ${ctx.esc(area)} resueltas y explicadas</h1>
  <p class="prose">${AREA_INTRO[area]} Todas son de exámenes que publicó el ICFES.</p>
  <div class="cta-row"><a class="btn btn-primary" href="${appArea(up, slug)}">Practicar ${ctx.esc(area)} en la app</a></div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>${list.length} preguntas de ${ctx.esc(area)} con explicación</h2>
  <ul class="checks">
    ${chunk.map((x) => `<li><a href="${up}${x.path}"><b>${ctx.esc(x.s.titulo)}</b></a> <span>· ${ctx.esc(x.s.tema)} · ${ctx.esc(examOf(x.s.exam).name)}</span></li>`).join("\n    ")}
  </ul>
  ${pager}
  ${exams.length ? `<h2>${ctx.esc(area)} por examen</h2>\n  <p class="prose">${exams.map((x) => `<a href="${up}${x.path}">${ctx.esc(area)} del ${ctx.esc(examOf(x.exam).name)}</a>`).join(" · ")}</p>` : ""}
  <p class="prose">También: <a href="${up}preguntas-icfes/${slug}/">preguntas de ${ctx.esc(area)} para responder</a>, el <a href="${up}simulacro-icfes/${slug}/">mini simulacro de ${ctx.esc(area)}</a> y <a href="${up}pregunta-icfes/">todas las preguntas resueltas</a>.</p>
</section>
${ctx.cta(up, `¿Quieres practicar más ${ctx.esc(area)}?`).replace(`href="${up}app/?empezar=1"`, `href="${appArea(up, slug)}"`)}`;
      write(path, ctx.page({
        siteUrl: ctx.siteUrl, path,
        title: `Preguntas ICFES de ${area} resueltas${p > 1 ? ` (${p})` : ""} | Cóndor`,
        desc: clip(`Preguntas reales de ${area} del Saber 11 con respuesta y explicación paso a paso. ${AREA_INTRO[area]}`),
        body,
        crumbs: [{ name: "Preguntas resueltas", path: "pregunta-icfes/" }, { name: area, path: `pregunta-icfes/${slug}/` }, ...(p > 1 ? [{ name: `Página ${p}`, path }] : [])],
        jsonLd: [{ "@type": "CollectionPage", name: `Preguntas ICFES de ${area} resueltas`, url: ctx.siteUrl + path, inLanguage: "es-CO",
          hasPart: chunk.map((x) => ({ "@type": "Quiz", name: x.s.titulo, url: ctx.siteUrl + x.path })) }],
      }));
    }
  }

  // ---- hub
  {
    const path = "pregunta-icfes/";
    const up = "../";
    const order = ctx.AREAS.map((a) => a.name).filter((a) => byArea.has(a));
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Con explicación</span>
  <h1>Preguntas ICFES resueltas: respuesta y explicación de cada una</h1>
  <p class="prose">Preguntas reales del Saber 11, de exámenes que publicó el ICFES, explicadas paso a paso: por qué la respuesta es esa, por qué fallan las otras y un truco para la próxima vez. Respóndelas en la página y compara.</p>
  ${`<div class="areas">${order.map((a) => `<a class="area" href="${AREA_SLUG[a]}/" style="--c:${areaInfo(a).color}"><span class="dot"></span><b>${ctx.esc(a)}</b><span>${byArea.get(a).length} resueltas</span></a>`).join("")}</div>`}
</div></section>
<section class="wrap narrow guide-body">
  ${order.map((a) => `<h2><a href="${AREA_SLUG[a]}/">${ctx.esc(a)}</a></h2>
  <ul class="checks">${byArea.get(a).slice(0, 6).map((x) => `<li><a href="${up}${x.path}">${ctx.esc(x.s.titulo)}</a></li>`).join("")}</ul>`).join("\n  ")}
  <h2>Cómo usar estas preguntas</h2>
  <ul class="checks">
    <li><b>Responde antes de mirar:</b> toca una opción y solo después abre la explicación.</li>
    <li><b>Lee por qué fallan las otras:</b> las opciones incorrectas del ICFES repiten los mismos errores, y reconocerlos sube tu puntaje.</li>
    <li><b>Practica con tiempo:</b> cuando entiendas un tema, presenta un <a href="${up}simulacro-icfes/">simulacro ICFES</a> o un <a href="${up}examenes-icfes-anteriores/">examen anterior completo</a>.</li>
  </ul>
</section>
${ctx.cta(up, "Practica con más de 4.000 preguntas")}`;
    write(path, ctx.page({
      siteUrl: ctx.siteUrl, path, title: "Preguntas ICFES resueltas y explicadas | Cóndor",
      desc: "Preguntas reales del Saber 11 con respuesta y explicación paso a paso: Matemáticas, Lectura crítica, Sociales, Ciencias naturales e Inglés.",
      body, crumbs: [{ name: "Preguntas resueltas", path }],
      jsonLd: [{ "@type": "CollectionPage", name: "Preguntas ICFES resueltas", url: ctx.siteUrl + path, inLanguage: "es-CO",
        hasPart: order.map((a) => ({ "@type": "CollectionPage", name: `Preguntas ICFES de ${a} resueltas`, url: `${ctx.siteUrl}pregunta-icfes/${AREA_SLUG[a]}/` })) }],
    }));
  }

  // ---- one page per test of a past exam
  for (const ea of examAreas) {
    const ex = examOf(ea.exam);
    const path = ea.path;
    const up = "../../../";
    const booklets = ex.booklets.map((n) => loadPastBooklet(ctx.dataDir, n)).filter(Boolean);
    const per = booklets.map((b) => ({ b, n: b.exam.questions.filter((q) => q.section === ea.area).length })).filter((x) => x.n);
    const total = per.reduce((n, x) => n + x.n, 0);
    const shown = items.filter((it) => it.s.exam === ea.exam && it.area === ea.area);
    const cards = shown.map((it) => cardHtml(ctx, it, { full: false, up })).join("\n");
    if (cards.includes('class="katex')) ctx.markKatex();
    const siblings = examAreas.filter((x) => x.exam === ea.exam && x !== ea);
    const sameArea = examAreas.filter((x) => x.areaSlug === ea.areaSlug && x !== ea);
    const where = per.map((x) => `${x.n} en la ${sessionOf(x.b.name).toLowerCase()}`).join(" y ");
    const temas = [...new Set(shown.map((it) => it.s.tema.toLowerCase()))];
    const buttons = per.map((x, i) => `<a class="btn ${i ? "btn-ghost" : "btn-primary"}" href="${appArea(up, ea.areaSlug, x.b.name)}">${per.length > 1 ? `Presentar ${ctx.esc(ea.area)} · ${sessionOf(x.b.name)}` : `Presentar ${ctx.esc(ea.area)} del ${ctx.esc(ex.name)}`}</a>`).join("");
    const faq = [
      [`¿Cuántas preguntas de ${ea.area} tuvo el ${ex.name}?`, `${total} preguntas${per.length > 1 ? `: ${where}` : ""}. En la app puedes presentarlas todas con el tiempo del examen.`],
      [`¿Dónde están las respuestas de ${ea.area} del ${ex.name}?`, `Aquí tienes ${shown.length} resueltas y explicadas. La clave completa la ves en la app al entregar, junto con tu puntaje de 0 a 100 en ${ea.area} y el repaso de cada error.`],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${areaInfo(ea.area)?.color ?? "#C8F04A"}">${ctx.esc(ex.name)}</span>
  <h1>${ctx.esc(ea.area)} del ${ctx.esc(ex.name)}: preguntas resueltas</h1>
  <p class="prose">La prueba de ${ctx.esc(ea.area)} del ${ctx.esc(ex.name)} tuvo ${total} preguntas${per.length > 1 ? ` (${where})` : ""}. Abajo tienes ${shown.length} de ellas para responder, con la respuesta y por qué${temas.length ? ` (${temas.join(", ")})` : ""}. Las demás las presentas en la app con el tiempo del examen.</p>
  <div class="cta-row">${buttons}</div>
</div></section>
<section class="qlist wrap narrow" aria-label="Preguntas de ${ctx.esc(ea.area)} del ${ctx.esc(ex.name)}">
${cards}
</section>
<section class="wrap narrow guide-body">
  <h2>Las otras pruebas del ${ctx.esc(ex.name)}</h2>
  <p class="prose">${siblings.map((x) => `<a href="${up}${x.path}">${ctx.esc(x.area)}</a>`).join(" · ")}${siblings.length ? " · " : ""}<a href="${up}examenes-icfes-anteriores/${ex.slug}/">el examen completo</a>.</p>
  ${sameArea.length ? `<h2>${ctx.esc(ea.area)} en otros exámenes</h2>\n  <p class="prose">${sameArea.map((x) => `<a href="${up}${x.path}">${ctx.esc(examOf(x.exam).name)}</a>`).join(" · ")}. Y todas las <a href="${up}pregunta-icfes/${ea.areaSlug}/">preguntas de ${ctx.esc(ea.area)} resueltas</a>.</p>` : ""}
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta(up, `Presenta ${ctx.esc(ea.area)} del ${ctx.esc(ex.name)} completo`).replace(`href="${up}app/?empezar=1"`, `href="${appArea(up, ea.areaSlug, per[0]?.b.name)}"`)}`;
    const title = `${ea.area} ICFES ${ex.name.replace(/^ICFES /, "")} con respuestas | Cóndor`;
    write(path, ctx.page({
      siteUrl: ctx.siteUrl, path, title: [title, `${ea.area} ${ex.name} resuelto | Cóndor`, `${ea.area.split(" ")[0]} ${ex.name} resuelto | Cóndor`].find((t) => t.length <= 60),
      desc: clip(`${ea.area} del ${ex.name}: ${total} preguntas reales del Saber 11, ${shown.length} resueltas y explicadas, y el resto para presentar en línea con tiempo.`),
      body, katex: cards.includes('class="katex'),
      crumbs: [{ name: "Exámenes ICFES anteriores", path: "examenes-icfes-anteriores/" }, { name: ex.name, path: `examenes-icfes-anteriores/${ex.slug}/` }, { name: ea.area, path }],
      jsonLd: [ctx.faqLd(faq), { "@type": "Quiz", name: `${ea.area} del ${ex.name}`, url: ctx.siteUrl + path, inLanguage: "es-CO", educationalLevel: "Grado 11", isAccessibleForFree: true,
        about: { "@type": "Thing", name: `Saber 11 · ${ea.area}` }, citation: `ICFES, Saber 11, ${ex.name}`, hasPart: shown.map((it) => questionLd(it, ctx.siteUrl, false)) }],
    }));
  }

  checkCap(ctx.out);
  return pages;
}

// Every question any public page shows (cards carry their booklet and number as id): never more than PUBLIC_CAP.
function checkCap(out) {
  const ids = new Set();
  (function scan(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "app") scan(p); continue; }
      if (!name.endsWith(".html")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/<article class="qcard q[^"]*" id="([^"]+)"/g)) ids.add(m[1]);
    }
  })(out);
  console.log(`[build-seo-bank] public questions on the site: ${ids.size} of ${PUBLIC_CAP} allowed`);
  if (ids.size > PUBLIC_CAP) throw new Error(`[build-seo-bank] ${ids.size} questions are public, more than the ${PUBLIC_CAP} cap`);
}

export const bankDataExists = (dataDir) => existsSync(join(here, "seo-bank", "solved.json")) && existsSync(dataDir);
