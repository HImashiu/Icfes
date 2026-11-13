// Saber 11 paperwork pages: people search "inscripción icfes", "citación icfes", "número de registro icfes"… These
// pages answer with the official facts (scripts/seo-data/icfes-tramites.mjs, read on icfes.gov.co), send people to the
// ICFES site for the paperwork itself, and offer practice. Cóndor is not the ICFES and every page says so.
//   que-es-el-saber-11/  inscripcion-icfes/  citacion-icfes/  numero-de-registro-icfes/  certificado-icfes/
//   fechas-icfes-2027/   (2026 dates as reference until the ICFES publishes 2027; Event schema once CAL_2027 is filled)
// Called from build-seo.mjs with the shared helpers.
import { CAL_2026, CAL_2027, CHECKED, EXAM_DAY, OFFICIAL, TARIFAS_2026 } from "./seo-data/icfes-tramites.mjs";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const d = (iso, withDay = false) => { const [y, m, dd] = iso.split("-").map(Number); const wd = DAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; return `${withDay ? wd + " " : ""}${dd} de ${MONTHS[m - 1]} de ${y}`; };
const money = (n) => "$" + n.toLocaleString("es-CO");
const ext = (url, text) => `<a href="${url}" rel="nofollow noopener" target="_blank">${text}</a>`;

const PAGES = [
  { path: "que-es-el-saber-11/", short: "Qué es el Saber 11" },
  { path: "inscripcion-icfes/", short: "Inscripción al ICFES" },
  { path: "citacion-icfes/", short: "Citación y día del examen" },
  { path: "numero-de-registro-icfes/", short: "Número de registro" },
  { path: "certificado-icfes/", short: "Certificado de resultados" },
  { path: "fechas-icfes-2027/", short: "Fechas ICFES 2027" },
];

export function buildTramitePages({ siteUrl, write, page, esc, faqBlock, faqLd, cta }) {
  const up = "../";
  // Every paperwork page links to the others, to the results guide and to university scores.
  const others = (self) => `<h2>Más sobre el Saber 11</h2>
  <ul class="checks">${PAGES.filter((p) => p.path !== self).map((p) => `<li><a href="${up}${p.path}">${esc(p.short)}</a></li>`).join("")}<li><a href="${up}resultados-icfes/">Cómo leer tus resultados</a></li><li><a href="${up}puntaje-icfes/">Puntaje ICFES para entrar a la universidad</a></li></ul>`;
  const disclaimer = `<p class="source">Cóndor es una plataforma independiente para practicar el Saber 11; no es el ICFES. Los trámites se hacen solo en los sitios oficiales del ICFES. Información consultada en ${ext(OFFICIAL.icfes, "icfes.gov.co")} el ${d(CHECKED)}.</p>`;
  const art = (path, headline, desc, sources) => ({ "@type": "Article", headline, description: desc, url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, author: { "@id": `${siteUrl}#org` }, publisher: { "@id": `${siteUrl}#org` }, isBasedOn: sources });
  const head = (tag, h1, intro) => `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">${esc(tag)}</span>
  <h1>${esc(h1)}</h1>
  <p class="prose">${intro}</p>
</div></section>`;
  const emit = ({ path, title, desc, tag, h1, intro, main, faq, sources, ctaText, extraLd = [] }) => {
    const body = `${head(tag, h1, intro)}
<section class="wrap narrow guide-body">
  <style>.guide-body .source a{color:#2B5F2E;font-weight:700}</style>
  ${main}
  ${others(path)}
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
  ${disclaimer}
</section>
${cta(up, ctaText)}`;
    write(path, page({ siteUrl, path, title, desc, body, crumbs: [{ name: PAGES.find((p) => p.path === path).short, path }], jsonLd: [faqLd(faq), art(path, h1, desc, sources), ...extraLd] }));
  };
  const calRows = (cal) => [
    ["Registro ordinario", cal.B ? `hasta el ${d(cal.B.ordinaryUntil)}` : "–", cal.A ? `hasta el ${d(cal.A.ordinaryUntil)}` : "–"],
    ["Registro extraordinario", cal.B ? `${d(cal.B.extra[0])} al ${d(cal.B.extra[1])}` : "–", cal.A ? `${d(cal.A.extra[0])} al ${d(cal.A.extra[1])}` : "–"],
    ["Citaciones", cal.B ? d(cal.B.citacion) : "–", cal.A ? d(cal.A.citacion) : "–"],
    ["Examen", cal.B ? `<b>${d(cal.B.exam, true)}</b>` : "–", cal.A ? `<b>${d(cal.A.exam, true)}</b>` : "–"],
    ["Resultados", cal.B ? d(cal.B.results) : "–", cal.A ? d(cal.A.results) : "–"],
  ];
  const calTable = (cal, caption) => `<div class="tbl"><table><caption class="source" style="caption-side:bottom;text-align:left;padding-top:6px">${caption}</caption><thead><tr><th>Etapa</th><th>Calendario B</th><th>Calendario A</th></tr></thead><tbody>${calRows(cal).map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</tbody></table></div>`;
  const cal2026Caption = `Fuente: ICFES, ${ext(OFFICIAL.calB2026, "calendario B 2026")} y ${ext(OFFICIAL.calA2026, "calendario A 2026")}.`;

  // ---------------------------------------------------------------- qué es el Saber 11
  emit({
    path: "que-es-el-saber-11/",
    title: "Qué es el Saber 11: pruebas, puntaje y fechas",
    desc: "Qué es el examen Saber 11 (ICFES): las cinco pruebas, las dos sesiones, cómo se calcula el puntaje de 0 a 500 y cuándo se presenta en calendario A y B.",
    tag: "Saber 11", h1: "Qué es el Saber 11 (el ICFES)",
    intro: "El Saber 11 es el examen de Estado que presentan los estudiantes de grado once en Colombia. Lo aplica el ICFES, y la mayoría lo llama simplemente «el ICFES». Sirve para entrar a la universidad, para becas y para que los colegios midan cómo van.",
    main: `<h2>Qué evalúa</h2>
  <p class="prose">Tiene cinco pruebas, todas de selección múltiple: <a href="${up}preguntas-icfes/lectura-critica/">Lectura crítica</a>, <a href="${up}preguntas-icfes/matematicas/">Matemáticas</a>, <a href="${up}preguntas-icfes/sociales-y-ciudadanas/">Sociales y ciudadanas</a>, <a href="${up}preguntas-icfes/ciencias-naturales/">Ciencias naturales</a> e <a href="${up}preguntas-icfes/ingles/">Inglés</a>. No mide si memorizaste datos sino si sabes usar lo que aprendiste: leer con criterio, razonar con números, interpretar situaciones. Mira <a href="${up}competencias-icfes/">qué competencias evalúa cada prueba</a>.</p>
  <h2>Cómo es el día del examen</h2>
  <p class="prose">Se presenta en un solo día, en dos sesiones. Según el ICFES, en 2026 la primera sesión empezó a las ${EXAM_DAY.start} con ${EXAM_DAY.session1.questions} preguntas de ${EXAM_DAY.session1.tests}; la segunda empezó a la ${EXAM_DAY.session2.start} con ${EXAM_DAY.session2.questions} preguntas de ${EXAM_DAY.session2.tests}. Lo que debes llevar está en la guía de la <a href="${up}citacion-icfes/">citación ICFES</a>.</p>
  <h2>Cómo se califica</h2>
  <p class="prose">Cada prueba tiene un puntaje de 0 a 100 y un nivel de desempeño. El puntaje global va de 0 a 500: Lectura crítica, Matemáticas, Sociales y Ciencias pesan 3 cada una e Inglés pesa 1; se suman, se dividen entre 13 y se multiplican por 5. Pruébalo con la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a> y mira los <a href="${up}niveles-de-desempeno-icfes/">niveles de desempeño</a>.</p>
  <h2>Cuándo se presenta</h2>
  <p class="prose">Hay dos aplicaciones al año. Los colegios de <b>calendario B</b> presentan en marzo y los de <b>calendario A</b> en julio o agosto. En 2026 fueron el ${d(CAL_2026.B.exam, true)} (B) y el ${d(CAL_2026.A.exam, true)} (A). Las fechas del próximo año están en <a href="${up}fechas-icfes-2027/">fechas ICFES 2027</a>.</p>
  <h2>Quién lo presenta y cuánto cuesta</h2>
  <p class="prose">Si estás en grado once, tu colegio te inscribe. Si ya te graduaste, te inscribes tú mismo como «individual». El valor depende del tipo de colegio y de si es registro ordinario o extraordinario: en 2026 iba de ${money(TARIFAS_2026[0][1])} a ${money(TARIFAS_2026[5][1])} para estudiantes. Todo el proceso está en <a href="${up}inscripcion-icfes/">inscripción al ICFES</a>.</p>
  <h2>Para qué sirve el puntaje</h2>
  <p class="prose">Las universidades públicas que admiten con el Saber 11 calculan un puntaje ponderado con tus cinco pruebas. Mira cuánto pide cada una en <a href="${up}puntaje-icfes/">puntaje ICFES para entrar a la universidad</a>.</p>`,
    faq: [
      ["¿El ICFES y el Saber 11 son lo mismo?", "El ICFES es la entidad que hace los exámenes de Estado; el Saber 11 es el examen de grado once. Por costumbre mucha gente llama «el ICFES» al Saber 11."],
      ["¿Cuántas preguntas tiene el Saber 11?", `Según el ICFES, en 2026 la primera sesión tuvo ${EXAM_DAY.session1.questions} preguntas y la segunda ${EXAM_DAY.session2.questions}.`],
      ["¿Cuál es el puntaje máximo?", "500 en el global y 100 en cada prueba."],
      ["¿Cómo me preparo?", "Con preguntas reales de exámenes publicados y simulacros con tiempo. Empieza por un simulacro para saber dónde estás y repasa la prueba que más pesa para la carrera que quieres."],
    ],
    sources: [OFFICIAL.saber11, OFFICIAL.reporte],
    ctaText: "Prueba el Saber 11 antes del día del examen",
  });

  // ---------------------------------------------------------------- inscripción
  emit({
    path: "inscripcion-icfes/",
    title: "Inscripción ICFES Saber 11: pasos, costos y fechas",
    desc: "Cómo es la inscripción al ICFES Saber 11: si te inscribe el colegio o te inscribes tú, cuánto cuesta en 2026, cómo se paga y las fechas de registro.",
    tag: "Inscripción", h1: "Inscripción al ICFES (Saber 11)",
    intro: "Cómo te inscribes al Saber 11, cuánto cuesta y en qué fechas, con los datos oficiales del ICFES. La inscripción se hace solo en los canales del ICFES.",
    main: `<h2>Quién hace la inscripción</h2>
  <ul class="checks">
    <li><b>Si estás en grado once:</b> tu colegio hace el registro de sus estudiantes ante el ICFES. Tú confirmas tus datos y pagas según te indique el colegio.</li>
    <li><b>Si ya te graduaste:</b> te registras tú mismo como aspirante «individual» en el sistema PRISMA del ICFES.</li>
  </ul>
  <p class="prose">Revisa bien tu nombre y tu documento al inscribirte: con esos datos sale tu <a href="${up}citacion-icfes/">citación</a> y tu reporte de resultados. Corregirlos después es un trámite aparte en el Sistema de Atención Electrónica del ICFES.</p>
  <h2>Cuánto cuesta el ICFES en 2026</h2>
  <div class="tbl"><table><thead><tr><th>Grupo</th><th>Ordinaria</th><th>Extraordinaria</th></tr></thead><tbody>${TARIFAS_2026.map((t) => `<tr><td>${esc(t[0])}</td><td>${money(t[1])}</td><td>${money(t[2])}</td></tr>`).join("")}</tbody></table></div>
  <p class="source">Resolución 000629 del 11 de noviembre de 2025. Fuente: ${ext(OFFICIAL.tarifas, "ICFES, tarifas del examen Saber 11")}.</p>
  <p class="prose">El registro extraordinario cuesta cerca de 50 % más, así que conviene no dejarlo para el final.</p>
  <h2>Cómo se paga</h2>
  <p class="prose">Según el ICFES, por PSE, en Davivienda, Banco de Bogotá, Daviplata o corresponsales bancarios. Paga solo con la referencia que te da el sistema del ICFES o tu colegio.</p>
  <h2>Fechas de inscripción</h2>
  <p class="prose">Así fue el registro en 2026. El ICFES publica cada año su calendario; mira el estado de las <a href="${up}fechas-icfes-2027/">fechas ICFES 2027</a>.</p>
  ${calTable(CAL_2026, cal2026Caption)}
  <p class="prose">${esc(CAL_2026.A.note)}</p>`,
    faq: [
      ["¿Cuánto cuesta el ICFES 2026?", `En registro ordinario, ${money(TARIFAS_2026[0][1])} para colegios públicos y privados de rango I, hasta ${money(TARIFAS_2026[5][1])} para rango VI; los graduados pagan ${money(TARIFAS_2026[6][1])} hasta su cuarta inscripción. El extraordinario cuesta más.`],
      ["¿Me puedo inscribir solo si ya me gradué?", "Sí. Los graduados se registran como aspirantes individuales en el sistema PRISMA del ICFES y pagan la tarifa de graduados."],
      ["¿Qué pasa si no me inscribo a tiempo?", "Después del registro ordinario hay un registro extraordinario, más caro. Si se pasan las dos fechas, tendrás que esperar la siguiente aplicación."],
      ["¿Cóndor hace la inscripción?", "No. Cóndor es una plataforma para practicar; la inscripción se hace solo con el ICFES o tu colegio."],
    ],
    sources: [OFFICIAL.tarifas, OFFICIAL.etapas, OFFICIAL.calB2026, OFFICIAL.calA2026],
    ctaText: "Ya te inscribiste: ahora a practicar",
  });

  // ---------------------------------------------------------------- citación + exam day
  emit({
    path: "citacion-icfes/",
    title: "Citación ICFES: cómo consultarla y qué llevar",
    desc: "Cómo consultar tu citación del ICFES Saber 11 en el sitio oficial, qué trae, a qué hora llegar y qué documentos y útiles llevar el día del examen.",
    tag: "Citación", h1: "Citación ICFES: dónde presentas y qué llevar",
    intro: "La citación te dice dónde y a qué hora presentas el Saber 11. Aquí está cómo consultarla en el sitio oficial y qué llevar ese día.",
    main: `<h2>Cómo consultar la citación</h2>
  <ul class="checks">
    <li>Entra al sitio oficial de citaciones del ICFES, ${ext(OFFICIAL.citacion, "citacion.icfes.edu.co")}, y elige «Consultar citación individual».</li>
    <li>Escoge la aplicación (por ejemplo, «SABER 11 20262 CAL A») y el examen.</li>
    <li>Escribe tu tipo y número de documento. El <a href="${up}numero-de-registro-icfes/">número de registro</a> es opcional.</li>
  </ul>
  <p class="prose">La citación trae tu nombre y documento, el lugar exacto donde presentas, la fecha, la hora y la duración de las sesiones, y las condiciones del examen. Se publica unas dos semanas antes: en 2026 fue el ${d(CAL_2026.B.citacion)} para calendario B y el ${d(CAL_2026.A.citacion)} para calendario A.</p>
  <h2>El día del examen</h2>
  <p class="prose">Según el ICFES, la jornada empieza a las ${EXAM_DAY.start} y debes llegar ${EXAM_DAY.arriveBefore} antes. La segunda sesión empieza a la ${EXAM_DAY.session2.start}.</p>
  <h3>Qué llevar</h3>
  <ul class="checks">${EXAM_DAY.bring.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
  <h3>Documentos que sirven</h3>
  <ul class="checks">${EXAM_DAY.ids.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
  <p class="prose">Los documentos digitales solo valen desde la aplicación de la Registraduría: no sirven fotos ni impresiones. El celular está prohibido: se guarda en una bolsa de seguridad, y usarlo puede anular tu examen.</p>
  <h2>La semana antes</h2>
  <p class="prose">Ve al lugar de la citación antes del día para saber cuánto te demoras. Repasa con un <a href="${up}simulacro-icfes/">simulacro ICFES</a> con el tiempo real, para que el ritmo de las dos sesiones no te tome por sorpresa.</p>`,
    faq: [
      ["¿Dónde consulto mi citación del ICFES?", "En el sitio oficial de citaciones del ICFES (citacion.icfes.edu.co), en «Consultar citación individual», con tu tipo y número de documento."],
      ["¿Necesito imprimir la citación?", "La citación sirve para saber dónde y a qué hora presentas. Lo que el ICFES exige para entrar es tu documento de identidad válido; revisa las condiciones que trae tu citación."],
      ["¿Puedo usar la cédula digital?", "Sí, pero solo desde la aplicación de la Registraduría. No se aceptan fotos ni impresiones del documento."],
      ["¿A qué hora debo llegar?", `La jornada empieza a las ${EXAM_DAY.start} y el ICFES pide llegar ${EXAM_DAY.arriveBefore} antes.`],
    ],
    sources: [OFFICIAL.etapas, OFFICIAL.calB2026, OFFICIAL.calA2026],
    ctaText: "Llega al examen con el ritmo entrenado",
  });

  // ---------------------------------------------------------------- número de registro
  emit({
    path: "numero-de-registro-icfes/",
    title: "Número de registro ICFES: qué es y dónde verlo",
    desc: "Qué es el número de registro del ICFES (el código AC o SNP), dónde aparece, para qué te lo piden las universidades y cómo recuperarlo si lo perdiste.",
    tag: "Registro", h1: "Número de registro del ICFES",
    intro: "Es el código que identifica tu inscripción a una aplicación del Saber 11. Te lo piden para consultar resultados y en muchas inscripciones a universidades.",
    main: `<h2>Qué es</h2>
  <p class="prose">Cuando te inscribes al Saber 11, el ICFES le asigna un número a esa inscripción. En el Saber 11 empieza por <b>AC</b>. Muchas universidades lo llaman <b>SNP</b>: por ejemplo, la guía de admisión de la <a href="${up}puntaje-icfes/universidad-de-antioquia/">Universidad de Antioquia</a> pide escribir el código AC del ICFES en el campo «SNP».</p>
  <p class="prose">Es distinto para cada vez que presentas el examen: si lo presentaste dos veces, tienes dos números.</p>
  <h2>Dónde lo encuentras</h2>
  <ul class="checks">
    <li><b>En tu citación:</b> consúltala en ${ext(OFFICIAL.citacion, "citacion.icfes.edu.co")} con tu documento. Lee <a href="${up}citacion-icfes/">cómo consultar la citación</a>.</li>
    <li><b>En tu reporte de resultados:</b> el reporte individual del Saber 11 trae tu número de registro junto a tu nombre, documento y colegio. Se consulta en ${ext(OFFICIAL.resultados, "resultadossaber11.icfes.gov.co")}.</li>
    <li><b>En tu colegio:</b> si te inscribió el colegio, allí tienen el registro de sus estudiantes.</li>
  </ul>
  <h2>Para qué lo vas a necesitar</h2>
  <p class="prose">Para inscribirte a universidades que piden tu resultado del Saber 11, para becas y créditos educativos, y para pedir certificados. Mira cuáles universidades usan tu puntaje en <a href="${up}puntaje-icfes/">puntaje ICFES para entrar a la universidad</a>.</p>`,
    faq: [
      ["¿Qué es el SNP del ICFES?", "Es como muchas universidades llaman al número de registro de tu inscripción al Saber 11, el código que empieza por AC."],
      ["¿Dónde veo mi número de registro?", "En tu citación (citacion.icfes.edu.co) y en tu reporte de resultados del Saber 11 (resultadossaber11.icfes.gov.co)."],
      ["Perdí mi número de registro, ¿qué hago?", "Consulta tu citación con tu tipo y número de documento: allí aparece. Si no puedes, pregunta en tu colegio o en los canales de atención del ICFES."],
      ["¿Es el mismo número si presenté el ICFES dos veces?", "No. Cada inscripción tiene su propio número de registro."],
    ],
    sources: [OFFICIAL.reporte, OFFICIAL.servicios],
    ctaText: "¿Vas a repetir el ICFES? Practica primero",
  });

  // ---------------------------------------------------------------- certificado
  emit({
    path: "certificado-icfes/",
    title: "Certificado ICFES: resultados, apostilla y copias",
    desc: "Cómo descargar tus resultados del Saber 11 y pedir la certificación para legalización o apostilla en el sitio del ICFES, según el año en que presentaste.",
    tag: "Certificado", h1: "Certificado de resultados del ICFES",
    intro: "Cómo obtener tu reporte de resultados del Saber 11 y la certificación para legalizar o apostillar, según el año en que presentaste el examen.",
    main: `<h2>Tu reporte de resultados</h2>
  <p class="prose">El reporte individual se consulta en el sitio oficial de resultados del Saber 11, ${ext(OFFICIAL.resultados, "resultadossaber11.icfes.gov.co")}. Trae tu nombre, documento, <a href="${up}numero-de-registro-icfes/">número de registro</a>, colegio, puntaje global y percentil, y el puntaje y nivel de cada prueba. Lee <a href="${up}resultados-icfes/">cómo leer tus resultados</a>.</p>
  <h2>Certificación para legalización o apostilla</h2>
  <p class="prose">Si vas a estudiar o a hacer un trámite en el exterior, necesitas una certificación que se pueda legalizar o apostillar. Según el ICFES, es gratis y depende del año:</p>
  <div class="tbl"><table><thead><tr><th>Presentaste el examen</th><th>Dónde se pide</th></tr></thead><tbody>
    <tr><td>2021 en adelante</td><td>Dentro del sitio de resultados del Saber 11, en el menú «Certificación para la legalización o apostilla».</td></tr>
    <tr><td>Del segundo semestre de 2014 a 2020</td><td>En el sitio de resultados anteriores del ICFES (resultados.icfes.edu.co), opción de solicitud de certificado.</td></tr>
    <tr><td>Antes de 2014-2</td><td>Revisa los servicios del ICFES: ${ext(OFFICIAL.servicios, "atención y servicios")}.</td></tr>
  </tbody></table></div>
  <p class="prose">El ICFES también expide un certificado de puesto para los exámenes de 2008 a 2015.</p>
  <h2>Si tus datos están mal</h2>
  <p class="prose">Si tu nombre o documento salen mal en el reporte, la corrección se pide en el Sistema de Atención Electrónica del ICFES y tarda entre 10 y 15 días hábiles. Hazlo antes de necesitar el certificado.</p>`,
    faq: [
      ["¿Cuánto cuesta el certificado del ICFES para apostillar?", "Según el ICFES, la certificación para legalización o apostilla es gratuita."],
      ["¿Dónde descargo mis resultados del ICFES?", "En el sitio oficial de resultados del Saber 11 (resultadossaber11.icfes.gov.co). Cóndor no publica ni guarda resultados oficiales."],
      ["Presenté el ICFES en 2018, ¿dónde pido el certificado?", "Para exámenes del segundo semestre de 2014 a 2020, en el sitio de resultados anteriores del ICFES (resultados.icfes.edu.co), en la solicitud de certificado."],
      ["¿Cuánto tarda corregir un dato?", "Según el ICFES, entre 10 y 15 días hábiles, por el Sistema de Atención Electrónica."],
    ],
    sources: [OFFICIAL.servicios, OFFICIAL.reporte],
    ctaText: "¿Quieres subir tu puntaje? Practica",
  });

  // ---------------------------------------------------------------- fechas 2027
  {
    const has2027 = !!(CAL_2027.A || CAL_2027.B);
    const events = ["B", "A"].filter((k) => CAL_2027[k]).map((k) => ({
      "@type": "Event", name: `Examen Saber 11 calendario ${k} 2027`, startDate: CAL_2027[k].exam, eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", location: { "@type": "Place", name: "Sitios de aplicación asignados por el ICFES", address: { "@type": "PostalAddress", addressCountry: "CO" } },
      organizer: { "@type": "Organization", name: "ICFES", url: OFFICIAL.icfes }, url: CAL_2027[k].sourceUrl,
      description: `Aplicación del examen de Estado Saber 11 para colegios de calendario ${k}. Fecha publicada por el ICFES.`,
    }));
    const status = has2027
      ? `<p class="prose">El ICFES ya publicó estas fechas para 2027:</p>${calTable(CAL_2027, `Fuente: ${["B", "A"].filter((k) => CAL_2027[k]).map((k) => ext(CAL_2027[k].sourceUrl, `ICFES, calendario ${k} 2027`)).join(" y ")}.`)}`
      : `<div class="card" style="padding:18px 20px;margin:8px 0 18px"><p class="prose" style="margin:0"><b>Estado al ${d(CHECKED)}:</b> el ICFES todavía no ha publicado en icfes.gov.co el calendario del Saber 11 para 2027. Cuando lo publique, actualizamos esta página con las fechas oficiales. Mientras tanto, abajo están las fechas de 2026 como referencia.</p></div>`;
    emit({
      path: "fechas-icfes-2027/",
      title: "Fechas ICFES 2027: calendario del Saber 11",
      desc: has2027 ? "Fechas oficiales del ICFES Saber 11 2027: inscripción, citación, examen y resultados para calendario A y B." : "Fechas del ICFES Saber 11 2027: estado del calendario oficial y las fechas de 2026 como referencia para inscripción, examen y resultados.",
      tag: "Fechas 2027", h1: "Fechas ICFES 2027 (Saber 11)",
      intro: "Cuándo es la inscripción, la citación, el examen y los resultados del Saber 11 en 2027, para calendario A y calendario B, según lo que publica el ICFES.",
      main: `${status}
  <h2>Calendario 2026 como referencia</h2>
  <p class="prose">El ICFES suele repetir el patrón cada año: calendario B presenta en marzo y calendario A entre julio y agosto, y el registro abre varios meses antes.</p>
  ${calTable(CAL_2026, cal2026Caption)}
  <h2>Qué hacer mientras tanto</h2>
  <ul class="checks">
    <li>Si eres de <b>calendario B</b>, tu examen sería alrededor de marzo de 2027: en 2026 el registro ordinario cerró el ${d(CAL_2026.B.ordinaryUntil)}. Pregunta en tu colegio por la inscripción.</li>
    <li>Si eres de <b>calendario A</b>, en 2026 el examen fue el ${d(CAL_2026.A.exam)}: tienes tiempo para un plan de estudio completo.</li>
    <li>Mira <a href="${up}inscripcion-icfes/">cómo es la inscripción y cuánto cuesta</a>.</li>
    <li>Empieza con el <a href="${up}como-prepararse-para-el-icfes/">plan para prepararte</a> y un <a href="${up}simulacro-icfes/">simulacro</a> para saber dónde estás.</li>
  </ul>
  <h2>Fechas de las universidades</h2>
  <p class="prose">Las admisiones también tienen calendario: por ejemplo, la UIS publica resultados para 2027-1 el 25 de noviembre de 2026. Mira las de cada universidad en <a href="${up}puntaje-icfes/">puntaje ICFES para entrar a la universidad</a>.</p>`,
      faq: [
        ["¿Cuándo es el ICFES 2027?", has2027 ? "Mira la tabla de arriba: son las fechas que publicó el ICFES." : `El ICFES aún no publica el calendario 2027 (revisado el ${d(CHECKED)}). En 2026 calendario B presentó el ${d(CAL_2026.B.exam)} y calendario A el ${d(CAL_2026.A.exam)}.`],
        ["¿Cuándo salen los resultados del ICFES?", `En 2026 salieron el ${d(CAL_2026.B.results)} para calendario B y el ${d(CAL_2026.A.results)} para calendario A, unos dos meses después del examen.`],
        ["¿Cuándo se inscribe uno al ICFES?", `Varios meses antes del examen. En 2026, calendario A tuvo registro ordinario hasta el ${d(CAL_2026.A.ordinaryUntil)} y extraordinario del ${d(CAL_2026.A.extra[0])} al ${d(CAL_2026.A.extra[1])}.`],
      ],
      sources: [OFFICIAL.calB2026, OFFICIAL.calA2026, ...["A", "B"].filter((k) => CAL_2027[k]).map((k) => CAL_2027[k].sourceUrl)],
      ctaText: "Empieza a prepararte para 2027",
      extraLd: events,
    });
  }
}
