// Pages for teachers who search for material to prepare their class for the Saber 11. Searches like "simulacro icfes
// para imprimir" or "banco de preguntas icfes para docentes" today land on old Scribd uploads and ICFES PDFs that
// cannot be edited (research: /mnt/project-files/outreach/docentes/canales-docentes-20261113.md). Cóndor lets a
// teacher pick the questions, print the booklet with the school's cover and grade the sheets with a phone, so each
// page ends in the self-serve teacher sign-up (app/#docente, migration 0038).
//   simulacro-icfes-para-imprimir/   banco-de-preguntas-icfes-docentes/
// Called from build-seo.mjs with the shared helpers. Linked from prueba-docente/ and preicfes-para-colegios/.

export const TEACHER_PAGES = [
  { path: "simulacro-icfes-para-imprimir/", short: "Simulacro ICFES para imprimir" },
  { path: "banco-de-preguntas-icfes-docentes/", short: "Banco de preguntas para docentes" },
];

// The teacher sign-up, tagged with the page it came from (site_visitors.source).
export const teacherApp = (up, fuente) => `${up}app/?fuente=${encodeURIComponent(fuente)}#docente`;

export function teacherCta(up, fuente, title = "Crea tu espacio docente") {
  return `<section class="section"><div class="wrap narrow"><div class="card price reveal"><div><h2>${title}</h2><p>Entras con tu cuenta de Google, escribes el nombre de tu colegio y ya tienes tus cursos, el banco de preguntas y el estudio de impresión.</p></div><a class="btn btn-primary" href="${teacherApp(up, fuente)}">Crear mi espacio docente</a></div></div></section>`;
}

export function buildTeacherPages({ siteUrl, write, page, faqBlock, faqLd }) {
  const up = "../";
  const more = (self) => `<h2>Más para docentes</h2>
  <ul class="checks">${TEACHER_PAGES.filter((p) => p.path !== self).map((p) => `<li><a href="${up}${p.path}">${p.short}</a></li>`).join("")}<li><a href="${up}prueba-docente/">Cómo crear tu espacio docente</a></li><li><a href="${up}preicfes-para-colegios/">Cóndor para todo el colegio</a></li><li><a href="${up}examenes-icfes-anteriores/">Exámenes ICFES anteriores</a></li></ul>`;
  const source = `<p class="source">Cóndor es una plataforma independiente; no es el ICFES. Las preguntas vienen de cuadernillos que el ICFES publicó, y cada una indica su fuente.</p>`;
  const emit = ({ path, fuente, title, desc, tag, h1, intro, main, faq }) => {
    const body = `<section class="section guide-head"><div class="wrap narrow">
  <span class="tag">${tag}</span>
  <h1>${h1}</h1>
  <p class="prose">${intro}</p>
  <div class="cta-row"><a class="btn btn-primary" href="${teacherApp(up, fuente)}">Crear mi espacio docente</a><a class="btn btn-ghost" href="${up}prueba-docente/">Cómo funciona</a></div>
</div></section>
<section class="wrap narrow guide-body">
  ${main}
  ${more(path)}
  <h2>Preguntas frecuentes</h2>
  ${faqBlock(faq)}
  ${source}
</section>
${teacherCta(up, fuente)}`;
    write(path, page({
      siteUrl, path, title, desc, body, crumbs: [{ name: TEACHER_PAGES.find((p) => p.path === path).short, path }],
      jsonLd: [faqLd(faq), { "@type": "WebPage", name: h1, url: siteUrl + path, inLanguage: "es-CO", audience: { "@type": "EducationalAudience", educationalRole: "teacher" } }],
    }));
  };

  // ---------------------------------------------------------------- simulacro para imprimir
  emit({
    path: "simulacro-icfes-para-imprimir/",
    fuente: "seo-imprimir",
    title: "Simulacro ICFES para imprimir: arma el de tu curso",
    desc: "Arma un simulacro ICFES para imprimir con preguntas reales: eliges las preguntas, portada del colegio, varias versiones y hojas que calificas con el celular.",
    tag: "Para docentes",
    h1: "Simulacro ICFES para imprimir, armado para tu curso",
    intro: "Los PDF que circulan son cuadernillos fijos: no puedes quitar una pregunta que tus estudiantes ya vieron ni poner el nombre del colegio. En Cóndor eliges las preguntas, las imprimes en un cuadernillo con la portada de tu colegio y calificas las hojas de respuestas con la cámara del celular.",
    main: `<h2>Cómo se arma, paso a paso</h2>
  <ol class="steps">
    <li><b>Elige qué evaluar.</b> Un simulacro completo de dos sesiones, una sola prueba (por ejemplo Matemáticas) o una mezcla corta para una clase.</li>
    <li><b>Ajusta las preguntas.</b> Filtra por prueba y competencia y cambia las que no te sirvan. Cóndor te avisa si un grupo ya vio una pregunta en otra tarea.</li>
    <li><b>Diseña el cuadernillo.</b> Portada con el escudo y el nombre del colegio, A4 o carta, dos columnas, tamaño de letra y encabezado. Puedes sacar varias versiones que cambian el orden de las preguntas.</li>
    <li><b>Imprime la hoja de respuestas.</b> Cada estudiante rellena los círculos, como en el examen real.</li>
    <li><b>Califica con el celular.</b> Escaneas las hojas y ves el puntaje de cada estudiante, el promedio del curso y las preguntas que más fallaron.</li>
  </ol>
  <h2>Qué tiene de distinto un PDF descargado</h2>
  <div class="tbl"><table><thead><tr><th></th><th>PDF descargado</th><th>Simulacro en Cóndor</th></tr></thead><tbody>
    <tr><td>Preguntas</td><td>Fijas</td><td>Las eliges tú, de más de 4.000</td></tr>
    <tr><td>Portada</td><td>Genérica</td><td>Con el nombre y el escudo del colegio</td></tr>
    <tr><td>Versiones</td><td>Una</td><td>Varias, con distinto orden</td></tr>
    <tr><td>Calificación</td><td>A mano</td><td>Escaneando con el celular</td></tr>
    <tr><td>Resultados</td><td>Los que anotes</td><td>Por estudiante, área y competencia, en el formato del ICFES</td></tr>
  </tbody></table></div>
  <p class="prose">Si tus estudiantes tienen celular, el mismo simulacro se puede presentar en línea, con tiempo y corrección inmediata o al final. Muchos docentes mezclan: diagnóstico en papel y tareas cortas en línea.</p>`,
    faq: [
      ["¿Puedo imprimir sin que los estudiantes tengan cuenta?", "Sí. El cuadernillo y la hoja de respuestas se imprimen desde tu espacio docente. Los estudiantes solo necesitan papel y lápiz; tú escaneas las hojas."],
      ["¿Las preguntas tienen clave?", "Sí. Las de cuadernillos con clave oficial usan la del ICFES. Las de cuadernillos publicados sin clave tienen una clave preliminar revisada por Cóndor, y así se indica."],
      ["¿Necesito que el colegio lo apruebe?", "No. Entras con tu cuenta de Google y lo usas con tus propios cursos desde el primer día."],
      ["¿Funciona para grado 10?", "Sí. Puedes armar pruebas más cortas por área o competencia para ir preparando desde décimo."],
    ],
  });

  // ---------------------------------------------------------------- banco de preguntas para docentes
  emit({
    path: "banco-de-preguntas-icfes-docentes/",
    fuente: "seo-banco-docentes",
    title: "Banco de preguntas ICFES para docentes",
    desc: "Más de 4.000 preguntas de cuadernillos del ICFES para docentes: filtra por prueba y competencia y conviértelas en taller, quiz, diapositivas o simulacro.",
    tag: "Para docentes",
    h1: "Banco de preguntas ICFES para docentes, listo para usar en clase",
    intro: "Más de 4.000 preguntas de cuadernillos que publicó el ICFES, organizadas por prueba y competencia. Con cada pregunta armas un taller para imprimir, un quiz en línea, unas diapositivas para proyectar o un simulacro completo, y ves qué entendió cada estudiante.",
    main: `<h2>Qué puedes hacer con el banco</h2>
  <ul class="checks">
    <li><b>Buscar y filtrar</b> por prueba (Lectura crítica, Matemáticas, Sociales y ciudadanas, Ciencias naturales, Inglés), competencia y cuadernillo.</li>
    <li><b>Convertir en un clic</b> unas preguntas en diapositivas para la clase, un taller para imprimir, un quiz o un examen.</li>
    <li><b>Jugar en vivo</b> en el salón: proyectas la pregunta y cada estudiante responde desde su celular. Sin tablas de posiciones.</li>
    <li><b>Evitar repeticiones:</b> Cóndor recuerda qué preguntas vio cada grupo, para que la tarea no repita las del simulacro.</li>
    <li><b>Crear las tuyas</b> con el editor, con imágenes y fórmulas, junto a las del ICFES.</li>
    <li><b>Ver resultados</b> por estudiante, por área y por competencia, y las preguntas que más fallaron.</li>
  </ul>
  <h2>De dónde salen las preguntas</h2>
  <p class="prose">De cuadernillos de Saber 11 que el ICFES publicó en los últimos años. Cada pregunta indica el cuadernillo y el número. Puedes ver algunas resueltas en <a href="${up}preguntas-icfes/">preguntas ICFES por área</a> y en <a href="${up}examenes-icfes-anteriores/">exámenes ICFES anteriores</a>.</p>
  <h2>Para usarlo con tus colegas</h2>
  <p class="prose">Cuando creas tu espacio, invitas a los docentes de tu colegio con un enlace. Cada uno ve sus cursos, y el banco y el control de preguntas repetidas quedan compartidos.</p>`,
    faq: [
      ["¿Es el banco oficial del ICFES?", "No. Cóndor es independiente. Usa preguntas de cuadernillos que el ICFES publicó, siempre con su fuente."],
      ["¿Puedo descargar todas las preguntas?", "No de una vez: el banco se usa dentro de la plataforma, para armar talleres, quiz, diapositivas o simulacros para tus cursos."],
      ["¿Necesito que el colegio lo apruebe?", "No. Entras con tu cuenta de Google y lo usas con tus propios cursos desde el primer día."],
      ["¿Mis estudiantes necesitan cuenta?", "Para responder en línea entran con su cuenta de Google. Para un taller o simulacro en papel no necesitan nada."],
    ],
  });

  return TEACHER_PAGES.map((p) => p.path);
}
