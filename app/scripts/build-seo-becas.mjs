// "Becas con el puntaje ICFES" pages: what each scholarship, credit or recognition asks of the Saber 11, with the
// official rules and dates (scripts/seo-data/becas.mjs, read on each program's own site). Cóndor is not affiliated
// with any of them and every page says so.
//   becas-icfes/                           hub: every program, its Saber 11 requirement and status, plus university scores
//   becas-icfes/icetex/                    ICETEX Tú eliges: minimum global score by municipality, calculator, 2027-1 dates
//   becas-icfes/matricula-cero/            Política de Gratuidad "Puedo Estudiar": who qualifies (no ICFES minimum)
//   becas-icfes/quiero-estudiar-uniandes/  Uniandes Quiero Estudiar: 380 / 400 global, coverage, commitment
//   becas-icfes/beca-merito-rosario/       Rosario Beca Mérito Pruebas de Estado: ranking by the average of 4 tests, no fixed minimum
//   becas-icfes/jovenes-a-la-e/            Bogotá (Agencia Atenea) Jóvenes a la E, sixth convocatoria: requirements, Saber 11 role, dates
// Called from build-seo.mjs with the shared helpers. Reuses the score calculator (site/calc-u.js).
import { ANDRES_BELLO, CHECKED, GRATUIDAD, ICETEX, JOVENES_E, QUIERO_ESTUDIAR, ROSARIO } from "./seo-data/becas.mjs";
import { STYLE, calcForm, gRow, legendFor } from "./build-seo-scores.mjs";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const d = (iso) => { const [y, m, dd] = iso.split("-").map(Number); return `${dd} de ${MONTHS[m - 1]} de ${y}`; };
const ext = (url, text) => `<a href="${url}" rel="nofollow noopener" target="_blank">${text}</a>`;

const PAGES = [
  { path: "becas-icfes/icetex/", short: "ICETEX: puntaje mínimo por municipio" },
  { path: "becas-icfes/matricula-cero/", short: "Matrícula cero (Puedo Estudiar)" },
  { path: "becas-icfes/quiero-estudiar-uniandes/", short: "Quiero Estudiar de los Andes" },
  { path: "becas-icfes/beca-merito-rosario/", short: "Beca Mérito del Rosario por Saber 11" },
  { path: "becas-icfes/jovenes-a-la-e/", short: "Jóvenes a la E (Bogotá)" },
];

export function buildBecasPages({ siteUrl, write, page, esc, faqBlock, faqLd, cta }) {
  const disclaimer = (who) => `<p class="source">Cóndor es una plataforma independiente para practicar el Saber 11; no está afiliada a ${who}. Información consultada en los sitios oficiales el ${d(CHECKED)}. Las convocatorias cambian: confirma siempre en la fuente antes de postularte.</p>`;
  const sources = (list) => `<h2>Fuentes</h2>
  <ul class="src-list">${list.map(([label, url]) => `<li>${ext(url, esc(label))}</li>`).join("")}</ul>`;
  const others = (self, up) => `<h2>Más becas y puntajes</h2>
  <ul class="checks">${PAGES.filter((p) => p.path !== self).map((p) => `<li><a href="${up}${p.path}">${esc(p.short)}</a></li>`).join("")}<li><a href="${up}becas-icfes/">Todas las becas con el puntaje ICFES</a></li><li><a href="${up}puntaje-icfes/">Puntaje ICFES para entrar a la universidad</a></li></ul>`;
  const head = (tag, h1, intro) => `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">${esc(tag)}</span>
  <h1>${esc(h1)}</h1>
  <p class="prose">${intro}</p>
</div></section>`;
  const art = (path, headline, desc, based) => ({ "@type": "Article", headline, description: desc, url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, author: { "@id": `${siteUrl}#org` }, publisher: { "@id": `${siteUrl}#org` }, isBasedOn: based });
  const emit = ({ path, title, desc, tag, h1, intro, main, faq, crumb, ctaText, script, ld }) => {
    const up = "../".repeat(path.split("/").filter(Boolean).length);
    const body = `${head(tag, h1, intro)}
<section class="wrap narrow guide-body">
  ${STYLE}
  ${main}
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
</section>
${cta(up, ctaText)}`;
    write(path, page({
      siteUrl, path, title, desc, body, script,
      crumbs: [{ name: "Becas con el puntaje ICFES", path: "becas-icfes/" }, ...(crumb ? [{ name: crumb, path }] : [])],
      jsonLd: [faqLd(faq), ...ld],
    }));
  };

  // ---------------------------------------------------------------- ICETEX
  {
    const path = "becas-icfes/icetex/";
    const up = "../../";
    const cityRow = ([city, dep, min]) => gRow(esc, { label: esc(city), sub: dep !== city ? dep : "", cuts: [min] });
    const table = (rows) => `<div class="tbl"><table class="ucalc-tab"><thead><tr><th>Municipio donde presentaste</th><th>Mínimo ICETEX</th><th>Tu global</th></tr></thead><tbody>${rows.map(cityRow).join("")}</tbody></table></div>`;
    const desc = "Puntaje ICFES mínimo para el crédito Tú Eliges del ICETEX según el municipio donde presentaste: 230 en Bogotá, Medellín y Cali. Fechas 2027-1.";
    const faq = [
      ["¿Qué puntaje ICFES pide el ICETEX?", `Para primer semestre, el puntaje global del Saber 11 debe cumplir el mínimo del municipio donde presentaste la prueba. En las grandes capitales, como Bogotá, Medellín, Cali o Barranquilla, es 230; en otros municipios es menor (por ejemplo 135 en Quibdó o 89 en Mocoa).`],
      ["¿Y si ya estoy en la universidad?", "Si pides el crédito para segundo semestre, cumples con el mismo mínimo del Saber 11 o con un promedio de 3,4 o más en el último periodo. Desde tercer semestre cuenta solo el promedio, de 3,4 o más."],
      ["¿Cuándo se pide el crédito ICETEX para 2027-1?", `Los formularios de pregrado abrieron el ${d(ICETEX.cal[0][1])} y cierran el ${d(ICETEX.cal[1][1])}, o antes si se agotan los recursos. Los resultados salen el ${d(ICETEX.cal[6][1])}.`],
      ["¿Dónde veo el mínimo de mi municipio?", "En la tabla oficial del ICETEX, que lista los 1.123 municipios del país con su código DANE y su mérito mínimo. Esta página copia las capitales y algunos municipios grandes."],
      ["¿El ICETEX es una beca?", "No. Tú Eliges es un crédito educativo: lo pagas después, con las condiciones de la línea que elijas. El puntaje del Saber 11 es uno de los requisitos para que te lo aprueben."],
    ];
    const main = `<h2>La regla</h2>
  <p class="prose">En las líneas de pregrado ${ICETEX.lines.map((l) => ext(l.url, esc(l.name))).join(" y ")} el ICETEX pide que, si entras a primer semestre, tu puntaje global del Saber 11 cumpla el mínimo del municipio donde presentaste la prueba. No es el municipio donde vives ni donde está la universidad.</p>
  <ul class="checks"><li><b>Primer semestre:</b> puntaje global igual o mayor al mínimo de tu municipio.</li><li><b>Segundo semestre:</b> el mismo mínimo, o promedio de 3,4 o más en el último periodo.</li><li><b>Tercer semestre en adelante:</b> promedio de 3,4 o más.</li></ul>
  <h2>Calcula si cumples</h2>
  ${calcForm(esc, 0, 0, { kind: "minimos", note: "Escribe tus cinco puntajes de 0 a 100: la tabla calcula tu puntaje global y lo compara con el mínimo de cada municipio." })}
  ${legendFor(15).replace("Igual o por encima del último corte", "Cumples el mínimo").replace("del corte", "del mínimo")}
  <h3>Capitales de departamento</h3>
  ${table(ICETEX.capitals)}
  <h3>Otros municipios grandes</h3>
  ${table(ICETEX.others)}
  <p class="prose">¿Tu municipio no está? Búscalo en la ${ext(ICETEX.pdf, "tabla oficial del ICETEX (PDF)")}: tiene los 1.123 municipios, con mínimos entre 39 y 230.</p>
  <h2>Fechas para 2027-1</h2>
  <div class="tbl"><table><thead><tr><th>Etapa</th><th>Fecha</th></tr></thead><tbody>${ICETEX.cal.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${d(v)}</td></tr>`).join("")}</tbody></table></div>
  <p class="prose">Según el ${ext(ICETEX.calendarUrl, "calendario de pregrado del ICETEX")}, aplica a Tú Eliges 30 %, Plan Talento STEM, Plan ciencias de la salud y otras líneas de pregrado.</p>
  <h2>Si te faltan puntos</h2>
  <p class="prose">Si aún no presentas el Saber 11, el global se sube prueba por prueba: Lectura crítica, Matemáticas, Sociales y Ciencias valen tres veces más que Inglés. Mide dónde estás con un <a href="${up}simulacro-icfes/">simulacro ICFES</a> y practica con <a href="${up}preguntas-icfes/">preguntas ICFES por área</a>.</p>
  ${others(path, up)}
  ${sources([["ICETEX, línea Tú eliges 30 %", ICETEX.lines[0].url], ["ICETEX, Plan progresivo Tú eliges 40 %", ICETEX.lines[1].url], ["ICETEX, municipios de presentación del Saber 11 y mérito mínimo (PDF)", ICETEX.pdf], ["ICETEX, calendario de pregrado", ICETEX.calendarUrl]])}
  ${disclaimer("el ICETEX")}`;
    emit({
      path, title: "Puntaje ICFES para el ICETEX 2027: mínimo por ciudad", desc, tag: "ICETEX", crumb: "ICETEX",
      h1: "Puntaje ICFES mínimo para el ICETEX",
      intro: "Para el crédito Tú Eliges del ICETEX, el puntaje global del Saber 11 que te piden depende del municipio donde presentaste la prueba: 230 en las grandes capitales y menos en otros municipios. Aquí está la tabla, una calculadora y las fechas de 2027-1.",
      main, faq, ctaText: "Llega al puntaje que pide el ICETEX", script: "calc-u.js",
      ld: [art(path, "Puntaje ICFES mínimo para el ICETEX", desc, [ICETEX.pdf, ...ICETEX.lines.map((l) => l.url), ICETEX.calendarUrl])],
    });
  }

  // ---------------------------------------------------------------- Gratuidad (matrícula cero)
  {
    const path = "becas-icfes/matricula-cero/";
    const up = "../../";
    const desc = "Requisitos de la Política de Gratuidad «Puedo Estudiar» (matrícula cero) en universidades públicas. No pide un puntaje ICFES mínimo: te lo pide la universidad.";
    const faq = [
      ["¿Matrícula cero pide puntaje ICFES?", "No. La Política de Gratuidad no tiene un puntaje mínimo del Saber 11. Lo que sí necesitas es que una institución pública te admita, y muchas admiten con el puntaje ICFES."],
      ["¿Quién revisa si cumplo los requisitos?", "La propia institución de educación superior pública donde te matriculas valida tu información."],
      ["¿Sirve para universidades privadas?", "No. Aplica a pregrados en las 67 instituciones públicas de educación superior registradas en el SNIES."],
      ["¿Qué pasó con Generación E?", "Generación E fue el programa del gobierno 2018-2022, con un componente de Equidad y otro de Excelencia por mérito en el Saber 11. Quienes recibieron Generación E Equidad o el Fondo Solidario en 2022 y 2023 conservan el beneficio de gratuidad; no encontramos una convocatoria nueva de Generación E en el Ministerio."],
    ];
    const main = `<h2>Quién puede tenerla</h2>
  <p class="prose">Según el ${ext(GRATUIDAD.url, "Ministerio de Educación")} (página actualizada el ${d(GRATUIDAD.updated)}), cumples si:</p>
  <ul class="checks"><li>Estás matriculado en un pregrado (técnico profesional, tecnológico o universitario) de una de las 67 instituciones públicas registradas en el SNIES.</li><li>No tienes un título profesional universitario.</li><li>Perteneces a uno de estos grupos:</li></ul>
  <ul class="uni-facts">${GRATUIDAD.groups.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
  <p class="prose">La institución donde te matriculas es la que valida que cumples.</p>
  <h2>Dónde entra el puntaje ICFES</h2>
  <p class="prose">La gratuidad no pide puntaje, pero para usarla primero tienes que entrar a una universidad pública, y muchas admiten con el Saber 11. Mira cuánto piden en <a href="${up}puntaje-icfes/">puntaje ICFES para entrar a la universidad</a>: por ejemplo <a href="${up}puntaje-icfes/univalle/">Univalle</a> publica sus líneas de corte y la <a href="${up}puntaje-icfes/universidad-del-magdalena/">Universidad del Magdalena</a> el puntaje global de sus últimos admitidos.</p>
  ${others(path, up)}
  ${sources([["Ministerio de Educación, Política de Gratuidad «Puedo Estudiar»", GRATUIDAD.url]])}
  ${disclaimer("el Ministerio de Educación")}`;
    emit({
      path, title: "Matrícula cero 2027: requisitos de Puedo Estudiar", desc, tag: "Gratuidad", crumb: "Matrícula cero",
      h1: "Matrícula cero: requisitos de la Política de Gratuidad",
      intro: "La Política de Gratuidad «Puedo Estudiar» del Ministerio de Educación cubre la matrícula de pregrado en instituciones públicas. No pide un puntaje ICFES mínimo, pero sí que cumplas ciertas condiciones.",
      main, faq, ctaText: "Prepárate para entrar a una universidad pública",
      ld: [art(path, "Matrícula cero: requisitos de la Política de Gratuidad", desc, [GRATUIDAD.url])],
    });
  }

  // ---------------------------------------------------------------- Uniandes Quiero Estudiar
  {
    const path = "becas-icfes/quiero-estudiar-uniandes/";
    const up = "../../";
    const q = QUIERO_ESTUDIAR;
    const desc = `Quiero Estudiar de los Andes pide Saber 11 de ${q.minGlobal} o más (${q.minGlobalMed} para Medicina), cubre hasta el 95 % de la matrícula y se devuelve con el 20 % del salario.`;
    const faq = [
      ["¿Qué puntaje ICFES pide Quiero Estudiar?", `Para ser preseleccionado necesitas un puntaje global de ${q.minGlobal} o más en el Saber 11, o ${q.minGlobalMed} o más si te admitieron a Medicina. También hay una vía por notas y posición en el colegio, con un equivalente de ${q.minEquiv} (${q.minEquivMed} para Medicina).`],
      ["¿Cuánto cubre?", "Hasta el 95 % del valor de la matrícula de cada semestre durante toda la carrera, según tu necesidad económica y el presupuesto disponible. Se renueva por la duración del programa y hasta dos semestres más."],
      ["¿Hay que devolverlo?", "Es un «apoyo financiero con compromiso»: sin intereses y sin codeudor. Cuando te gradúas, aportas el 20 % de tus ingresos durante el doble del tiempo que recibiste el beneficio."],
      ["¿Cuándo se postula?", "Para la convocatoria 2027-10, los preseleccionados se postularon del 14 de agosto al 8 de noviembre de 2026, con tres cierres. La universidad publica cada convocatoria en su página de apoyo financiero."],
    ];
    const main = `<h2>Requisitos para ser preseleccionado</h2>
  <ul class="checks"><li>Ser bachiller o estar en grado 11.</li><li>Tener entre 16 y 21 años.</li><li>Ser admitido a un pregrado de los Andes con un Saber 11 de <b>${q.minGlobal}</b> o más (<b>${q.minGlobalMed}</b> para Medicina), o con un equivalente de ${q.minEquiv} (${q.minEquivMed} para Medicina) calculado con tus notas y tu posición en el colegio.</li></ul>
  <h2>Calcula si llegas</h2>
  ${calcForm(esc, 0, 0, { kind: "minimos", note: "Escribe tus cinco puntajes de 0 a 100: la tabla calcula tu puntaje global y lo compara con el mínimo de Quiero Estudiar." })}
  ${legendFor(15).replace("Igual o por encima del último corte", "Cumples el mínimo").replace("del corte", "del mínimo")}
  <div class="tbl"><table class="ucalc-tab"><thead><tr><th>Programa</th><th>Saber 11 mínimo</th><th>Tu global</th></tr></thead><tbody>${gRow(esc, { label: "Pregrados (excepto Medicina)", cuts: [q.minGlobal] })}${gRow(esc, { label: "Medicina", cuts: [q.minGlobalMed] })}</tbody></table></div>
  <h2>Qué cubre y cómo se devuelve</h2>
  <ul class="uni-facts"><li>Hasta el 95 % de la matrícula semestral durante toda la carrera, según necesidad y presupuesto.</li><li>Sin intereses y sin codeudor. Al graduarte aportas el 20 % de tus ingresos durante el doble del tiempo que usaste el beneficio.</li><li>Se renueva por la duración del programa y hasta dos semestres adicionales. No aplica para Open Year.</li><li>Convocatoria 2027-10: postulación del 14 de agosto al 8 de noviembre de 2026; respuesta por correo en tres cierres (finales de septiembre, principios de noviembre y principios de diciembre).</li></ul>
  <p class="prose">Un global de ${q.minGlobal} está muy por encima del promedio nacional, así que se prepara con tiempo. Mide dónde estás con un <a href="${up}simulacro-icfes/">simulacro ICFES</a> y calcula tu global en la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>.</p>
  ${others(path, up)}
  ${sources([["Universidad de los Andes, Quiero Estudiar", q.url]])}
  ${disclaimer("la Universidad de los Andes")}`;
    emit({
      path, title: "Quiero Estudiar Uniandes: puntaje ICFES y requisitos", desc, tag: "Universidad de los Andes", crumb: "Quiero Estudiar",
      h1: "Quiero Estudiar de los Andes: puntaje ICFES y requisitos",
      intro: `Quiero Estudiar es el apoyo financiero de la Universidad de los Andes para admitidos con excelencia académica y necesidad económica. Pide un Saber 11 de ${q.minGlobal} o más.`,
      main, faq, ctaText: `Prepárate para pasar de ${q.minGlobal}`, script: "calc-u.js",
      ld: [art(path, "Quiero Estudiar de los Andes: puntaje ICFES y requisitos", desc, [q.url])],
    });
  }

  // ---------------------------------------------------------------- Rosario
  {
    const path = "becas-icfes/beca-merito-rosario/";
    const up = "../../";
    const r = ROSARIO;
    const desc = "La Beca Mérito del Rosario por Saber 11 cubre hasta el 100 % de la matrícula. No pide un puntaje fijo: premia el mejor promedio de cuatro pruebas.";
    const faq = [
      ["¿Qué puntaje ICFES pide la beca del Rosario?", "La universidad no publica un puntaje mínimo. Asigna las becas por ranking del promedio simple de Lectura crítica, Matemáticas, Sociales y ciudadanas y Ciencias naturales entre los admitidos de cada unidad académica. Las cifras de 345 o 365 que circulan en noticias no aparecen en la página oficial."],
      ["¿Hay que postularse?", "No. Es automática si estás admitido a un programa participante en la fecha de corte del calendario de la beca, inscrito como «Nuevo»."],
      ["¿Cuánto cubre?", "Hasta el 100 % del valor de la matrícula, en la cantidad que defina la universidad según su presupuesto. Se puede mantener toda la carrera si cumples las condiciones."],
      ["¿Inglés cuenta?", "No. El promedio usa solo Lectura crítica, Matemáticas, Sociales y ciudadanas y Ciencias naturales."],
      ["¿Cómo se mantiene?", "Con un promedio acumulado igual o superior a la escala de tu programa, sin reprobar materias, con 64 horas por semestre de trabajo orientado por la universidad, a paz y salvo y sin sanciones disciplinarias (condiciones vigentes para 2026-2)."],
    ];
    const main = `<h2>Cómo se asigna</h2>
  <p class="prose">Según la ${ext(r.url, "Universidad del Rosario")}, la beca es para los admitidos a 2027-1 inscritos como «Nuevo» que obtienen puntajes de excelencia en el Saber 11 del ${d(r.examDate)}. La universidad ordena a los admitidos de cada unidad académica por el <b>promedio simple</b> de cuatro pruebas y asigna becas de hasta el 100 % de la matrícula, en la cantidad que permita su presupuesto.</p>
  <ul class="checks"><li>No hay que postularse: es automática si estás admitido en la fecha de corte.</li><li>Cuentan Lectura crítica, Matemáticas, Sociales y ciudadanas y Ciencias naturales. Inglés no.</li><li>No aplica para ${esc(r.excluded.slice(0, -1).join(", "))} ni ${esc(r.excluded[r.excluded.length - 1])}, ni si haces reserva de cupo.</li></ul>
  <h2>Calcula tu promedio</h2>
  ${calcForm(esc, 0, 0, { kind: "promedio", note: "Escribe tus cinco puntajes de 0 a 100 (Inglés no cuenta): la tabla calcula el promedio que usa el Rosario." })}
  <div class="tbl"><table class="ucalc-tab"><thead><tr><th>Cálculo</th><th>Pesos (%)</th><th>Tú</th></tr></thead><tbody><tr data-w="25,25,25,25,0"><td>Promedio de las cuatro pruebas</td><td class="wts">LC 25 · M 25 · S 25 · CN 25</td><td class="you">–</td></tr></tbody></table></div>
  <p class="prose">No hay un corte publicado: compites con los demás admitidos de tu unidad académica. Como referencia, el global le da a esas cuatro pruebas el mismo peso entre ellas, así que cada punto de promedio equivale a unos 4,6 puntos de global.</p>
  <h2>Calendario del ciclo 2027-1</h2>
  <div class="tbl"><table><thead><tr><th>Etapa</th><th>Fecha</th></tr></thead><tbody>${r.cal.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${d(v)}</td></tr>`).join("")}</tbody></table></div>
  <p class="prose">Ese ciclo ya se asignó. Si presentas el Saber 11 en 2027, revisa la página de la beca para el calendario siguiente y prepárate con un <a href="${up}simulacro-icfes/">simulacro ICFES</a> y <a href="${up}preguntas-icfes/lectura-critica/">preguntas de Lectura crítica</a>.</p>
  ${others(path, up)}
  ${sources([["Universidad del Rosario, Becas Mérito URosario Pruebas de Estado", r.url]])}
  ${disclaimer("la Universidad del Rosario")}`;
    emit({
      path, title: "Beca Rosario por Saber 11: cómo se gana", desc, tag: "Universidad del Rosario", crumb: "Beca Mérito Rosario",
      h1: "Beca Mérito del Rosario por el Saber 11",
      intro: "La Universidad del Rosario da becas de hasta el 100 % de la matrícula a los admitidos con los mejores resultados en el Saber 11. No hay un puntaje mínimo publicado: es un ranking.",
      main, faq, ctaText: "Sube tu promedio en las cuatro pruebas", script: "calc-u.js",
      ld: [art(path, "Beca Mérito del Rosario por el Saber 11", desc, [r.url])],
    });
  }

  // ---------------------------------------------------------------- Jóvenes a la E (Bogotá)
  {
    const path = "becas-icfes/jovenes-a-la-e/";
    const up = "../../";
    const j = JOVENES_E;
    const span = (a, b) => (!b ? d(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))} al ${d(b)}` : `${d(a)} al ${d(b)}`);
    const desc = `Jóvenes a la E 2027-1 (Bogotá): inscripción para universidades privadas hasta el ${d(j.privClose)}, requisitos, papel del Saber 11 y fechas.`;
    const faq = [
      ["¿Jóvenes a la E pide un puntaje ICFES mínimo?", "Atenea no fija un mínimo general: asigna los cupos con un sistema de puntos que incluye el Saber 11, el Sisbén y condiciones de vulnerabilidad. Pero algunas instituciones sí piden un puntaje mínimo del Saber 11 para ciertos programas, y si no lo cumples ese programa no aparece en SICORE."],
      ["¿Hasta cuándo son las inscripciones?", `Para la línea de Admisión General (universidades privadas), del ${span(j.privOpen, j.privClose)}, hasta las 11:59 p. m., en la plataforma SICORE de Atenea. La línea de instituciones públicas cerró el ${d(j.pubClose)}.`],
      ["¿Cuándo salen los resultados?", `Según el cronograma de Atenea, el ${d(j.cal[2][1])}. Los elegibles firman la carta de compromiso hasta el ${d(j.cal[4][2])}.`],
      ["¿Tengo que haber presentado el ICFES en Bogotá?", "Sí. Debes haber presentado el Saber 11 o las pruebas ICFES en Bogotá y ser bachiller de un colegio de Bogotá (o haber validado el bachillerato con el ICFES en Bogotá)."],
      ["¿Hay que devolver la plata?", "No es un crédito. A cambio, los beneficiarios hacen 32 horas de retribución social a la ciudad por cada periodo cursado."],
      ["¿Puedo pedir Medicina?", "Sí, pero Atenea financia un solo cupo de Medicina en esta línea: se asigna al aspirante con el mejor puntaje del Saber 11 que la elija como primera opción. No puedes poner Medicina como primera y segunda opción a la vez."],
    ];
    const main = `<div class="card" style="padding:18px 20px;margin:8px 0 18px"><p class="prose" style="margin:0"><b>Estado al ${d(CHECKED)}:</b> la línea de Admisión General (universidades privadas) recibe inscripciones del ${span(j.privOpen, j.privClose)} en ${ext(j.privadas, "la página de la convocatoria")}. La línea de instituciones públicas cerró el ${d(j.pubClose)}.</p></div>
  <h2>Qué da</h2>
  <ul class="checks"><li><b>Universidades privadas (Admisión General):</b> Atenea paga la matrícula completa de cada periodo directamente a la institución, y el beneficiario recibe un apoyo de hasta un salario mínimo por periodo cursado.</li><li><b>Instituciones públicas:</b> para admitidos a 2027-1 en la Nacional, la Distrital, la Pedagógica, la ETITC y técnicos laborales del SENA en Bogotá, un apoyo de sostenimiento de hasta un salario mínimo por periodo, apoyos en especie como transporte y bienestar. Atenea espera asignar más de 1.490 beneficios en esa línea.</li><li>No es un crédito: a cambio haces 32 horas de retribución social por periodo.</li></ul>
  <h2>Requisitos (Admisión General)</h2>
  <ul class="uni-facts"><li>Ser bachiller, o estar en grado 11 y graduarte a más tardar en diciembre de 2026, de un colegio de Bogotá (o haber validado el bachillerato con el ICFES en Bogotá).</li><li>Haber presentado el Saber 11 o las pruebas ICFES en Bogotá.</li><li>Tener máximo 28 años al cierre de la inscripción.</li><li>No haber sido beneficiario de Jóvenes a la E, del FEST ni de otros fondos de educación superior del Distrito (con algunas excepciones).</li><li>No estar cursando un programa de educación superior en 2026.</li></ul>
  <h2>Qué pesa el Saber 11</h2>
  <p class="prose">Atenea ordena a los aspirantes con un sistema de puntos que valora la situación personal, económica y académica: ser mujer o persona trans, ser víctima del conflicto, tener discapacidad, vivir en zona rural, el grupo del Sisbén, los <b>resultados del Saber 11</b> y la participación en programas como La U en tu Colegio. Si hay empate en los cupos, el primer criterio es el <b>puntaje global del Saber 11</b>, de mayor a menor.</p>
  <p class="prose">Además, algunas instituciones fijan un puntaje mínimo del Saber 11: si no lo alcanzas, sus programas no se habilitan en SICORE. El ${ext(j.lineamiento, "lineamiento operativo (PDF)")} trae la tabla por institución. Para Medicina, Atenea financia un solo cupo, que va al mejor Saber 11 entre quienes la ponen como primera opción.</p>
  <p class="prose">Calcula tu global en la <a href="${up}calculadora-puntaje-icfes/">calculadora del puntaje ICFES</a>.</p>
  <h2>Fechas de la sexta convocatoria</h2>
  <div class="tbl"><table><thead><tr><th>Etapa</th><th>Fecha</th></tr></thead><tbody>${j.cal.map(([k, a, b]) => `<tr><td>${esc(k)}</td><td>${span(a, b)}</td></tr>`).join("")}</tbody></table></div>
  <p class="prose">Fuente: ${ext(j.cronograma, "cronograma de la convocatoria (PDF)")}. Atenea aclara que las fechas pueden ajustarse por razones operativas.</p>
  <h2>Talentos Excepcionales</h2>
  <p class="prose">Es otra línea, cerrada y por preselección. Su sublínea de capacidades excepcionales es para quienes quedaron en el percentil 100 del Saber 11 de julio de 2026 presentado en Bogotá.</p>
  ${others(path, up)}
  ${sources([["Atenea, Jóvenes a la E 6: instituciones privadas", j.privadas], ["Atenea, Jóvenes a la E 6: instituciones públicas", j.publicas], ["Atenea, cronograma de la sexta convocatoria (PDF)", j.cronograma], ["Atenea, preguntas frecuentes de la línea de Admisión General (PDF)", j.faq], ["Atenea, lineamiento operativo para aspirantes (PDF)", j.lineamiento]])}
  ${disclaimer("la Agencia Atenea ni a la Alcaldía de Bogotá")}`;
    emit({
      path, title: "Jóvenes a la E 2027-1: requisitos, ICFES y fechas", desc, tag: "Bogotá", crumb: "Jóvenes a la E",
      h1: "Jóvenes a la E 2027-1: requisitos y fechas",
      intro: `Jóvenes a la E es el programa de la Agencia Atenea de Bogotá que paga la matrícula en universidades privadas o da apoyo de sostenimiento en las públicas. La inscripción para privadas va hasta el ${d(j.privClose)}.`,
      main, faq, ctaText: "Sube tu Saber 11 para sumar puntos",
      ld: [art(path, "Jóvenes a la E 2027-1: requisitos y fechas", desc, [j.privadas, j.publicas, j.cronograma, j.faq, j.lineamiento])],
    });
  }

  // ---------------------------------------------------------------- hub
  {
    const path = "becas-icfes/";
    const up = "../";
    const rows = [
      [`<a href="icetex/">Crédito Tú Eliges</a>`, "ICETEX", "Global mínimo según el municipio donde presentaste (230 en las grandes capitales)", "Formularios 2027-1 hasta el 4 de diciembre de 2026"],
      [`<a href="matricula-cero/">Matrícula cero (Puedo Estudiar)</a>`, "Ministerio de Educación", "No pide puntaje: necesitas ser admitido en una institución pública", "Vigente; la valida tu institución"],
      [`<a href="beca-merito-rosario/">Beca Mérito URosario Pruebas de Estado</a>`, "Universidad del Rosario", "Los mejores promedios de Lectura crítica, Matemáticas, Sociales y Ciencias entre los admitidos; sin mínimo fijo", "Ciclo 2027-1 asignado en octubre de 2026"],
      [`<a href="jovenes-a-la-e/">Jóvenes a la E</a>`, "Agencia Atenea (Bogotá)", "Saber 11 presentado en Bogotá; suma puntos y desempata. Algunas instituciones piden mínimo", "Privadas: inscripción hasta el 18 de noviembre de 2026"],
      [`<a href="quiero-estudiar-uniandes/">Quiero Estudiar</a>`, "Universidad de los Andes", `Global de ${QUIERO_ESTUDIAR.minGlobal} o más (${QUIERO_ESTUDIAR.minGlobalMed} para Medicina)`, "Convocatoria 2027-10 cerrada el 8 de noviembre de 2026"],
      ["Distinción Andrés Bello", "Ministerio de Educación", "Los puntajes más altos del país en cada prueba del núcleo común", "No hay postulación: se otorga con los resultados"],
    ];
    const desc = "Becas y créditos con el puntaje ICFES: mínimo del ICETEX por municipio, Quiero Estudiar de los Andes (380), beca del Rosario y matrícula cero.";
    const faq = [
      ["¿Qué becas hay con el puntaje ICFES?", "Pocas dependen solo del puntaje. El crédito Tú Eliges del ICETEX pide un global mínimo según tu municipio; Quiero Estudiar de los Andes pide 380 o más; el Rosario beca a los mejores promedios entre sus admitidos; la Distinción Andrés Bello reconoce los puntajes más altos del país. La matrícula cero en universidades públicas no pide puntaje."],
      ["¿Todavía existe Ser Pilo Paga o Generación E?", "Fueron programas de gobiernos anteriores. Generación E (2018-2022) tenía un componente de Excelencia por mérito en el Saber 11. Hoy el Ministerio de Educación financia la matrícula en instituciones públicas con la Política de Gratuidad, que no pide puntaje; no encontramos convocatorias nuevas de esos programas."],
      ["¿Qué es la Distinción Andrés Bello?", "Un reconocimiento del Ministerio de Educación a los estudiantes de grado 11 que obtienen las puntuaciones más altas en cada prueba del núcleo común del Saber 11, en categorías nacional, departamental y rural o urbana. No hay que postularse."],
      ["¿Cuánto puntaje necesito para una beca?", "Depende de la beca. En el ICETEX, 230 de global si presentaste en una gran capital; en los Andes, 380 o más. Para entrar a una universidad pública depende del programa: mira los cortes en la página de puntaje ICFES por universidad."],
    ];
    const main = `<h2>Becas, créditos y reconocimientos</h2>
  <style>.beca-cards{display:grid;gap:14px;margin:8px 0 18px}.beca-cards .card{padding:16px 18px}.beca-cards h3{margin:0 0 4px;font-size:18px}.beca-cards h3 a{color:#2B5F2E}.beca-cards p{margin:6px 0 0;font-size:15px;line-height:1.45}.beca-cards .who{font-size:13px;font-weight:700;color:var(--text-2)}@media(min-width:720px){.beca-cards{grid-template-columns:1fr 1fr}}</style>
  <div class="beca-cards">${rows.map(([name, who, asks, status]) => `<div class="card"><h3>${name}</h3><span class="who">${esc(who)}</span><p><b>Saber 11:</b> ${esc(asks)}</p><p><b>Estado:</b> ${esc(status)}</p></div>`).join("")}</div>
  <h2>Distinción Andrés Bello</h2>
  <p class="prose">El ${ext(ANDRES_BELLO.url, "Ministerio de Educación")} la entrega a los estudiantes de grado 11 que obtienen las puntuaciones más altas del país en cada prueba del núcleo común del Saber 11. Hay categorías nacional, departamental y rural o urbana, y no hay que postularse: se otorga con los resultados.</p>
  <h2>Ser Pilo Paga y Generación E</h2>
  <p class="prose">Fueron programas de gobiernos anteriores. Generación E (2018-2022) tenía un componente de Equidad y otro de Excelencia por mérito en el Saber 11. Hoy la matrícula en instituciones públicas la cubre la <a href="matricula-cero/">Política de Gratuidad</a>, que no pide puntaje. No encontramos convocatorias nuevas de esos programas.</p>
  <h2>El puntaje que piden las universidades</h2>
  <p class="prose">Antes de la beca está la admisión. Univalle, la UIS y la de Caldas te ordenan por un puntaje ponderado por programa; la del Magdalena y la del Atlántico, por el global; la Nacional y la de Antioquia tienen examen propio. Mira cada una en <a href="${up}puntaje-icfes/">puntaje ICFES para entrar a la universidad</a>, por ejemplo <a href="${up}puntaje-icfes/carreras/medicina/">cuánto piden para Medicina</a>.</p>
  <h2>Cómo subir el puntaje</h2>
  <p class="prose">Lectura crítica, Matemáticas, Sociales y Ciencias valen tres veces más que Inglés en el global. Mide dónde estás con un <a href="${up}simulacro-icfes/">simulacro ICFES</a>, practica con <a href="${up}preguntas-icfes/">preguntas ICFES por área</a> y revisa las <a href="${up}fechas-icfes-2027/">fechas del ICFES 2027</a>.</p>
  ${sources([["ICETEX, mérito mínimo por municipio (PDF)", ICETEX.pdf], ["ICETEX, calendario de pregrado", ICETEX.calendarUrl], ["Ministerio de Educación, Política de Gratuidad «Puedo Estudiar»", GRATUIDAD.url], ["Ministerio de Educación, Distinción Andrés Bello", ANDRES_BELLO.url], ["Universidad de los Andes, Quiero Estudiar", QUIERO_ESTUDIAR.url], ["Universidad del Rosario, Becas Mérito URosario Pruebas de Estado", ROSARIO.url], ["Agencia Atenea, Jóvenes a la E 6 (instituciones privadas)", JOVENES_E.privadas]])}
  ${disclaimer("el ICETEX, el Ministerio de Educación ni ninguna universidad")}`;
    emit({
      path, title: "Becas con el puntaje ICFES 2027: requisitos y fechas", desc, tag: "Becas",
      h1: "Becas con el puntaje ICFES",
      intro: "Qué becas, créditos y reconocimientos dependen de tu Saber 11, cuánto puntaje piden y cuándo se postula, con datos de los sitios oficiales.",
      main, faq, ctaText: "Sube el puntaje que te piden las becas",
      ld: [{ "@type": "CollectionPage", name: "Becas con el puntaje ICFES", url: siteUrl + path, inLanguage: "es-CO", dateModified: CHECKED, hasPart: PAGES.map((p) => ({ "@type": "WebPage", name: p.short, url: siteUrl + p.path })) }],
    });
  }
}
