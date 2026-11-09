// Second round of public pages for search (SEO plan, section 1), built by build-seo.mjs with its helpers:
//   /simulacro-icfes/<area>/      one mini simulacro per area: how that test works, strategy, 5 questions with a score
//   /competencias-icfes/           the 12 competencies the ICFES evaluates, each with real tagged questions
//   /resultados-icfes/             how to read an ICFES results report
//   /glosario-icfes/               ICFES terms with short definitions
//   /blog/ + two articles          evergreen study articles
// Questions never repeat across pages (ctx.used), only settled keys are shown, and explanations stay in the app.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const COMPETENCIES = [
  {
    slug: "interpretacion-y-representacion", area: "Matemáticas", name: "Interpretación y representación",
    tag: "Interpretación y representación",
    what: "Es la capacidad de leer y usar representaciones de información cuantitativa: tablas, gráficas, diagramas, expresiones algebraicas y enunciados verbales, y de pasar de una representación a otra sin cambiar lo que dicen.",
    tasks: ["Leer un dato o comparar valores en una tabla o gráfica.", "Elegir la gráfica que representa correctamente unos datos.", "Traducir una situación escrita a una expresión o ecuación.", "Reconocer qué información aporta una representación y cuál no."],
    tips: ["Antes de mirar las opciones, di en una frase qué muestra la tabla o gráfica: qué variable va en cada eje y en qué unidades.", "Revisa escalas y unidades: muchas opciones incorrectas usan bien el número pero con la unidad equivocada.", "Cuando debas elegir una gráfica, comprueba dos o tres puntos concretos en vez de mirar la forma general."],
  },
  {
    slug: "formulacion-y-ejecucion", area: "Matemáticas", name: "Formulación y ejecución",
    tag: "Formulación y ejecución",
    what: "Es la capacidad de plantear una estrategia para resolver un problema, elegir el modelo o procedimiento adecuado (una ecuación, una proporción, un conteo, una probabilidad) y llevarlo a cabo con precisión.",
    tasks: ["Plantear la ecuación o el procedimiento que resuelve una situación.", "Calcular porcentajes, proporciones, áreas, volúmenes o probabilidades.", "Elegir entre varios procedimientos el que sirve para responder una pregunta.", "Resolver problemas de varios pasos."],
    tips: ["Escribe primero qué te piden y qué datos tienes; muchas veces sobra información.", "Estima el resultado antes de calcular: te ayuda a descartar opciones absurdas.", "Practica operaciones a mano: en el examen no se permite calculadora."],
  },
  {
    slug: "argumentacion", area: "Matemáticas", name: "Argumentación",
    tag: "Argumentación",
    what: "Es la capacidad de justificar o refutar afirmaciones, procedimientos y conclusiones con razones matemáticas: decir por qué algo es correcto o en qué paso falla.",
    tasks: ["Decidir si una afirmación sobre unos datos es verdadera y por qué.", "Encontrar el error en un procedimiento resuelto paso a paso.", "Elegir la razón que justifica una conclusión.", "Reconocer cuándo los datos no alcanzan para concluir algo."],
    tips: ["En las opciones de la forma 'sí, porque…' o 'no, porque…', revisa por separado la decisión y la razón: muchas opciones aciertan una y fallan la otra.", "Para encontrar un error, revisa cada paso con un número concreto.", "Desconfía de las afirmaciones con 'siempre' o 'nunca': basta un contraejemplo."],
  },
  {
    slug: "contenidos-locales-de-un-texto", area: "Lectura crítica", name: "Identificar y entender los contenidos locales de un texto",
    tag: "Identificar y entender los contenidos locales que conforman un texto",
    what: "Es la capacidad de comprender el significado de palabras, expresiones y frases dentro del texto en que aparecen, y de entender lo que dice explícitamente cada parte.",
    tasks: ["Explicar qué significa una palabra o expresión en su contexto.", "Identificar quién dice algo o a quién se refiere un pronombre.", "Reconocer la información que el texto dice de forma literal.", "Parafrasear una oración sin cambiar su sentido."],
    tips: ["Vuelve siempre al texto: la respuesta correcta está apoyada en lo que el texto dice.", "Para el significado de una palabra, reemplázala por cada opción y lee la frase completa.", "Descarta las opciones que agregan información que el texto no menciona."],
  },
  {
    slug: "articulacion-de-las-partes-de-un-texto", area: "Lectura crítica", name: "Comprender cómo se articulan las partes de un texto",
    tag: "Comprender cómo se articulan las partes de un texto para darle un sentido global",
    what: "Es la capacidad de entender cómo se relacionan las partes de un texto para formar un sentido global: la idea principal, la función de cada párrafo, la estructura y las relaciones entre ideas.",
    tasks: ["Identificar la idea principal o la tesis del texto.", "Reconocer la función de un párrafo (ejemplificar, contrastar, concluir).", "Relacionar dos partes del texto o dos ideas.", "Identificar la estructura del texto o el tipo de texto."],
    tips: ["Después de leer, resume el texto en una sola frase antes de ver las preguntas.", "Fíjate en los conectores (sin embargo, por lo tanto, en cambio): muestran cómo se relacionan las ideas.", "Para la idea principal, descarta las opciones que solo hablan de un párrafo."],
  },
  {
    slug: "reflexionar-y-evaluar-un-texto", area: "Lectura crítica", name: "Reflexionar a partir de un texto y evaluar su contenido",
    tag: "Reflexionar a partir de un texto y evaluar su contenido",
    what: "Es la capacidad de asumir una postura crítica frente al texto: evaluar sus argumentos y supuestos, reconocer la intención del autor, distinguir hechos de opiniones y relacionar el texto con otros textos o contextos.",
    tasks: ["Reconocer la intención o la postura del autor.", "Evaluar si un argumento es válido o qué lo fortalece o debilita.", "Distinguir entre un hecho y una opinión.", "Relacionar el texto con otra fuente o situación."],
    tips: ["Pregúntate para qué escribió el autor el texto: informar, convencer, criticar, narrar.", "Para fortalecer o debilitar un argumento, busca la opción que toque directamente la razón principal.", "Una opinión usa juicios de valor; un hecho se puede comprobar."],
  },
  {
    slug: "pensamiento-social", area: "Sociales y ciudadanas", name: "Pensamiento social",
    tag: "Pensamiento social",
    what: "Es la capacidad de usar conceptos básicos de las ciencias sociales (historia, geografía, economía, política) y de la Constitución Política de Colombia para comprender problemas sociales.",
    tasks: ["Reconocer derechos y deberes y los mecanismos para protegerlos.", "Identificar la función de las ramas del poder y los órganos de control.", "Usar conceptos históricos, geográficos o económicos para explicar una situación.", "Relacionar un hecho con su contexto histórico."],
    tips: ["Repasa la Constitución: derechos fundamentales, tutela, acción popular, ramas del poder y organismos de control.", "Lee el caso completo antes de mirar las opciones: el concepto clave suele estar en un detalle.", "Relaciona cada concepto con un ejemplo concreto de la vida diaria."],
  },
  {
    slug: "interpretacion-y-analisis-de-perspectivas", area: "Sociales y ciudadanas", name: "Interpretación y análisis de perspectivas",
    tag: "Interpretación y análisis de perspectivas",
    what: "Es la capacidad de analizar un problema desde la mirada de los distintos actores que participan en él: sus intereses, argumentos y prejuicios, y de evaluar la información y las fuentes que usan.",
    tasks: ["Identificar los intereses de cada actor en un conflicto.", "Reconocer un prejuicio o una generalización en un argumento.", "Comparar dos posturas sobre un mismo problema.", "Evaluar si una fuente es confiable o suficiente."],
    tips: ["Haz una lista rápida de actores y de lo que cada uno gana o pierde.", "Desconfía de las opciones que atribuyen a todo un grupo una característica.", "No respondas con tu opinión: la pregunta pide la postura de un actor."],
  },
  {
    slug: "pensamiento-reflexivo-y-sistemico", area: "Sociales y ciudadanas", name: "Pensamiento reflexivo y sistémico",
    tag: "Pensamiento reflexivo y sistémico",
    what: "Es la capacidad de comprender la realidad social como un sistema, en el que un problema tiene dimensiones económicas, políticas, ambientales y culturales, y de evaluar las consecuencias de las soluciones que se proponen.",
    tasks: ["Identificar las dimensiones de un problema social.", "Prever consecuencias de una decisión o política.", "Evaluar si una solución resuelve el problema planteado.", "Relacionar factores que influyen entre sí."],
    tips: ["Pregúntate qué otras áreas afecta una decisión: la economía, el ambiente, la convivencia.", "Una buena solución ataca la causa del problema, no solo sus efectos.", "Busca la opción que tenga en cuenta a todos los afectados."],
  },
  {
    slug: "uso-comprensivo-del-conocimiento-cientifico", area: "Ciencias naturales", name: "Uso comprensivo del conocimiento científico",
    tag: "Uso comprensivo del conocimiento científico",
    what: "Es la capacidad de comprender y usar conceptos, nociones y teorías de biología, química y física para resolver problemas, no solo de recordarlos.",
    tasks: ["Aplicar un concepto (energía, célula, reacción, fuerza) a una situación nueva.", "Relacionar un fenómeno con la teoría que lo explica.", "Reconocer las propiedades de sustancias, organismos u objetos.", "Usar unidades y magnitudes correctamente."],
    tips: ["Repasa los conceptos base de cada componente: biología celular y ecología, cambios químicos y mezclas, fuerza, energía y ondas.", "Identifica qué concepto está en juego antes de leer las opciones.", "Practica con situaciones cotidianas: cocina, deporte, salud."],
  },
  {
    slug: "explicacion-de-fenomenos", area: "Ciencias naturales", name: "Explicación de fenómenos",
    tag: "Explicación de fenómenos",
    what: "Es la capacidad de construir explicaciones y comprender argumentos y modelos que dicen por qué ocurre un fenómeno natural.",
    tasks: ["Elegir la explicación correcta de un fenómeno observado.", "Usar un modelo (de partículas, de un circuito, de un ecosistema) para predecir.", "Reconocer la causa de un cambio.", "Evaluar si una explicación es coherente con los datos."],
    tips: ["Busca la relación de causa y efecto: ¿qué cambia primero y qué cambia como consecuencia?", "Descarta las explicaciones que usan bien las palabras pero invierten la causa.", "Dibuja un esquema rápido cuando haya varios elementos."],
  },
  {
    slug: "indagacion", area: "Ciencias naturales", name: "Indagación",
    tag: "Indagación",
    what: "Es la capacidad de plantear preguntas y procedimientos para investigar, y de buscar, organizar y analizar datos para sacar conclusiones válidas.",
    tasks: ["Identificar la variable que se mide y la que se cambia en un experimento.", "Elegir el procedimiento adecuado para responder una pregunta.", "Sacar una conclusión de una tabla o gráfica de resultados.", "Reconocer cuándo los datos no permiten concluir algo."],
    tips: ["En cada experimento, identifica qué se cambia, qué se mide y qué se mantiene igual.", "Una conclusión válida solo habla de lo que los datos muestran.", "Si dos variables cambian a la vez, el experimento no permite saber cuál causó el efecto."],
  },
];

const AREA_SLUG = { "Matemáticas": "matematicas", "Lectura crítica": "lectura-critica", "Sociales y ciudadanas": "sociales-y-ciudadanas", "Ciencias naturales": "ciencias-naturales", "Inglés": "ingles" };

// How each test looks in the real exam, for the simulacro-by-area pages.
const AREA_EXAM = {
  "Matemáticas": {
    count: "unas 50 preguntas: 25 en la Sesión 1 y 25 en la Sesión 2",
    time: "Como cada sesión dura 4 horas y 30 minutos para todas sus pruebas, dedica unos 2 minutos y medio por pregunta de Matemáticas.",
    parts: ["Estadística: tablas, gráficas, promedio, mediana, probabilidad.", "Geometría: áreas, perímetros, volúmenes, semejanza, plano cartesiano.", "Álgebra y cálculo: ecuaciones, funciones, variación, proporciones."],
    strategy: ["Responde primero las preguntas de lectura de tablas y gráficas: son las más rápidas.", "Si un cálculo se alarga, marca la pregunta y vuelve al final.", "Revisa unidades y escalas antes de elegir."],
  },
  "Lectura crítica": {
    count: "41 preguntas, todas en la Sesión 1",
    time: "Con textos largos, calcula unos 3 a 4 minutos por texto para leer y unos 90 segundos por pregunta.",
    parts: ["Textos continuos: cuentos, ensayos, artículos de opinión, textos filosóficos.", "Textos discontinuos: tablas, infografías, avisos, caricaturas.", "Preguntas de los tres tipos: lo que dice el texto, cómo se organiza y qué tan válido es."],
    strategy: ["Lee primero las preguntas del texto y luego el texto, subrayando lo que te piden.", "Resume cada párrafo en tres palabras al margen.", "La respuesta correcta siempre se puede apoyar en el texto."],
  },
  "Sociales y ciudadanas": {
    count: "unas 50 preguntas: 25 en la Sesión 1 y 25 en la Sesión 2",
    time: "Unos 2 minutos por pregunta; los casos largos toman más, las preguntas de conceptos menos.",
    parts: ["Constitución, derechos, mecanismos de participación y organización del Estado.", "Historia y geografía de Colombia y del mundo.", "Casos de conflicto y convivencia con varios actores."],
    strategy: ["En los casos, identifica a los actores y sus intereses antes de ver las opciones.", "No respondas con tu opinión: la pregunta pide analizar.", "Repasa los mecanismos de participación: tutela, derecho de petición, acción popular, consulta, cabildo."],
  },
  "Ciencias naturales": {
    count: "unas 58 preguntas: 29 en la Sesión 1 y 29 en la Sesión 2",
    time: "Unos 2 minutos por pregunta. Las de experimentos con tablas suelen tomar más.",
    parts: ["Biológico: célula, genética, ecosistemas, cuerpo humano.", "Químico: materia, mezclas, reacciones, soluciones.", "Físico: movimiento, fuerzas, energía, ondas, electricidad.", "Ciencia, tecnología y sociedad: impacto de la ciencia en la vida diaria y el ambiente."],
    strategy: ["En los experimentos, identifica qué se cambia y qué se mide.", "Lee con cuidado las tablas: la conclusión debe salir de los datos.", "Repasa unidades de medida y conversiones básicas."],
  },
  "Inglés": {
    count: "unas 55 preguntas, todas en la Sesión 2, organizadas en 7 partes",
    time: "Las primeras partes son cortas: avanza rápido en ellas y guarda tiempo para las lecturas de las partes 5, 6 y 7.",
    parts: ["Parte 1: avisos. ¿Dónde puedes ver este aviso?", "Parte 2: vocabulario. Relacionar palabras con su descripción.", "Parte 3: conversaciones cortas. Elegir la respuesta adecuada.", "Parte 4: texto con espacios. Elegir la palabra que completa cada espacio.", "Parte 5: comprensión de lectura de un texto corto.", "Parte 6: comprensión de lectura con preguntas de inferencia.", "Parte 7: texto con espacios de gramática y vocabulario."],
    strategy: ["Asegura las partes 1 a 3: son las más fáciles y valen igual.", "En los textos con espacios, lee la oración completa antes de elegir.", "No traduzcas palabra por palabra: busca la idea general."],
  },
};

export function buildContentPages(ctx) {
  const pages = [];
  // Competencies first: they can only use the few questions tagged with that competency.
  const comps = buildCompetencies(ctx);
  pages.push(...buildAreaSimulacros(ctx), ...comps);
  buildResults(ctx);
  buildGlossary(ctx);
  buildBlog(ctx);
  return pages;
}

// ---------------------------------------------------------------- helpers

function questionsBlock(ctx, items, area) {
  const html = items.map((it) => ctx.questionHtml(it, area, ctx.renderRich)).join("\n");
  if (html.includes('class="katex')) ctx.markKatex();
  return html;
}
const idOf = (b, q) => `${b.name}-${q.number}`;

// Standalone questions of an area not shown on any other page, spread across booklets.
function freshSingles(ctx, areaName, count, filter = () => true) {
  const per = ctx.bank.map((b) => b.exam.questions.filter((q) => !q.group_id && ctx.usable(b, q, areaName) && !ctx.used.has(idOf(b, q))
    && filter(b, q) && (String(q.stimulus_md ?? "") + q.stem_md).length < 1100).map((q) => ({ b, q, passage: null })));
  const out = [];
  for (let round = 0; out.length < count && round < 60; round++) {
    for (let i = 0; i < per.length && out.length < count; i++) {
      const list = per[(i + round) % per.length];
      const item = list[(round * 5 + 2) % Math.max(1, list.length)];
      if (item && !out.includes(item)) out.push(item);
    }
  }
  out.forEach((it) => ctx.used.add(idOf(it.b, it.q)));
  return out;
}

// One whole reading group (text + up to `max` questions) not used elsewhere.
function freshGroup(ctx, areaName, max, filter = () => true, skipBooklets = 0) {
  let seen = 0;
  for (const b of ctx.bank) {
    for (const g of b.groups.values()) {
      const passage = String(g.passage_md ?? "");
      if (!passage.trim() || ctx.PICTURE.test(passage) || ctx.NEEDS_PICTURE.test(passage) || passage.length > 4200 || passage.length < 300) continue;
      const qs = b.exam.questions.filter((q) => q.group_id === g.id);
      if (qs.length < 2 || !qs.every((q) => ctx.usable(b, q, areaName)) || qs.some((q) => ctx.used.has(idOf(b, q)))) continue;
      const pick = qs.filter((q) => filter(b, q));
      if (!pick.length) continue;
      if (seen++ < skipBooklets) continue;
      const take = pick.slice(0, max);
      take.forEach((q) => ctx.used.add(idOf(b, q)));
      return take.map((q, i) => ({ b, q, passage: i === 0 ? { ...g, from: q.number } : null, groupSize: take.length }));
    }
  }
  return [];
}

// Reading groups from different booklets until there are about `count` questions.
function groupsUpTo(ctx, areaName, count) {
  const out = [];
  for (let skip = 2, tries = 0; out.length < count - 1 && tries < 4; tries++, skip = 0) {
    out.push(...freshGroup(ctx, areaName, Math.min(3, count - out.length), undefined, skip));
  }
  return out;
}

// Competency tags from the enrichment files (only where the key check agreed).
function loadTags(dataDir) {
  const tags = new Map();
  for (const name of ["S11-A_1ra", "S11-A_2da"]) {
    const f = join(dataDir, "enrichment", `${name}.json`);
    if (!existsSync(f)) continue;
    const qs = JSON.parse(readFileSync(f, "utf8")).questions ?? {};
    for (const v of Object.values(qs)) {
      if (v.key_check !== "agree" || !v.enrich?.competencia) continue;
      tags.set(`${name}-${v.number}`, v.enrich.competencia);
    }
  }
  return tags;
}

const listHtml = (items) => `<ul class="checks">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;

// ---------------------------------------------------------------- simulacro by area

function buildAreaSimulacros(ctx) {
  const out = [];
  for (const area of ctx.AREAS) {
    const exam = AREA_EXAM[area.name];
    const items = area.grouped
      ? groupsUpTo(ctx, area.name, 6)
      : freshSingles(ctx, area.name, 5);
    if (!items.length) continue;
    const comps = COMPETENCIES.filter((c) => c.area === area.name);
    const path = `simulacro-icfes/${area.slug}/`;
    const title = `Simulacro ICFES de ${area.name}`;
    const faq = [
      [`¿Cuántas preguntas tiene ${area.name} en el ICFES?`, `${exam.count[0].toUpperCase()}${exam.count.slice(1)}. El número exacto cambia un poco entre cuadernillos.`],
      [`¿Cuánto tiempo hay para ${area.name}?`, `El tiempo no se divide por prueba: cada sesión dura 4 horas y 30 minutos para todas sus preguntas. ${exam.time}`],
      [`¿Cuánto pesa ${area.name} en el puntaje global?`, area.name === "Inglés" ? "Inglés pesa 1 de 13 en el global; las otras cuatro pruebas pesan 3 cada una." : `${area.name} pesa 3 de 13 en el global, igual que Lectura crítica, Sociales y Ciencias; Inglés pesa 1.`],
    ];
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${area.color}">${ctx.esc(area.name)}</span>
  <h1>${ctx.esc(title)}: mini simulacro y cómo es la prueba</h1>
  <p class="prose">Haz este mini simulacro de ${items.length} preguntas reales del Saber 11 y al final ves cuántas acertaste. Abajo te explicamos cómo es la prueba de ${ctx.esc(area.name)} en el examen real y cómo prepararla.</p>
</div></section>
<section class="qlist wrap narrow mini" aria-label="Mini simulacro de ${ctx.esc(area.name)}" data-total="${items.length}">
${questionsBlock(ctx, items, area)}
<div class="card mini-score" hidden><strong></strong><span></span><a class="btn btn-primary btn-sm" href="../../app/">Hacer el simulacro completo</a></div>
</section>
<section class="wrap narrow guide-body">
  <h2>Cómo es la prueba de ${ctx.esc(area.name)}</h2>
  <p class="prose">En el Saber 11, la prueba de ${ctx.esc(area.name)} tiene ${exam.count}. ${exam.time}</p>
  ${listHtml(exam.parts)}
  ${comps.length ? `<h2>Qué competencias evalúa</h2>\n  <ul class="checks">${comps.map((c) => `<li><a href="../../competencias-icfes/${c.slug}/"><b>${ctx.esc(c.name)}</b></a>: ${ctx.esc(c.what.split(":")[0].split(". ")[0])}.</li>`).join("")}</ul>` : ""}
  <h2>Estrategia para el día del examen</h2>
  ${listHtml(exam.strategy)}
  <p class="prose">Más preguntas en <a href="../../preguntas-icfes/${area.slug}/">preguntas ICFES de ${ctx.esc(area.name)} con respuestas</a>, o mira el <a href="../">simulacro ICFES completo</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta("../../", `Haz el simulacro completo de ${ctx.esc(area.name)}`)}`;
    ctx.write(path, ctx.page({
      siteUrl: ctx.siteUrl, path, title: `${title} gratis: mini simulacro con preguntas reales | Cóndor`,
      desc: `Simulacro ICFES de ${area.name} gratis: ${items.length} preguntas reales del Saber 11 con tu resultado al final, cómo es la prueba, cuánto tiempo tienes y estrategias.`,
      body, katex: body.includes('class="katex'),
      crumbs: [{ name: "Simulacro ICFES", path: "simulacro-icfes/" }, { name: area.name, path }],
      jsonLd: [ctx.faqLd(faq), { "@type": "Quiz", name: title, about: { "@type": "Thing", name: `Saber 11 · ${area.name}` }, educationalLevel: "Grado 11", inLanguage: "es-CO", url: ctx.siteUrl + path, isAccessibleForFree: true }],
    }));
    out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------- competencies

function buildCompetencies(ctx) {
  const tags = loadTags(ctx.dataDir);
  const out = [];
  for (const c of COMPETENCIES) {
    const area = ctx.AREAS.find((a) => a.name === c.area);
    const tagged = (b, q) => tags.get(`${b.name}-${q.number}`) === c.tag;
    const items = area.grouped ? freshGroup(ctx, area.name, 2, tagged) : freshSingles(ctx, area.name, 3, tagged);
    const path = `competencias-icfes/${c.slug}/`;
    const siblings = COMPETENCIES.filter((x) => x.area === c.area && x !== c);
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag" style="background:${area.color}">${ctx.esc(c.area)} · Competencia</span>
  <h1>${ctx.esc(c.name)} en el ICFES</h1>
  <p class="prose">${ctx.esc(c.what)}</p>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Qué te piden las preguntas</h2>
  ${listHtml(c.tasks.map(ctx.esc))}
  <h2>Cómo mejorar</h2>
  ${listHtml(c.tips.map(ctx.esc))}
  ${items.length ? `<h2>Preguntas de ejemplo</h2><p class="prose">Preguntas reales del ICFES que evalúan esta competencia. Toca una opción para ver si acertaste.</p>` : ""}
</section>
${items.length ? `<section class="qlist wrap narrow" aria-label="Preguntas de ejemplo">\n${questionsBlock(ctx, items, area)}\n</section>` : ""}
<section class="wrap narrow more"><p>Las otras competencias de ${ctx.esc(c.area)}: ${siblings.map((s) => `<a href="../${s.slug}/">${ctx.esc(s.name)}</a>`).join(" · ")}. Practica la prueba completa en el <a href="../../simulacro-icfes/${area.slug}/">simulacro ICFES de ${ctx.esc(c.area)}</a>.</p></section>
${ctx.cta("../../", "Practica por competencia en la app")}`;
    ctx.write(path, ctx.page({
      siteUrl: ctx.siteUrl, path, title: `${c.name}: competencia de ${c.area} en el ICFES | Cóndor`,
      desc: `Qué es la competencia ${c.name} del ICFES Saber 11 (${c.area}), qué piden las preguntas, cómo mejorar y preguntas reales de ejemplo.`,
      body, katex: body.includes('class="katex'),
      crumbs: [{ name: "Competencias ICFES", path: "competencias-icfes/" }, { name: c.name, path }],
      jsonLd: [{ "@type": "LearningResource", name: `${c.name} (ICFES)`, description: c.what, inLanguage: "es-CO", url: ctx.siteUrl + path, educationalLevel: "Grado 11", teaches: c.name, about: { "@type": "Thing", name: `Saber 11 · ${c.area}` } }],
    }));
    out.push(path);
  }
  // Hub.
  const path = "competencias-icfes/";
  const groups = [...new Set(COMPETENCIES.map((c) => c.area))];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <h1>Competencias que evalúa el ICFES</h1>
  <p class="prose">El Saber 11 no mide si memorizaste temas: mide <b>competencias</b>, es decir, lo que sabes hacer con lo que aprendiste. Cada prueba evalúa tres. Conocerlas te ayuda a entender qué te piden las preguntas y a practicar lo que más te cuesta.</p>
</div></section>
<section class="wrap narrow guide-body">
  ${groups.map((g) => `<h2>${ctx.esc(g)}</h2>\n  <ul class="checks">${COMPETENCIES.filter((c) => c.area === g).map((c) => `<li><a href="${c.slug}/"><b>${ctx.esc(c.name)}</b></a>. ${ctx.esc(c.what.split(". ")[0])}.</li>`).join("")}</ul>`).join("\n  ")}
  <h2>Inglés</h2>
  <p class="prose">La prueba de Inglés no se reporta por competencias sino por niveles del Marco Común Europeo (Pre A1, A1, A2 y B1). Mira cómo son sus 7 partes en el <a href="../simulacro-icfes/ingles/">simulacro ICFES de Inglés</a>.</p>
</section>
${ctx.cta("../", "Practica cada competencia")}`;
  ctx.write(path, ctx.page({
    siteUrl: ctx.siteUrl, path, title: "Competencias del ICFES Saber 11 por prueba, explicadas | Cóndor",
    desc: "Las competencias que evalúa el ICFES en Matemáticas, Lectura crítica, Sociales y Ciencias: qué significa cada una, qué preguntan y cómo prepararlas.",
    body, crumbs: [{ name: "Competencias ICFES", path }],
    jsonLd: [{ "@type": "CollectionPage", name: "Competencias del ICFES", url: ctx.siteUrl + path, inLanguage: "es-CO", hasPart: COMPETENCIES.map((c) => ({ "@type": "LearningResource", name: c.name, url: `${ctx.siteUrl}competencias-icfes/${c.slug}/` })) }],
  }));
  out.push(path);
  return out;
}

// ---------------------------------------------------------------- results

function buildResults(ctx) {
  const path = "resultados-icfes/";
  const faq = [
    ["¿Dónde consulto mis resultados del ICFES?", "En la página oficial del ICFES (icfes.gov.co), en la sección de resultados, con los datos de tu inscripción. Cóndor no publica resultados oficiales."],
    ["¿Qué es el percentil en el ICFES?", "Es el porcentaje de estudiantes del país que obtuvo un puntaje menor que el tuyo. Un percentil 80 significa que superaste al 80 % de quienes presentaron el examen."],
    ["¿Por qué mi puntaje no coincide con las preguntas que acerté?", "El ICFES no cuenta respuestas correctas: califica con un modelo que tiene en cuenta la dificultad de cada pregunta. Dos estudiantes con el mismo número de aciertos pueden tener puntajes distintos."],
    ["¿Qué puntaje piden las universidades?", "Cada universidad y cada programa fija su propio puntaje o su forma de ponderar las pruebas, y cambia cada semestre. Revisa la convocatoria oficial de la universidad que te interesa."],
  ];
  const rows = [
    ["Puntaje global", "De 0 a 500. Combina las cinco pruebas con sus pesos."],
    ["Percentil global", "De 1 a 100. Qué porcentaje del país obtuvo menos que tú."],
    ["Puntaje por prueba", "De 0 a 100 en Lectura crítica, Matemáticas, Sociales y ciudadanas, Ciencias naturales e Inglés."],
    ["Nivel de desempeño", "Del 1 al 4 en cada prueba (en Inglés, Pre A1, A1, A2 o B1). Describe lo que sabes hacer."],
    ["Percentil por prueba", "Tu posición en el país en cada prueba por separado."],
  ];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Guía</span>
  <h1>Cómo leer tus resultados del ICFES</h1>
  <p class="prose">El reporte del Saber 11 trae varios números. Aquí te explicamos qué significa cada uno, cómo se relacionan y qué hacer con ellos.</p>
</div></section>
<section class="wrap narrow guide-body">
  <h2>Qué trae el reporte</h2>
  <div class="tbl"><table><thead><tr><th>Dato</th><th>Qué significa</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join("")}</tbody></table></div>
  <h2>Cómo se relacionan</h2>
  <p class="prose">El puntaje global sale de los cinco puntajes por prueba: <b>(3 × Lectura crítica + 3 × Matemáticas + 3 × Sociales + 3 × Ciencias + 1 × Inglés) ÷ 13 × 5</b>. Por eso un punto en Matemáticas mueve el global tres veces más que un punto en Inglés. Compruébalo con la <a href="../calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>.</p>
  <p class="prose">El nivel de desempeño depende del rango en que cae tu puntaje de cada prueba. Mira los rangos en <a href="../niveles-de-desempeno-icfes/">niveles de desempeño del ICFES</a>.</p>
  <h2>Qué hacer con tu resultado</h2>
  <ul class="checks">
    <li><b>Si vas a la universidad:</b> revisa el puntaje y las pruebas que pondera el programa que te interesa en su convocatoria oficial.</li>
    <li><b>Si vas a repetir el examen:</b> empieza por la prueba con el percentil más bajo entre las cuatro que pesan 3; ahí está la mayor ganancia.</li>
    <li><b>Si eres docente:</b> compara los niveles de desempeño del curso por prueba para decidir qué competencias reforzar.</li>
  </ul>
  <h2>Preguntas frecuentes</h2>
  ${ctx.faqBlock(faq)}
</section>
${ctx.cta("../", "Mide tu puntaje antes del examen")}`;
  ctx.write(path, ctx.page({
    siteUrl: ctx.siteUrl, path, title: "Resultados ICFES: cómo leer tu puntaje, percentil y niveles | Cóndor",
    desc: "Qué significa cada dato de los resultados del ICFES Saber 11: puntaje global, percentil, puntaje por prueba y nivel de desempeño, y qué hacer con ellos.",
    body, crumbs: [{ name: "Resultados ICFES", path }],
    jsonLd: [ctx.faqLd(faq), { "@type": "Article", headline: "Cómo leer tus resultados del ICFES", inLanguage: "es-CO", url: ctx.siteUrl + path, author: { "@id": `${ctx.siteUrl}#org` }, publisher: { "@id": `${ctx.siteUrl}#org` }, datePublished: "2026-11-09" }],
  }));
}

// ---------------------------------------------------------------- glossary

const TERMS = [
  ["ICFES", "Instituto Colombiano para la Evaluación de la Educación. Es la entidad que diseña y aplica el examen Saber 11 y otras pruebas de Estado."],
  ["Saber 11", "El examen de Estado que presentan los estudiantes de grado 11 en Colombia. Muchas universidades lo usan para la admisión. Se le suele llamar simplemente 'el ICFES'."],
  ["Calendario A y calendario B", "Los dos calendarios escolares de Colombia. Cada uno presenta el Saber 11 en una fecha distinta del año; la mayoría de los colegios son calendario A."],
  ["Sesión", "Cada una de las dos jornadas del examen, el mismo día. Cada sesión dura 4 horas y 30 minutos e incluye preguntas de varias pruebas."],
  ["Cuadernillo", "El folleto con las preguntas de una sesión. Hay varias versiones del cuadernillo con las mismas pruebas."],
  ["Hoja de respuestas", "La hoja donde marcas tus respuestas rellenando un óvalo por pregunta con lápiz de mina negra número 2."],
  ["Prueba", "Cada una de las cinco áreas del examen: Lectura crítica, Matemáticas, Sociales y ciudadanas, Ciencias naturales e Inglés."],
  ["Puntaje por prueba", "Tu resultado de 0 a 100 en cada prueba."],
  ["Puntaje global", "Tu resultado total de 0 a 500. Combina las cinco pruebas: cuatro pesan 3 e Inglés pesa 1."],
  ["Percentil", "El porcentaje de estudiantes del país con un puntaje menor que el tuyo."],
  ["Nivel de desempeño", "La categoría (1 a 4) en que cae tu puntaje de cada prueba, con una descripción de lo que sabes hacer."],
  ["MCER", "Marco Común Europeo de Referencia para las lenguas. El ICFES lo usa para reportar Inglés en niveles Pre A1, A1, A2 y B1."],
  ["Competencia", "Lo que el examen mide en cada prueba: lo que sabes hacer con lo que aprendiste, por ejemplo argumentación o indagación."],
  ["Componente", "El tema o campo de conocimiento de una pregunta dentro de una prueba, por ejemplo el componente químico de Ciencias."],
  ["Afirmación y evidencia", "En el diseño del ICFES, la afirmación dice qué se espera que el estudiante sepa hacer, y la evidencia es lo que se observa en su respuesta para comprobarlo."],
  ["Selección múltiple con única respuesta", "El tipo de pregunta del Saber 11: un enunciado y varias opciones, de las cuales solo una es correcta."],
  ["Texto discontinuo", "Un texto que no se lee de corrido: tablas, gráficas, infografías, avisos o caricaturas. Aparecen sobre todo en Lectura crítica."],
  ["Simulacro", "Un ensayo del examen completo o de una prueba, con tiempo, para practicar y medir tu nivel."],
  ["Preicfes", "Curso o programa de preparación para el Saber 11, del colegio o de una institución externa."],
  ["Citación", "El documento que indica el lugar, la fecha y la hora en que presentas el examen. Se consulta en la página del ICFES antes de la prueba."],
];

function buildGlossary(ctx) {
  const path = "glosario-icfes/";
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Glosario</span>
  <h1>Glosario del ICFES: términos del Saber 11 explicados</h1>
  <p class="prose">Las palabras que vas a encontrar en las guías, los resultados y las citaciones del Saber 11, explicadas en una o dos frases.</p>
</div></section>
<section class="wrap narrow guide-body">
  <dl class="gloss">${TERMS.map(([t, d]) => `<div id="${slug(t)}"><dt>${ctx.esc(t)}</dt><dd>${ctx.esc(d)}</dd></div>`).join("")}</dl>
  <p class="prose">Sigue con la <a href="../como-prepararse-para-el-icfes/">guía para prepararte</a>, las <a href="../competencias-icfes/">competencias del ICFES</a> o <a href="../resultados-icfes/">cómo leer tus resultados</a>.</p>
</section>
${ctx.cta("../", "Practica para el Saber 11")}`;
  ctx.write(path, ctx.page({
    siteUrl: ctx.siteUrl, path, title: "Glosario ICFES: qué es percentil, puntaje global, MCER y más | Cóndor",
    desc: "Glosario del ICFES Saber 11: percentil, puntaje global, nivel de desempeño, MCER, competencia, cuadernillo, citación y otros términos explicados en una frase.",
    body, crumbs: [{ name: "Glosario ICFES", path }],
    jsonLd: [{ "@type": "DefinedTermSet", name: "Glosario del ICFES", url: ctx.siteUrl + path, inLanguage: "es-CO", hasDefinedTerm: TERMS.map(([t, d]) => ({ "@type": "DefinedTerm", name: t, description: d, url: `${ctx.siteUrl}${path}#${slug(t)}` })) }],
  }));
}

// ---------------------------------------------------------------- blog

const ARTICLES = [
  {
    slug: "como-mejorar-en-lectura-critica-icfes", date: "2026-11-09",
    title: "Cómo mejorar en Lectura crítica del ICFES: 7 hábitos que sí funcionan",
    desc: "Siete hábitos concretos para subir tu puntaje en Lectura crítica del Saber 11: cómo leer, cómo descartar opciones y cómo practicar cada semana.",
    intro: "Lectura crítica pesa 3 en el puntaje global y tiene 41 preguntas, todas en la primera sesión. La buena noticia es que mejora rápido con práctica dirigida. Estos son los hábitos que más ayudan.",
    sections: [
      ["1. Lee con una pregunta en la cabeza", "Antes de leer el texto, mira las preguntas que vienen con él. Así sabes qué buscar y subrayas lo importante desde la primera lectura."],
      ["2. Resume cada párrafo en tres palabras", "Al margen, escribe de qué habla cada párrafo. Cuando una pregunta pida la función de un párrafo o la idea principal, ya tienes el mapa del texto."],
      ["3. Apoya cada respuesta en una línea del texto", "La respuesta correcta siempre se puede justificar con algo que el texto dice. Si no encuentras de dónde sale una opción, probablemente es una trampa."],
      ["4. Descarta las opciones que exageran o agregan", "Las opciones incorrectas suelen decir más de lo que dice el texto, usar 'siempre' o 'nunca', o traer información de afuera."],
      ["5. Distingue al autor de las voces que cita", "Muchos textos citan opiniones ajenas. Pregúntate siempre quién dice cada cosa antes de atribuírsela al autor."],
      ["6. Practica con textos discontinuos", "Tablas, infografías y caricaturas también son textos. Practica decir en una frase qué muestran antes de responder."],
      ["7. Repasa tus errores, no solo tus aciertos", "Después de cada práctica, vuelve a las preguntas que fallaste y busca la línea del texto que daba la respuesta. Ese repaso es lo que más sube el puntaje."],
    ],
    links: [["competencias-icfes/reflexionar-y-evaluar-un-texto/", "Competencia: reflexionar y evaluar un texto"], ["simulacro-icfes/lectura-critica/", "Mini simulacro de Lectura crítica"]],
  },
  {
    slug: "errores-comunes-ingles-icfes", date: "2026-11-09",
    title: "Errores comunes en la prueba de Inglés del ICFES y cómo evitarlos",
    desc: "Los errores más frecuentes en la prueba de Inglés del Saber 11, parte por parte, y cómo evitarlos para subir tu nivel MCER.",
    intro: "La prueba de Inglés tiene unas 55 preguntas en 7 partes, todas en la segunda sesión. Muchos puntos se pierden por errores evitables, no por falta de vocabulario. Estos son los más comunes.",
    sections: [
      ["Traducir palabra por palabra", "En los avisos y las conversaciones (partes 1 y 3), traducir cada palabra lleva a respuestas literales que no tienen sentido. Piensa en la situación: ¿dónde estás y qué diría una persona ahí?"],
      ["Elegir la palabra que 'suena bien'", "En los textos con espacios (partes 4 y 7), la opción correcta tiene que encajar en la gramática de toda la oración: tiempo verbal, singular o plural, preposición. Lee la oración completa con cada opción."],
      ["Confundir respuestas educadas con respuestas correctas", "En las conversaciones cortas, una respuesta puede ser amable pero no responder lo que se preguntó. Busca la que continúa la conversación con sentido."],
      ["Dejar las lecturas para el final sin tiempo", "Las partes 5 y 6 son lecturas con varias preguntas. Si llegas sin tiempo, pierdes muchas a la vez. Avanza rápido en las primeras partes para guardar tiempo."],
      ["Dejar preguntas sin responder", "Una pregunta en blanco cuenta como incorrecta y no se resta por equivocarse. Si no sabes, descarta y elige."],
      ["Practicar solo vocabulario", "El vocabulario ayuda, pero la prueba mide comprensión. Leer textos cortos en inglés unos minutos al día mejora más que memorizar listas."],
    ],
    links: [["simulacro-icfes/ingles/", "Mini simulacro de Inglés"], ["niveles-de-desempeno-icfes/", "Niveles de Inglés: Pre A1, A1, A2 y B1"]],
  },
];

function buildBlog(ctx) {
  for (const a of ARTICLES) {
    const path = `blog/${a.slug}/`;
    const body = `<article class="wrap narrow guide-body post">
  <header class="guide-head"><span class="tag">Blog</span>
  <h1>${ctx.esc(a.title)}</h1>
  <p class="post-meta">Equipo Cóndor · <time datetime="${a.date}">${new Date(`${a.date}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</time></p>
  <p class="prose">${ctx.esc(a.intro)}</p></header>
  ${a.sections.map(([h, t]) => `<h2>${ctx.esc(h)}</h2><p class="prose">${ctx.esc(t)}</p>`).join("\n  ")}
  <h2>Sigue practicando</h2>
  <ul class="checks">${a.links.map(([href, text]) => `<li><a href="../../${href}">${ctx.esc(text)}</a></li>`).join("")}</ul>
</article>
${ctx.cta("../../", "Pon en práctica estos consejos")}`;
    ctx.write(path, ctx.page({
      siteUrl: ctx.siteUrl, path, title: `${a.title} | Cóndor`, desc: a.desc, body, type: "article",
      crumbs: [{ name: "Blog", path: "blog/" }, { name: a.title, path }],
      jsonLd: [{ "@type": "BlogPosting", headline: a.title, description: a.desc, inLanguage: "es-CO", url: ctx.siteUrl + path, datePublished: a.date, dateModified: a.date, author: { "@id": `${ctx.siteUrl}#org` }, publisher: { "@id": `${ctx.siteUrl}#org` }, mainEntityOfPage: ctx.siteUrl + path }],
    }));
  }
  const path = "blog/";
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <h1>Blog de Cóndor: consejos para el ICFES</h1>
  <p class="prose">Artículos cortos para preparar el Saber 11, escritos a partir de las preguntas que más fallan los estudiantes.</p>
</div></section>
<section class="wrap narrow guide-body">
  <div class="posts">${ARTICLES.map((a) => `<a class="card post-card" href="${a.slug}/"><b>${ctx.esc(a.title)}</b><span>${ctx.esc(a.desc)}</span></a>`).join("")}</div>
</section>`;
  ctx.write(path, ctx.page({
    siteUrl: ctx.siteUrl, path, title: "Blog de Cóndor: consejos para el ICFES Saber 11", desc: "Artículos para preparar el ICFES Saber 11: hábitos de estudio, errores comunes y estrategias por prueba.",
    body, crumbs: [{ name: "Blog", path }],
    jsonLd: [{ "@type": "Blog", name: "Blog de Cóndor", url: ctx.siteUrl + path, inLanguage: "es-CO", blogPost: ARTICLES.map((a) => ({ "@type": "BlogPosting", headline: a.title, url: `${ctx.siteUrl}blog/${a.slug}/`, datePublished: a.date })) }],
  }));
}
