// "Cuántas preguntas tiene el ICFES": the structure of the Saber 11 exam by test and session, from the ICFES guía de
// orientación 2026. People search "cuantas preguntas tiene el icfes por area", "cuanto dura el icfes", "cuantas
// preguntas de ingles tiene el icfes"; news sites answer with numbers that contradict each other (254, 278, ~170).
// One page, every number with its official source and the day it was checked.
//   estructura-examen-icfes/
// Called from build-seo.mjs with the shared helpers.

const CHECKED = "2026-11-13";
const SRC = {
  guia2026: "https://www.icfes.gov.co/wp-content/uploads/2025/11/guia-orientacion-saber-11-2026-26-noviembre.pdf",
  guia2025: "https://www.icfes.gov.co/wp-content/uploads/2024/11/07-Noviembre_Gui%CC%80a-de-Orientacioi%CC%80n-Saber-11.o-2025-1.pdf",
  infografia: "https://www.icfes.gov.co/wp-content/uploads/2025/09/15-septiembre-infografia-generalidades-examen-saber-11.pdf",
  res268: "https://normograma.icfes.gov.co/compilacion/docs/resolucion_icfes_0268_2020.htm",
  ingles: "https://www.icfes.gov.co/wp-content/uploads/2025/03/MR-Ingle%CC%81s-Saber-11.o-Pro-y-TyT.pdf",
  niveles: "https://www.icfes.gov.co/wp-content/uploads/2025/09/22-septiembre-nd-prueba-ingles-saber-11.pdf",
};
// Guía de orientación Saber 11 2026 (calendario B), questions per session.
const ROWS = [
  { name: "Lectura crítica", href: "preguntas-icfes/lectura-critica/", s1: 41, s2: 0, weight: "3" },
  { name: "Matemáticas", href: "preguntas-icfes/matematicas/", s1: 25, s2: 25, weight: "3" },
  { name: "Sociales y ciudadanas", href: "preguntas-icfes/sociales-y-ciudadanas/", s1: 25, s2: 25, weight: "3" },
  { name: "Ciencias naturales", href: "preguntas-icfes/ciencias-naturales/", s1: 29, s2: 29, weight: "3" },
  { name: "Inglés", href: "preguntas-icfes/ingles/", s1: 0, s2: 55, weight: "1" },
];
const EXTRA = [
  { name: "Cuestionario socioeconómico", s1: 11, s2: 13 },
  { name: "Cuestionario de clima escolar", s1: 12, s2: 12 },
];
const ENGLISH_PARTS = [
  "Vocabulario: relacionar descripciones con palabras.",
  "Avisos: entender para qué sirve un aviso y dónde aparecería.",
  "Conversaciones cortas: escoger la respuesta que sigue.",
  "Texto con espacios: gramática.",
  "Comprensión de lectura de un texto sencillo.",
  "Comprensión de lectura de un texto más complejo.",
  "Texto con espacios: gramática y vocabulario.",
];

export function buildEstructuraPages({ siteUrl, write, page, esc, faqBlock, faqLd, cta }) {
  const path = "estructura-examen-icfes/";
  const up = "../";
  const ext = (url, text) => `<a href="${url}" rel="nofollow noopener" target="_blank">${text}</a>`;
  const sum = (k) => ROWS.reduce((n, r) => n + r[k], 0);
  const scored = sum("s1") + sum("s2");
  const extra = EXTRA.reduce((n, r) => n + r.s1 + r.s2, 0);
  const s1 = sum("s1") + EXTRA.reduce((n, r) => n + r.s1, 0);
  const s2 = sum("s2") + EXTRA.reduce((n, r) => n + r.s2, 0);
  const cell = (n) => (n ? String(n) : "–");
  const table = `<div class="tbl"><table>
  <caption class="source" style="caption-side:bottom;text-align:left;padding-top:6px">Fuente: ICFES, ${ext(SRC.guia2026, "guía de orientación Saber 11 2026")}. Pesos: ${ext(SRC.res268, "Resolución 268 de 2020")}.</caption>
  <thead><tr><th>Prueba</th><th>Sesión 1</th><th>Sesión 2</th><th>Total</th><th>Peso en el global</th></tr></thead>
  <tbody>
  ${ROWS.map((r) => `<tr><td><a href="${up}${r.href}">${esc(r.name)}</a></td><td>${cell(r.s1)}</td><td>${cell(r.s2)}</td><td><b>${r.s1 + r.s2}</b></td><td>${r.weight}</td></tr>`).join("\n  ")}
  <tr><td><b>Preguntas que se califican</b></td><td>${sum("s1")}</td><td>${sum("s2")}</td><td><b>${scored}</b></td><td></td></tr>
  ${EXTRA.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.s1}</td><td>${r.s2}</td><td>${r.s1 + r.s2}</td><td>No cuenta</td></tr>`).join("\n  ")}
  <tr><td><b>Total del cuadernillo</b></td><td>${s1}</td><td>${s2}</td><td><b>${scored + extra}</b></td><td></td></tr>
  </tbody></table></div>`;
  const perQ = (270 / (sum("s1"))).toFixed(1).replace(".", ",");
  const desc = `El ICFES (Saber 11) tiene ${scored} preguntas que se califican: Lectura crítica 41, Matemáticas 50, Sociales 50, Ciencias 58 e Inglés 55, en dos sesiones de 4 h 30.`;
  const faq = [
    ["¿Cuántas preguntas tiene el ICFES?", `Según la guía de orientación 2026, el Saber 11 tiene ${scored} preguntas que se califican, repartidas en dos sesiones. Con los cuestionarios socioeconómico y de clima escolar, que no cuentan para el puntaje, el cuadernillo completo llega a ${scored + extra}.`],
    ["¿Cuántas preguntas tiene cada área del ICFES?", "Lectura crítica 41, Matemáticas 50, Sociales y ciudadanas 50, Ciencias naturales 58 e Inglés 55 (guía de orientación Saber 11 2026)."],
    ["¿Cuántas preguntas de inglés tiene el ICFES?", "55, todas en la segunda sesión, divididas en siete partes que evalúan lectura, vocabulario y gramática."],
    ["¿Cuánto dura el ICFES?", "Se presenta en un solo día, en dos sesiones de 4 horas y 30 minutos cada una, una en la mañana y otra en la tarde."],
    ["¿Los cuestionarios socioeconómico y de clima escolar cuentan para el puntaje?", "No. El ICFES los usa para estudiar el contexto de los estudiantes y de los colegios; tus respuestas no cambian tu puntaje."],
    ["¿Cambia la estructura del ICFES en 2027?", `A ${CHECKED.split("-").reverse().join("/")} el ICFES no ha publicado una estructura nueva para 2027. Cuando publique la guía de orientación 2027, actualizamos esta página.`],
  ];
  const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">Saber 11 2026</span>
  <h1>Cuántas preguntas tiene el ICFES por área</h1>
  <p class="prose">El Saber 11 tiene <b>${scored} preguntas que se califican</b>: Lectura crítica 41, Matemáticas 50, Sociales y ciudadanas 50, Ciencias naturales 58 e Inglés 55. Se responden el mismo día en dos sesiones de 4 horas y 30 minutos. Los datos son de la guía de orientación del ICFES para 2026.</p>
</div></section>
<section class="wrap narrow guide-body">
  <style>.guide-body .source a{color:#2B5F2E;font-weight:700}</style>
  <h2>Preguntas por prueba y por sesión</h2>
  <p class="prose">Matemáticas, Sociales y Ciencias se reparten entre las dos sesiones; Lectura crítica va completa en la primera e Inglés completo en la segunda. Además de las cinco pruebas, cada sesión trae preguntas de dos cuestionarios que <b>no cuentan</b> para el puntaje.</p>
  ${table}
  <p class="prose">En 2025 el cuadernillo no traía el cuestionario de clima escolar, por eso algunas páginas todavía dicen 131 y 147 preguntas por sesión (${ext(SRC.guia2025, "guía 2025")}). Las ${scored} preguntas que se califican son las mismas.</p>
  <h2>Cuánto dura el examen</h2>
  <p class="prose">Las dos sesiones duran <b>4 horas y 30 minutos</b> cada una (${ext(SRC.infografia, "ICFES")}). En la primera sesión hay ${sum("s1")} preguntas que se califican: si repartes el tiempo parejo, tienes unos ${perQ} minutos por pregunta, un poco menos si dejas tiempo para los cuestionarios. Es un cálculo nuestro, no del ICFES. Practica con el reloj en un <a href="${up}simulacro-icfes/">simulacro ICFES con tiempo</a>.</p>
  <h2>Cómo se convierte en tu puntaje</h2>
  <p class="prose">Cada prueba se califica de 0 a 100. El puntaje global va de 0 a 500: Lectura crítica, Matemáticas, Sociales y Ciencias pesan 3 e Inglés pesa 1; se suman, se dividen entre 13 y se multiplican por 5 (${ext(SRC.res268, "Resolución 268 de 2020")}). No se resta por responder mal, así que no dejes preguntas en blanco. Calcula el tuyo en la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a> y mira qué significa cada rango en los <a href="${up}niveles-de-desempeno-icfes/">niveles de desempeño</a>.</p>
  <h2>Las siete partes de la prueba de Inglés</h2>
  <p class="prose">Las 55 preguntas de Inglés están en la segunda sesión y no evalúan escucha ni escritura: solo lectura, vocabulario y gramática (${ext(SRC.ingles, "ICFES")}). El resultado se reporta en niveles del Marco Común Europeo: Pre A1, A1, A2 y B1 (${ext(SRC.niveles, "ICFES, 2025")}).</p>
  <ol class="prose">${ENGLISH_PARTS.map((p, i) => `<li><b>Parte ${i + 1}.</b> ${esc(p)}</li>`).join("")}</ol>
  <p class="prose">Practica cada parte con <a href="${up}preguntas-icfes/ingles/">preguntas de Inglés tipo ICFES</a>.</p>
  <h2>Qué tipo de preguntas trae</h2>
  <p class="prose">Las preguntas de las cinco pruebas son de selección múltiple y casi todas parten de una situación, un texto, una tabla o una gráfica. No piden memorizar datos sino usar lo que sabes; mira las <a href="${up}competencias-icfes/">competencias que evalúa cada prueba</a> y practica con <a href="${up}pregunta-icfes/">preguntas ICFES resueltas y explicadas</a> o con <a href="${up}examenes-icfes-anteriores/">exámenes ICFES anteriores completos</a>.</p>
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
  <p class="source">Cóndor es una plataforma independiente para practicar el Saber 11; no es el ICFES. Datos consultados en documentos oficiales del ICFES el 13 de noviembre de 2026. Más sobre el examen en <a href="${up}que-es-el-saber-11/">qué es el Saber 11</a> y <a href="${up}fechas-icfes-2027/">fechas ICFES 2027</a>.</p>
</section>
${cta(up, "Haz un simulacro con la estructura real")}`;
  const ld = [
    faqLd(faq),
    {
      "@type": "Article", headline: "Cuántas preguntas tiene el ICFES por área", description: desc, url: siteUrl + path, inLanguage: "es-CO",
      dateModified: CHECKED, author: { "@id": `${siteUrl}#org` }, publisher: { "@id": `${siteUrl}#org` }, isBasedOn: [SRC.guia2026, SRC.res268, SRC.infografia, SRC.ingles],
    },
  ];
  write(path, page({ siteUrl, path, title: "Cuántas preguntas tiene el ICFES por área (2026)", desc, body, crumbs: [{ name: "Estructura del examen", path }], jsonLd: ld }));
}
