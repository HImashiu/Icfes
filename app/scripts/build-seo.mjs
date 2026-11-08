// Public pages Google can read: "Simulacro ICFES gratis", a hub of sample questions and one page per area, each with
// real questions from the published ICFES booklets (source on every question) and their answers. Called by
// build-site.mjs after the landing page is copied into site-dist/. The questions are picked by fixed rules so the pages
// stay the same from build to build:
//   - the question is ready and trusted, has no figure or picture (the static page cannot draw figure specs),
//   - its key is the blue dot printed in the published booklet, with no dispute, and agrees with the scanned mark.
// Only a handful per area: the full bank, review and scoring stay in the app.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

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

function loadBank(dataDir) {
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

function usable(b, q, area) {
  if (canonArea(q.section) !== area) return false;
  if (!q.ready || q.provenance?.trusted === false || q.figure || q.item_type !== "standard") return false;
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

function page({ siteUrl, path, title, desc, body, crumbs, jsonLd, katex }) {
  const url = siteUrl + path;
  const up = "../".repeat(path.split("/").filter(Boolean).length);
  const crumbLd = {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Inicio", path: "" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: siteUrl + c.path })),
  };
  const ld = { "@context": "https://schema.org", "@graph": [crumbLd, ...jsonLd] };
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
  <link rel="icon" type="image/png" href="${up}brand/owl-64.png" />
  <link rel="apple-touch-icon" href="${up}brand/owl-192.png" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Cóndor" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${siteUrl}img/og.png" />
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
      <a class="brand" href="${up}" aria-label="Cóndor, inicio"><img src="${up}img/owl.svg" alt="" width="34" height="34" /><span>Cóndor</span></a>
      <nav class="top-nav" aria-label="Secciones">
        <a href="${up}simulacro-icfes/">Simulacro</a>
        <a href="${up}preguntas-icfes/">Preguntas</a>
        <a href="${up}#colegios">Colegios</a>
      </nav>
      <a class="btn btn-primary btn-sm" href="${up}app/">Practicar gratis</a>
    </div>
  </header>
  <main id="contenido">
    <nav class="crumbs wrap narrow" aria-label="Ruta"><a href="${up}">Inicio</a>${crumbs.map((c, i) => i === crumbs.length - 1 ? ` <span aria-hidden="true">›</span> <span aria-current="page">${esc(c.name)}</span>` : ` <span aria-hidden="true">›</span> <a href="${up}${c.path}">${esc(c.name)}</a>`).join("")}</nav>
${body}
  </main>
  <footer class="foot">
    <div class="wrap foot-row">
      <a class="brand" href="${up}"><img src="${up}img/owl.svg" alt="" width="28" height="28" /><span>Cóndor</span></a>
      <p>Plataforma independiente, no afiliada al ICFES. Fuente de las preguntas: ICFES, Saber 11.</p>
      <nav aria-label="Más">
        <a href="${up}simulacro-icfes/">Simulacro ICFES gratis</a>
        <a href="${up}preguntas-icfes/">Preguntas por área</a>
        <a href="${up}privacidad.html">Privacidad y términos</a>
      </nav>
    </div>
  </footer>
  <script src="${up}site.js" defer></script>
</body>
</html>
`;
}

const areaLinks = (up) => `<div class="areas">${AREAS.map((a) => `<a class="area" href="${up}preguntas-icfes/${a.slug}/" style="--c:${a.color}"><span class="dot"></span><b>${esc(a.name)}</b><span>Ver preguntas</span></a>`).join("")}</div>`;

const cta = (up, text) => `<section class="section"><div class="wrap narrow"><div class="card price reveal"><div><h2>${text}</h2><p>En la app tienes los 18 cuadernillos completos, simulacros con tiempo, tu puntaje de 0 a 500 y el repaso de tus errores.</p></div><a class="btn btn-primary" href="${up}app/">Empezar a practicar</a></div></div></section>`;

function faqBlock(items) {
  return `<div class="faq">${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}</div>`;
}
const faqLd = (items) => ({ "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, "") } })) });

export async function buildSeoPages({ appRoot, out, siteUrl, dataDir, renderRich }) {
  if (!existsSync(dataDir)) { console.warn(`[build-seo] ${dataDir} not found: question pages skipped.`); return []; }
  const bank = loadBank(dataDir);
  const pages = [];
  const write = (path, html) => { mkdirSync(join(out, path), { recursive: true }); writeFileSync(join(out, path, "index.html"), html); pages.push(path); };
  let usesKatex = false;

  // One page per area.
  for (const area of AREAS) {
    const items = area.grouped ? pickGroups(bank, area.name, area.count) : pickSingles(bank, area.name, area.count);
    if (!items.length) { console.warn(`[build-seo] no sample questions for ${area.name}`); continue; }
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
<section class="wrap narrow more"><p>Otras áreas: ${others}. ¿Vas a presentar el examen completo? Mira cómo es el <a href="../../simulacro-icfes/">simulacro ICFES</a>.</p></section>`;
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
  <div class="cta-row"><a class="btn btn-primary" href="../app/">Hacer el simulacro</a><a class="btn btn-ghost" href="../preguntas-icfes/">Ver preguntas de muestra</a></div>
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
  <h2>Practica por área</h2>
  ${areaLinks("../")}
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

  // KaTeX stylesheet and fonts for the math on the question pages.
  if (usesKatex) {
    const k = join(appRoot, "node_modules", "katex", "dist");
    mkdirSync(join(out, "katex", "fonts"), { recursive: true });
    copyFileSync(join(k, "katex.min.css"), join(out, "katex", "katex.min.css"));
    for (const f of readdirSync(join(k, "fonts")).filter((f) => f.endsWith(".woff2"))) copyFileSync(join(k, "fonts", f), join(out, "katex", "fonts", f));
  }
  return pages;
}
