// Public pages Google can read: "Simulacro ICFES gratis", a hub of sample questions and one page per area, each with
// real questions from the published ICFES booklets (source on every question) and their answers. Called by
// build-site.mjs after the landing page is copied into site-dist/. The questions are picked by fixed rules so the pages
// stay the same from build to build:
//   - the question is ready and trusted, has no figure or picture (the static page cannot draw figure specs),
//   - its key is the blue dot printed in the published booklet, with no dispute, and agrees with the scanned mark.
// Only a handful per area: the full bank, review and scoring stay in the app.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { buildContentPages } from "./build-seo-content.mjs";
import { buildExamPages } from "./build-seo-exams.mjs";

const AREAS = [
  {
    slug: "matematicas", name: "Matemáticas", color: "#FFB547", count: 8,
    title: "Preguntas ICFES de Matemáticas con respuestas",
    desc: "Preguntas reales de Matemáticas del Saber 11 publicadas por el ICFES, con su respuesta. Practica estadística, álgebra, geometría y probabilidad.",
    intro: [
      "La prueba de Matemáticas del Saber 11 tiene unas 50 preguntas, repartidas entre la Sesión 1 y la Sesión 2. Evalúa si sabes usar las matemáticas en situaciones cotidianas, no si recuerdas fórmulas sueltas.",
      "Mide tres competencias: <b>interpretación y representación</b> (leer tablas, gráficas y expresiones), <b>formulación y ejecución</b> (plantear y resolver un procedimiento) y <b>argumentación</b> (justificar si una afirmación o un procedimiento es correcto). Los temas son estadística, geometría, álgebra y cálculo.",
    ],
  },
  {
    slug: "lectura-critica", name: "Lectura crítica", color: "#8AB4FF", count: 6, grouped: true,
    title: "Preguntas ICFES de Lectura crítica con respuestas",
    desc: "Textos y preguntas reales de Lectura crítica del Saber 11 publicados por el ICFES, con su respuesta. Practica con textos literarios, informativos y argumentativos.",
    intro: [
      "Lectura crítica tiene 41 preguntas y va solo en la Sesión 1. Cada grupo de preguntas parte de un texto: literario, informativo, argumentativo, o discontinuo como una tabla o una infografía.",
      "Evalúa tres competencias: <b>identificar y entender</b> lo que dice el texto, <b>comprender cómo se relacionan</b> sus partes y <b>reflexionar y evaluar</b> su contenido, por ejemplo reconocer la intención del autor o la validez de un argumento.",
    ],
  },
  {
    slug: "sociales-y-ciudadanas", name: "Sociales y ciudadanas", color: "#F59EC4", count: 8,
    title: "Preguntas ICFES de Sociales y ciudadanas con respuestas",
    desc: "Preguntas reales de Sociales y competencias ciudadanas del Saber 11 publicadas por el ICFES, con su respuesta. Constitución, historia, geografía y ciudadanía.",
    intro: [
      "Sociales y ciudadanas tiene unas 50 preguntas, entre la Sesión 1 y la Sesión 2. Incluye historia, geografía, economía y la Constitución Política de Colombia, siempre aplicadas a situaciones concretas.",
      "Evalúa <b>pensamiento social</b> (usar conceptos de las ciencias sociales y de la Constitución), <b>interpretación y análisis de perspectivas</b> (entender los intereses de distintos actores) y <b>pensamiento reflexivo y sistémico</b> (ver un problema con todas sus dimensiones).",
    ],
  },
  {
    slug: "ciencias-naturales", name: "Ciencias naturales", color: "#5ED3B4", count: 8,
    title: "Preguntas ICFES de Ciencias naturales con respuestas",
    desc: "Preguntas reales de Ciencias naturales del Saber 11 publicadas por el ICFES, con su respuesta. Biología, química, física y ciencia, tecnología y sociedad.",
    intro: [
      "Ciencias naturales tiene unas 58 preguntas, entre la Sesión 1 y la Sesión 2. Cubre biología, química y física, y también ciencia, tecnología y sociedad.",
      "Evalúa el <b>uso comprensivo del conocimiento científico</b>, la <b>explicación de fenómenos</b> y la <b>indagación</b>: plantear preguntas, leer datos de un experimento y sacar conclusiones válidas.",
    ],
  },
  {
    slug: "ingles", name: "Inglés", color: "#C79BFF", count: 6, grouped: true,
    title: "Preguntas ICFES de Inglés con respuestas",
    desc: "Preguntas reales de Inglés del Saber 11 publicadas por el ICFES, con su respuesta. Practica comprensión de lectura y gramática por niveles A1, A2 y B1.",
    intro: [
      "La prueba de Inglés va en la Sesión 2 y tiene unas 55 preguntas organizadas en 7 partes: avisos, vocabulario, conversaciones, textos con espacios en blanco y comprensión de lectura.",
      "El resultado se da en niveles del Marco Común Europeo: <b>Pre A1, A1, A2 y B1</b>, además del puntaje de 0 a 100. Pesa menos en el puntaje global que las otras cuatro pruebas.",
    ],
  },
];

const CANON = { "ciencias naturales": "Ciencias naturales", "sociales y ciudadanas": "Sociales y ciudadanas", "matemáticas": "Matemáticas", "lectura crítica": "Lectura crítica", "inglés": "Inglés" };
const canonArea = (s) => CANON[(s ?? "").toLowerCase()] ?? null;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PICTURE = /<img\b|\[\[?\s*figura|!\[|<svg\b/i;
// A stem that talks about a drawing, chart or map needs that picture, which these pages cannot show.
const NEEDS_PICTURE = /\b(gr[aá]fic[oa]s?|figuras?|imagen(es)?|dibujos?|mapas?|diagramas?|esquemas?|ilustraci[oó]n|fotograf[ií]a|plano cartesiano|caricatura|historieta|infograf[ií]a|muestra[n]? a continuaci[oó]n|siguientes? (reacci[oó]n|ecuaci[oó]n qu[ií]mica))\b/i;
const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const bookletLabel = (name) => { const m = name.match(/^(S11-[A-Z0-9]+)_(1ra|2da)$/); return m ? `${m[1]} · Sesión ${m[2] === "1ra" ? 1 : 2}` : name; };
// Booklets known to be incomplete or mislabelled in the data are left out.
const SKIP = new Set(["S11-I_1ra", "S11-M_2da"]);

// Questions that have a native figure spec or a traced scan: they need a picture, so they stay in the app.
function figureQuestions(root, name) {
  const qs = new Set();
  for (const f of [join(root, "figures", "specs", `${name}.json`), join(root, "figures", "specs", `${name}.full.json`)]) {
    if (!existsSync(f)) continue;
    const spec = JSON.parse(readFileSync(f, "utf8"));
    for (const fig of [...(spec.figures ?? []), ...(spec.pending ?? [])]) {
      const n = fig?.location?.question;
      if (n != null) qs.add(Number(n));
    }
  }
  const traced = join(root, "figures", "traced", name, "manifest.json");
  if (existsSync(traced)) {
    const m = JSON.parse(readFileSync(traced, "utf8"));
    for (const e of Array.isArray(m) ? m : m.entries ?? m.figures ?? []) if (e?.question != null) qs.add(Number(e.question));
  }
  return qs;
}

export function loadBank(dataDir) {
  const keysDir = join(dirname(dataDir), "answer-keys");
  const out = [];
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith(".golden.json")).sort()) {
    const name = basename(file, ".golden.json");
    if (SKIP.has(name)) continue;
    const keyFile = join(keysDir, `${name}.key.json`);
    const sideFile = [join(keysDir, `${name}.sidecar.json`), join(keysDir, `${name}.key.sidecar.json`)].find(existsSync);
    if (!existsSync(keyFile) || !sideFile) continue;
    const exam = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
    const answers = JSON.parse(readFileSync(keyFile, "utf8")).answers ?? {};
    const side = JSON.parse(readFileSync(sideFile, "utf8")).questions ?? {};
    const groups = new Map((exam.groups ?? []).map((g) => [g.id, g]));
    out.push({ name, label: bookletLabel(name), exam, answers, side, groups, figureQs: figureQuestions(dirname(dataDir), name) });
  }
  return out;
}

function settledKey(b, q) {
  const key = b.answers[String(q.number)];
  const s = b.side[String(q.number)];
  if (!key || !s) return null;
  if (s.status !== "blue_dot" || !["dot", "dot+solve"].includes(s.confidence)) return null;
  if (q.scan_marked_option && q.scan_marked_option !== key) return null;
  return key;
}

// S11-A was checked by hand, question by question, in the editor; its provenance flags were never updated.
const HAND_CHECKED = new Set(["S11-A_1ra", "S11-A_2da"]);

export function usable(b, q, area, handChecked = false) {
  if (canonArea(q.section) !== area) return false;
  if (!q.ready || (q.provenance?.trusted === false && !(handChecked && HAND_CHECKED.has(b.name))) || q.figure || q.item_type !== "standard") return false;
  if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length !== (q.expected_options ?? q.options.length)) return false;
  const text = [q.stimulus_md, q.stem_md, ...q.options.map((o) => o.text_md)].join(" ");
  if (PICTURE.test(text) || q.options.some((o) => !String(o.text_md ?? "").trim())) return false;
  if (b.figureQs.has(q.number) || NEEDS_PICTURE.test(text)) return false;
  if (!String(q.stem_md ?? "").trim()) return false;
  return Boolean(settledKey(b, q));
}

// Standalone questions: one per booklet in turn, so the page mixes booklets; medium length only.
function pickSingles(bank, area, count) {
  const per = bank.map((b) => b.exam.questions.filter((q) => !q.group_id && usable(b, q, area)
    && (String(q.stimulus_md ?? "") + q.stem_md).length < 1100).map((q) => ({ b, q })));
  const picked = [];
  for (let round = 0; picked.length < count && round < 40; round++) {
    for (const list of per) {
      // Spread picks through each booklet rather than always taking its first questions.
      const item = list[(round * 3 + 1) % Math.max(1, list.length)];
      if (item && !picked.includes(item) && picked.length < count) picked.push(item);
    }
  }
  return picked.map((it) => ({ ...it, passage: null }));
}

// Reading areas: whole groups (text + its questions), each group from a different booklet, all of its questions usable.
function pickGroups(bank, area, count) {
  const out = [];
  for (const b of bank) {
    if (out.length >= count) break;
    for (const g of b.groups.values()) {
      const passage = String(g.passage_md ?? "");
      if (!passage.trim() || PICTURE.test(passage) || NEEDS_PICTURE.test(passage) || passage.length > 4200 || passage.length < 300) continue;
      const qs = b.exam.questions.filter((q) => q.group_id === g.id);
      if (qs.length < 2 || !qs.every((q) => usable(b, q, area))) continue;
      const take = qs.slice(0, 3);
      take.forEach((q, i) => out.push({ b, q, passage: i === 0 ? g : null, groupSize: take.length }));
      break;
    }
  }
  return out;
}

function questionHtml({ b, q, passage, groupSize }, area, renderRich) {
  const key = settledKey(b, q);
  const id = `${b.name}-${q.number}`.toLowerCase();
  const passageHtml = passage
    ? `<div class="paper passage"><p class="paper-label">Texto · ${esc(b.label)}${groupSize > 1 ? ` · preguntas ${passage.from} a ${passage.from + groupSize - 1}` : ""}</p>${passage.directions ? `<p class="paper-dir">${esc(passage.directions)}</p>` : ""}${renderRich(passage.passage_md)}</div>`
    : "";
  const opts = q.options.map((o) => `<li><button type="button" class="opt" data-l="${esc(o.letter)}"><span class="let">${esc(o.letter)}</span><span>${renderRich(o.text_md)}</span></button></li>`).join("");
  return `${passageHtml}
<article class="qcard q reveal" id="${id}" data-key="${esc(key)}">
  <div class="qbar"><span class="qarea"><span class="dot" style="--c:${area.color}"></span>${esc(area.name)}</span></div>
  <div class="paper">
    <p class="paper-label">Pregunta ${q.number} · ${esc(b.label)}</p>
    ${q.stimulus_md && plain(q.stimulus_md) !== plain(q.stem_md) ? renderRich(q.stimulus_md) : ""}
    <div class="paper-stem">${renderRich(q.stem_md)}</div>
  </div>
  <ul class="opts" aria-label="Opciones">${opts}</ul>
  <details class="ans"><summary>Ver la respuesta</summary><p>La respuesta es la <b>${esc(key)}</b>. Clave tomada del cuadernillo publicado por el ICFES.</p></details>
  <p class="source">Fuente: ICFES, Saber 11, cuadernillo ${esc(b.label)}, pregunta ${q.number}</p>
</article>`;
}

// The landing page's logo (mark + wordmark) and icon links, so every page carries the same brand.
let BRAND = null;
function brandBits(appRoot) {
  if (BRAND) return BRAND;
  const html = readFileSync(join(appRoot, "site", "index.html"), "utf8");
  const header = html.match(/<header class="top">[\s\S]*?<a class="brand"[^>]*>([\s\S]*?)<\/a>/);
  const footer = html.match(/<footer[\s\S]*?<a class="brand"[^>]*>([\s\S]*?)<\/a>/);
  const icons = (html.match(/<link rel="(icon|apple-touch-icon)"[^>]*>/g) ?? []).join("\n  ");
  BRAND = { header: header?.[1] ?? "", footer: footer?.[1] ?? "", icons };
  return BRAND;
}
// Relative links in the landing's markup, rewritten for a page `up` levels deep.
const rebase = (html, up) => html.replace(/(src|href)="(?!https?:|#|\/|data:)([^"]*)"/g, (m, a, v) => `${a}="${up}${v === "./" ? "" : v}"`);

// Share image of a page (scripts/build-og.mjs draws one per page; falls back to img/og.png if it cannot).
export const ogName = (path) => path.replace(/\/$/, "").replace(/\//g, "--");
let SITE_DIR = "";
const ogImagePath = (path) => existsSync(join(SITE_DIR, "img", "og", `${ogName(path)}.png`)) ? `img/og/${ogName(path)}.png` : "img/og.png";

function page({ siteUrl, path, title, desc, body, crumbs, jsonLd, katex, script, type = "website" }) {
  const url = siteUrl + path;
  const up = "../".repeat(path.split("/").filter(Boolean).length);
  const crumbLd = {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Inicio", path: "" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: siteUrl + c.path })),
  };
  const ld = { "@context": "https://schema.org", "@graph": [crumbLd, ...jsonLd.map((x) => ({ ...x, isPartOf: { "@id": `${siteUrl}#web` } }))] };
  return `<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="theme-color" content="#0D110F" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  ${rebase(BRAND.icons, up)}
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="Cóndor" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${siteUrl}${ogImagePath(path)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(title)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${up}site.css" />
  ${katex ? `<link rel="stylesheet" href="${up}katex/katex.min.css" />` : ""}
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
  <!--ANALYTICS-->
</head>
<body class="guide">
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="top">
    <div class="wrap top-row">
      <a class="brand" href="${up}" aria-label="Cóndor, inicio">${rebase(BRAND.header, up)}</a>
      <nav class="top-nav" aria-label="Secciones">
        <a href="${up}simulacro-icfes/">Simulacro</a>
        <a href="${up}preguntas-icfes/">Preguntas</a>
        <a href="${up}examenes-icfes-anteriores/">Exámenes anteriores</a>
        <a href="${up}calculadora-puntaje-icfes/">Calculadora</a>
        <a href="${up}como-prepararse-para-el-icfes/">Cómo prepararse</a>
        <a href="${up}preicfes-para-colegios/">Colegios</a>
      </nav>
      <a class="btn btn-primary btn-sm" href="${up}app/?empezar=1">Practicar gratis</a>
    </div>
  </header>
  <main id="contenido">
    <nav class="crumbs wrap narrow" aria-label="Ruta"><a href="${up}">Inicio</a>${crumbs.map((c, i) => i === crumbs.length - 1 ? ` <span aria-hidden="true">›</span> <span aria-current="page">${esc(c.name)}</span>` : ` <span aria-hidden="true">›</span> <a href="${up}${c.path}">${esc(c.name)}</a>`).join("")}</nav>
${body}
  </main>
  <footer class="foot">
    <div class="wrap foot-row">
      <a class="brand" href="${up}" aria-label="Cóndor, inicio">${rebase(BRAND.footer, up)}</a>
      <p>Plataforma independiente, no afiliada al ICFES. Fuente de las preguntas: ICFES, Saber 11.</p>
      <nav aria-label="Más">
        <a href="${up}simulacro-icfes/">Simulacro ICFES gratis</a>
        <a href="${up}examenes-icfes-anteriores/">Exámenes ICFES anteriores</a>
        <a href="${up}preguntas-icfes/">Preguntas por área</a>
        <a href="${up}calculadora-puntaje-icfes/">Calculadora de puntaje</a>
        <a href="${up}niveles-de-desempeno-icfes/">Niveles de desempeño</a>
        <a href="${up}preicfes-para-colegios/">Para colegios</a>
        <a href="${up}como-prepararse-para-el-icfes/">Cómo prepararse</a>
        <a href="${up}competencias-icfes/">Competencias ICFES</a>
        <a href="${up}resultados-icfes/">Cómo leer tus resultados</a>
        <a href="${up}glosario-icfes/">Glosario ICFES</a>
        <a href="${up}blog/">Blog</a>
        <a href="${up}privacidad.html">Privacidad y términos</a>
      </nav>
    </div>
  </footer>
  <script src="${up}site.js" defer></script>
  ${script ? `<script src="${up}${script}" defer></script>` : ""}
</body>
</html>
`;
}

const areaLinks = (up) => `<div class="areas">${AREAS.map((a) => `<a class="area" href="${up}preguntas-icfes/${a.slug}/" style="--c:${a.color}"><span class="dot"></span><b>${esc(a.name)}</b><span>Ver preguntas</span></a>`).join("")}</div>`;

const cta = (up, text) => `<section class="section"><div class="wrap narrow"><div class="card price reveal"><div><h2>${text}</h2><p>En la app tienes los 18 cuadernillos completos, simulacros con tiempo, tu puntaje de 0 a 500 y el repaso de tus errores.</p></div><a class="btn btn-primary" href="${up}app/?empezar=1">Empezar a practicar</a></div></div></section>`;

function faqBlock(items) {
  return `<div class="faq">${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}</div>`;
}
const faqLd = (items) => ({ "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, "") } })) });

export async function buildSeoPages({ appRoot, out, siteUrl, dataDir, renderRich, saber11, national }) {
  brandBits(appRoot);
  SITE_DIR = join(appRoot, "site");
  if (!existsSync(dataDir)) { console.warn(`[build-seo] ${dataDir} not found: question pages skipped.`); return []; }
  const bank = loadBank(dataDir);
  const pages = [];
  const write = (path, html) => { mkdirSync(join(out, path), { recursive: true }); writeFileSync(join(out, path, "index.html"), html); pages.push(path); };
  let usesKatex = false;
  const used = new Set(); // questions already on a page, so no page repeats another one's questions

  // One page per area.
  for (const area of AREAS) {
    const items = area.grouped ? pickGroups(bank, area.name, area.count) : pickSingles(bank, area.name, area.count);
    if (!items.length) { console.warn(`[build-seo] no sample questions for ${area.name}`); continue; }
    items.forEach((it) => used.add(`${it.b.name}-${it.q.number}`));
    const qs = items.map((it) => questionHtml(it, area, renderRich)).join("\n");
    if (qs.includes('class="katex')) usesKatex = true;
    const path = `preguntas-icfes/${area.slug}/`;
    const others = AREAS.filter((a) => a !== area).map((a) => `<a href="../${a.slug}/">${esc(a.name)}</a>`).join(" · ");
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${area.color}">${esc(area.name)}</span>
  <h1>${esc(area.title)}</h1>
  ${area.intro.map((p) => `<p class="prose">${p}</p>`).join("\n  ")}
  <p class="prose">Abajo tienes ${items.length} preguntas reales de cuadernillos que publicó el ICFES. Toca una opción para ver si acertaste.</p>
</div></section>
<section class="qlist wrap narrow" aria-label="Preguntas de ${esc(area.name)}">
${qs}
</section>
${cta("../../", `¿Quieres más preguntas de ${esc(area.name)}?`)}
<section class="wrap narrow more"><p>Otras áreas: ${others}.</p><p>¿Vas a presentar el examen completo? Mira cómo es el <a href="../../simulacro-icfes/">simulacro ICFES</a>, calcula tu puntaje con la <a href="../../calculadora-puntaje-icfes/">calculadora ICFES</a> o sigue el <a href="../../como-prepararse-para-el-icfes/">plan de estudio de 8 semanas</a>.</p></section>`;
    write(path, page({
      siteUrl, path, title: `${area.title} · Saber 11 | Cóndor`, desc: area.desc, body, katex: qs.includes('class="katex'),
      crumbs: [{ name: "Preguntas ICFES", path: "preguntas-icfes/" }, { name: area.name, path }],
      jsonLd: [{ "@type": "LearningResource", name: area.title, description: area.desc, inLanguage: "es-CO", url: siteUrl + path, educationalLevel: "Grado 11", learningResourceType: "Practice questions", isAccessibleForFree: true, about: { "@type": "Thing", name: `Saber 11 · ${area.name}` }, publisher: { "@type": "Organization", name: "Cóndor", url: siteUrl }, citation: "ICFES, Saber 11, cuadernillos publicados" }],
    }));
  }

  // Hub of all areas.
  {
    const path = "preguntas-icfes/";
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <h1>Preguntas tipo ICFES con respuestas, por área</h1>
  <p class="prose">Estas son preguntas reales del examen Saber 11, tomadas de los cuadernillos que el ICFES publicó, con la respuesta de cada una. Elige un área para practicar.</p>
  ${areaLinks("../")}
  <p class="prose">El examen tiene cinco pruebas: Matemáticas, Lectura crítica, Sociales y ciudadanas, Ciencias naturales e Inglés. Se presenta en dos sesiones el mismo día. Si quieres practicar con el examen completo y con tiempo, haz un <a href="../simulacro-icfes/">simulacro ICFES gratis</a>.</p>
</div></section>
${cta("../", "Practica con más de 4.000 preguntas")}`;
    write(path, page({
      siteUrl, path, title: "Preguntas tipo ICFES con respuestas por área · Saber 11 | Cóndor",
      desc: "Preguntas reales del Saber 11 con respuestas: Matemáticas, Lectura crítica, Sociales y ciudadanas, Ciencias naturales e Inglés. Tomadas de cuadernillos publicados por el ICFES.",
      body, crumbs: [{ name: "Preguntas ICFES", path }],
      jsonLd: [{ "@type": "CollectionPage", name: "Preguntas tipo ICFES por área", url: siteUrl + path, inLanguage: "es-CO", hasPart: AREAS.map((a) => ({ "@type": "LearningResource", name: a.title, url: `${siteUrl}preguntas-icfes/${a.slug}/` })) }],
    }));
  }

  // Simulacro ICFES gratis.
  {
    const path = "simulacro-icfes/";
    const faq = [
      ["¿Cuántas preguntas tiene el examen Saber 11?", "Unas 254, repartidas en dos sesiones: Lectura crítica 41, Matemáticas 50, Sociales y ciudadanas 50, Ciencias naturales 58 e Inglés 55. El número exacto cambia un poco entre cuadernillos."],
      ["¿Cuánto dura cada sesión?", "Cada sesión dura 4 horas y 30 minutos, y las dos se presentan el mismo día con un descanso en medio."],
      ["¿Cómo se calcula el puntaje global?", "Cada prueba da un puntaje de 0 a 100. El global va de 0 a 500 y se calcula con pesos: Lectura crítica, Matemáticas, Sociales y Ciencias pesan 3 cada una e Inglés pesa 1. Se suman, se dividen entre 13 y se multiplican por 5."],
      ["¿El simulacro de Cóndor da el mismo puntaje que el ICFES?", "Da un estimado. Usa los pesos, niveles de desempeño y percentiles oficiales, pero la dificultad de cada pregunta es estimada. Sirve para saber dónde estás y qué repasar; no reemplaza el resultado oficial."],
      ["¿De dónde salen las preguntas?", "De cuadernillos del Saber 11 que el ICFES publicó. Cada pregunta indica su cuadernillo y su número. Cóndor es independiente y no está afiliado al ICFES."],
    ];
    const rows = [["Lectura crítica", "41", "Sesión 1", "3"], ["Matemáticas", "≈ 50", "Sesiones 1 y 2", "3"], ["Sociales y ciudadanas", "≈ 50", "Sesiones 1 y 2", "3"], ["Ciencias naturales", "≈ 58", "Sesiones 1 y 2", "3"], ["Inglés", "≈ 55", "Sesión 2", "1"]];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Gratis</span>
  <h1>Simulacro ICFES gratis: presenta el Saber 11 completo</h1>
  <p class="prose">Haz el simulacro con preguntas reales de cuadernillos publicados por el ICFES, con la Sesión 1 y la Sesión 2, el tiempo del examen y tu puntaje estimado de 0 a 500 al terminar. Después repasas tus errores hasta acertarlos.</p>
  <div class="cta-row"><a class="btn btn-primary" href="../app/?empezar=1">Hacer el simulacro</a><a class="btn btn-ghost" href="../preguntas-icfes/">Ver preguntas de muestra</a></div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Cómo es el examen Saber 11</h2>
  <p class="prose">El Saber 11 se presenta en un solo día, en dos sesiones de 4 horas y 30 minutos. Todas las preguntas son de selección múltiple con única respuesta.</p>
  <div class="tbl"><table><thead><tr><th>Prueba</th><th>Preguntas</th><th>Sesión</th><th>Peso en el global</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
  <h2>Cómo se calcula tu puntaje</h2>
  <p class="prose">Cada prueba tiene un puntaje de 0 a 100 y un nivel de desempeño del 1 al 4 (en Inglés, niveles Pre A1, A1, A2 y B1). El puntaje global va de 0 a 500: se multiplica cada prueba por su peso, se suma, se divide entre 13 y se multiplica por 5.</p>
  <h2>Qué tiene el simulacro de Cóndor</h2>
  <ul class="checks">
    <li><b>18 cuadernillos completos</b> publicados por el ICFES, con Sesión 1 y Sesión 2.</li>
    <li><b>El tiempo real del examen</b> o práctica sin reloj, por área.</li>
    <li><b>Puntaje estimado de 0 a 500</b> con niveles y percentil nacional.</li>
    <li><b>Repaso de errores</b> pregunta por pregunta.</li>
    <li><b>Sin rankings:</b> te comparas con tu meta, no con otros.</li>
  </ul>
  <h2>Mini simulacro por área</h2>
  <p class="prose">¿Quieres probar una sola prueba primero? Cada mini simulacro tiene preguntas reales y te dice cuántas acertaste.</p>
  <div class="areas">${AREAS.map((a) => `<a class="area" href="${a.slug}/" style="--c:${a.color}"><span class="dot"></span><b>${esc(a.name)}</b><span>Mini simulacro</span></a>`).join("")}</div>
  <h2>Exámenes ICFES anteriores completos</h2>
  <p class="prose">Presenta un examen real de otro año, completo y con tiempo: <a href="../examenes-icfes-anteriores/icfes-2019-1/">ICFES 2019-1</a>, <a href="../examenes-icfes-anteriores/icfes-2020-calendario-a/">ICFES 2020 calendario A</a>, <a href="../examenes-icfes-anteriores/icfes-2020-calendario-b/">ICFES 2020 calendario B</a> y <a href="../examenes-icfes-anteriores/">todos los exámenes anteriores</a>.</p>
  <p class="prose">También puedes ver <a href="../preguntas-icfes/">preguntas por área con respuestas</a> y <a href="../competencias-icfes/">las competencias que evalúa cada prueba</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta("../", "Empieza tu simulacro ahora")}`;
    write(path, page({
      siteUrl, path, title: "Simulacro ICFES gratis 2026 · Saber 11 con puntaje de 0 a 500 | Cóndor",
      desc: "Simulacro ICFES gratis con preguntas reales del Saber 11: dos sesiones, tiempo del examen y puntaje estimado de 0 a 500. Matemáticas, Lectura crítica, Sociales, Ciencias e Inglés.",
      body, crumbs: [{ name: "Simulacro ICFES", path }],
      jsonLd: [faqLd(faq), { "@type": "WebPage", name: "Simulacro ICFES gratis", url: siteUrl + path, inLanguage: "es-CO", about: { "@type": "Thing", name: "Examen Saber 11" } }],
    }));
  }

  if (saber11 && national) buildScorePages({ siteUrl, write, saber11, national });
  buildGuidePage({ siteUrl, write });
  buildSchoolsPage({ siteUrl, write });
  buildTrialPage({ siteUrl, write });
  buildContentPages({
    siteUrl, write, page, esc, faqBlock, faqLd, cta, questionHtml, usable: (b, q, a) => usable(b, q, a, true), renderRich, AREAS, dataDir, used, bank,
    markKatex: () => { usesKatex = true; }, PICTURE, NEEDS_PICTURE,
  });

  buildExamPages({
    siteUrl, write, page, esc, faqBlock, faqLd, cta, renderRich, AREAS, dataDir, markKatex: () => { usesKatex = true; }, PICTURE, NEEDS_PICTURE,
  });

  // KaTeX stylesheet and fonts for the math on the question pages.
  if (usesKatex) {
    const k = join(appRoot, "node_modules", "katex", "dist");
    mkdirSync(join(out, "katex", "fonts"), { recursive: true });
    copyFileSync(join(k, "katex.min.css"), join(out, "katex", "katex.min.css"));
    for (const f of readdirSync(join(k, "fonts")).filter((f) => f.endsWith(".woff2"))) copyFileSync(join(k, "fonts", f), join(out, "katex", "fonts", f));
  }
  return pages;
}

// ---------------------------------------------------------------- score calculator, levels, study guide

const fmtN = (n) => n.toLocaleString("es-CO");
// The score at which a given share of the country scored lower (from the ICFES open data counts).
function scoreAtPercentile(entry, pct) {
  const n = entry.counts.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < entry.counts.length; i++) {
    if ((acc / n) * 100 >= pct) return entry.min + i;
    acc += entry.counts[i];
  }
  return entry.min + entry.counts.length - 1;
}

function buildScorePages({ siteUrl, write, saber11, national }) {
  const { TESTS, NATIONAL_SOURCE } = saber11;
  const total = national.global.counts.reduce((a, b) => a + b, 0);

  // Calculator.
  {
    const path = "calculadora-puntaje-icfes/";
    const pcts = [25, 50, 75, 90, 95, 99];
    const pctRows = pcts.map((p) => `<tr><td>${p === 50 ? "La mitad del país (mediana)" : `Mejor que el ${p} %`}</td><td><b>${scoreAtPercentile(national.global, p)}</b></td></tr>`).join("");
    const areaPct = TESTS.map((t) => `<tr><td>${esc(t.name)}</td>${[50, 75, 90].map((p) => `<td>${scoreAtPercentile(national[t.id], p)}</td>`).join("")}</tr>`).join("");
    const inputs = TESTS.map((t) => `<label class="calc-in"><span>${esc(t.name)}${t.weight === 1 ? " <small>(pesa 1)</small>" : " <small>(pesa 3)</small>"}</span><input type="number" inputmode="numeric" min="0" max="100" step="1" name="${t.id}" placeholder="0 a 100" /></label>`).join("");
    const levelsJson = Object.fromEntries(TESTS.map((t) => [t.id, t.levels.map((l) => [l.label, l.from, l.to])]));
    const faq = [
      ["¿Cuál es el puntaje máximo del ICFES?", "500 en el puntaje global y 100 en cada prueba."],
      ["¿Qué es un buen puntaje en el ICFES?", `Depende de tu meta. Con datos del ICFES de 2022, un global de ${scoreAtPercentile(national.global, 50)} te pone en la mitad del país, ${scoreAtPercentile(national.global, 75)} en el 25 % más alto y ${scoreAtPercentile(national.global, 90)} en el 10 % más alto. Muchas universidades públicas y becas piden más de 300.`],
      ["¿Por qué Inglés pesa menos?", "El ICFES le da peso 1 a Inglés y peso 3 a las otras cuatro pruebas. Por eso subir 10 puntos en Matemáticas mueve el global tres veces más que subir 10 en Inglés."],
      ["¿Esta calculadora es oficial?", "No. Usa la fórmula y los niveles que publica el ICFES y la distribución nacional de 2022 de sus datos abiertos. Tu percentil real depende de los estudiantes que presenten el examen contigo."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Calculadora</span>
  <h1>Calculadora del puntaje ICFES</h1>
  <p class="prose">Escribe tu puntaje de 0 a 100 en cada prueba del Saber 11 y te mostramos tu <b>puntaje global de 0 a 500</b>, tu <b>nivel de desempeño</b> en cada prueba y qué porcentaje de estudiantes del país tuvo un puntaje menor.</p>
</div></section>
<section class="wrap narrow">
  <form class="card calc" id="calc" novalidate>
    <div class="calc-grid">${inputs}</div>
    <div class="calc-out" id="calc-out" aria-live="polite">
      <div class="calc-big"><span>Puntaje global</span><b id="calc-global">–</b><small id="calc-gpct">Llena las cinco pruebas</small></div>
      <ul class="calc-levels" id="calc-levels"></ul>
    </div>
  </form>
  <script type="application/json" id="calc-data">${JSON.stringify({ levels: levelsJson, dist: Object.fromEntries(Object.entries(national).map(([k, v]) => [k, { min: v.min, counts: v.counts }])) })}</script>
  <p class="source">Percentiles con la distribución nacional: ${esc(NATIONAL_SOURCE)}.</p>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo se calcula el puntaje global</h2>
  <p class="prose">Cada prueba se califica de 0 a 100. El global se calcula así: <b>(3 × Lectura crítica + 3 × Matemáticas + 3 × Sociales + 3 × Ciencias + 1 × Inglés) ÷ 13 × 5</b>, redondeado.</p>
  <p class="prose">Ejemplo: con 60 en Lectura crítica, 55 en Matemáticas, 50 en Sociales, 52 en Ciencias y 65 en Inglés: (180 + 165 + 150 + 156 + 65) ÷ 13 × 5 = <b>275</b>.</p>
  <h2>¿Qué es un buen puntaje ICFES?</h2>
  <p class="prose">Así quedó el puntaje global de los ${fmtN(total)} estudiantes de calendario A que presentaron el Saber 11 en 2022:</p>
  <div class="tbl"><table><thead><tr><th>Posición en el país</th><th>Puntaje global</th></tr></thead><tbody>${pctRows}</tbody></table></div>
  <p class="prose">Y por prueba (puntaje de 0 a 100):</p>
  <div class="tbl"><table><thead><tr><th>Prueba</th><th>Mediana</th><th>Mejor que el 75 %</th><th>Mejor que el 90 %</th></tr></thead><tbody>${areaPct}</tbody></table></div>
  <p class="prose">Mira qué significa cada rango en <a href="../niveles-de-desempeno-icfes/">niveles de desempeño del ICFES</a>, o mide tu puntaje real con un <a href="../simulacro-icfes/">simulacro ICFES completo</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta("../", "Descubre tu puntaje con un simulacro")}`;
    write(path, page({
      siteUrl, path, title: "Calculadora del puntaje ICFES 2026: global de 0 a 500 y percentil | Cóndor",
      desc: "Calcula tu puntaje global del ICFES (Saber 11) de 0 a 500 con la fórmula oficial, tu nivel de desempeño por prueba y en qué percentil del país quedas. Gratis.",
      body, crumbs: [{ name: "Calculadora de puntaje", path }], script: "calc.js",
      jsonLd: [faqLd(faq), { "@type": "WebApplication", name: "Calculadora del puntaje ICFES", url: siteUrl + path, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: "es-CO", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "COP" } }],
    }));
  }

  // Levels.
  {
    const path = "niveles-de-desempeno-icfes/";
    const tables = TESTS.map((t) => `<h2>${esc(t.name)}</h2>
  <div class="tbl"><table><thead><tr><th>${t.mcer ? "Nivel (MCER)" : "Nivel"}</th><th>Puntaje</th><th>Qué sabe hacer el estudiante</th></tr></thead><tbody>${t.levels.map((l) => `<tr><td><b>${esc(l.label)}</b></td><td>${l.from} a ${l.to}</td><td>${esc(l.desc)}</td></tr>`).join("")}</tbody></table></div>`).join("\n  ");
    const faq = [
      ["¿Cuántos niveles de desempeño tiene el ICFES?", "Cuatro en Lectura crítica, Matemáticas, Sociales y Ciencias (del 1 al 4). Inglés usa los niveles del Marco Común Europeo: Pre A1, A1, A2 y B1."],
      ["¿Qué nivel es bueno?", "El nivel 3 indica que el estudiante va más allá de lo literal y relaciona conceptos; el nivel 4 es el más alto. En Inglés, B1 es el nivel más alto que mide el Saber 11."],
      ["¿Los niveles de Inglés cambiaron?", "Sí. Desde 2025 el ICFES reporta Pre A1, A1, A2 y B1. Hasta 2024 usaba A-, A1, A2, B1 y B+ con otros cortes."],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Guía</span>
  <h1>Niveles de desempeño del ICFES (Saber 11)</h1>
  <p class="prose">Además del puntaje de 0 a 100, el ICFES ubica cada prueba en un <b>nivel de desempeño</b> que describe lo que el estudiante sabe hacer. Estos son los rangos de puntaje de cada nivel y lo que significan.</p>
</div></section>
<section class="wrap narrow guide-body">
  ${tables}
  <p class="prose">Hasta 2024, Inglés usaba otros niveles: A- (0 a 47), A1 (48 a 57), A2 (58 a 67), B1 (68 a 78) y B+ (79 a 100).</p>
  <p class="prose">¿Quieres saber en qué nivel estás? Usa la <a href="../calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a> o haz un <a href="../simulacro-icfes/">simulacro gratis</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta("../", "Mide tu nivel en cada prueba")}`;
    write(path, page({
      siteUrl, path, title: "Niveles de desempeño ICFES Saber 11: rangos de puntaje por prueba | Cóndor",
      desc: "Rangos de puntaje de los niveles de desempeño 1 a 4 del ICFES en Lectura crítica, Matemáticas, Sociales y Ciencias, y los niveles de Inglés Pre A1, A1, A2 y B1.",
      body, crumbs: [{ name: "Niveles de desempeño", path }],
      jsonLd: [faqLd(faq), { "@type": "Article", headline: "Niveles de desempeño del ICFES (Saber 11)", inLanguage: "es-CO", url: siteUrl + path, publisher: { "@type": "Organization", name: "Cóndor", url: siteUrl } }],
    }));
  }
}

function buildGuidePage({ siteUrl, write }) {
  const path = "como-prepararse-para-el-icfes/";
  const weeks = [
    ["1", "Simulacro completo de diagnóstico, con tiempo. Anota tu puntaje por prueba y las preguntas que fallaste."],
    ["2 y 3", "Refuerza tus dos pruebas más bajas de Lectura crítica, Matemáticas, Sociales o Ciencias (pesan 3 cada una). 20 a 30 preguntas al día y repaso de cada error."],
    ["4", "Segundo simulacro. Compara por prueba y mira qué tipo de pregunta sigues fallando."],
    ["5 y 6", "Práctica mezclada de las cinco pruebas, con tiempo por pregunta. Inglés unos días por semana."],
    ["7", "Tercer simulacro completo, en el horario del examen real."],
    ["8", "Repaso suave de tus errores. Duerme bien y prepara los materiales del día del examen."],
  ];
  const tips = [
    ["Lectura crítica", "Lee primero la pregunta y luego vuelve al texto. Las respuestas casi siempre se apoyan en algo que el texto dice; descarta las opciones que agregan ideas que el autor no plantea."],
    ["Matemáticas", "No hay calculadora, así que practica operaciones a mano, porcentajes y lectura de gráficas. Muchas preguntas piden validar un procedimiento: revisa paso por paso dónde falla."],
    ["Sociales y ciudadanas", "Repasa la Constitución (derechos, mecanismos de participación, ramas del poder) y practica identificar los intereses de cada actor en un conflicto."],
    ["Ciencias naturales", "Lee bien tablas y gráficas de experimentos: qué variable cambia, cuál se mide y qué conclusión se puede sacar. Pregúntate siempre si los datos alcanzan para concluir algo."],
    ["Inglés", "Las primeras partes son las más fáciles: avisos, vocabulario y conversaciones cortas. Asegura esos puntos y lee en inglés unos minutos al día."],
  ];
  const faq = [
    ["¿Cuánto tiempo antes debo empezar a prepararme?", "Lo ideal son dos o tres meses, con 30 a 60 minutos de práctica al día. Si te queda menos tiempo, prioriza simulacros y repaso de errores."],
    ["¿Se resta por responder mal?", "No. Una pregunta sin responder cuenta como incorrecta, así que responde todas. Si no sabes, descarta opciones y elige entre las que quedan."],
    ["¿Puedo llevar calculadora?", "No. En el Saber 11 no se permite calculadora ni celular. Lleva tu documento de identidad original, lápiz de mina negra número 2, borrador y tajalápiz."],
    ["¿Cuánto tiempo tengo por pregunta?", "Cada sesión dura 4 horas y 30 minutos para unas 120 a 135 preguntas: unos 2 minutos por pregunta. Practica con tiempo para no quedarte sin terminar."],
  ];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Guía de estudio</span>
  <h1>Cómo prepararse para el ICFES: plan de 8 semanas</h1>
  <p class="prose">Prepararse para el Saber 11 no es estudiar todo de nuevo: es conocer el examen, saber en qué fallas y practicar justo eso. Este plan te sirve si tienes unos dos meses; si tienes menos, comprime las semanas pero conserva los simulacros.</p>
</div></section>
<section class="wrap narrow guide-body">
  <h2>1. Conoce el examen</h2>
  <p class="prose">Son cinco pruebas en dos sesiones el mismo día. Lectura crítica, Matemáticas, Sociales y Ciencias pesan 3 en el global; Inglés pesa 1. Mira la estructura completa en <a href="../simulacro-icfes/">simulacro ICFES</a> y cómo se calcula tu puntaje en la <a href="../calculadora-puntaje-icfes/">calculadora</a>.</p>
  <h2>2. Plan semana a semana</h2>
  <div class="tbl"><table><thead><tr><th>Semana</th><th>Qué hacer</th></tr></thead><tbody>${weeks.map(([w, d]) => `<tr><td><b>${w}</b></td><td>${d}</td></tr>`).join("")}</tbody></table></div>
  <h2>3. Consejos por prueba</h2>
  ${tips.map(([a, t]) => `<h3>${a}</h3><p class="prose">${t} <a href="../preguntas-icfes/${AREAS.find((x) => x.name === a).slug}/">Practica ${a}</a>.</p>`).join("\n  ")}
  <h2>4. El día del examen</h2>
  <ul class="checks">
    <li><b>Lleva</b> tu documento de identidad original, lápiz de mina negra número 2, borrador y tajalápiz.</li>
    <li><b>Responde todas las preguntas:</b> no se resta por equivocarse.</li>
    <li><b>Marca bien la hoja de respuestas:</b> rellena el óvalo completo y revisa que el número coincida.</li>
    <li><b>Controla el tiempo:</b> si una pregunta te toma más de 3 minutos, márcala y vuelve al final.</li>
  </ul>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta("../", "Empieza con un simulacro de diagnóstico")}`;
  write(path, page({
    siteUrl, path, title: "Cómo prepararse para el ICFES: plan de estudio de 8 semanas | Cóndor",
    desc: "Plan de estudio para el ICFES Saber 11: simulacros de diagnóstico, qué repasar en cada prueba, manejo del tiempo y qué llevar el día del examen.",
    body, crumbs: [{ name: "Cómo prepararse", path }],
    jsonLd: [faqLd(faq), { "@type": "Article", headline: "Cómo prepararse para el ICFES: plan de 8 semanas", inLanguage: "es-CO", url: siteUrl + path, publisher: { "@type": "Organization", name: "Cóndor", url: siteUrl } }],
  }));
}

function buildSchoolsPage({ siteUrl, write }) {
  const path = "preicfes-para-colegios/";
  const features = [
    ["Simulacros y tareas por curso", "Asigna un simulacro completo, una sesión o una práctica por área a cada curso, con fecha de apertura y cierre. Los estudiantes la presentan desde el celular o el computador."],
    ["Hoy: lo que necesita atención", "Cada día el docente ve qué estudiantes bajaron, no entregaron o fallan siempre el mismo tipo de pregunta. Agrupa alertas, las marca como listas o las pospone."],
    ["Resultados en el formato del ICFES", "Puntaje de 0 a 100 por prueba, global de 0 a 500, niveles de desempeño y percentil nacional estimado, por estudiante, por curso y por competencia."],
    ["Simulacro en papel con plano del salón", "Imprime el cuadernillo con la portada del colegio, en A4 o carta, con varias versiones que cambian el orden de las preguntas. El plano del salón indica dónde se sienta cada estudiante. Las hojas se califican escaneándolas con el celular."],
    ["Juego en vivo, ahora o programado", "Proyecta preguntas y los estudiantes responden desde su celular con un código o QR. Puedes dejarlo programado para una hora de clase. Sin tablas de posiciones: cada estudiante ve su propio avance."],
    ["Control de preguntas repetidas", "El sistema recuerda qué preguntas vio cada grupo, para que una tarea no repita las del simulacro y los resultados reflejen lo que de verdad saben."],
    ["Banco de más de 4.000 preguntas", "Preguntas de cuadernillos publicados por el ICFES, con su fuente. Conviértelas en diapositivas, taller o quiz para la clase, o crea las tuyas con el editor."],
    ["Hoja de datos y tableros", "Revisa las notas de cada curso en una hoja de datos, con gráficas que puedes guardar en tableros para la coordinación."],
    ["Cuentas del colegio", "Docentes y estudiantes entran con la cuenta de Google del colegio. Coordinación ve todos los cursos; cada docente, los suyos."],
  ];
  const faq = [
    ["¿Qué necesita el colegio para empezar?", "Solo internet y las cuentas de Google del colegio. No hay que instalar nada: funciona en el navegador del computador, la tableta o el celular."],
    ["¿Sirve si los estudiantes no tienen computador?", "Sí. Los simulacros se pueden presentar en papel con el cuadernillo impreso y calificar escaneando las hojas de respuestas con un celular."],
    ["¿Las preguntas son del ICFES?", "El banco usa preguntas de cuadernillos que el ICFES publicó, y cada una indica su fuente. Cóndor es independiente y no está afiliado al ICFES."],
    ["¿Cuánto cuesta?", "Durante la etapa de demostración es gratis. Escríbenos y te mostramos la plataforma con los cursos de tu colegio."],
  ];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Para colegios</span>
  <h1>Preicfes para colegios: simulacros, resultados por curso y simulacros en papel</h1>
  <p class="prose">Cóndor es una plataforma para preparar el Saber 11 en el colegio. Los docentes asignan simulacros y tareas por curso, los estudiantes practican en línea o en papel, y coordinación ve los resultados en el mismo formato del ICFES.</p>
  <div class="cta-row"><a class="btn btn-primary" href="../#colegios">Pedir una demostración</a><a class="btn btn-ghost" href="../app/">Ver la plataforma</a></div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Qué incluye</h2>
  ${features.map(([t, d]) => `<h3>${t}</h3><p class="prose">${d}</p>`).join("\n  ")}
  <h2>Cómo funciona en un periodo</h2>
  <div class="tbl"><table><thead><tr><th>Momento</th><th>Qué pasa</th></tr></thead><tbody>
    <tr><td><b>Inicio</b></td><td>Simulacro de diagnóstico para todo el grado 11, en línea o en papel.</td></tr>
    <tr><td><b>Cada semana</b></td><td>Tareas cortas por área según lo que el diagnóstico mostró. Juego en vivo en clase para repasar.</td></tr>
    <tr><td><b>Mitad</b></td><td>Segundo simulacro. Comparación por curso, área y competencia.</td></tr>
    <tr><td><b>Antes del examen</b></td><td>Simulacro final con tiempo real y repaso de los errores de cada estudiante.</td></tr>
  </tbody></table></div>
  <h2>Prueba con tu código de docente</h2>
  <p class="prose">Si ya recibiste un código de prueba, entra a la plataforma de docentes en un par de minutos. <a href="../prueba-docente/">Cómo entrar con tu código</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
<section class="section"><div class="wrap narrow"><div class="card price reveal"><div><h2>Muéstrale Cóndor a tu colegio</h2><p>Te hacemos una demostración con tus cursos y tus docentes. Gratis durante la etapa de demostración.</p></div><a class="btn btn-primary" href="../#colegios">Pedir una demostración</a></div></div></section>`;
  write(path, page({
    siteUrl, path, title: "Preicfes para colegios: plataforma de simulacros ICFES por curso | Cóndor",
    desc: "Plataforma preicfes para colegios: simulacros Saber 11 en línea o en papel, resultados por curso y competencia en formato ICFES, alertas de estudiantes y juego en vivo.",
    body, crumbs: [{ name: "Para colegios", path }],
    jsonLd: [faqLd(faq), { "@type": "Service", name: "Cóndor para colegios", serviceType: "Preparación Saber 11 (preicfes) para colegios", areaServed: { "@type": "Country", name: "Colombia" }, provider: { "@id": `${siteUrl}#org` }, url: siteUrl + path, inLanguage: "es-CO" }],
  }));
}

function buildTrialPage({ siteUrl, write }) {
  const path = "prueba-docente/";
  const faq = [
    ["¿Necesito pagar?", "No. Durante la etapa de demostración la plataforma es gratis para docentes con código de prueba."],
    ["¿Qué pasa si el código venció o ya no admite más docentes?", "Cada colegio tiene un código con vencimiento de 20 días y un límite de docentes. Escríbenos desde la página de demostración y te enviamos uno nuevo."],
    ["¿Mis estudiantes necesitan código?", "No. Entran con su cuenta de Google. Si su correo es el del colegio, ven sus cursos y tareas; si no, practican de forma independiente."],
    ["¿Qué datos se guardan?", "Tu nombre, tu correo de Google y lo que se hace en la plataforma: cursos, tareas y resultados. Puedes leer más en la página de privacidad."],
  ];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Docentes</span>
  <h1>Entra a la plataforma de docentes con tu código de prueba</h1>
  <p class="prose">Con el código creas tu colegio de prueba, armas tus cursos y pruebas las tareas, los simulacros en línea y en papel, y el juego en vivo con tus estudiantes.</p>
  <div class="cta-row"><a class="btn btn-primary" href="../app/#docente">Activar prueba gratuita</a><a class="btn btn-ghost" href="../preicfes-para-colegios/">Qué incluye</a></div>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Cómo entrar</h2>
  <ol class="steps">
    <li><b>Abre la app.</b> Ve a <a href="../app/#docente">condoricfes.com/app</a> y elige “Soy docente”.</li>
    <li><b>Escribe el código de tu colegio.</b> Se parece a <code>CND-XXXX-XXXX-XXXX-XXXX</code>. El primer docente que entra crea el colegio de prueba; los demás entran al mismo.</li>
    <li><b>Entra con tu cuenta de Google.</b> Sirve la del colegio o la personal. Si ya habías entrado antes como estudiante, el código convierte esa cuenta en docente.</li>
  </ol>
  <h2>Primeros pasos</h2>
  <p class="prose">Al entrar, un recorrido corto te muestra dónde está cada cosa. Crea un curso, agrega a tus estudiantes con su correo y asigna un simulacro. Ellos lo presentan desde su celular o en papel, y en Hoy ves quién necesita apoyo. ¿Quieres ver primero cómo se ve con datos? Activa «Datos de ejemplo» en el panel: muestra un colegio inventado sin tocar el tuyo.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
<section class="section"><div class="wrap narrow"><div class="card price reveal"><div><h2>¿Todavía no tienes código?</h2><p>Pide una demostración para tu colegio y te lo enviamos.</p></div><a class="btn btn-primary" href="../#colegios">Pedir una demostración</a></div></div></section>`;
  write(path, page({
    siteUrl, path, title: "Entrar a Cóndor para docentes con código de prueba | Cóndor",
    desc: "Entra a la plataforma de docentes de Cóndor con tu código de prueba: cursos, tareas, simulacros en línea y en papel, y alertas por estudiante.",
    body, crumbs: [{ name: "Docentes", path }],
    jsonLd: [faqLd(faq), { "@type": "WebPage", name: "Entrar con código de prueba", url: siteUrl + path, inLanguage: "es-CO" }],
  }));
}
